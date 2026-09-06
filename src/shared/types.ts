// Types partagés entre le process main et le renderer.

export type AppStatus =
  | 'not_installed'
  | 'installed'
  | 'update_available'
  | 'downloading'
  | 'installing'
  | 'launching'
  | 'uninstalling'
  | 'error'

/** Description statique d'une app de la suite (catalogue, ne change jamais à l'exécution). */
export interface CatalogEntry {
  id: string
  name: string
  /** Doit correspondre exactement à `build.productName` du repo cible. */
  productName: string
  /** Nom du paquet .deb (champ `name` du package.json cible, en général) — sert à dpkg -s/-L/-r. */
  debPackageName: string
  description: string
  category: string
  owner: string
  repo: string
  /** Emoji affiché tant que le vrai logo (resources/icon.png du repo) n'a pas pu être chargé. */
  fallbackEmoji: string
  accent: string
}

/** État courant d'une app pour l'utilisateur (catalogue + statut dynamique). */
export interface AppState extends CatalogEntry {
  status: AppStatus
  installedVersion: string | null
  latestVersion: string | null
  repoUrl: string
  logoUrl: string
  /** Message d'erreur court, si status === 'error'. */
  error?: string
}

export interface InstallProgress {
  id: string
  phase: 'downloading' | 'installing'
  pct: number
}

export interface AppSettings {
  theme?: 'dark' | 'light'
}
