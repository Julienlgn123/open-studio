import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import si from 'systeminformation'
import type { GpuInfo, GpuVendor, HardwareProfile, VendorTool } from '@shared/types'
import { hasCommand, OS, run } from './platform/exec'

let cached: HardwareProfile | null = null
let pending: Promise<HardwareProfile> | null = null

function gpuVendor(vendor: string, model: string): GpuVendor {
  const s = `${vendor} ${model}`.toLowerCase()
  if (/nvidia|geforce|quadro|rtx|gtx/.test(s)) return 'nvidia'
  if (/amd|radeon|ati\b/.test(s)) return 'amd'
  if (/intel|iris|uhd|arc/.test(s)) return 'intel'
  if (/apple/.test(s)) return 'apple'
  return 'other'
}

/** Chemin de nvidia-smi (installé avec le pilote NVIDIA). */
export async function nvidiaSmi(): Promise<string | null> {
  if (OS === 'windows') {
    const candidates = [
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'nvidia-smi.exe'),
      'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'
    ]
    return candidates.find((p) => existsSync(p)) ?? null
  }
  if (OS === 'linux' && (await hasCommand('nvidia-smi'))) return 'nvidia-smi'
  return null
}

async function nvidiaPowerLimit(): Promise<GpuInfo['powerLimit']> {
  const smi = await nvidiaSmi()
  if (!smi) return null
  const res = await run(smi, ['--query-gpu=power.min_limit,power.max_limit,power.default_limit,power.limit', '--format=csv,noheader,nounits'], { timeoutMs: 8000 })
  if (res.code !== 0) return null
  const [min, max, def, cur] = res.stdout.split('\n')[0].split(',').map((s) => parseFloat(s.trim()))
  if (![min, max, def, cur].every((n) => Number.isFinite(n) && n > 0) || max <= min) return null
  return { min, max, default: def, current: cur }
}

/** Logiciels de fabricant connus : ce sont eux qui pilotent vraiment les ventilateurs. */
function detectVendorTools(): VendorTool[] {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const candidates: { id: string; name: string; paths: string[]; fans: boolean }[] =
    OS === 'windows'
      ? [
          { id: 'nzxt', name: 'NZXT CAM', paths: [join(pf, 'NZXT CAM', 'NZXT CAM.exe')], fans: true },
          { id: 'msi-center', name: 'MSI Center', paths: [join(pf86, 'MSI', 'One Dragon Center', 'MSI_Central_Service.exe'), join(pf, 'MSI', 'MSI Center', 'MSI Center.exe')], fans: true },
          { id: 'msi-afterburner', name: 'MSI Afterburner', paths: [join(pf86, 'MSI Afterburner', 'MSIAfterburner.exe')], fans: true },
          { id: 'armoury', name: 'Armoury Crate', paths: [join(pf, 'ASUS', 'Armoury Crate Service', 'ArmouryCrate.Service.exe')], fans: true },
          { id: 'fancontrol', name: 'Fan Control', paths: [join(pf, 'FanControl', 'FanControl.exe'), join(local, 'Programs', 'FanControl', 'FanControl.exe')], fans: true },
          { id: 'icue', name: 'Corsair iCUE', paths: [join(pf, 'Corsair', 'Corsair iCUE5 Software', 'iCUE.exe'), join(pf, 'Corsair', 'CORSAIR iCUE 5 Software', 'iCUE.exe')], fans: true },
          { id: 'lghub', name: 'Logitech G HUB', paths: [join(pf, 'LGHUB', 'lghub.exe')], fans: false },
          { id: 'gigabyte', name: 'GIGABYTE Control Center', paths: [join(pf, 'GIGABYTE', 'Control Center', 'GCC.exe')], fans: true },
          { id: 'razer', name: 'Razer Synapse', paths: [join(pf86, 'Razer', 'Synapse3', 'WPFUI', 'Framework', 'Razer Synapse 3 Host', 'Razer Synapse 3.exe')], fans: false }
        ]
      : OS === 'mac'
        ? [
            { id: 'macs-fan', name: 'Macs Fan Control', paths: ['/Applications/Macs Fan Control.app'], fans: true },
            { id: 'tgpro', name: 'TG Pro', paths: ['/Applications/TG Pro.app'], fans: true }
          ]
        : []
  const found: VendorTool[] = []
  for (const c of candidates) {
    const path = c.paths.find((p) => existsSync(p))
    if (path) found.push({ id: c.id, name: c.name, path, fans: c.fans })
  }
  return found
}

async function macCaps(): Promise<{ low: boolean; high: boolean }> {
  const res = await run('pmset', ['-g', 'cap'], { timeoutMs: 5000 })
  const text = res.stdout.toLowerCase()
  return { low: /lowpowermode|powermode/.test(text), high: /highpowermode|powermode/.test(text) && /max|pro/i.test((await si.cpu()).brand) }
}

