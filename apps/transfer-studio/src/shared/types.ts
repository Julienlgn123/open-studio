// Échangé entre le main et l'interface du Transfert local.

export interface Shared {
  id: string
  path: string
  name: string
  size: number
}
export interface Received {
  id: string
  name: string
  path: string
  size: number
  at: number
  from: string
}
export interface TransferState {
  running: boolean
  url: string | null
  addresses: string[]
  shared: Shared[]
  received: Received[]
  saveDir: string
  uploads: { id: string; name: string; done: number; total: number }[]
}
