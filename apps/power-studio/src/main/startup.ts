import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { StartupItem } from '@shared/types'
import { AdminDeniedError, OS, powershellElevated, powershellJson, psq, run } from './platform/exec'
import { getStore, logActivity, updateStore } from './store'

const HEAVY = /steam|epic|riot|discord|spotify|opera|chrome|edge|teams|onedrive|dropbox|curseforge|overwolf|roblox|wallpaper|battle\.?net|origin|ea ?app|ubisoft|adobe|creative cloud|skype|zoom|slack|icloud|google drive|nzxt|armoury|icue|synapse|lghub|msi center/i
const MEDIUM = /update|updater|helper|assistant|agent|launcher|tray|notifier|lm studio|ollama/i
const ESSENTIAL = /securityhealth|windows defender|rtkaud|realtek|nvidia|nvbackend|amd|radeon|intel|igfx|synaptics|elan|touchpad|bluetooth|audio|nahimic|waves|dolby|ctfmon|onedrivesetup/i

function impact(name: string, command: string): StartupItem['impact'] {
  const s = `${name} ${command}`
  if (HEAVY.test(s)) return 'high'
  if (MEDIUM.test(s)) return 'medium'
  return 'low'
}

// ─── Windows : clés Run + dossiers Démarrage, état dans StartupApproved (comme le Gestionnaire des tâches) ───

interface WinRaw {
  name: string
  command: string
  source: 'hkcu' | 'hklm' | 'hklm32' | 'userfolder' | 'commonfolder'
  approved: string | null
}

const WIN_LIST = `
$items = @()
function Approved($root, $sub, $name) {
  try {
    $v = (Get-ItemProperty -LiteralPath ($root + '\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\' + $sub) -Name $name -ErrorAction Stop).$name
    if ($v) { return [BitConverter]::ToString($v[0..0]) }
  } catch {}
  return $null
}
$runs = @(
  @{ path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; source = 'hkcu'; root = 'HKCU:'; sub = 'Run' },
  @{ path = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; source = 'hklm'; root = 'HKLM:'; sub = 'Run' },
  @{ path = 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'; source = 'hklm32'; root = 'HKLM:'; sub = 'Run32' }
)
foreach ($r in $runs) {
  $k = Get-Item -LiteralPath $r.path -ErrorAction SilentlyContinue
  if (-not $k) { continue }
  foreach ($n in $k.GetValueNames()) {
    if (-not $n) { continue }
    $items += @{ name = $n; command = [string]$k.GetValue($n); source = $r.source; approved = (Approved $r.root $r.sub $n) }
  }
}
$folders = @(
  @{ path = [Environment]::GetFolderPath('Startup'); source = 'userfolder'; root = 'HKCU:' },
  @{ path = [Environment]::GetFolderPath('CommonStartup'); source = 'commonfolder'; root = 'HKLM:' }
)
foreach ($f in $folders) {
  if (-not (Test-Path -LiteralPath $f.path)) { continue }
  foreach ($file in Get-ChildItem -LiteralPath $f.path -File -ErrorAction SilentlyContinue) {
    if ($file.Name -eq 'desktop.ini') { continue }
    $items += @{ name = $file.Name; command = $file.FullName; source = $f.source; approved = (Approved $f.root 'StartupFolder' $file.Name) }
  }
}
ConvertTo-Json -InputObject @($items) -Depth 3 -Compress
`

const LOCATION: Record<WinRaw['source'], string> = {
  hkcu: 'Registre (utilisateur)',
  hklm: 'Registre (tous les utilisateurs)',
  hklm32: 'Registre (tous les utilisateurs, 32 bits)',
  userfolder: 'Dossier Démarrage',
  commonfolder: 'Dossier Démarrage (tous les utilisateurs)'
}

async function listWindows(): Promise<StartupItem[]> {
  const raw = await powershellJson<WinRaw[] | WinRaw>(WIN_LIST, 30_000)
  const list = Array.isArray(raw) ? raw : [raw]
  return list.map((r) => {
    const name = r.name.replace(/\.lnk$/i, '')
    // StartupApproved : premier octet pair = actif, impair (03, 07…) = désactivé ; absent = actif.
    const enabled = r.approved === null || parseInt(r.approved, 16) % 2 === 0
    return {
      id: `${r.source}|${r.name}`,
      name,
      command: r.command,
      location: LOCATION[r.source],
      enabled,
      admin: r.source !== 'hkcu' && r.source !== 'userfolder',
      impact: impact(name, r.command),
      essential: !HEAVY.test(name) && (ESSENTIAL.test(name) || /\\windows\\system32\\/i.test(r.command))
    }
  })
}

