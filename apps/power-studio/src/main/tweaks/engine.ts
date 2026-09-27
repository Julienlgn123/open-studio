import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HardwareProfile, TweakInfo, TweakResult } from '@shared/types'
import { AdminDeniedError, hasCommand, OS, powershellElevated, powershellJson, run } from '../platform/exec'
import { getStore, logActivity, setSettings, updateStore } from '../store'
import { TWEAKS, type TweakDef, type TweakOp } from './defs'

// ─── Windows : un petit moteur PowerShell commun (lecture / application / annulation) ───

const HIVES: Record<string, string> = { HKCU: 'HKEY_CURRENT_USER', HKLM: 'HKEY_LOCAL_MACHINE' }
const fullKey = (p: string): string => p.replace(/^(HKCU|HKLM)/, (h) => HIVES[h])

const PS_LIB = `
function Read-Reg($path, $name) {
  try {
    $k = Get-Item -LiteralPath ("Registry::" + $path) -ErrorAction Stop
    $v = $k.GetValue($name, $null, 'DoNotExpandEnvironmentNames')
    if ($null -eq $v) { return @{ exists = $false } }
    return @{ exists = $true; value = $v; kind = $k.GetValueKind($name).ToString() }
  } catch { return @{ exists = $false } }
}
function Write-Reg($path, $name, $kind, $value) {
  $p = "Registry::" + $path
  if (-not (Test-Path -LiteralPath $p)) { New-Item -Path $p -Force | Out-Null }
  if ($kind -eq 'DWord') { $value = [int]$value }
  New-ItemProperty -LiteralPath $p -Name $name -PropertyType $kind -Value $value -Force | Out-Null
}
function Remove-Reg($path, $name) {
  Remove-ItemProperty -LiteralPath ("Registry::" + $path) -Name $name -ErrorAction SilentlyContinue
}
$StartCodes = @{ 'Automatic' = 2; 'Manual' = 3; 'Disabled' = 4 }
function Read-Svc($name) {
  $s = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $s) { return @{ exists = $false } }
  return @{ exists = $true; start = $s.StartType.ToString(); running = ($s.Status -eq 'Running') }
}
function Write-Svc($name, $start, $running) {
  $s = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $s) { return }
  try { Set-Service -Name $name -StartupType $start -ErrorAction Stop }
  catch { Set-ItemProperty -LiteralPath ("HKLM:\\SYSTEM\\CurrentControlSet\\Services\\" + $name) -Name Start -Value $StartCodes[$start] -Type DWord }
  if ($start -eq 'Disabled') { Stop-Service -Name $name -Force -ErrorAction SilentlyContinue }
  elseif ($running) { Start-Service -Name $name -ErrorAction SilentlyContinue }
}
function Read-Op($op) {
  switch ($op.t) {
    'reg' { return Read-Reg $op.path $op.name }
    'svc' { return Read-Svc $op.name }
    'cmd' { return Read-Reg $op.check.path $op.check.name }
  }
}
$ops = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($OpsB64)) | ConvertFrom-Json
`

interface WinOp {
  /** Index : « idTweak:numéroOp ». */
  key: string
  t: 'reg' | 'svc' | 'cmd'
  path?: string
  name?: string
  kind?: string
  value?: number | string
  start?: string
  apply?: string
  revert?: string
  check?: { path: string; name: string; value: number }
  /** Pour l'annulation : état à remettre. */
  restore?: { exists: boolean; value?: unknown; kind?: string; start?: string; running?: boolean }
}

interface OpState {
  exists: boolean
  value?: unknown
  kind?: string
  start?: string
  running?: boolean
}

