import { existsSync, lstatSync, readdirSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import type { CleanResult, CleanTarget } from '@shared/types'
import { AdminDeniedError, OS, powershellElevated, powershellJson, psq, shellElevated } from './platform/exec'
import { logActivity } from './store'

interface TargetDef {
  id: string
  name: string
  description: string
  admin: boolean
  /** Dossiers dont le CONTENU est vidé (le dossier lui-même reste). */
  dirs: string[]
  /** Nettoyage spécial (corbeille, cache de Windows Update…). */
  special?: 'recycle' | 'wupdate' | 'apt' | 'journal'
}

function defs(): TargetDef[] {
  const home = homedir()
  if (OS === 'windows') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    const win = process.env.SystemRoot ?? 'C:\\Windows'
    return [
      { id: 'temp', name: 'Fichiers temporaires', description: 'Fichiers laissés par les installations et les apps.', admin: false, dirs: [tmpdir()] },
      { id: 'shaders', name: 'Caches de shaders', description: 'DirectX et NVIDIA les recréent au prochain lancement des jeux (premier lancement un peu plus lent).', admin: false, dirs: [join(local, 'D3DSCache'), join(local, 'NVIDIA', 'DXCache'), join(local, 'NVIDIA', 'GLCache'), join(local, 'AMD', 'DxCache')] },
      { id: 'crashdumps', name: 'Rapports de plantage', description: 'Vidages mémoire des apps qui ont planté.', admin: false, dirs: [join(local, 'CrashDumps'), join(local, 'Microsoft', 'Windows', 'WER', 'ReportArchive')] },
      { id: 'recycle', name: 'Corbeille', description: 'Les fichiers de la corbeille sont supprimés définitivement.', admin: false, dirs: [], special: 'recycle' },
      { id: 'wintemp', name: 'Temporaires de Windows', description: 'Dossier Temp du système.', admin: true, dirs: [join(win, 'Temp')] },
      { id: 'wupdate', name: 'Cache de Windows Update', description: 'Mises à jour déjà installées (Windows re-télécharge au besoin).', admin: true, dirs: [join(win, 'SoftwareDistribution', 'Download')], special: 'wupdate' }
    ]
  }
  if (OS === 'mac') {
    return [
      { id: 'caches', name: 'Caches des apps', description: 'Recréés automatiquement par les apps.', admin: false, dirs: [join(home, 'Library', 'Caches')] },
      { id: 'logs', name: 'Journaux', description: 'Anciens fichiers de log des apps.', admin: false, dirs: [join(home, 'Library', 'Logs')] },
      { id: 'trash', name: 'Corbeille', description: 'Les fichiers de la corbeille sont supprimés définitivement.', admin: false, dirs: [join(home, '.Trash')] }
    ]
  }
  return [
    { id: 'thumbs', name: 'Miniatures', description: 'Aperçus d’images recréés à la demande.', admin: false, dirs: [join(home, '.cache', 'thumbnails')] },
    { id: 'trash', name: 'Corbeille', description: 'Les fichiers de la corbeille sont supprimés définitivement.', admin: false, dirs: [join(home, '.local', 'share', 'Trash', 'files'), join(home, '.local', 'share', 'Trash', 'info')] },
    { id: 'apt', name: 'Paquets téléchargés (apt)', description: 'Paquets .deb déjà installés.', admin: true, dirs: ['/var/cache/apt/archives'], special: 'apt' },
    { id: 'journal', name: 'Journaux système anciens', description: 'Garde seulement les 7 derniers jours.', admin: true, dirs: [], special: 'journal' }
  ]
}

/** Taille d'un dossier (plafonnée en nombre de fichiers pour rester rapide). */
function dirSize(dir: string, budget = { n: 200_000 }): number {
  let total = 0
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return 0
  }
  for (const e of entries) {
    if (--budget.n < 0) break
    const p = join(dir, e)
    try {
      const st = lstatSync(p)
      if (st.isSymbolicLink()) continue
      total += st.isDirectory() ? dirSize(p, budget) : st.size
    } catch {
      // fichier disparu / verrouillé
    }
  }
  return total
}

