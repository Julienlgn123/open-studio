// Remplace « electron » dans le preload d'un module (voir vite.ts) : tout vient du vrai electron,
// sauf `ipcRenderer`, préfixé par l'id du module. Expose aussi `window.studio` (studio-bridge.ts).
import './studio-bridge'

export * from 'electron'
export { scopedIpcRenderer as ipcRenderer } from './scoped-ipc'
