import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/api'
import type { ProfileApplyResult } from '@shared/types'

const api: Api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    platform: () => ipcRenderer.invoke('app:platform')
  },
  hardware: {
    get: (force) => ipcRenderer.invoke('hw:get', force),
    stats: () => ipcRenderer.invoke('hw:stats')
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    active: () => ipcRenderer.invoke('profiles:active'),
    apply: (id) => ipcRenderer.invoke('profiles:apply', id),
    restore: () => ipcRenderer.invoke('profiles:restore'),
    onChanged: (cb) => {
      const listener = (_: unknown, r: ProfileApplyResult): void => cb(r)
      ipcRenderer.on('profiles:changed', listener)
      return () => ipcRenderer.removeListener('profiles:changed', listener)
    }
  },
  tweaks: {
    list: () => ipcRenderer.invoke('tweaks:list'),
    apply: (ids) => ipcRenderer.invoke('tweaks:apply', ids),
    revert: (ids) => ipcRenderer.invoke('tweaks:revert', ids),
    restorePoint: () => ipcRenderer.invoke('tweaks:restorePoint'),
    openBackups: () => ipcRenderer.invoke('tweaks:openBackups')
  },
  startup: {
    list: () => ipcRenderer.invoke('startup:list'),
    set: (id, enable) => ipcRenderer.invoke('startup:set', id, enable)
  },
  bloat: {
    list: () => ipcRenderer.invoke('bloat:list'),
    remove: (ids) => ipcRenderer.invoke('bloat:remove', ids),
    reinstall: (id) => ipcRenderer.invoke('bloat:reinstall', id)
  },
  clean: {
    list: () => ipcRenderer.invoke('clean:list'),
    run: (ids) => ipcRenderer.invoke('clean:run', ids)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  activity: { list: () => ipcRenderer.invoke('activity:list') },
  processes: { list: () => ipcRenderer.invoke('processes:list') }
}

contextBridge.exposeInMainWorld('api', api)
