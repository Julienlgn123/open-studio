import { app, BrowserWindow, shell, ipcMain, session, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { startScheduler, stopScheduler } from './scheduler'
import { getLaunchAtStartup, setLaunchAtStartup, getPublicSettings } from './settings'
import { refreshAllAccountTokens } from './google/accounts'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

/** Icône minimaliste générée à la volée (aucun asset requis, aucun risque de packaging cassé). */
function createTrayIcon(): Electron.NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 0xf7 // B
    buf[i * 4 + 1] = 0x8f // G
    buf[i * 4 + 2] = 0x6f // R
    buf[i * 4 + 3] = 0xff // A
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createTray(): void {
  try {
    tray = new Tray(createTrayIcon())
    tray.setToolTip('Drive Studio')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Ouvrir Drive Studio',
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } catch {
    tray = null
  }
}

/** Aligne l'enregistrement OS (démarrage à la connexion) sur le réglage stocké. */
function syncLoginItemSettings(): void {
  const enabled = getLaunchAtStartup()
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? ['--hidden'] : []
  })
}

function createWindow(startHidden: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
  })

  // Lancement en tâche de fond (démarrage OS) : referme la fenêtre dans la
  // barre système au lieu de quitter, pour laisser tourner le scheduler.
  // Si aucune icône de tray n'a pu être créée, on quitte proprement plutôt
  // que de laisser une fenêtre invisible et impossible à rouvrir.
  mainWindow.on('close', (e) => {
    if (isQuitting) return
    if (tray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev) {
    // Remonte les logs du renderer dans le terminal pendant le dev.
    // Electron 35 : nouvel objet d'événement { message, level, lineNumber, sourceId }.
    mainWindow.webContents.on(
      'console-message',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any, level?: unknown, message?: unknown, line?: unknown, source?: unknown) => {
        const msg = e && typeof e === 'object' && 'message' in e ? e.message : message
        const src = e && typeof e === 'object' && 'sourceId' in e ? e.sourceId : source
        const ln = e && typeof e === 'object' && 'lineNumber' in e ? e.lineNumber : line
        // eslint-disable-next-line no-console
        console.log(`[renderer] ${msg} (${src}:${ln})`)
        void level
      }
    )
  }
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gdrive-backup-manager')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  // CSP : appliqué au chargement en production (fichier local). En dev, Vite
  // injecte des scripts inline pour le HMR, donc on garde une politique permissive.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: ws://localhost:* http://localhost:*; " +
        'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:'
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  initDb()
  registerIpc()
  syncLoginItemSettings()

  const launchedHidden = process.argv.includes('--hidden')
  if (getLaunchAtStartup()) createTray()
  createWindow(launchedHidden && !!tray)
  startScheduler()

  // Rafraîchit les tokens de tous les comptes à chaque lancement (l'app
  // n'utilise autrement le refresh_token qu'au moment d'un appel API — sans
  // ça, un compte inutilisé pendant longtemps risque de finir avec un
  // refresh_token expiré côté Google).
  refreshAllAccountTokens().catch(() => null)

  ipcMain.handle('settings:setLaunchAtStartup', (_, enabled: boolean) => {
    setLaunchAtStartup(enabled)
    syncLoginItemSettings()
    if (enabled && !tray) createTray()
    else if (!enabled && tray) {
      tray.destroy()
      tray = null
    }
    return getPublicSettings()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(false)
    else mainWindow?.show()
  })

  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    let checked = false
    ipcMain.on('renderer:ready', () => {
      if (checked) return
      checked = true
      autoUpdater.checkForUpdates().catch(() => null)
    })
    setTimeout(() => {
      if (!checked) {
        checked = true
        autoUpdater.checkForUpdates().catch(() => null)
      }
    }, 8000)
  }
})

// Toute tentative de quitter l'app (Cmd+Q, fermeture OS, menu système...) doit
// vraiment fermer, même avec un tray actif — seul mainWindow.close() doit
// masquer la fenêtre au lieu de quitter.
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  stopScheduler()
  if (process.platform !== 'darwin') app.quit()
})
