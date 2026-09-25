import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { AppSettings } from '@shared/types'

// Ne contient QUE le suivi propre à Open Studio (quelle app est installée, où,
// quelle version) — jamais les données des apps gérées, qui restent dans
// leur propre dossier userData habituel (%APPDATA%/<leur-nom>).
interface TrackedApp {
  installPath: string
  installedVersion: string
}

interface StoredData {
  theme?: 'dark' | 'light'
  apps?: Record<string, TrackedApp>
}

function storePath(): string {
  return join(app.getPath('userData'), 'open-studio-data.json')
}

function readRaw(): StoredData {
  try {
    return JSON.parse(readFileSync(storePath(), 'utf-8')) as StoredData
  } catch {
    return {}
  }
}

function writeRaw(s: StoredData): void {
  writeFileSync(storePath(), JSON.stringify(s, null, 2))
}

export function getSettings(): AppSettings {
  return { theme: readRaw().theme ?? 'dark' }
}

export function setTheme(theme: 'dark' | 'light'): void {
  const raw = readRaw()
  raw.theme = theme
  writeRaw(raw)
}

export function getTrackedApp(id: string): TrackedApp | null {
  return readRaw().apps?.[id] ?? null
}

export function setTrackedApp(id: string, data: TrackedApp): void {
  const raw = readRaw()
  raw.apps = raw.apps ?? {}
  raw.apps[id] = data
  writeRaw(raw)
}

export function clearTrackedApp(id: string): void {
  const raw = readRaw()
  if (raw.apps?.[id]) {
    delete raw.apps[id]
    writeRaw(raw)
  }
}
