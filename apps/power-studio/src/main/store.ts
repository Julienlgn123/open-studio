import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETTINGS, type ActivityEntry, type AppSettings } from '@shared/types'

/** Valeur d'origine d'un réglage modifié, pour pouvoir l'annuler exactement. */
export type Snapshot = Record<string, unknown>

interface StoreData {
  settings: AppSettings
  /** Optimisations appliquées par l'app : état d'origine de chaque réglage touché. */
  tweakJournal: Record<string, { at: number; snapshot: Snapshot }>
  /** Plans d'alimentation créés par l'app (Windows), par profil. */
  powerSchemes: Record<string, string>
  /** Plan actif avant le premier profil appliqué, pour « Rétablir les réglages Windows ». */
  originalScheme: string | null
  activity: ActivityEntry[]
  /** macOS : éléments de connexion retirés par l'app (nom → chemin), pour pouvoir les remettre. */
  disabledLoginItems?: Record<string, string>
}

const EMPTY: StoreData = {
  settings: DEFAULT_SETTINGS,
  tweakJournal: {},
  powerSchemes: {},
  originalScheme: null,
  activity: []
}

let data: StoreData | null = null

function file(): string {
  return join(app.getPath('userData'), 'power-studio.json')
}

function load(): StoreData {
  if (data) return data
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<StoreData>
      data = {
        ...EMPTY,
        ...raw,
        settings: { ...DEFAULT_SETTINGS, ...raw.settings, auto: { ...DEFAULT_SETTINGS.auto, ...raw.settings?.auto } }
      }
      return data
    }
  } catch {
    // Fichier illisible : on repart des valeurs par défaut.
  }
  data = structuredClone(EMPTY)
  return data
}

function save(): void {
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file())
}

export function getStore(): StoreData {
  return load()
}

export function updateStore(fn: (d: StoreData) => void): void {
  fn(load())
  save()
}

export function getSettings(): AppSettings {
  return load().settings
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  updateStore((d) => {
    d.settings = { ...d.settings, ...patch }
  })
  return load().settings
}

export function logActivity(text: string, kind: ActivityEntry['kind']): ActivityEntry {
  const entry = { at: Date.now(), text, kind }
  updateStore((d) => {
    d.activity = [entry, ...d.activity].slice(0, 200)
  })
  return entry
}
