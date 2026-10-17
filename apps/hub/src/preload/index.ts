import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, CatalogState, ModuleInfo, ModuleProgress, Theme, ThemeSetting } from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

type Settings = AppSettings & { effectiveTheme: Theme }

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    setTheme: (theme: ThemeSetting): Promise<Settings> => ipcRenderer.invoke('settings:setTheme', theme),
    setLaunchAtStartup: (enabled: boolean): Promise<Settings> => ipcRenderer.invoke('settings:setLaunchAtStartup', enabled),
    onTheme: (cb: (t: Theme) => void) => on<Theme>('studio:theme', cb)
  },
  modules: {
    list: (refresh?: boolean): Promise<ModuleInfo[]> => ipcRenderer.invoke('modules:list', refresh),
    catalogState: (): Promise<CatalogState> => ipcRenderer.invoke('modules:catalogState'),
    install: (id: string): Promise<void> => ipcRenderer.invoke('modules:install', id),
    uninstall: (id: string): Promise<void> => ipcRenderer.invoke('modules:uninstall', id),
    removeLegacy: (id: string): Promise<void> => ipcRenderer.invoke('modules:removeLegacy', id),
    setCurrent: (id: string | null) => ipcRenderer.send('modules:current', id),
    onProgress: (cb: (p: ModuleProgress) => void) => on<ModuleProgress>('modules:progress', cb),
    onChanged: (cb: () => void) => on<null>('modules:changed', cb),
    onAutoUpdated: (cb: (p: { id: string; name: string; version: string | null }) => void) =>
      on<{ id: string; name: string; version: string | null }>('modules:autoUpdated', cb)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  },
  app: {
    notifyReady: () => ipcRenderer.send('renderer:ready'),
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    onLauncher: (cb: () => void) => on<void>('launcher:open', cb),
    /** Demande d'ouverture d'un module (menu de l'icône, notification, autre module). */
    onNavigate: (cb: (id: string | null) => void) => on<string | null>('studio:navigate', cb),
    onShortcut: (cb: (key: string) => void) => on<string>('studio:shortcut', cb),
    onUpdateReady: (cb: (payload: { version: string }) => void) => on<{ version: string }>('app:updateReady', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
