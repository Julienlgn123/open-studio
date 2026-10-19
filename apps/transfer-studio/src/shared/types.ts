// Échangé entre le main et l'interface du Transfert local.

export interface Shared {
  id: string
  path: string
  name: string
  size: number
  /** Dossier partagé : envoyé en ZIP. */
  dir?: boolean
  files?: number
}
export interface Received {
  id: string
  name: string
  path: string
  size: number
  at: number
  from: string
}
export interface TextItem {
  id: string
  from: 'pc' | 'phone'
  text: string
  at: number
  device?: string
}
export interface Device {
  ip: string
  name: string
  last: number
}
export interface TransferSettings {
  /** Code demandé sur le téléphone en plus du QR code. */
  pin: boolean
  /** Fermeture automatique après N minutes sans activité (0 = jamais). */
  autoStop: number
  /** Texte reçu du téléphone copié directement dans le presse-papiers du PC. */
  autoCopy: boolean
  address: string | null
}
export interface TransferState {
  running: boolean
  url: string | null
  addresses: string[]
  shared: Shared[]
  received: Received[]
  saveDir: string
  uploads: { id: string; name: string; done: number; total: number }[]
  texts: TextItem[]
  devices: Device[]
  pin: string | null
  settings: TransferSettings
  /** Fermeture automatique prévue (horodatage), si activée. */
  stopsAt: number | null
}
