// `window.studio` dans l'interface d'un module : thème d'Open Studio (appliqué à toute la page),
// navigation entre modules. Importé par le preload du module (une seule fois, quel que soit le chemin).
import { contextBridge, ipcRenderer as raw } from 'electron'
import { moduleId } from './scoped-ipc'
import type { StudioBridge, StudioTheme } from './types'

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
contextBridge.exposeInMainWorld('studio', bridge)