function toWinOps(defs: TweakDef[]): WinOp[] {
  const out: WinOp[] = []
  for (const d of defs) {
    d.ops.forEach((op, i) => {
      const key = `${d.id}:${i}`
      if (op.t === 'reg') out.push({ key, t: 'reg', path: fullKey(op.path), name: op.name, kind: op.kind, value: op.value })
      else if (op.t === 'svc') out.push({ key, t: 'svc', name: op.name, start: op.start })
      else if (op.t === 'cmd') out.push({ key, t: 'cmd', apply: op.apply, revert: op.revert, check: { ...op.check, path: fullKey(op.check.path) } })
    })
  }
  return out
}

const b64 = (ops: WinOp[]): string => Buffer.from(JSON.stringify(ops), 'utf8').toString('base64')

async function readWinStates(ops: WinOp[]): Promise<Record<string, OpState>> {
  if (!ops.length) return {}
  const script = `$OpsB64 = '${b64(ops)}'
${PS_LIB}
$res = @{}
foreach ($op in $ops) { $res[$op.key] = Read-Op $op }
$res | ConvertTo-Json -Depth 5 -Compress`
  return powershellJson<Record<string, OpState>>(script, 60_000)
}

const APPLY_BODY = `
$res = @{}
foreach ($op in $ops) {
  $prev = Read-Op $op
  $err = $null
  try {
    switch ($op.t) {
      'reg' { Write-Reg $op.path $op.name $op.kind $op.value }
      'svc' { Write-Svc $op.name $op.start $false }
      'cmd' { $o = cmd.exe /c $op.apply 2>&1 | Out-String; if ($LASTEXITCODE -ne 0) { throw $o.Trim() } }
    }
  } catch { $err = $_.ToString() }
  $res[$op.key] = @{ prev = $prev; error = $err }
}
`

const REVERT_BODY = `
$res = @{}
foreach ($op in $ops) {
  $err = $null
  $r = $op.restore
  try {
    switch ($op.t) {
      'reg' { if ($r.exists) { Write-Reg $op.path $op.name $r.kind $r.value } else { Remove-Reg $op.path $op.name } }
      'svc' { if ($r.exists) { Write-Svc $op.name $r.start $r.running } }
      'cmd' { if (-not ($r.exists -and [int]$r.value -eq [int]$op.check.value)) { $o = cmd.exe /c $op.revert 2>&1 | Out-String; if ($LASTEXITCODE -ne 0) { throw $o.Trim() } } }
    }
  } catch { $err = $_.ToString() }
  $res[$op.key] = @{ error = $err }
}
`

async function runWin(ops: WinOp[], body: string, elevated: boolean): Promise<Record<string, { prev?: OpState; error: string | null }>> {
  if (!ops.length) return {}
  const head = `$OpsB64 = '${b64(ops)}'\n${PS_LIB}\n${body}`
  if (elevated) {
    const out = await powershellElevated(`$ErrorActionPreference = 'Continue'\n${head}\n$res | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $OutFile -Encoding UTF8`)
    if (!out.trim()) throw new Error('Aucune réponse du script administrateur')
    return JSON.parse(out)
  }
  return powershellJson(`$ErrorActionPreference = 'Continue'\n${head}\n$res | ConvertTo-Json -Depth 6 -Compress`)
}

function sameValue(a: unknown, b: unknown): boolean {
  return String(a) === String(b)
}

function winApplied(def: TweakDef, states: Record<string, OpState>): boolean | null {
  for (let i = 0; i < def.ops.length; i++) {
    const op = def.ops[i]
    const s = states[`${def.id}:${i}`]
    if (!s) return null
    if (op.t === 'reg') {
      if (!s.exists) return false
      if (op.atMost ? !(Number(s.value) <= Number(op.value)) : !sameValue(s.value, op.value)) return false
    } else if (op.t === 'svc') {
      // Service absent de cette édition de Windows : rien à faire.
      if (!s.exists) continue
      if (op.start === 'Disabled' ? s.start !== 'Disabled' : s.start === 'Automatic') return false
    } else if (op.t === 'cmd') {
      if (!s.exists || !sameValue(s.value, op.check.value)) return false
    }
  }
  return true
}

// ─── macOS / Linux ───────────────────────────────────────────────────────