async function detect(): Promise<HardwareProfile> {
  const [sys, chassis, cpu, graphics, mem, battery, disks, os] = await Promise.all([
    si.system().catch(() => null),
    si.chassis().catch(() => null),
    si.cpu(),
    si.graphics().catch(() => ({ controllers: [] as si.Systeminformation.GraphicsControllerData[] })),
    si.mem(),
    si.battery().catch(() => null),
    si.diskLayout().catch(() => [] as si.Systeminformation.DiskLayoutData[]),
    si.osInfo().catch(() => null)
  ])

  const hasBattery = !!battery?.hasBattery
  const chassisType = (chassis?.type ?? '').toLowerCase()
  const laptop = hasBattery || /laptop|notebook|portable|convertible|tablet|detachable|sub notebook/.test(chassisType)

  const powerLimit = await nvidiaPowerLimit()
  const seen = new Set<string>()
  const gpus: GpuInfo[] = graphics.controllers
    .filter((c) => c.model && !/basic display|remote|virtual|parsec|microsoft basic/i.test(c.model))
    .filter((c) => {
      const key = c.model.trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((c) => {
      const vendor = gpuVendor(c.vendor ?? '', c.model)
      const integrated = vendor === 'apple' || !!c.vramDynamic || (vendor === 'intel' && !/arc/i.test(c.model)) || /vega \d|radeon\(tm\) graphics|radeon graphics/i.test(c.model)
      return {
        vendor,
        model: c.model.replace(/\(R\)|\(TM\)/g, '').trim(),
        vramMb: c.vram ?? null,
        integrated,
        powerLimit: vendor === 'nvidia' ? powerLimit : null
      }
    })
    .sort((a, b) => Number(a.integrated) - Number(b.integrated))

  const cpuVendor = /amd/i.test(cpu.manufacturer) ? 'amd' : /intel/i.test(cpu.manufacturer) ? 'intel' : /apple/i.test(cpu.manufacturer) ? 'apple' : 'other'
  const cpuBrand = `${cpuVendor === 'amd' ? 'AMD ' : cpuVendor === 'intel' ? 'Intel ' : cpuVendor === 'apple' ? 'Apple ' : ''}${cpu.brand}`
    .replace(/\s+\d+-Core Processor/i, '')
    .replace(/\(R\)|\(TM\)|CPU|Processor/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  let caps: HardwareProfile['capabilities'] = {
    powerPlans: false,
    cpuLimit: false,
    coolingPolicy: false,
    gpuPowerLimit: !!powerLimit,
    lowPowerMode: false,
    highPowerMode: false,
    powerProfilesDaemon: false
  }
  if (OS === 'windows') caps = { ...caps, powerPlans: true, cpuLimit: true, coolingPolicy: true }
  if (OS === 'mac') {
    const m = await macCaps().catch(() => ({ low: false, high: false }))
    caps = { ...caps, lowPowerMode: m.low, highPowerMode: m.high }
  }
  if (OS === 'linux') {
    const ppd = await hasCommand('powerprofilesctl')
    const cpufreq = existsSync('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor')
    caps = { ...caps, powerProfilesDaemon: ppd, cpuLimit: cpufreq }
  }

  const dedicated = gpus.find((g) => !g.integrated)
  const gamer = !!dedicated && (dedicated.vendor === 'nvidia' || dedicated.vendor === 'amd')
  const kind = laptop ? (gamer ? 'PC portable gamer' : 'PC portable') : OS === 'mac' ? 'Mac de bureau' : gamer ? 'PC fixe gamer' : 'PC fixe'
  const ramGb = Math.round(mem.total / 1024 ** 3)
  const summary = [kind, cpuBrand, dedicated?.model ?? gpus[0]?.model, `${ramGb} Go`].filter(Boolean).join(' · ')

  return {
    os: OS,
    osLabel: os ? `${os.distro} ${OS === 'windows' ? '' : os.release}`.trim() : process.platform,
    manufacturer: sys?.manufacturer ?? '',
    model: sys?.model ?? '',
    laptop,
    hasBattery,
    cpu: {
      brand: cpuBrand,
      vendor: cpuVendor,
      cores: cpu.physicalCores || cpu.cores,
      threads: cpu.cores,
      baseGhz: cpu.speed || null,
      maxGhz: cpu.speedMax || null
    },
    gpus,
    ramGb,
    disks: disks
      .filter((d) => d.size > 0)
      .map((d) => ({
        name: d.name.trim(),
        type: /nvme/i.test(d.interfaceType ?? '') ? 'nvme' : /ssd/i.test(d.type) ? 'ssd' : /hd/i.test(d.type) ? 'hdd' : 'other',
        sizeGb: Math.round(d.size / 1e9)
      })),
    vendorTools: detectVendorTools(),
    capabilities: caps,
    summary
  }
}

export function getHardware(force = false): Promise<HardwareProfile> {
  if (cached && !force) return Promise.resolve(cached)
  if (!pending) {
    pending = detect()
      .then((hw) => {
        cached = hw
        return hw
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}