async function recycleSize(): Promise<number> {
  const res = await powershellJson<number>(
    `$s = New-Object -ComObject Shell.Application; $b = $s.Namespace(10); $t = 0; foreach ($i in $b.Items()) { $t += [int64]$i.ExtendedProperty('Size') }; $t`,
    30_000
  ).catch(() => 0)
  return Number(res) || 0
}

export async function listCleanTargets(): Promise<CleanTarget[]> {
  const out: CleanTarget[] = []
  for (const d of defs()) {
    let bytes = d.dirs.filter((p) => existsSync(p)).reduce((s, p) => s + dirSize(p), 0)
    if (d.special === 'recycle') bytes = await recycleSize()
    if (d.special === 'journal') bytes = 0
    out.push({ id: d.id, name: d.name, description: d.description, bytes, admin: d.admin })
  }
  return out
}

/** Vide le contenu d'un dossier ; les fichiers en cours d'utilisation sont simplement ignorés. */
function emptyDir(dir: string): number {
  let freed = 0
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = join(dir, e)
    try {
      const st = lstatSync(p)
      const size = st.isDirectory() && !st.isSymbolicLink() ? dirSize(p) : st.size
      rmSync(p, { recursive: true, force: true, maxRetries: 1 })
      freed += size
    } catch {
      // verrouillé par une app ouverte : ignoré
    }
  }
  return freed
}

export async function clean(ids: string[]): Promise<CleanResult> {
  const targets = defs().filter((d) => ids.includes(d.id))
  const before = new Map((await listCleanTargets()).map((t) => [t.id, t.bytes]))
  const result: CleanResult = { freedBytes: 0, failed: [], adminDenied: false }

  for (const t of targets.filter((t) => !t.admin)) {
    try {
      if (t.special === 'recycle') {
        await powershellJson(`Clear-RecycleBin -Force -ErrorAction SilentlyContinue; '"ok"'`, 120_000)
        result.freedBytes += before.get(t.id) ?? 0
      } else {
        for (const d of t.dirs) if (existsSync(d)) result.freedBytes += emptyDir(d)
      }
    } catch (err) {
      result.failed.push({ id: t.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const admin = targets.filter((t) => t.admin)
  if (admin.length) {
    try {
      if (OS === 'windows') {
        const wu = admin.some((t) => t.special === 'wupdate')
        const dirs = admin.flatMap((t) => t.dirs)
        await powershellElevated(`
$ErrorActionPreference = 'Continue'
${wu ? "Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue\nStop-Service -Name bits -Force -ErrorAction SilentlyContinue" : ''}
foreach ($d in @(${dirs.map(psq).join(', ')})) {
  if (Test-Path -LiteralPath $d) { Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
}
${wu ? 'Start-Service -Name bits -ErrorAction SilentlyContinue\nStart-Service -Name wuauserv -ErrorAction SilentlyContinue' : ''}
Set-Content -LiteralPath $OutFile -Value 'ok'
`)
      } else {
        const cmds: string[] = []
        if (admin.some((t) => t.special === 'apt')) cmds.push('apt-get clean')
        if (admin.some((t) => t.special === 'journal')) cmds.push('journalctl --vacuum-time=7d')
        if (cmds.length) await shellElevated(cmds.join('; '))
      }
      const after = new Map((await listCleanTargets()).map((t) => [t.id, t.bytes]))
      for (const t of admin) result.freedBytes += Math.max(0, (before.get(t.id) ?? 0) - (after.get(t.id) ?? 0))
    } catch (err) {
      if (err instanceof AdminDeniedError) result.adminDenied = true
      admin.forEach((t) => result.failed.push({ id: t.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }

  if (result.freedBytes > 0) logActivity(`Nettoyage : ${(result.freedBytes / 1024 ** 3).toFixed(2)} Go libérés`, 'clean')
  return result
}
