import { EventEmitter } from 'events'
import { host } from '@open-studio/module'
import type { TransferProgress, BackupProgress } from '@shared/types'

// Bus d'événements interne au main. ipc.ts relaie vers le renderer.
class AppEvents extends EventEmitter {}
export const appEvents = new AppEvents()
appEvents.setMaxListeners(50)

export function emitTransfer(p: TransferProgress): void {
  appEvents.emit('transfer', p)
  broadcast('transfer:progress', p)
}

export function emitBackup(p: BackupProgress): void {
  appEvents.emit('backup', p)
  broadcast('backup:progress', p)
}

/** Vers l'interface du module (si elle est ouverte dans Open Studio). */
export function broadcast(channel: string, payload: unknown): void {
  host.send(channel, payload)
}
