import { globalShortcut } from 'electron'
import { host } from '@open-studio/module'
import { registerKit } from '@open-studio/kit'

// Notes rapides : Ctrl+Alt+N depuis n'importe où ouvre Open Studio sur une nouvelle note.
const SHORTCUT = 'CommandOrControl+Alt+N'

// Raccourci pressé avant que l'interface soit chargée : la note est créée dès son ouverture.
let pending = false

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
}

export function deactivate(): void {
  globalShortcut.unregister(SHORTCUT)
}
