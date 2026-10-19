import { ipcMain } from 'electron'
import { host } from '@open-studio/module'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { startScheduler, stopScheduler } from './scheduler'
import { startFolderSync, stopFolderSync } from './folderSync'
import { setLaunchAtStartup, getPublicSettings } from './settings'
import { refreshAllAccountTokens } from './google/accounts'

// Module Drive Studio dans Open Studio. Tourne aussi fenêtre fermée (Open Studio reste près de
// l'horloge) : les backups planifiés continuent.

export function activate(): void {
  // CSP de l'interface du module (sa propre session).
  host.session().webRequest.onHeadersReceived((details, callback) => {
    const csp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'"
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })

  initDb()
  registerIpc()
  startScheduler()
  startFolderSync()

  // Rafraîchit les tokens de tous les comptes à chaque démarrage (sinon le refresh_token d'un
  // compte inutilisé longtemps risque d'expirer côté Google).
  refreshAllAccountTokens().catch(() => null)

  ipcMain.handle('settings:setLaunchAtStartup', (_, enabled: boolean) => {
    setLaunchAtStartup(enabled)
    return getPublicSettings()
  })
}

export function deactivate(): void {
  stopScheduler()
  stopFolderSync()
}
