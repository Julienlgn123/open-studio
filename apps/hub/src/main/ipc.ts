import { app, ipcMain, BrowserWindow, shell, nativeTheme } from 'electron'
import type { Layout, ThemeSetting } from '@shared/types'
import { effectiveTheme, getSettings, setLastModule, setLaunchAtStartup, setLayout, setTheme, setTourSeen } from './store'
import { getCatalogState, installModule, listModules, removeLegacyApp, uninstallModule } from './modules/manager'
import { broadcastTheme, moduleOfGuest, setCurrentModule } from './modules/runtime'
import { broadcast } from './events'

export function registerIpc(getWin: () => BrowserWindow | null, onModulesChanged: () => void, open: (id: string | null) => void): void {
  ipcMain.handle('window:minimize', () => getWin()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const w = getWin()
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.handle('window:close', () => getWin()?.close())
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('settings:get', () => ({ ...getSettings(), effectiveTheme: effectiveTheme() }))
  ipcMain.handle('settings:setTheme', (_, theme: ThemeSetting) => {
    setTheme(theme)
    applyTheme()
    return { ...getSettings(), effectiveTheme: effectiveTheme() }
  })
  ipcMain.handle('settings:setLaunchAtStartup', (_, enabled: boolean) => {
    setLaunchAtStartup(enabled)
    return { ...getSettings(), effectiveTheme: effectiveTheme() }
  })
  ipcMain.handle('settings:setLayout', (_, p: Partial<Layout> | null) => {
    setLayout(p)
    return { ...getSettings(), effectiveTheme: effectiveTheme() }
  })
  ipcMain.handle('settings:setTourSeen', () => {
    setTourSeen()
    return { ...getSettings(), effectiveTheme: effectiveTheme() }
  })
  nativeTheme.on('updated', () => {
    if (getSettings().theme === 'system') applyTheme()
  })

  ipcMain.handle('modules:list', (_, refresh?: boolean) => listModules({ refresh }))
  ipcMain.handle('modules:catalogState', () => getCatalogState())
  ipcMain.handle('modules:install', async (_, id: string) => {
    await installModule(id)
    onModulesChanged()
  })
  ipcMain.handle('modules:uninstall', async (_, id: string) => {
    await uninstallModule(id)
    onModulesChanged()
  })
  ipcMain.handle('modules:removeLegacy', (_, id: string) => removeLegacyApp(id))
  // Module affiché à l'écran : rouvert au prochain lancement, et pas mis à jour sous les yeux.
  ipcMain.on('modules:current', (_, id: string | null) => {
    setCurrentModule(id)
    setLastModule(id)
  })

  // Une interface de module demande à ouvrir un autre module (ou l'accueil).
  ipcMain.on('studio:open', (_, id: string | null) => open(id))
  // Un module signale qu'il travaille (ou qu'il a fini) : l'hôte garde ou décharge son interface.
  ipcMain.on('studio:busy', (e, busy: boolean) => {
    const id = moduleOfGuest(e.sender)
    if (id) broadcast('modules:busy', { id, busy: !!busy })
  })
  // Thème courant, lu de façon synchrone par le preload des modules (pas de flash au chargement).
  ipcMain.on('studio:theme', (e) => {
    e.returnValue = effectiveTheme()
  })

  ipcMain.handle('shell:openExternal', (_, url: string) => {
    if (/^https?:/.test(url)) return shell.openExternal(url)
  })
}

function applyTheme(): void {
  broadcast('studio:theme', effectiveTheme())
  broadcastTheme()
}
