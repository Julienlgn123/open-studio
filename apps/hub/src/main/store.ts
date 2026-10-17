import { app, nativeTheme } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { AppSettings, Theme, ThemeSetting } from '@shared/types'

// Réglages d'Open Studio. Les données des modules n'y sont jamais : chacun garde son propre
// dossier (celui de l'ancienne app quand il y en avait une).

interface StoredData {
  theme?: ThemeSetting
  launchAtStartup?: boolean
  lastModule?: string | null
  trayHintSeen?: boolean
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

function patch(p: Partial<StoredData>): void {
  writeFileSync(storePath(), JSON.stringify({ ...readRaw(), ...p }, null, 2))
}

export function getSettings(): AppSettings {
  const raw = readRaw()
  return {
    theme: raw.theme ?? 'dark',
    launchAtStartup: raw.launchAtStartup ?? false,
    lastModule: raw.lastModule ?? null
  }
}

export function setTheme(theme: ThemeSetting): void {
  patch({ theme })
}

/** Thème réellement affiché (« système » résolu). */
export function effectiveTheme(): Theme {
  const t = getSettings().theme
  if (t === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  return t
}

export function setLastModule(id: string | null): void {
  patch({ lastModule: id })
}

export function getLaunchAtStartup(): boolean {
  return getSettings().launchAtStartup
}

/** Lancement à l'ouverture de session, fenêtre cachée (les modules tournent en arrière-plan). */
export function setLaunchAtStartup(enabled: boolean): void {
  patch({ launchAtStartup: enabled })
  syncLoginItem()
}

export function syncLoginItem(): void {
  if (!app.isPackaged) return
  const enabled = getLaunchAtStartup()
  app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? ['--hidden'] : [] })
}

export function getTrayHintSeen(): boolean {
  return !!readRaw().trayHintSeen
}

export function setTrayHintSeen(): void {
  patch({ trayHintSeen: true })
}
