// ipcRenderer d'un module : invoke/send préfixés par son id (pour rejoindre ses handlers dans
// Open Studio) ; les événements reçus arrivent tels quels (envoyés directement à sa webview).
import { ipcRenderer as raw } from 'electron'

export const moduleId = process.argv.find((a) => a.startsWith('--os-module='))?.slice('--os-module='.length) ?? ''
const scoped = (channel: string): string => (channel.startsWith('studio:') ? channel : `m:${moduleId}:${channel}`)

// Open Studio décharge l'interface d'un module qu'on quitte pour économiser la mémoire, sauf s'il
// est occupé : un appel au main process dure depuis plus d'une seconde (conversion, réponse d'IA,
// sauvegarde…) ou le module l'a signalé lui-même (`window.studio.setBusy`).
let pending = 0
let manual = false
let reported = false
let timer: ReturnType<typeof setTimeout> | null = null
const report = (): void => {
  const busy = pending > 0 || manual
  if (busy === reported) return
  reported = busy
  raw.send('studio:busy', busy)
}
export function setManualBusy(v: boolean): void {
  manual = v
  report()
}
const track = <T>(p: Promise<T>): Promise<T> => {
  pending++
  if (!timer) timer = setTimeout(() => ((timer = null), report()), 1000)
  const done = (): void => {
    if (--pending === 0 && timer) (clearTimeout(timer), (timer = null))
    if (pending === 0) report()
  }
  p.then(done, done)
  return p
}

export const scopedIpcRenderer = {
  invoke: (channel: string, ...args: unknown[]) => {
    const p = raw.invoke(scoped(channel), ...args)
    return channel.startsWith('studio:') ? p : track(p)
  },
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
