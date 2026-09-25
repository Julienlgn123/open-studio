import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, AppState, InstallProgress } from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    setTheme: (theme: 'dark' | 'light'): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:setTheme', theme)
  },
  apps: {
    list: (): Promise<AppState[]> => ipcRenderer.invoke('apps:list'),
    install: (id: string): Promise<AppState> => ipcRenderer.invoke('apps:install', id),
    launch: (id: string): Promise<void> => ipcRenderer.invoke('apps:launch', id),
    uninstall: (id: string): Promise<void> => ipcRenderer.invoke('apps:uninstall', id),
    getInstalledSize: (id: string): Promise<number | null> => ipcRenderer.invoke('apps:size', id),
    onProgress: (cb: (p: InstallProgress) => void) => on<InstallProgress>('apps:progress', cb)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  },
  app: {
    notifyReady: () => ipcRenderer.send('renderer:ready'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('app:installUpdate'),
    onUpdateReady: (cb: (payload: { version: string }) => void) =>
      on<{ version: string }>('app:updateReady', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
