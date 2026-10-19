import si from 'systeminformation'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { promises as fsp } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import { host } from '@open-studio/module'
import { notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import type { AlertSettings, HistoryPoint, ProcessInfo, Sample, ScanEntry, ScanResult, SystemInfo, Volume } from '../shared/types'

// Moniteur système : rien n'est modifié sans demande explicite (seule action possible : terminer
// un programme, après confirmation dans l'interface).
// Mesures détaillées à la demande de l'interface ; en fond, une mesure légère toutes les 10 s
// pour l'historique et les alertes.

/** Valeur mesurée, ou null : jamais un 0 inventé quand le capteur ne répond pas. */
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
const settle = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null)

/**
 * Mesures lentes sous Windows (chacune lance PowerShell ou nvidia-smi) : rafraîchies toutes les
 * 5 s seulement, la valeur précédente sert entre deux.
 */
const slow = { at: 0, temp: null as si.Systeminformation.CpuTemperatureData | null, gfx: null as si.Systeminformation.GraphicsData | null, bat: null as si.Systeminformation.BatteryData | null, busy: false }
async function refreshSlow(): Promise<void> {
  if (slow.busy || Date.now() - slow.at < 5_000) return
  slow.busy = true
  const [temp, gfx, bat] = await Promise.all([settle(si.cpuTemperature()), settle(si.graphics()), settle(si.battery())])
  Object.assign(slow, { temp, gfx, bat, at: Date.now(), busy: false })
}

/** Réseau et disque (lents sous Windows aussi) : relus en tâche de fond, sans faire attendre la mesure. */
const io = { at: 0, net: null as si.Systeminformation.NetworkStatsData[] | null, disk: null as si.Systeminformation.DisksIoData | null, busy: false }
async function refreshIo(): Promise<void> {
  if (io.busy || Date.now() - io.at < 1_500) return
  io.busy = true
  const [net, disk] = await Promise.all([settle(si.networkStats()), settle(si.disksIO())])
  Object.assign(io, { net, disk, at: Date.now(), busy: false })
}

/**
 * Débit disque sous Windows : systeminformation ne le mesure pas, on lit les compteurs de
 * performance de Windows (noms WMI, identiques quelle que soit la langue) dans un seul PowerShell
 * qui tourne en boucle, plutôt qu'un nouveau processus à chaque mesure.
 */
const winDisk = { read: null as number | null, write: null as number | null, at: 0, proc: null as ChildProcess | null }
function startWinDisk(): void {
  if (process.platform !== 'win32' || winDisk.proc) return
  const script =
    "$ErrorActionPreference='SilentlyContinue'; while ($true) { $d = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter \"Name='_Total'\"; " +
    "if ($d) { [Console]::Out.WriteLine(('{0} {1}' -f $d.DiskReadBytesPersec, $d.DiskWriteBytesPersec)); [Console]::Out.Flush() }; Start-Sleep -Milliseconds 900 }"
  const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
  winDisk.proc = proc
  let buf = ''
  proc.stdout.on('data', (d: Buffer) => {
    buf += d.toString()
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    const last = lines.filter(Boolean).pop()
    const m = last && /^(\d+) (\d+)$/.exec(last.trim())
    if (m) Object.assign(winDisk, { read: Number(m[1]), write: Number(m[2]), at: Date.now() })
  })
  proc.on('exit', () => {
    winDisk.proc = null
  })
}

