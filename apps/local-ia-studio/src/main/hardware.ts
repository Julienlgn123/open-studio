import { app } from 'electron'
import { cpus, freemem, platform, totalmem } from 'os'
import type { HardwareInfo } from '@shared/types'
import { getLlamaGpuInfo } from './providers/llamacpp'

const GB = 1024 ** 3
const round = (n: number): number => Math.round(n * 10) / 10

let cached: Promise<HardwareInfo> | null = null

async function electronGpuNames(): Promise<string[]> {
  try {
    const info = (await app.getGPUInfo('complete')) as { gpuDevice?: { deviceString?: string; active?: boolean }[] }
    return (info.gpuDevice ?? []).map((d) => d.deviceString ?? '').filter(Boolean)
  } catch {
    return []
  }
}

async function detect(): Promise<HardwareInfo> {
  const cpuList = cpus()
  const base: HardwareInfo = {
    platform: `${platform()} ${process.arch}`,
    cpuModel: cpuList[0]?.model.trim() ?? 'inconnu',
    cpuCores: cpuList.length,
    ramTotalGb: round(totalmem() / GB),
    ramFreeGb: round(freemem() / GB),
    gpus: [],
    gpuBackend: null,
    vramTotalGb: null,
    vramFreeGb: null,
    unifiedMemory: false
  }

  // llama.cpp donne la VRAM réelle ; Electron sert de repli pour les noms de GPU.
  const [llamaGpu, names] = await Promise.all([
    Promise.race([getLlamaGpuInfo(), new Promise<null>((r) => setTimeout(() => r(null), 15000))]).catch(() => null),
    electronGpuNames()
  ])
  base.gpus = [...new Set([...(llamaGpu?.names ?? []), ...names])]
  if (llamaGpu?.backend) {
    base.gpuBackend = llamaGpu.backend
    if (llamaGpu.vram) {
      base.vramTotalGb = round(llamaGpu.vram.total / GB)
      base.vramFreeGb = round(llamaGpu.vram.free / GB)
      base.unifiedMemory = llamaGpu.vram.unifiedSize > 0
    }
  }
  return base
}

/** Détecté une fois par session (la RAM libre est rafraîchie à chaque appel). */
export async function getHardwareInfo(): Promise<HardwareInfo> {
  cached ??= detect()
  const info = await cached
  return { ...info, ramFreeGb: round(freemem() / GB) }
}
