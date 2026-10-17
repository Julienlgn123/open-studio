// Remplace « electron » dans le preload d'un module (voir vite.ts). Les canaux invoke/send
// sont préfixés par l'id du module pour rejoindre ses propres handlers ; les événements reçus
// arrivent tels quels (ils sont envoyés directement à la webview du module).
// Expose aussi `window.studio` : thème d'Open Studio, navigation entre modules.
import * as electron from 'electron'
import type { StudioBridge, StudioTheme } from './types'

export * from 'electron'

const raw = electron.ipcRenderer
const moduleId = process.argv.find((a) => a.startsWith('--os-module='))?.slice('--os-module='.length) ?? ''
const scoped = (channel: string): string => (channel.startsWith('studio:') ? channel : `m:${moduleId}:${channel}`)

export const ipcRenderer = {
  invoke: (channel: string, ...args: unknown[]) => raw.invoke(scoped(channel), ...args),
  send: (channel: string, ...args: unknown[]) => raw.send(scoped(channel), ...args),
  sendSync: (channel: string, ...args: unknown[]) => raw.sendSync(scoped(channel), ...args),
  on(channel: string, listener: (...args: any[]) => void) {
    raw.on(channel, listener)
    return ipcRenderer
  },
  once(channel: string, listener: (...args: any[]) => void) {
    raw.once(channel, listener)
    return ipcRenderer
  },
  removeListener(channel: string, listener: (...args: any[]) => void) {
    raw.removeListener(channel, listener)
    return ipcRenderer
  },
  off(channel: string, listener: (...args: any[]) => void) {
    raw.removeListener(channel, listener)
    return ipcRenderer
  },
  removeAllListeners(channel?: string) {
    raw.removeAllListeners(channel)
    return ipcRenderer
  }
} as unknown as Electron.IpcRenderer

// ─── Thème d'Open Studio, appliqué à toute l'interface du module ───────────────────────────
let theme: StudioTheme = raw.sendSync('studio:theme') === 'light' ? 'light' : 'dark'
const listeners = new Set<(t: StudioTheme) => void>()
const applyTheme = (): void => {
  document.documentElement?.setAttribute('data-theme', theme)
  document.documentElement?.classList.add('in-open-studio')
}
raw.on('studio:theme', (_e, t: StudioTheme) => {
  theme = t === 'light' ? 'light' : 'dark'
  applyTheme()
  for (const cb of listeners) cb(theme)
})
document.addEventListener('DOMContentLoaded', applyTheme)

const bridge: StudioBridge = {
  moduleId,
  getTheme: () => theme,
  onTheme(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
  openModule: (id) => raw.send('studio:open', id),
  openHome: () => raw.send('studio:open', null)
}
electron.contextBridge.exposeInMainWorld('studio', bridge)
