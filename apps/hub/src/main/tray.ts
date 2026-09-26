import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Notification, Tray } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { launchApp, listAppStates } from './install'
import { getTrayHintSeen, setTrayHintSeen } from './store'

// Open Studio reste disponible après fermeture de sa fenêtre : icône près de l'horloge
// (barre de menus sur Mac) pour lancer une app, et raccourci global pour la palette de lancement.

export const LAUNCHER_SHORTCUT = 'CommandOrControl+Alt+Space'

let tray: Tray | null = null
let quitting = false

export function iconPath(): string {
  return is.dev ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png')
}

/** Affiche la fenêtre principale (la recrée si besoin). */
export function showWindow(getWin: () => BrowserWindow | null, create: () => void): BrowserWindow | null {
  let win = getWin()
  if (!win) {
    create()
    win = getWin()
  }
  if (!win) return null
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

async function rebuildMenu(getWin: () => BrowserWindow | null, create: () => void): Promise<void> {
  if (!tray) return
  const installed = (await listAppStates().catch(() => [])).filter((a) => a.status !== 'not_installed')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Open Studio', click: () => showWindow(getWin, create) },
      { type: 'separator' },
      ...(installed.length
        ? installed.map((a) => ({ label: `Lancer ${a.name}`, click: () => void launchApp(a.id).catch(() => {}) }))
        : [{ label: 'Aucune app installée', enabled: false }]),
      { type: 'separator' },
      { label: `Lanceur rapide (${process.platform === 'darwin' ? '⌘⌥Espace' : 'Ctrl+Alt+Espace'})`, enabled: false },
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

export function setupTray(getWin: () => BrowserWindow | null, create: () => void): void {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: process.platform === 'darwin' ? 18 : 16 })
  tray = new Tray(image)
  tray.setToolTip('Open Studio')
  tray.on('click', () => showWindow(getWin, create))
  void rebuildMenu(getWin, create)
  // Le menu reflète les apps installées : rafraîchi régulièrement (les installs changent la liste).
  setInterval(() => void rebuildMenu(getWin, create), 5 * 60_000)

  const registered = globalShortcut.register(LAUNCHER_SHORTCUT, () => {
    const win = showWindow(getWin, create)
    win?.webContents.send('launcher:open')
  })
  if (!registered) console.warn('[launcher] raccourci déjà utilisé par une autre app')

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

export const refreshTrayMenu = rebuildMenu

/** Fermer la fenêtre la cache (Open Studio continue en arrière-plan : lanceur, mises à jour). */
export function hideOnClose(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
    if (!getTrayHintSeen() && Notification.isSupported()) {
      setTrayHintSeen()
      new Notification({
        title: 'Open Studio reste disponible',
        body: `Lance tes apps depuis l’icône près de l’horloge ou avec ${process.platform === 'darwin' ? '⌘⌥Espace' : 'Ctrl+Alt+Espace'}. Clic droit sur l’icône → Quitter pour le fermer.`
      }).show()
    }
  })
}
