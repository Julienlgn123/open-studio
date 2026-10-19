import type { HardwareProfile, ProfileApplyResult, ProfileId, ScheduleRule } from '@shared/types'
import si from 'systeminformation'
import { onAcPower } from './monitor'
import { OS, run } from './platform/exec'
import { applyProfile } from './profiles'
import { getSettings } from './store'

/** Noms des programmes en cours (sans extension, en minuscules). */
export async function runningProcesses(): Promise<string[]> {
  const res =
    OS === 'windows'
      ? await run('tasklist.exe', ['/fo', 'csv', '/nh'], { timeoutMs: 15_000 })
      : await run('ps', ['-A', '-o', 'comm='], { timeoutMs: 15_000 })
  const names =
    OS === 'windows'
      ? res.stdout.split('\n').map((l) => l.match(/^"([^"]+)"/)?.[1] ?? '')
      : res.stdout.split('\n').map((l) => l.trim().split('/').pop() ?? '')
  return [...new Set(names.filter(Boolean).map(normalizeProcess))]
}

export function normalizeProcess(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/, '')
}

const SYSTEM = /^(system|idle|registry|smss|csrss|wininit|services|lsass|svchost|fontdrvhost|dwm|winlogon|conhost|runtimebroker|searchhost|sihost|taskhostw|ctfmon|explorer|dllhost|audiodg|spoolsv|wudfhost|securityhealth.*|msmpeng|nissrv|memory compression|tasklist|powershell|cmd|backgroundtaskhost|startmenuexperiencehost|textinputhost|shellexperiencehost|applicationframehost|systemsettings|lockapp|wmiprvse|searchindexer|smartscreen|widgets|widgetservice|phoneexperiencehost|crashpad_handler|kernel_task|launchd|windowserver|loginwindow|mds.*|systemd.*|kworker.*|dbus.*|(ba|z|fi)?sh)$/

/** Programmes ouverts proposés pour une règle (sans les processus du système). */
export async function pickableProcesses(): Promise<string[]> {
  return (await runningProcesses()).filter((n) => !SYSTEM.test(n) && !/^power studio$/.test(n)).sort()
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** La plage peut passer minuit (23:00 → 07:00) : elle appartient alors au jour où elle commence. */
export function inSchedule(r: ScheduleRule, now: Date): boolean {
  const t = now.getHours() * 60 + now.getMinutes()
  const a = minutes(r.from)
  const b = minutes(r.to)
  const day = now.getDay()
  const days = r.days?.length ? r.days : [0, 1, 2, 3, 4, 5, 6]
  if (a === b) return false
  if (a < b) return days.includes(day) && t >= a && t < b
  // Passe minuit : avant minuit le jour J, après minuit le lendemain de J.
  return (t >= a && days.includes(day)) || (t < b && days.includes((day + 6) % 7))
}

let timer: NodeJS.Timeout | null = null
let lastCondition = ''
let busy = false

/**
 * Règles automatiques : on n'agit que quand la situation CHANGE (branché/débranché, jeu
 * lancé/fermé). Un profil choisi à la main reste donc en place jusqu'au prochain changement.
 * La limite GPU n'est jamais touchée ici (elle demanderait les droits admin à chaque fois).
 */
async function tick(getHw: () => Promise<HardwareProfile>, onApplied: (r: ProfileApplyResult) => void): Promise<void> {
  const { auto } = getSettings()
  if (!auto.enabled || busy) return
  busy = true
  try {
    let target: ProfileId | null = null
    let condition = ''
    if (auto.apps.length) {
      const running = new Set(await runningProcesses())
      const hit = auto.apps.find((a) => running.has(normalizeProcess(a.process)))
      if (hit) {
        target = hit.profile
        condition = `app:${hit.process}`
      }
    }
    if (!target && auto.lowBattery) {
      const b = await si.battery().catch(() => null)
      if (b?.hasBattery && !b.acConnected && b.percent <= auto.lowBattery.percent) {
        target = auto.lowBattery.profile
        condition = 'lowbattery'
      }
    }
    if (!target && auto.schedule?.length) {
      const now = new Date()
      const hit = auto.schedule.find((r) => inSchedule(r, now))
      if (hit) {
        target = hit.profile
        condition = `schedule:${hit.from}-${hit.to}`
      }
    }
    if (!target) {
      const ac = await onAcPower()
      if (ac === false && auto.onBattery) {
        target = auto.onBattery
        condition = 'battery'
      } else if (ac !== false && auto.onAc) {
        target = auto.onAc
        condition = 'ac'
      } else condition = ac === false ? 'battery' : 'ac'
    }
    if (condition === lastCondition) return
    lastCondition = condition
    if (target && target !== getSettings().activeProfile) onApplied(await applyProfile(target, await getHw(), false))
  } finally {
    busy = false
  }
}

export function startAuto(getHw: () => Promise<HardwareProfile>, onApplied: (r: ProfileApplyResult) => void): void {
  if (timer) clearInterval(timer)
  lastCondition = ''
  timer = setInterval(() => void tick(getHw, onApplied).catch(() => {}), 5000)
  void tick(getHw, onApplied).catch(() => {})
}

/** Les règles ont changé : réévaluer tout de suite. */
export function resetAuto(): void {
  lastCondition = ''
}