async function readPosix(op: TweakOp): Promise<string | null> {
  if (op.t === 'defaults') {
    const r = await run('defaults', ['read', op.domain, op.key], { timeoutMs: 5000 })
    if (r.code !== 0) return null
    const v = r.stdout.trim()
    return op.type === 'bool' ? (v === '1' ? 'true' : v === '0' ? 'false' : v) : v
  }
  if (op.t === 'gsettings') {
    const r = await run('gsettings', ['get', op.schema, op.key], { timeoutMs: 5000 })
    return r.code === 0 ? r.stdout.trim().replace(/^'|'$/g, '') : null
  }
  return null
}

async function writePosix(op: TweakOp, value: string | null): Promise<void> {
  let r
  if (op.t === 'defaults') {
    r =
      value === null
        ? await run('defaults', ['delete', op.domain, op.key], { timeoutMs: 5000 })
        : await run('defaults', ['write', op.domain, op.key, `-${op.type}`, value], { timeoutMs: 5000 })
    if (value === null && r.code !== 0) return // déjà absent
    if (op.restart) await run('killall', [op.restart], { timeoutMs: 5000 })
  } else if (op.t === 'gsettings') {
    r = await run('gsettings', ['set', op.schema, op.key, value ?? op.def], { timeoutMs: 5000 })
  } else return
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'Réglage refusé')
}

// ─── API ─────────────────────────────────────────────────────────────────

let gsettingsOk: boolean | null = null

async function platformDefs(): Promise<TweakDef[]> {
  const defs = TWEAKS.filter((t) => t.os === OS)
  if (OS === 'linux') {
    if (gsettingsOk === null) gsettingsOk = await hasCommand('gsettings')
    if (!gsettingsOk) return []
  }
  return defs
}

export async function listTweaks(hw: HardwareProfile): Promise<TweakInfo[]> {
  const defs = await platformDefs()
  const applied = new Map<string, boolean | null>()
  if (OS === 'windows') {
    const states = await readWinStates(toWinOps(defs)).catch(() => ({}) as Record<string, OpState>)
    for (const d of defs) applied.set(d.id, winApplied(d, states))
  } else {
    for (const d of defs) {
      const values = await Promise.all(d.ops.map((op) => readPosix(op)))
      applied.set(
        d.id,
        d.ops.every((op, i) => (op.t === 'defaults' || op.t === 'gsettings') && values[i] === op.value)
      )
    }
  }
  return defs.map((d) => ({
    id: d.id,
    category: d.category,
    title: d.title,
    description: d.description,
    tradeoff: d.tradeoff,
    risk: d.risk,
    admin: d.admin,
    restart: d.restart,
    recommended: d.recommend(hw),
    applied: applied.get(d.id) ?? null
  }))
}

/** Dossier des sauvegardes (visible par l'utilisateur, dans Documents). */
export function backupRoot(): string {
  return join(app.getPath('documents'), 'Power Studio', 'Sauvegardes')
}

/**
 * Sauvegarde AVANT modification : export .reg de chaque clé touchée (double-clic pour
 * restaurer), état des services, et copie du journal d'annulation de l'app.
 */
