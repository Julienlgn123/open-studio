import { existsSync } from 'fs'
import { join } from 'path'
import si from 'systeminformation'
import type { GpuInfo, GpuVendor, HardwareProfile } from '@shared/types'
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
        integrated
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
    lowPowerMode: false,
    powerProfilesDaemon: false
  }
  if (OS === 'windows') caps = { ...caps, powerPlans: true, cpuLimit: true }
  if (OS === 'mac') {
    const cap = (await run('pmset', ['-g', 'cap'], { timeoutMs: 5000 })).stdout.toLowerCase()
    caps = { ...caps, lowPowerMode: /lowpowermode|powermode/.test(cap) }
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
