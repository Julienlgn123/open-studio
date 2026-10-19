import { app, BrowserWindow, shell, ipcMain, session, protocol } from 'electron'
import { delimiter, join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { checkAppUpdate, setupAppUpdater } from './updates'
import { broadcast, setEventTarget } from './events'
import { hideOnClose, iconPath, refreshTray, setupTray } from './tray'
import { syncLoginItem } from './store'
import { activateInstalled, autoUpdate, listModules } from './modules/manager'
import { deactivateAll, guardWebviews, initRuntime } from './modules/runtime'

// Profil séparé pour le développement et les versions de test : ni les réglages ni le verrou
// d'instance unique de l'Open Studio installé ne sont touchés.
const PROFILE = import.meta.env.MAIN_VITE_PROFILE || (app.isPackaged ? '' : 'dev')
// Tests en développement : un faux AppData (copie des données), pour ne jamais toucher aux vraies.
if ((!app.isPackaged || PROFILE) && process.env.OPEN_STUDIO_APPDATA) app.setPath('appData', process.env.OPEN_STUDIO_APPDATA)
if (PROFILE) app.setPath('userData', join(app.getPath('appData'), `open-studio-${PROFILE}`))

// Les modules chargent leurs dépendances lourdes (better-sqlite3, node-llama-cpp…) depuis les
// node_modules d'Open Studio : leur propre dossier n'en a pas.
process.env.NODE_PATH = [
  join(app.getAppPath(), 'node_modules'),
  ...(is.dev ? [resolve(app.getAppPath(), '../../node_modules')] : []),
  process.env.NODE_PATH ?? ''
]
  .filter(Boolean)
  .join(delimiter)
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('module').Module._initPaths()

// Schémas utilisés par des modules (lecture des enregistrements de Cours Studio) : à déclarer
// avant le démarrage d'Electron, chaque module les branche ensuite sur sa propre session.
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true } }])

const UPDATE_INTERVAL_MS = 30 * 60_000
let mainWindow: BrowserWindow | null = null
const startHidden = process.argv.includes('--hidden')

function createWindow(show: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0f',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webviewTag: true
    }
  })

  if (show) mainWindow.on('ready-to-show', () => mainWindow?.show())
  hideOnClose(mainWindow)
  guardWebviews(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): BrowserWindow | null {
  if (!mainWindow) createWindow(true)
  const win = mainWindow
  if (!win) return null
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

/** Affiche Open Studio sur un module (ou l'accueil). */
function openModule(id: string | null): void {
  showWindow()?.webContents.send('studio:navigate', id)
}

const trayActions = {
  show: () => void showWindow(),
  open: openModule,
  launcher: () => showWindow()?.webContents.send('launcher:open')
}

async function modulesChanged(): Promise<void> {
  refreshTray(await listModules().catch(() => []), trayActions)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => void showWindow())

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.open-studio.app')
    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Seulement pour l'interface d'Open Studio : les modules ont leur propre session.
      const csp = is.dev
        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: ws://localhost:* http://localhost:*; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data:"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
    })

    setEventTarget(() => mainWindow)
    initRuntime({ window: () => mainWindow, reveal: openModule })
    registerIpc(() => mainWindow, () => void modulesChanged(), openModule)
    syncLoginItem()

    // Les modules démarrent avant la fenêtre : leurs handlers doivent exister quand leur interface se charge.
    await activateInstalled()
    createWindow(!startHidden)
    setupTray(trayActions)
    void modulesChanged()
    app.on('activate', () => void showWindow())

    // Mises à jour au lancement (modules, puis Open Studio) : automatiques, avec un bandeau pour annuler.
    // Ensuite, une vérification régulière en arrière-plan.
    ipcMain.once('renderer:ready', () => setTimeout(() => void autoUpdate({ atLaunch: true }), 2500))
    setInterval(() => void autoUpdate(), UPDATE_INTERVAL_MS)

    if (app.isPackaged && !PROFILE) {
      setupAppUpdater(() => !!mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized())
      let checked = false
      ipcMain.on('renderer:ready', () => {
        if (checked) return
        checked = true
        setTimeout(checkAppUpdate, 1500)
      })
      setInterval(checkAppUpdate, UPDATE_INTERVAL_MS)
    }
  })

  // Fenêtre fermée ≠ quitter : Open Studio reste dans la zone de notification (voir tray.ts).
  app.on('window-all-closed', () => {})
  app.on('before-quit', () => void deactivateAll())
}
