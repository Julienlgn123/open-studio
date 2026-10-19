import { Notification, globalShortcut } from 'electron'
import { host } from '@open-studio/module'
import { registerKit, storeGet, storeSet } from '@open-studio/kit'

// Notes rapides : Ctrl+Alt+N depuis n'importe où ouvre Open Studio sur une nouvelle note.
const SHORTCUT = 'CommandOrControl+Alt+N'

// Raccourci pressé avant que l'interface soit chargée : la note est créée dès son ouverture.
let pending = false
let timer: ReturnType<typeof setInterval> | null = null

interface StoredNote {
  id: string
  title: string
  body: string
  reminder?: number
  deletedAt?: number
}

/**
 * Rappels : vérifiés ici (et pas dans l'interface, qui peut être déchargée).
 * Les rappels déjà affichés sont notés à part, pour ne pas réécrire les notes en même temps que l'interface.
 */
function checkReminders(): void {
  const notes = storeGet<StoredNote[]>('notes', [])
  const fired = storeGet<Record<string, number>>('reminders-fired', {})
  const now = Date.now()
  let changed = false
  for (const n of notes) {
    if (!n.reminder || n.deletedAt || n.reminder > now) continue
    if (fired[n.id] === n.reminder) continue
    // Un rappel vieux de plus d'un jour (PC éteint) n'est pas rejoué en rafale.
    if (now - n.reminder < 86_400_000 && Notification.isSupported()) {
      const title = n.title.trim() || n.body.trim().split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 60) || 'Note'
      const notif = new Notification({ title: `Rappel : ${title}`, body: n.body.replace(/[#*_`>[\]]/g, '').trim().slice(0, 140) || 'Ouvre la note pour la voir.' })
      notif.on('click', () => {
        host.reveal()
        host.send('notes:open', n.id)
      })
      notif.show()
    }
    fired[n.id] = n.reminder
    changed = true
  }
  if (changed) storeSet('reminders-fired', fired)
}

export function activate(): void {
  registerKit()
  host.ipcMain.handle('notes:takePending', () => {
    const p = pending
    pending = false
    return p
  })
  globalShortcut.register(SHORTCUT, () => {
    pending = true
    host.reveal()
    host.send('notes:new')
  })
  checkReminders()
  timer = setInterval(checkReminders, 20_000)
}

export function deactivate(): void {
  globalShortcut.unregister(SHORTCUT)
  if (timer) clearInterval(timer)
}
