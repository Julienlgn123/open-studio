// Types partagés entre le process main et le renderer d'Open Studio.

export type ThemeSetting = 'dark' | 'light' | 'system'
export type Theme = 'dark' | 'light'

export type ModuleStatus = 'available' | 'installed' | 'update'

/** Un module tel qu'affiché : fiche du catalogue + état sur cet ordinateur. */
export interface ModuleInfo {
  id: string
  name: string
  tagline: string
  description: string
  category: string
  accent: string
  /** Logo (data URL), null tant qu'il est inconnu. */
  icon: string | null
  status: ModuleStatus
  installedVersion: string | null
  latestVersion: string | null
  /** Taille du téléchargement, en octets. */
  size: number | null
  /** Page de l'interface du module (file://), si installé. */
  entryUrl: string | null
  /** Le module n'a pas pu démarrer (message court). */
  error: string | null
  /** Ancienne app autonome repérée sur l'ordinateur. */
  legacy: { hasData: boolean; appInstalled: boolean } | null
}

export interface ModuleProgress {
  id: string
  phase: 'downloading' | 'installing' | 'done'
  pct: number
}

export interface AppSettings {
  theme: ThemeSetting
  launchAtStartup: boolean
  /** Dernier module ouvert, rouvert au lancement. */
  lastModule: string | null
}

/** État de la récupération du catalogue (hors ligne, source locale de test…). */
export interface CatalogState {
  ok: boolean
  error: string | null
  /** « GitHub » ou le dossier local utilisé pour les tests. */
  source: string
}