async function sample(): Promise<Sample> {
  startWinDisk()
  void refreshSlow()
  void refreshIo()
  const [load, mem] = await Promise.all([settle(si.currentLoad()), settle(si.mem())])
  const { temp, gfx, bat } = slow
  const { net, disk } = io
  const gpu = gfx?.controllers.find((c) => c.utilizationGpu != null) ?? null
  const sumNet = (k: 'rx_sec' | 'tx_sec'): number | null => {
    const vals = (net ?? []).map((n) => num(n[k])).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  return {
    at: Date.now(),
    cpu: num(load?.currentLoad),
    cores: (load?.cpus ?? []).map((c) => num(c.load)),
    memUsed: mem ? mem.active : null,
    memTotal: num(mem?.total),
    swapUsed: num(mem?.swapused),
    swapTotal: num(mem?.swaptotal),
    netRx: sumNet('rx_sec'),
    netTx: sumNet('tx_sec'),
    // Mesure Windows si elle est récente, sinon celle de systeminformation (macOS, Linux).
    diskRead: Date.now() - winDisk.at < 5_000 ? winDisk.read : num(disk?.rIO_sec),
    diskWrite: Date.now() - winDisk.at < 5_000 ? winDisk.write : num(disk?.wIO_sec),
    cpuTemp: temp && temp.main != null && temp.main > 0 ? temp.main : null,
    gpuLoad: num(gpu?.utilizationGpu),
    gpuTemp: num(gpu?.temperatureGpu),
    gpuMemUsed: gpu?.memoryUsed != null ? gpu.memoryUsed * 1024 * 1024 : null,
    gpuMemTotal: gpu?.memoryTotal != null ? gpu.memoryTotal * 1024 * 1024 : null,
    battery: bat?.hasBattery ? { percent: bat.percent, charging: bat.isCharging } : null
  }
}

async function processes(grouped = true): Promise<ProcessInfo[]> {
  const p = await si.processes()
  if (!grouped)
    return p.list
      .filter((x) => x.name && x.name !== 'System Idle Process' && x.pid > 0)
      .map((x) => ({ pid: x.pid, name: x.name.replace(/\.exe$/i, ''), cpu: x.cpu ?? 0, mem: (x.memRss ?? 0) * 1024, user: x.user ?? '', path: x.path ?? '' }))
      .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
      .slice(0, 600)
  // Regroupe les processus du même programme (Chrome, Electron… en lancent des dizaines).
  const groups = new Map<string, ProcessInfo>()
  for (const x of p.list) {
    if (!x.name || x.name === 'System Idle Process') continue
    const key = x.name.toLowerCase()
    const g = groups.get(key)
    const mem = (x.memRss ?? 0) * 1024
    if (g) {
      g.cpu += x.cpu ?? 0
      g.mem += mem
      g.count = (g.count ?? 1) + 1
    } else groups.set(key, { pid: x.pid, count: 1, name: x.name.replace(/\.exe$/i, ''), cpu: x.cpu ?? 0, mem, user: x.user ?? '', path: x.path ?? '' })
  }
  return [...groups.values()].sort((a, b) => b.cpu - a.cpu || b.mem - a.mem).slice(0, 300)
}

/** Termine un processus (et ses enfants), ou tous ceux d'un programme. Jamais le PC lui-même. */
async function kill(target: { pid?: number; name?: string }): Promise<number> {
  const PROTECTED = /^(system|smss|csrss|wininit|winlogon|services|lsass|svchost|explorer|dwm|kernel_task|launchd|systemd|init|electron|open studio)$/i
  let pids: number[] = []
  if (target.pid) pids = [target.pid]
  else if (target.name) {
    const list = (await si.processes()).list
    pids = list.filter((x) => x.name.replace(/\.exe$/i, '').toLowerCase() === target.name!.toLowerCase()).map((x) => x.pid)
  }
  const list = (await si.processes()).list
  const names = new Map(list.map((x) => [x.pid, x.name.replace(/\.exe$/i, '')]))
  pids = pids.filter((pid) => pid !== process.pid && pid !== process.ppid && !PROTECTED.test(names.get(pid) ?? ''))
  if (!pids.length) throw new Error('Ce programme est protégé : le terminer ferait planter le système ou Open Studio.')
  let n = 0
  for (const pid of pids) {
    await new Promise<void>((resolve) => {
      if (process.platform === 'win32') execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (err) => (err || n++, resolve()))
      else {
        try {
          process.kill(pid, 'SIGTERM')
          n++
        } catch {
          /* déjà terminé, ou pas le droit */
        }
        resolve()
      }
    })
  }
  if (!n) throw new Error('Impossible de le terminer (droits administrateur nécessaires ?).')
  return n
}

