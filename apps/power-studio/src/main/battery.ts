import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'
import si from 'systeminformation'
import type { BatteryHealth } from '@shared/types'
import { OS, run } from './platform/exec'

const n = (s: string | undefined): number | null => {
  const v = Number(s)
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Durée ISO 8601 (PT5H30M12S) → minutes. */
function isoMinutes(s: string | undefined): number | null {
  const m = s?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/)
  if (!m) return null
  const v = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60
  return v > 0 ? Math.round(v) : null
}

const tag = (xml: string, name: string): string | undefined => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim()
const attr = (xml: string, name: string): string | undefined => xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

/** Lit le rapport de batterie de Windows (powercfg /batteryreport), sans droits admin. */
export function parseBatteryReport(xml: string): Omit<BatteryHealth, 'reportPath'> {
  const battery = xml.match(/<Battery>([\s\S]*?)<\/Battery>/)?.[1] ?? ''
  const design = n(tag(battery, 'DesignCapacity'))
  const full = n(tag(battery, 'FullChargeCapacity'))
  const history: BatteryHealth['history'] = []
  for (const m of xml.matchAll(/<HistoryEntry\b([^>]*)\/?>/g)) {
    const f = n(attr(m[1], 'FullChargeCapacity'))
    const d = n(attr(m[1], 'DesignCapacity'))
    const date = (attr(m[1], 'LocalStartDate') ?? attr(m[1], 'StartDate') ?? '').slice(0, 10)
    if (f && d && date) history.push({ date, fullMwh: f, designMwh: d })
  }
  // Estimation d'autonomie à pleine charge selon l'usage récent (« ActiveRuntime »).
  const est = xml.match(/<RuntimeEstimates>([\s\S]*?)<\/RuntimeEstimates>/)?.[1] ?? ''
  const fullEst = est.match(/<FullChargeCapacity\b([^>]*)\/?>/)?.[1] ?? ''
  return {
    designMwh: design,
    fullMwh: full,
    healthPct: design && full ? Math.min(100, (full / design) * 100) : null,
    cycles: n(tag(battery, 'CycleCount')),
    manufacturer: tag(battery, 'Manufacturer') ?? '',
    model: tag(battery, 'Id') ?? '',
    chemistry: tag(battery, 'Chemistry') ?? '',
    history: history.slice(-120),
    estimateMinutes: isoMinutes(attr(fullEst, 'ActiveRuntime'))
  }
}

export async function batteryHealth(): Promise<BatteryHealth | null> {
  const b = await si.battery().catch(() => null)
  if (!b?.hasBattery) return null
  if (OS === 'windows') {
    const dir = join(app.getPath('userData'), 'battery')
    mkdirSync(dir, { recursive: true })
    const xml = join(dir, 'battery-report.xml')
    const html = join(dir, 'battery-report.html')
    rmSync(xml, { force: true })
    await run('powercfg', ['/batteryreport', '/xml', '/output', xml], { timeoutMs: 30_000 })
    await run('powercfg', ['/batteryreport', '/output', html], { timeoutMs: 30_000 })
    if (existsSync(xml)) {
      const parsed = parseBatteryReport(readFileSync(xml, 'utf8').replace(/^﻿/, ''))
      if (parsed.designMwh) return { ...parsed, reportPath: existsSync(html) ? html : null }
    }
  }
  // macOS, Linux (ou rapport Windows illisible) : ce que donne le système.
  const design = n(String(b.designedCapacity))
  const full = n(String(b.maxCapacity))
  return {
    designMwh: design,
    fullMwh: full,
    healthPct: design && full ? Math.min(100, (full / design) * 100) : null,
    cycles: n(String(b.cycleCount)),
    manufacturer: b.manufacturer ?? '',
    model: b.model ?? '',
    chemistry: b.type ?? '',
    history: [],
    estimateMinutes: null,
    reportPath: null
  }
}