async function toggleWindows(item: StartupItem, enable: boolean): Promise<void> {
  const [source, name] = [item.id.split('|')[0] as WinRaw['source'], item.id.slice(item.id.indexOf('|') + 1)]
  const root = source === 'hkcu' || source === 'userfolder' ? 'HKCU:' : 'HKLM:'
  const sub = source === 'hklm32' ? 'Run32' : source.endsWith('folder') ? 'StartupFolder' : 'Run'
  const script = `
$p = ${psq(`${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\${sub}`)}
if (-not (Test-Path -LiteralPath $p)) { New-Item -Path $p -Force | Out-Null }
$bytes = New-Object byte[] 12
$bytes[0] = ${enable ? 2 : 3}
if (${enable ? '$false' : '$true'}) { [BitConverter]::GetBytes([DateTime]::Now.ToFileTime()).CopyTo($bytes, 4) }
New-ItemProperty -LiteralPath $p -Name ${psq(name)} -PropertyType Binary -Value $bytes -Force | Out-Null
`
  if (item.admin) await powershellElevated(`${script}\nSet-Content -LiteralPath $OutFile -Value 'ok'`)
  else await powershellJson(`${script}\n'"ok"'`)
}

// ─── Linux : ~/.config/autostart (Hidden=true pour désactiver, standard XDG) ───

function linuxDirs(): { user: string; system: string } {
  return { user: join(homedir(), '.config', 'autostart'), system: '/etc/xdg/autostart' }
}

function desktopField(text: string, key: string): string | null {
  return text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? null
}

function listLinux(): StartupItem[] {
  const { user, system } = linuxDirs()
  const files = new Map<string, { path: string; text: string; userCopy: boolean }>()
  for (const [dir, userCopy] of [[system, false], [user, true]] as const) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.desktop'))) {
      try {
        files.set(f, { path: join(dir, f), text: readFileSync(join(dir, f), 'utf8'), userCopy })
      } catch {
        // illisible
      }
    }
  }
  return [...files.entries()].map(([file, { text }]) => {
    const name = desktopField(text, 'Name') ?? file.replace(/\.desktop$/, '')
    const command = desktopField(text, 'Exec') ?? ''
    const hidden = /^Hidden=true$/m.test(text) || /^X-GNOME-Autostart-enabled=false$/m.test(text)
    return {
      id: file,
      name,
      command,
      location: '~/.config/autostart',
      enabled: !hidden,
      admin: false,
      impact: impact(name, command),
      essential: /gnome|kde|xdg|polkit|keyring|ibus|pulse|pipewire|at-spi|print|update-notifier|user-dirs/i.test(`${file} ${command}`)
    }
  })
}

function toggleLinux(item: StartupItem, enable: boolean): void {
  const { user, system } = linuxDirs()
  mkdirSync(user, { recursive: true })
  const userPath = join(user, item.id)
  const source = existsSync(userPath) ? userPath : join(system, item.id)
  let text = readFileSync(source, 'utf8').replace(/^Hidden=.*\n?/gm, '').replace(/^X-GNOME-Autostart-enabled=.*\n?/gm, '')
  if (!enable) text = text.replace(/(\[Desktop Entry\][^\n]*\n)/, `$1Hidden=true\n`)
  writeFileSync(userPath, text, 'utf8')
}

// ─── macOS : éléments de connexion (Réglages > Général > Ouverture) ───

async function listMac(): Promise<StartupItem[]> {
  const res = await run('osascript', ['-e', 'tell application "System Events" to get the {name, path} of every login item'], { timeoutMs: 15_000 })
  const disabled = getStore().disabledLoginItems ?? {}
  const items: StartupItem[] = []
  if (res.code === 0) {
    const parts = res.stdout.trim().split(', ')
    const half = Math.floor(parts.length / 2)
    for (let i = 0; i < half; i++) {
      const name = parts[i]
      const path = parts[half + i]
      items.push({ id: name, name, command: path, location: 'Éléments de connexion', enabled: true, admin: false, impact: impact(name, path), essential: false })
    }
  }
  for (const [name, path] of Object.entries(disabled)) {
    if (!items.some((i) => i.id === name)) {
      items.push({ id: name, name, command: path, location: 'Éléments de connexion', enabled: false, admin: false, impact: impact(name, path), essential: false })
    }
  }
  return items
}

async function toggleMac(item: StartupItem, enable: boolean): Promise<void> {
  const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = enable
    ? `tell application "System Events" to make login item at end with properties {path:"${esc(item.command)}", hidden:false}`
    : `tell application "System Events" to delete login item "${esc(item.name)}"`
  const res = await run('osascript', ['-e', script], { timeoutMs: 15_000 })
  if (res.code !== 0) throw new Error(res.stderr.trim() || 'Refusé par macOS')
  updateStore((d) => {
    d.disabledLoginItems = d.disabledLoginItems ?? {}
    if (enable) delete d.disabledLoginItems[item.name]
    else d.disabledLoginItems[item.name] = item.command
  })
}

// ─── API ───

export async function listStartup(): Promise<StartupItem[]> {
  const items = OS === 'windows' ? await listWindows() : OS === 'linux' ? listLinux() : await listMac()
  const order = { high: 0, medium: 1, low: 2, unknown: 3 }
  return items.sort((a, b) => Number(a.essential) - Number(b.essential) || order[a.impact] - order[b.impact] || a.name.localeCompare(b.name))
}

export async function setStartupEnabled(id: string, enable: boolean): Promise<{ ok: boolean; error: string | null; adminDenied: boolean }> {
  const item = (await listStartup()).find((i) => i.id === id)
  if (!item) return { ok: false, error: 'Élément introuvable', adminDenied: false }
  try {
    if (OS === 'windows') await toggleWindows(item, enable)
    else if (OS === 'linux') toggleLinux(item, enable)
    else await toggleMac(item, enable)
    logActivity(`Démarrage : « ${item.name} » ${enable ? 'réactivé' : 'désactivé'}`, 'startup')
    return { ok: true, error: null, adminDenied: false }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), adminDenied: err instanceof AdminDeniedError }
  }
}

