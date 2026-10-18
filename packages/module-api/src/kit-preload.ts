// Kit commun du preload des modules : expose `window.kit` (voir kit-main.ts pour le côté main).
// Les canaux passent par l'ipcRenderer du module (préfixé par son id).
import { contextBridge, webUtils } from 'electron'
import { scopedIpcRenderer as ipcRenderer } from './scoped-ipc'
import './studio-bridge'
import type { KitFetchInit, KitFetchResult } from './kit-main'

export interface FileFilter {
  name: string
  extensions: string[]
}

export const kit = {
  store: {
    get: <T>(key: string, fallback: T): Promise<T> => ipcRenderer.invoke('kit:store:get', key, fallback),
    set: (key: string, value: unknown): Promise<boolean> => ipcRenderer.invoke('kit:store:set', key, value)
  },
  files: {
    open: (opts?: { title?: string; filters?: FileFilter[]; multi?: boolean; directory?: boolean }): Promise<string[]> =>
      ipcRenderer.invoke('kit:files:open', opts),
    save: (opts?: { title?: string; defaultPath?: string; filters?: FileFilter[] }): Promise<string | null> =>
      ipcRenderer.invoke('kit:files:save', opts),
    readText: (path: string): Promise<string> => ipcRenderer.invoke('kit:files:readText', path),
    writeText: (path: string, text: string): Promise<boolean> => ipcRenderer.invoke('kit:files:writeText', path, text),
    readBase64: (path: string): Promise<string> => ipcRenderer.invoke('kit:files:readBase64', path),
    writeBase64: (path: string, b64: string): Promise<boolean> => ipcRenderer.invoke('kit:files:writeBase64', path, b64),
    stat: (path: string): Promise<{ exists: boolean; size: number; isDir: boolean; mtime: number }> => ipcRenderer.invoke('kit:files:stat', path),
    list: (dir: string): Promise<{ name: string; path: string; isDir: boolean }[]> => ipcRenderer.invoke('kit:files:list', dir),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke('kit:files:reveal', path),
    openPath: (path: string): Promise<string> => ipcRenderer.invoke('kit:files:openPath', path),
    dataDir: (): Promise<string> => ipcRenderer.invoke('kit:files:dataDir'),
    /** Chemin d'un fichier glissé-déposé. */
    pathFor: (file: File): string => webUtils.getPathForFile(file)
  },
  net: {
    fetch: (url: string, init?: KitFetchInit): Promise<KitFetchResult> => ipcRenderer.invoke('kit:net:fetch', url, init)
  },
  notify: (title: string, body: string): Promise<void> => ipcRenderer.invoke('kit:notify', title, body),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('kit:openExternal', url),
  clipboard: {
    write: (text: string): Promise<void> => ipcRenderer.invoke('kit:clipboard:write', text),
    read: (): Promise<string> => ipcRenderer.invoke('kit:clipboard:read')
  },
  hash: (algo: 'md5' | 'sha1' | 'sha256' | 'sha512', text: string): Promise<string> => ipcRenderer.invoke('kit:hash', algo, text),
  /** Handler propre au module (ipcMain.handle côté main). */
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args),
  /** Événement envoyé par le main du module (host.send). Renvoie de quoi se désabonner. */
  on: (channel: string, cb: (...args: any[]) => void): (() => void) => {
    const fn = (_e: unknown, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  }
}

export type Kit = typeof kit

export function exposeKit(): void {
  contextBridge.exposeInMainWorld('kit', kit)
}
