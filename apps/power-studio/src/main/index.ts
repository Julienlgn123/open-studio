import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import type { AppSettings, ProfileApplyResult, ProfileId } from '@shared/types'
import { PROFILE_ORDER } from '@shared/types'
import { pickableProcesses, resetAuto, startAuto } from './auto'
import { listBloat, reinstallBloat, removeBloat } from './bloat'
import { clean, listCleanTargets } from './clean'
import { getHardware } from './hardware'
import { readStats } from './monitor'
import { AdminDeniedError, OS } from './platform/exec'
import { applyProfile, describeProfiles, detectActiveProfile, profileName, restoreDefaults } from './profiles'
import { listStartup, setStartupEnabled } from './startup'
import { getSettings, getStore, setSettings } from './store'
import { applyTweaks, backupRoot, createRestorePoint, listTweaks, revertTweaks } from './tweaks/engine'
import { mkdirSync } from 'fs'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function iconPath(): string {
  return is.dev ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png')
}

function createWindow(show: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0f',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => show && mainWindow?.show())
  mainWindow.on('close', (e) => {
    if (!quitting && getSettings().runInTray && tray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function showWindow(): void {
  if (!mainWindow) createWindow(true)
  else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function notifyProfile(r: ProfileApplyResult): void {
  mainWindow?.webContents.send('profiles:changed', r)
  refreshTray()
}

function refreshTray(): void {
  if (!tray) return
  const active = getSettings().activeProfile
  tray.setToolTip(`Power Studio${active ? ` — ${profileName(active)}` : ''}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Power Studio', click: showWindow },
      { type: 'separator' },
      ...PROFILE_ORDER.map((id) => ({
        label: profileName(id),
        type: 'radio' as const,
        checked: active === id,
        click: async (): Promise<void> => {
          if (!getSettings().disclaimerAccepted) return showWindow()
          notifyProfile(await applyProfile(id, await getHardware(), true))
        }
      })),
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function setupTray(): void {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.on('click', showWindow)
  refreshTray()
}

function applyLoginItem(s: AppSettings): void {
  if (OS === 'linux') return
  app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ['--hidden'] })
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function registerIpc(): void {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()))
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => OS)

  ipcMain.handle('hw:get', (_, force?: boolean) => getHardware(!!force))
  ipcMain.handle('hw:stats', async () => readStats((await getHardware()).hasBattery))

  ipcMain.handle('profiles:list', async () => describeProfiles(await getHardware()))
  ipcMain.handle('profiles:active', async () => {
    const detected = await detectActiveProfile()
    // Plan changé en dehors de l'app (Windows) : on ne prétend plus qu'un profil est actif.
    if (OS === 'windows' && detected !== getSettings().activeProfile) setSettings({ activeProfile: detected })
    return detected
  })
  ipcMain.handle('profiles:apply', async (_, id: ProfileId) => {
    const r = await applyProfile(id, await getHardware(true), true)
    refreshTray()
    return r
  })
  ipcMain.handle('profiles:restore', async () => {
    try {
      await restoreDefaults(await getHardware(true))
      refreshTray()
      return { ok: true, error: null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('tweaks:list', async () => listTweaks(await getHardware()))
  ipcMain.handle('tweaks:apply', (_, ids: string[]) => applyTweaks(ids))
  ipcMain.handle('tweaks:revert', (_, ids: string[]) => revertTweaks(ids))
  ipcMain.handle('tweaks:restorePoint', async () => {
    try {
      await createRestorePoint()
      return { ok: true, error: null, adminDenied: false }
    } catch (err) {
      return { ok: false, error: errText(err), adminDenied: err instanceof AdminDeniedError }
    }
  })
  ipcMain.handle('tweaks:openBackups', async () => {
    mkdirSync(backupRoot(), { recursive: true })
    await shell.openPath(backupRoot())
  })

  ipcMain.handle('startup:list', () => listStartup())
  ipcMain.handle('startup:set', (_, id: string, enable: boolean) => setStartupEnabled(id, enable))

  ipcMain.handle('bloat:list', () => listBloat())
  ipcMain.handle('bloat:remove', (_, ids: string[]) => removeBloat(ids))
  ipcMain.handle('bloat:reinstall', (_, id: string) => reinstallBloat(id))

  ipcMain.handle('clean:list', () => listCleanTargets())
  ipcMain.handle('clean:run', (_, ids: string[]) => clean(ids))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_, patch: Partial<AppSettings>) => {
    const s = setSettings(patch)
    if ('launchAtLogin' in patch) applyLoginItem(s)
    if ('auto' in patch) resetAuto()
    return s
  })
  ipcMain.handle('activity:list', () => getStore().activity)
  ipcMain.handle('processes:list', () => pickableProcesses())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.power-studio')
    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
    registerIpc()
    const hidden = process.argv.includes('--hidden')
    createWindow(!hidden)
    setupTray()
    void getHardware()
    startAuto(() => getHardware(), notifyProfile)
    app.on('activate', showWindow)
  })

  app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => {
    if (!tray || !getSettings().runInTray) app.quit()
  })
}
