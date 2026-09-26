import { app, ipcMain, BrowserWindow, shell } from 'electron'
import { getSettings, setTheme, setOnboardingSeen } from './store'
import { listAppStates, installOrUpdateApp, launchApp, uninstallApp, getInstalledSize, findPreviousVersion, rollbackApp, unskipUpdate } from './install'
import { cleanAppStorage, getAppStorage } from './storage'

function getWin(): BrowserWindow {
  return BrowserWindow.getAllWindows()[0]
}

export function registerIpc(): void {
  ipcMain.handle('window:minimize', () => getWin()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const w = getWin()
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.handle('window:close', () => getWin()?.close())
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:setTheme', (_, theme: 'dark' | 'light') => {
    setTheme(theme)
    return getSettings()
  })
  ipcMain.handle('settings:setOnboardingSeen', (_, seen: boolean) => {
    setOnboardingSeen(seen)
    return getSettings()
  })

  ipcMain.handle('apps:list', () => listAppStates())
  ipcMain.handle('apps:install', (_, id: string) => installOrUpdateApp(id))
  ipcMain.handle('apps:launch', (_, id: string) => launchApp(id))
  ipcMain.handle('apps:uninstall', (_, id: string) => uninstallApp(id))
  ipcMain.handle('apps:size', (_, id: string) => getInstalledSize(id))
  ipcMain.handle('apps:previousVersion', async (_, id: string) => (await findPreviousVersion(id))?.version ?? null)
  ipcMain.handle('apps:rollback', (_, id: string) => rollbackApp(id))
  ipcMain.handle('apps:unskip', (_, id: string) => { unskipUpdate(id); return true })
  ipcMain.handle('storage:list', () => getAppStorage())
  ipcMain.handle('storage:clean', (_, id: string) => cleanAppStorage(id))

  ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url))
}
