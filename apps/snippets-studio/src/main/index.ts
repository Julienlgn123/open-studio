import { globalShortcut } from 'electron'
import { host } from '@open-studio/module'
import { registerKit } from '@open-studio/kit'

// Snippets : Ctrl+Alt+S depuis n'importe où ouvre Open Studio sur la recherche des snippets.
const SHORTCUT = 'CommandOrControl+Alt+S'
let pending = false

export function activate(): void {
  registerKit()
  host.ipcMain.handle('snippets:takePending', () => {
    const p = pending
    pending = false
    return p
  })
  try {
    globalShortcut.register(SHORTCUT, () => {
      pending = true
      host.reveal()
      host.send('snippets:search')
    })
  } catch {
    /* raccourci déjà pris par une autre app : le module marche sans */
  }
}

export function deactivate(): void {
  globalShortcut.unregister(SHORTCUT)
}