// ─── Historique et alertes ─────────────────────────────────────────────────────────────────

const history: HistoryPoint[] = []
const HISTORY_MAX = 6 * 360 // 6 h à une mesure toutes les 10 s
const DEFAULT_ALERTS: AlertSettings = { enabled: false, cpu: 90, cpuMinutes: 5, mem: 90, temp: 90, diskFree: 10, battery: 15 }
const alerts = (): AlertSettings => ({ ...DEFAULT_ALERTS, ...storeGet<Partial<AlertSettings>>('alerts', {}) })
const lastAlert = new Map<string, number>()
let lastDiskCheck = 0

function alert(kind: string, title: string, body: string): void {
  // Pas plus d'une alerte du même genre par demi-heure.
  if (Date.now() - (lastAlert.get(kind) ?? 0) < 30 * 60_000) return
  lastAlert.set(kind, Date.now())
  notify(title, body)
}

async function background(): Promise<void> {
  const [load, mem] = await Promise.all([settle(si.currentLoad()), settle(si.mem())])
  void refreshIo()
  // Interface fermée : température et batterie une fois par minute seulement (coûteux sous Windows),
  // sans la carte graphique.
  if (Date.now() - slow.at > 60_000 && !slow.busy) {
    slow.busy = true
    const [temp, bat] = await Promise.all([settle(si.cpuTemperature()), settle(si.battery())])
    Object.assign(slow, { temp, bat, at: Date.now(), busy: false })
  }
  const sum = (k: 'rx_sec' | 'tx_sec'): number | null => {
    const v = (io.net ?? []).map((n) => num(n[k])).filter((x): x is number => x !== null)
    return v.length ? v.reduce((a, b) => a + b, 0) : null
  }
  const point: HistoryPoint = {
    at: Date.now(),
    cpu: num(load?.currentLoad),
    mem: mem && mem.total ? (mem.active / mem.total) * 100 : null,
    netRx: sum('rx_sec'),
    netTx: sum('tx_sec'),
    temp: slow.temp && slow.temp.main != null && slow.temp.main > 0 ? slow.temp.main : null
  }
  history.push(point)
  if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX)

  const a = alerts()
  if (!a.enabled) return
  const recent = history.slice(-Math.max(1, Math.round((a.cpuMinutes * 60) / 10)))
  if (recent.length * 10 >= a.cpuMinutes * 60 && recent.every((p) => (p.cpu ?? 0) >= a.cpu)) {
    let top = ''
    try {
      top = (await processes())[0]?.name ?? ''
    } catch {
      /* pas grave */
    }
    alert('cpu', 'Processeur très chargé', `Plus de ${a.cpu} % depuis ${a.cpuMinutes} min${top ? ` (surtout ${top})` : ''}.`)
  }
  if (point.mem !== null && point.mem >= a.mem) alert('mem', 'Mémoire presque pleine', `${Math.round(point.mem)} % utilisés : ferme quelques programmes ou onglets.`)
  if (point.temp !== null && point.temp >= a.temp) alert('temp', 'Processeur très chaud', `${Math.round(point.temp)} °C. Vérifie la ventilation.`)
  const bat = slow.bat
  if (bat?.hasBattery && !bat.isCharging && bat.percent <= a.battery) alert('battery', 'Batterie faible', `${bat.percent} % restants : branche le chargeur.`)
  if (Date.now() - lastDiskCheck > 10 * 60_000) {
    lastDiskCheck = Date.now()
    try {
      for (const v of await volumes()) {
        const free = ((v.size - v.used) / v.size) * 100
        if (free < a.diskFree && v.size > 5e9) alert(`disk:${v.mount}`, `Disque ${v.label} presque plein`, `Plus que ${Math.round(free)} % libres (${((v.size - v.used) / 1e9).toFixed(1)} Go).`)
      }
    } catch {
      /* disques illisibles : rien */
    }
  }
}

