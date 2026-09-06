import { ipcMain, BrowserWindow, shell } from 'electron'
import { getSettings, setTheme } from './store'
import { listAppStates, installOrUpdateApp, launchApp, uninstallApp } from './install'

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

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:setTheme', (_, theme: 'dark' | 'light') => {
    setTheme(theme)
    return getSettings()
  })

  ipcMain.handle('apps:list', () => listAppStates())
  ipcMain.handle('apps:install', (_, id: string) => installOrUpdateApp(id))
  ipcMain.handle('apps:launch', (_, id: string) => launchApp(id))
  ipcMain.handle('apps:uninstall', (_, id: string) => uninstallApp(id))

  ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url))
}
