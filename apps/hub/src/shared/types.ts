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
  /** Date d'installation (change à chaque réinstallation : l'interface est alors rechargée). */
  installedAt: number | null
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

/** Personnalisation de l'interface (tout est modifiable depuis Réglages ▸ Personnaliser). */
export interface Layout {
  /** Couleur d'accent (#rrggbb), null = celle du thème. */
  accent: string | null
  railSide: 'left' | 'right'
  railSize: 'small' | 'normal' | 'large'
  /** Ordre des modules (barre, accueil, Ctrl+1…9). Les modules absents viennent après. */
  order: string[]
  /** Modules masqués de la barre latérale (toujours visibles sur l'accueil). */
  hidden: string[]
  radius: 'sharp' | 'normal' | 'round'
  /** Accueil : tuiles ou liste. */
  homeView: 'tiles' | 'list'
  /** Accueil : texte d'accueil et sections affichés. */
  showHero: boolean
  showDiscover: boolean
  /** Taille du texte de l'interface d'Open Studio (1 = normal). */
  scale: number
}

export const DEFAULT_LAYOUT: Layout = {
  accent: null,
  railSide: 'left',
  railSize: 'normal',
  order: [],
  hidden: [],
  radius: 'normal',
  homeView: 'tiles',
  showHero: true,
  showDiscover: true,
  scale: 1
}

export interface AppSettings {
  theme: ThemeSetting
  launchAtStartup: boolean
  /** Dernier module ouvert, rouvert au lancement. */
  lastModule: string | null
  /** Visite guidée d'Open Studio 2 déjà vue. */
  tourSeen: boolean
  /** Mises à jour automatiques au lancement (Open Studio et modules). */
  autoUpdate: boolean
  layout: Layout
}

/** État de la récupération du catalogue (hors ligne, source locale de test…). */
export interface CatalogState {
  ok: boolean
  error: string | null
  /** « GitHub » ou le dossier local utilisé pour les tests. */
  source: string
}

/** Avancement des mises à jour automatiques (bandeau en bas de la fenêtre). */
export interface UpdateState {
  phase: 'idle' | 'available' | 'downloading' | 'ready'
  kind: 'module' | 'app' | null
  label: string
  /** 0..1, -1 si inconnu. */
  pct: number
  /** Secondes avant le redémarrage (phase « ready »). */
  seconds?: number
}
