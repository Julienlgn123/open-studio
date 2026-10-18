// ipcRenderer d'un module : invoke/send préfixés par son id (pour rejoindre ses handlers dans
// Open Studio) ; les événements reçus arrivent tels quels (envoyés directement à sa webview).
import { ipcRenderer as raw } from 'electron'

export const moduleId = process.argv.find((a) => a.startsWith('--os-module='))?.slice('--os-module='.length) ?? ''
const scoped = (channel: string): string => (channel.startsWith('studio:') ? channel : `m:${moduleId}:${channel}`)

export const scopedIpcRenderer = {
  invoke: (channel: string, ...args: unknown[]) => raw.invoke(scoped(channel), ...args),
  send: (channel: string, ...args: unknown[]) => raw.send(scoped(channel), ...args),
  sendSync: (channel: string, ...args: unknown[]) => raw.sendSync(scoped(channel), ...args),
  on(channel: string, listener: (...args: any[]) => void) {
    raw.on(channel, listener)
    return scopedIpcRenderer
  },
  once(channel: string, listener: (...args: any[]) => void) {
    raw.once(channel, listener)
    return scopedIpcRenderer
  },
  removeListener(channel: string, listener: (...args: any[]) => void) {
    raw.removeListener(channel, listener)
    return scopedIpcRenderer
  },
  off(channel: string, listener: (...args: any[]) => void) {
    raw.removeListener(channel, listener)
    return scopedIpcRenderer
  },
  removeAllListeners(channel?: string) {
    raw.removeAllListeners(channel)
    return scopedIpcRenderer
  }
} as unknown as Electron.IpcRenderer