async function backupBefore(defs: TweakDef[]): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const dir = join(backupRoot(), stamp)
  mkdirSync(dir, { recursive: true })
  const lines = [
    'Sauvegarde créée par Power Studio avant de modifier ces réglages :',
    ...defs.map((d) => `  - ${d.title}`),
    ''
  ]
  if (OS === 'windows') {
    const keys = new Set<string>()
    for (const d of defs) {
      for (const op of d.ops) {
        if (op.t === 'reg') keys.add(fullKey(op.path))
        if (op.t === 'svc') keys.add(`HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\${op.name}`)
        if (op.t === 'cmd') keys.add(fullKey(op.check.path))
      }
    }
    let n = 0
    for (const key of keys) {
      const file = join(dir, `${String(++n).padStart(2, '0')}-${key.split('\\').pop()}.reg`)
      await run('reg.exe', ['export', key, file, '/y'], { timeoutMs: 15_000 })
    }
    lines.push(
      'Pour tout remettre comme avant :',
      '  1. Le plus simple : Power Studio > Optimisation > « Annuler » sur chaque réglage.',
      '  2. Sinon : double-clic sur chaque fichier .reg de ce dossier (clés qui existaient avant).',
      '  3. En dernier recours : Point de restauration Windows (tape « Créer un point de restauration »',
      '     dans le menu Démarrer > Restauration du système).'
    )
  } else {
    for (const d of defs) {
      for (const op of d.ops) {
        const v = await readPosix(op)
        if (op.t === 'defaults') lines.push(`defaults ${v === null ? `delete ${op.domain} ${op.key}` : `write ${op.domain} ${op.key} -${op.type} ${v}`}`)
        if (op.t === 'gsettings') lines.push(`gsettings set ${op.schema} ${op.key} ${v ?? op.def}`)
      }
    }
    lines.push('', 'Chaque ligne ci-dessus remet la valeur d’avant (à coller dans un Terminal).')
  }
  writeFileSync(join(dir, 'LISEZ-MOI.txt'), lines.join('\n'), 'utf8')
  writeFileSync(join(dir, 'journal-power-studio.json'), JSON.stringify(getStore().tweakJournal, null, 2), 'utf8')
  return dir
}

/** Crée un point de restauration Windows (droits admin). */
export async function createRestorePoint(): Promise<void> {
  if (OS !== 'windows') return
  const out = await powershellElevated(`
$ErrorActionPreference = 'Continue'
$k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore'
$old = (Get-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
try {
  Enable-ComputerRestore -Drive ($env:SystemDrive + '\\') -ErrorAction SilentlyContinue
  # Windows limite à un point toutes les 24 h : on lève la limite le temps de celui-ci.
  Set-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord
  Checkpoint-Computer -Description 'Power Studio - avant optimisation' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
  $r = 'ok'
} catch { $r = 'err:' + $_.ToString() }
if ($null -eq $old) { Remove-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
else { Set-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -Value $old -Type DWord }
Set-Content -LiteralPath $OutFile -Value $r
`)
  if (!out.trim().startsWith('ok')) throw new Error(out.replace(/^err:/, '').trim() || 'Point de restauration impossible')
  setSettings({ restorePointDone: true })
  logActivity('Point de restauration Windows créé', 'tweak')
}

function emptyResult(): TweakResult {
  return { ok: true, done: [], failed: [], adminDenied: false, restartNeeded: false }
}

