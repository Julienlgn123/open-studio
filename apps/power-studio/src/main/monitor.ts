import { cpus, freemem, totalmem } from 'os'
import si from 'systeminformation'
import type { LiveStats } from '@shared/types'
import { nvidiaSmi } from './hardware'
import { OS, run } from './platform/exec'

let lastCpu = cpus().map((c) => ({ ...c.times }))

/** Charge CPU depuis le dernier appel (0-100), calculée sans outil externe. */
function cpuLoad(): number {
  const now = cpus().map((c) => ({ ...c.times }))
  let idle = 0
  let total = 0
  now.forEach((t, i) => {
    const p = lastCpu[i] ?? t
    const d = (k: keyof typeof t): number => t[k] - p[k]
    idle += d('idle')
    total += d('user') + d('nice') + d('sys') + d('irq') + d('idle')
  })
  lastCpu = now
  return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0
}

const num = (s: string | undefined): number | null => {
  const n = parseFloat((s ?? '').trim())
  return Number.isFinite(n) ? n : null
}

async function gpuStats(): Promise<LiveStats['gpu']> {
  const smi = await nvidiaSmi()
  if (!smi) return null
  const res = await run(
    smi,
    ['--query-gpu=utilization.gpu,temperature.gpu,power.draw,clocks.gr,memory.used,memory.total', '--format=csv,noheader,nounits'],
    { timeoutMs: 5000 }
  )
  if (res.code !== 0) return null
  const [load, temp, power, clock, used, total] = res.stdout.split('\n')[0].split(',')
  return {
    load: num(load),
    temp: num(temp),
    powerW: num(power),
    clockMhz: num(clock),
    vramUsedMb: num(used),
    vramTotalMb: num(total)
  }
}

let batteryCache: { at: number; value: Pick<LiveStats, 'battery' | 'batteryW'> } | null = null

async function batteryStats(hasBattery: boolean): Promise<Pick<LiveStats, 'battery' | 'batteryW'>> {
  if (!hasBattery) return { battery: null, batteryW: null }
  if (batteryCache && Date.now() - batteryCache.at < 15_000) return batteryCache.value
  const b = await si.battery().catch(() => null)
  const value: Pick<LiveStats, 'battery' | 'batteryW'> = b?.hasBattery
    ? {
        battery: {
          percent: Math.round(b.percent),
          charging: b.isCharging,
          pluggedIn: b.acConnected,
          minutesLeft: b.timeRemaining && b.timeRemaining > 0 ? b.timeRemaining : null
        },
        batteryW: null
      }
    : { battery: null, batteryW: null }
  batteryCache = { at: Date.now(), value }
  return value
}

let tempFails = 0

async function cpuTemp(): Promise<number | null> {
  // Windows ne donne pas la température du processeur sans pilote : on n'insiste pas.
  if (OS === 'windows' || tempFails > 3) return null
  const t = await si.cpuTemperature().catch(() => null)
  if (!t || !t.main || t.main <= 0) {
    tempFails++
    return null
  }
  return Math.round(t.main)
}

export async function readStats(hasBattery: boolean): Promise<LiveStats> {
  const [gpu, bat, temp] = await Promise.all([gpuStats(), batteryStats(hasBattery), cpuTemp()])
  const total = totalmem()
  // La fréquence live n'est fiable que sous Linux / Mac (Windows renvoie la fréquence de base).
  const ghz = OS === 'windows' ? null : Math.round((cpus().reduce((s, c) => s + c.speed, 0) / cpus().length / 1000) * 10) / 10 || null
  return {
    at: Date.now(),
    cpuLoad: Math.round(cpuLoad()),
    cpuGhz: ghz,
    cpuTemp: temp,
    ramUsedGb: Math.round(((total - freemem()) / 1024 ** 3) * 10) / 10,
    ramTotalGb: Math.round((total / 1024 ** 3) * 10) / 10,
    gpu,
    ...bat
  }
}

/** Sur secteur ? (null : pas de batterie). */
export async function onAcPower(): Promise<boolean | null> {
  const b = await si.battery().catch(() => null)
  if (!b?.hasBattery) return null
  return b.acConnected
}
