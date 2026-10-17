import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Notification, Tray } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getTrayHintSeen, setTrayHintSeen } from './store'
import type { ModuleInfo } from '@shared/types'

// Open Studio reste disponible fenêtre fermée (ses modules tournent : sauvegardes planifiées,
// rappels de révision…) : icône près de l'horloge, et raccourci global pour la palette.

export const LAUNCHER_SHORTCUT = 'CommandOrControl+Alt+Space'
const SHORTCUT_LABEL = process.platform === 'darwin' ? '⌘⌥Espace' : 'Ctrl+Alt+Espace'

let tray: Tray | null = null
let quitting = false

export function iconPath(): string {
  return is.dev ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png')
}

export function setupTray(opts: { show: () => void; open: (id: string | null) => void; launcher: () => void }): void {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: process.platform === 'darwin' ? 18 : 16 })
  tray = new Tray(image)
  tray.setToolTip('Open Studio')
  tray.on('click', opts.show)
  refreshTray([], opts)

  const registered = globalShortcut.register(LAUNCHER_SHORTCUT, opts.launcher)
  if (!registered) console.warn('[launcher] raccourci déjà utilisé par une autre app')

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

/** Le menu liste les modules installés (rafraîchi à chaque changement). */
export function refreshTray(modules: ModuleInfo[], opts: { show: () => void; open: (id: string | null) => void }): void {
  if (!tray) return
  const installed = modules.filter((m) => m.status !== 'available')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Open Studio', click: opts.show },
      { type: 'separator' },
      ...(installed.length
        ? installed.map((m) => ({ label: m.name, click: () => opts.open(m.id) }))
        : [{ label: 'Aucun module installé', enabled: false }]),
      { type: 'separator' },
      { label: `Palette rapide (${SHORTCUT_LABEL})`, enabled: false },
      {
        label: 'Quitter Open Studio',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

/** Fermer la fenêtre la cache : les modules continuent de tourner en arrière-plan. */
export function hideOnClose(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
    if (!getTrayHintSeen() && Notification.isSupported()) {
      setTrayHintSeen()
      new Notification({
        title: 'Open Studio reste ouvert en arrière-plan',
        body: `Tes modules continuent de tourner. Rouvre-le depuis l’icône près de l’horloge ou avec ${SHORTCUT_LABEL}. Clic droit sur l’icône → Quitter pour le fermer.`
      }).show()
    }
  })
}
