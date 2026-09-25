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
  /**
   * App encore hébergée dans son propre repo GitHub. Omis pour une app vivant
   * dans ce monorepo (`apps/<id>`) : ses installateurs sont alors cherchés dans
   * la release de ce repo (Julienlgn123/open-studio), filtrés par `assetPrefix`.
   */
  owner?: string
  repo?: string
  /** Préfixe des noms de fichiers d'installateurs de cette app dans la release partagée (ex: "Local-IA-Studio"). Requis quand `owner`/`repo` sont omis. */
  assetPrefix?: string
  /** Emoji affiché tant que le vrai logo (resources/icon.png) n'a pas pu être chargé. */
  fallbackEmoji: string
  accent: string
}

/** État courant d'une app pour l'utilisateur (catalogue + statut dynamique). */
export interface AppState extends CatalogEntry {
  status: AppStatus
  installedVersion: string | null
  latestVersion: string | null
  /** Notes de version (markdown brut) de la dernière release, si disponibles. */
  latestChangelog?: string | null
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