// ─── Qu'est-ce qui prend de la place ? ─────────────────────────────────────────────────────

let scanId = 0
async function scan(root: string): Promise<ScanResult> {
  const id = ++scanId
  const t0 = Date.now()
  let files = 0
  let lastPush = 0
  const largest: ScanEntry[] = []
  const LIMIT = 400_000
  let truncated = false
  const keep = (e: ScanEntry): void => {
    if (largest.length < 40 || e.size > largest[largest.length - 1].size) {
      largest.push(e)
      largest.sort((a, b) => b.size - a.size)
      if (largest.length > 40) largest.pop()
    }
  }
  const walk = async (dir: string): Promise<{ size: number; files: number }> => {
    if (id !== scanId) throw new Error('annulé')
    let size = 0
    let n = 0
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return { size: 0, files: 0 }
    }
    for (const e of entries) {
      if (files > LIMIT) {
        truncated = true
        break
      }
      const p = join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        const r = await walk(p)
        size += r.size
        n += r.files
      } else if (e.isFile()) {
        try {
          const st = await fsp.stat(p)
          size += st.size
          n++
          files++
          keep({ name: e.name, path: p, size: st.size, files: 1, dir: false })
        } catch {
          /* fichier verrouillé */
        }
      }
    }
    if (Date.now() - lastPush > 400) {
      lastPush = Date.now()
      host.send('monitor:scanProgress', { files, path: dir })
    }
    return { size, files: n }
  }
  const children: ScanEntry[] = []
  let total = 0
  let entries
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    throw new Error('Dossier illisible (droits insuffisants ?).')
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue
    const p = join(root, e.name)
    if (e.isDirectory()) {
      const r = await walk(p)
      children.push({ name: e.name, path: p, size: r.size, files: r.files, dir: true })
      total += r.size
    } else if (e.isFile()) {
      try {
        const st = await fsp.stat(p)
        children.push({ name: e.name, path: p, size: st.size, files: 1, dir: false })
        keep({ name: e.name, path: p, size: st.size, files: 1, dir: false })
        total += st.size
        files++
      } catch {
        /* verrouillé */
      }
    }
  }
  children.sort((a, b) => b.size - a.size)
  return { root, size: total, files, children, largest, ms: Date.now() - t0, truncated }
}

async function volumes(): Promise<Volume[]> {
  const [fs, blocks] = await Promise.all([si.fsSize(), settle(si.blockDevices())])
  return fs
    .filter((f) => f.size > 0)
    .map((f) => ({
      mount: f.mount,
      fs: f.type,
      size: f.size,
      used: f.used,
      label: blocks?.find((b) => b.mount === f.mount)?.label || f.mount
    }))
}

async function info(): Promise<SystemInfo> {
  const [sys, cpu, mem, os, gfx, disks, nets, time] = await Promise.all([
    settle(si.system()),
    settle(si.cpu()),
    settle(si.mem()),
    settle(si.osInfo()),
    settle(si.graphics()),
    settle(si.diskLayout()),
    settle(si.networkInterfaces()),
    Promise.resolve(si.time())
  ])
  const netList = Array.isArray(nets) ? nets : nets ? [nets] : []
  return {
    host: hostname(),
    os: os?.distro ?? process.platform,
    osVersion: os?.release ?? '',
    arch: os?.arch ?? process.arch,
    manufacturer: sys?.manufacturer ?? '',
    model: sys?.model ?? '',
    cpuBrand: cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : '',
    cpuCores: cpu?.cores ?? 0,
    cpuPhysical: cpu?.physicalCores ?? 0,
    performanceCores: num(cpu?.performanceCores) || null,
    efficiencyCores: num(cpu?.efficiencyCores) || null,
    cpuSpeed: num(cpu?.speedMax) ?? num(cpu?.speed),
    memTotal: mem?.total ?? 0,
    gpus: (gfx?.controllers ?? []).map((g) => ({ model: g.model, vram: g.vram ? g.vram * 1024 * 1024 : null })),
    disks: (disks ?? []).map((d) => ({ name: d.name, type: d.type, size: d.size, interface: d.interfaceType })),
    uptime: num(time.uptime) ?? 0,
    network: netList
      .filter((n) => !n.internal && n.ip4)
      .map((n) => ({ iface: n.ifaceName || n.iface, ip4: n.ip4, mac: n.mac, speed: num(n.speed), type: n.type }))
  }
}

