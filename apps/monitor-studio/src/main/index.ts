import si from 'systeminformation'
import { hostname } from 'os'
import { host } from '@open-studio/module'
import { registerKit } from '@open-studio/kit'
import type { ProcessInfo, Sample, SystemInfo, Volume } from '../shared/types'

// Moniteur système : lecture seule (aucun réglage modifié, aucun processus arrêté).
// Les mesures sont faites à la demande de l'interface, donc seulement quand elle est ouverte.

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

async function sample(): Promise<Sample> {
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
    diskRead: num(disk?.rIO_sec),
    diskWrite: num(disk?.wIO_sec),
    cpuTemp: temp && temp.main != null && temp.main > 0 ? temp.main : null,
    gpuLoad: num(gpu?.utilizationGpu),
    gpuTemp: num(gpu?.temperatureGpu),
    gpuMemUsed: gpu?.memoryUsed != null ? gpu.memoryUsed * 1024 * 1024 : null,
    gpuMemTotal: gpu?.memoryTotal != null ? gpu.memoryTotal * 1024 * 1024 : null,
    battery: bat?.hasBattery ? { percent: bat.percent, charging: bat.isCharging } : null
  }
}

async function processes(): Promise<ProcessInfo[]> {
  const p = await si.processes()
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
    } else groups.set(key, { pid: x.pid, name: x.name.replace(/\.exe$/i, ''), cpu: x.cpu ?? 0, mem, user: x.user ?? '', path: x.path ?? '' })
  }
  return [...groups.values()].sort((a, b) => b.cpu - a.cpu || b.mem - a.mem).slice(0, 300)
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

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('monitor:sample', () => sample())
  ipc.handle('monitor:processes', () => processes())
  ipc.handle('monitor:volumes', () => volumes())
  ipc.handle('monitor:info', () => info())
}