export async function applyTweaks(ids: string[]): Promise<TweakResult & { backupDir: string | null }> {
  const defs = (await platformDefs()).filter((d) => ids.includes(d.id))
  const result = emptyResult()
  if (!defs.length) return { ...result, backupDir: null }
  const backupDir = await backupBefore(defs)

  if (OS === 'windows') {
    const groups = [defs.filter((d) => !d.admin), defs.filter((d) => d.admin)]
    for (const [gi, group] of groups.entries()) {
      if (!group.length) continue
      let res: Record<string, { prev?: OpState; error: string | null }>
      try {
        res = await runWin(toWinOps(group), APPLY_BODY, gi === 1)
      } catch (err) {
        if (err instanceof AdminDeniedError) result.adminDenied = true
        group.forEach((d) => result.failed.push({ id: d.id, error: err instanceof Error ? err.message : String(err) }))
        continue
      }
      for (const d of group) {
        const entries = d.ops.map((_, i) => res[`${d.id}:${i}`])
        const error = entries.find((e) => e?.error)?.error
        // On garde l'état d'origine même en cas d'échec partiel, pour pouvoir tout annuler.
        const already = getStore().tweakJournal[d.id]
        if (!already) updateStore((s) => (s.tweakJournal[d.id] = { at: Date.now(), snapshot: { ops: entries.map((e) => e?.prev ?? null) } }))
        if (error) result.failed.push({ id: d.id, error })
        else {
          result.done.push(d.id)
          if (d.restart) result.restartNeeded = true
        }
      }
    }
  } else {
    for (const d of defs) {
      try {
        const prev = await Promise.all(d.ops.map((op) => readPosix(op)))
        if (!getStore().tweakJournal[d.id]) updateStore((s) => (s.tweakJournal[d.id] = { at: Date.now(), snapshot: { ops: prev } }))
        for (const op of d.ops) if (op.t === 'defaults' || op.t === 'gsettings') await writePosix(op, op.value)
        result.done.push(d.id)
        if (d.restart) result.restartNeeded = true
      } catch (err) {
        result.failed.push({ id: d.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  result.ok = result.failed.length === 0
  if (result.done.length) logActivity(`${result.done.length} optimisation(s) appliquée(s) — sauvegarde dans ${backupDir}`, 'tweak')
  if (result.failed.length) logActivity(`${result.failed.length} optimisation(s) en échec`, 'error')
  return { ...result, backupDir }
}

export async function revertTweaks(ids: string[]): Promise<TweakResult> {
  const defs = (await platformDefs()).filter((d) => ids.includes(d.id))
  const result = emptyResult()
  const journal = getStore().tweakJournal

  if (OS === 'windows') {
    const withRestore = (group: TweakDef[]): WinOp[] => {
      const ops = toWinOps(group)
      return ops.map((op) => {
        const [id, idx] = op.key.split(':')
        const def = group.find((d) => d.id === id)!
        const src = def.ops[Number(idx)]
        const saved = (journal[id]?.snapshot.ops as (OpState | null)[] | undefined)?.[Number(idx)]
        // État « d'avant » déjà optimisé (par un autre outil) : on remet la valeur d'usine.
        const savedIsTarget =
          !!saved?.exists &&
          ((src.t === 'reg' && sameValue(saved.value, src.value)) || (src.t === 'svc' && saved.start === src.start))
        let restore: WinOp['restore']
        if (saved && !savedIsTarget) restore = saved
        else if (src.t === 'reg') restore = src.def === null ? { exists: false } : { exists: true, value: src.def, kind: src.kind }
        else if (src.t === 'svc') restore = { exists: true, start: src.def, running: src.def === 'Automatic' }
        else restore = { exists: false }
        return { ...op, restore }
      })
    }
    const groups = [defs.filter((d) => !d.admin), defs.filter((d) => d.admin)]
    for (const [gi, group] of groups.entries()) {
      if (!group.length) continue
      try {
        const res = await runWin(withRestore(group), REVERT_BODY, gi === 1)
        for (const d of group) {
          const error = d.ops.map((_, i) => res[`${d.id}:${i}`]?.error).find(Boolean)
          if (error) result.failed.push({ id: d.id, error })
          else {
            result.done.push(d.id)
            if (d.restart) result.restartNeeded = true
          }
        }
      } catch (err) {
        if (err instanceof AdminDeniedError) result.adminDenied = true
        group.forEach((d) => result.failed.push({ id: d.id, error: err instanceof Error ? err.message : String(err) }))
      }
    }
  } else {
    for (const d of defs) {
      try {
        const saved = journal[d.id]?.snapshot.ops as (string | null)[] | undefined
        for (const [i, op] of d.ops.entries()) {
          if (op.t !== 'defaults' && op.t !== 'gsettings') continue
          await writePosix(op, saved ? saved[i] : op.def)
        }
        result.done.push(d.id)
      } catch (err) {
        result.failed.push({ id: d.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  updateStore((s) => {
    for (const id of result.done) delete s.tweakJournal[id]
  })
  result.ok = result.failed.length === 0
  if (result.done.length) logActivity(`${result.done.length} optimisation(s) annulée(s)`, 'tweak')
  return result
}
