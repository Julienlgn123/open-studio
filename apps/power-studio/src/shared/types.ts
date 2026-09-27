export type OsKind = 'windows' | 'mac' | 'linux'

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'other'

export interface GpuInfo {
  vendor: GpuVendor
  model: string
  vramMb: number | null
  /** Carte intégrée au processeur (iGPU) plutôt que dédiée. */
  integrated: boolean
  /** Limite de puissance réglable (NVIDIA), en watts. */
  powerLimit: { min: number; max: number; default: number; current: number } | null
}

/** Logiciel du fabricant qui pilote les ventilateurs / l'éclairage (détecté sur le PC). */
export interface VendorTool {
  id: string
  name: string
  /** Chemin de l'exécutable (Windows) ou de l'app (Mac) ; null si ouvert via une URL. */
  path: string
  fans: boolean
}

export interface HardwareProfile {
  os: OsKind
  osLabel: string
  manufacturer: string
  model: string
  /** Portable (batterie présente ou châssis portable). */
  laptop: boolean
  hasBattery: boolean
  cpu: {
    brand: string
    vendor: 'amd' | 'intel' | 'apple' | 'other'
    cores: number
    threads: number
    baseGhz: number | null
    maxGhz: number | null
  }
  gpus: GpuInfo[]
  ramGb: number
  disks: { name: string; type: 'ssd' | 'hdd' | 'nvme' | 'other'; sizeGb: number }[]
  vendorTools: VendorTool[]
  /** Ce que la plateforme permet vraiment de régler (pour ne pas afficher de faux réglages). */
  capabilities: {
    powerPlans: boolean
    cpuLimit: boolean
    coolingPolicy: boolean
    gpuPowerLimit: boolean
    lowPowerMode: boolean
    highPowerMode: boolean
    powerProfilesDaemon: boolean
  }
  /** Phrase courte qui résume la machine (« PC fixe gamer · Ryzen 7 5800X · RTX 3060 »). */
  summary: string
}

export interface LiveStats {
  at: number
  cpuLoad: number
  cpuGhz: number | null
  cpuTemp: number | null
  ramUsedGb: number
  ramTotalGb: number
  gpu: {
    load: number | null
    temp: number | null
    powerW: number | null
    powerLimitW: number | null
    fanPct: number | null
    clockMhz: number | null
    vramUsedMb: number | null
    vramTotalMb: number | null
  } | null
  battery: { percent: number; charging: boolean; pluggedIn: boolean; minutesLeft: number | null } | null
  /** Consommation estimée de la batterie (W), si le système la donne. */
  batteryW: number | null
}

export type ProfileId = 'performance' | 'balanced' | 'silent' | 'eco'

/** Un réglage appliqué par un profil, calculé selon le matériel. */
export interface ProfileAction {
  id: string
  label: string
  /** Valeur lisible (« 100 % », « Agressif », « 180 W »…). */
  value: string
  /** Pourquoi ce réglage, pour cette machine. */
  why: string
  admin: boolean
  /** Réglage non disponible ici (affiché grisé avec la raison). */
  unavailable?: string
}

export interface ProfileDef {
  id: ProfileId
  name: string
  tagline: string
  color: string
  actions: ProfileAction[]
}

export interface ProfileApplyResult {
  profile: ProfileId
  ok: boolean
  applied: string[]
  failed: { id: string; error: string }[]
  /** L'utilisateur a refusé la demande de droits administrateur. */
  adminDenied: boolean
}

export interface AutoRules {
  enabled: boolean
  /** Sur batterie → ce profil (portables). */
  onBattery: ProfileId | null
  /** Sur secteur → ce profil. */
  onAc: ProfileId | null
  /** Quand un de ces programmes tourne (jeux, montage…) → ce profil. */
  apps: { process: string; profile: ProfileId }[]
}

export type TweakCategory = 'privacy' | 'performance' | 'battery' | 'services' | 'interface'

export type TweakRisk = 'safe' | 'moderate'

export interface TweakInfo {
  id: string
  category: TweakCategory
  title: string
  description: string
  /** Ce que ça change concrètement / ce qu'on perd. */
  tradeoff: string | null
  risk: TweakRisk
  admin: boolean
  /** Prend effet après redémarrage (ou reconnexion). */
  restart: boolean
  /** Recommandé pour cette machine (calculé selon le matériel). */
  recommended: boolean
  /** État actuel : true = optimisation déjà en place, null = inconnu. */
  applied: boolean | null
}

export interface TweakResult {
  ok: boolean
  done: string[]
  failed: { id: string; error: string }[]
  adminDenied: boolean
  restartNeeded: boolean
}

export interface StartupItem {
  id: string
  name: string
  command: string
  /** Où il est déclaré (registre utilisateur, dossier Démarrage…). */
  location: string
  enabled: boolean
  admin: boolean
  /** Impact estimé au démarrage. */
  impact: 'high' | 'medium' | 'low' | 'unknown'
  /** Élément système / pilote / sécurité : à laisser actif. */
  essential: boolean
}

export interface BloatApp {
  id: string
  name: string
  description: string
  packageName: string
  installed: boolean
}

export interface CleanTarget {
  id: string
  name: string
  description: string
  bytes: number
  admin: boolean
}

export interface CleanResult {
  freedBytes: number
  failed: { id: string; error: string }[]
  adminDenied: boolean
}

export interface ActivityEntry {
  at: number
  text: string
  kind: 'profile' | 'tweak' | 'clean' | 'startup' | 'app' | 'error'
}

export interface AppSettings {
  activeProfile: ProfileId | null
  /** Inclure la limite de puissance du GPU dans les profils (demande les droits admin). */
  gpuTuning: boolean
  auto: AutoRules
  /** Garder l'app dans la zone de notification quand on ferme la fenêtre. */
  runInTray: boolean
  /** Lancer au démarrage de l'ordinateur (réduite dans la zone de notification). */
  launchAtLogin: boolean
  /** Point de restauration créé avant la première optimisation système. */
  restorePointDone: boolean
  /** Avertissement de sécurité lu et accepté (écran bloquant au premier lancement). */
  disclaimerAccepted: boolean
  theme: 'dark' | 'light'
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeProfile: null,
  gpuTuning: false,
  auto: { enabled: false, onBattery: 'eco', onAc: null, apps: [] },
  runInTray: true,
  launchAtLogin: false,
  restorePointDone: false,
  disclaimerAccepted: false,
  theme: 'dark'
}

export const PROFILE_ORDER: ProfileId[] = ['performance', 'balanced', 'silent', 'eco']
