import type { BrowserWindow } from 'electron'

let getWin: () => BrowserWindow | null = () => null

export function setEventTarget(fn: () => BrowserWindow | null): void {
  getWin = fn
}

/** Événement pour l'interface d'Open Studio (pas pour les fenêtres internes des modules). */
export function broadcast(channel: string, payload: unknown): void {
  const win = getWin()
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}