// ─── Test de débit ─────────────────────────────────────────────────────────────────────────

/** Latence (médiane de 5 petites requêtes), puis téléchargement et envoi chronométrés. */
async function speedtest(): Promise<{ ping: number; jitter: number; down: number; up: number; server: string }> {
  const base = 'https://speed.cloudflare.com'
  const pings: number[] = []
  for (let i = 0; i < 6; i++) {
    const t = performance.now()
    const r = await fetch(`${base}/__down?bytes=0`, { cache: 'no-store' })
    await r.arrayBuffer()
    if (i) pings.push(performance.now() - t) // la 1re inclut la connexion
  }
  pings.sort((a, b) => a - b)
  const ping = pings[Math.floor(pings.length / 2)]
  const jitter = pings.slice(1).reduce((a, p, i) => a + Math.abs(p - pings[i]), 0) / Math.max(1, pings.length - 1)
  host.send('monitor:speedProgress', { phase: 'down', ping })
  // Téléchargement : 4 × 10 Mo en parallèle, ou 10 s maximum.
  let bytes = 0
  const t0 = performance.now()
  const ctrl = new AbortController()
  const stop = setTimeout(() => ctrl.abort(), 10_000)
  await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      const r = await fetch(`${base}/__down?bytes=10000000`, { cache: 'no-store', signal: ctrl.signal })
      const reader = r.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        host.send('monitor:speedProgress', { phase: 'down', ping, down: (bytes * 8) / ((performance.now() - t0) / 1000) })
      }
    })
  )
  clearTimeout(stop)
  const down = (bytes * 8) / ((performance.now() - t0) / 1000)
  host.send('monitor:speedProgress', { phase: 'up', ping, down })
  // Envoi : 3 × 5 Mo.
  const chunk = new Uint8Array(5_000_000)
  const t1 = performance.now()
  let sent = 0
  await Promise.allSettled(
    Array.from({ length: 3 }, async () => {
      await fetch(`${base}/__up`, { method: 'POST', body: chunk })
      sent += chunk.byteLength
    })
  )
  const up = (sent * 8) / ((performance.now() - t1) / 1000)
  if (!bytes) throw new Error('Pas de connexion au serveur de test (speed.cloudflare.com).')
  return { ping, jitter, down, up: sent ? up : 0, server: 'Cloudflare' }
}

let bg: NodeJS.Timeout | null = null

export function deactivate(): void {
  winDisk.proc?.kill()
  if (bg) clearInterval(bg)
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('monitor:sample', () => sample())
  ipc.handle('monitor:processes', (_e, grouped?: boolean) => processes(grouped ?? true))
  ipc.handle('monitor:kill', (_e, target: { pid?: number; name?: string }) => kill(target))
  ipc.handle('monitor:history', () => history)
  ipc.handle('monitor:alerts', () => alerts())
  ipc.handle('monitor:setAlerts', (_e, patch: Partial<AlertSettings>) => {
    storeSet('alerts', { ...alerts(), ...patch })
    return alerts()
  })
  ipc.handle('monitor:scan', (_e, dir: string) => scan(dir))
  ipc.handle('monitor:cancelScan', () => void scanId++)
  ipc.handle('monitor:speedtest', () => speedtest())
  ipc.handle('monitor:volumes', () => volumes())
  ipc.handle('monitor:info', () => info())
  void background()
  bg = setInterval(() => void background(), 10_000)
}
