// Mesures du Moniteur système. Principe repris de TMOG (tmog.org) : une valeur non mesurée vaut
// `null` (affichée « non disponible »), jamais 0 — un zéro n'est affiché que s'il a été mesuré.

export interface Sample {
  at: number
  cpu: number | null
  cores: (number | null)[]
  memUsed: number | null
  memTotal: number | null
  swapUsed: number | null
  swapTotal: number | null
  netRx: number | null
  netTx: number | null
  diskRead: number | null
  diskWrite: number | null
  cpuTemp: number | null
  gpuLoad: number | null
  gpuTemp: number | null
  gpuMemUsed: number | null
  gpuMemTotal: number | null
  battery: { percent: number; charging: boolean } | null
}

export interface ProcessInfo {
  pid: number
  /** Nombre de processus regroupés sous ce nom. */
  count?: number
  name: string
  cpu: number
  mem: number
  user: string
  path: string
}

export interface Volume {
  mount: string
  label: string
  fs: string
  size: number
  used: number
}

export interface SystemInfo {
  host: string
  os: string
  osVersion: string
  arch: string
  manufacturer: string
  model: string
  cpuBrand: string
  cpuCores: number
  cpuPhysical: number
  performanceCores: number | null
  efficiencyCores: number | null
  cpuSpeed: number | null
  memTotal: number
  gpus: { model: string; vram: number | null }[]
  disks: { name: string; type: string; size: number; interface: string }[]
  uptime: number
  network: { iface: string; ip4: string; mac: string; speed: number | null; type: string }[]
}

/** Point d'historique (toutes les 10 s, gardé 6 h). */
export interface HistoryPoint {
  at: number
  cpu: number | null
  mem: number | null
  netRx: number | null
  netTx: number | null
  temp: number | null
}

export interface AlertSettings {
  enabled: boolean
  /** % de processeur… */
  cpu: number
  /** …pendant N minutes */
  cpuMinutes: number
  /** % de mémoire */
  mem: number
  /** °C */
  temp: number
  /** % d'espace libre minimum sur un disque */
  diskFree: number
  /** % de batterie (hors charge) */
  battery: number
}

export interface ScanEntry {
  name: string
  path: string
  size: number
  files: number
  dir: boolean
}

export interface ScanResult {
  root: string
  size: number
  files: number
  children: ScanEntry[]
  largest: ScanEntry[]
  ms: number
  truncated: boolean
}
