// Remplace « electron » dans le code main d'un module (voir vite.ts) : tout vient du vrai
// electron, sauf `app` et `ipcMain`, propres au module. Le code des anciennes apps tourne
// ainsi presque tel quel dans Open Studio (app.getPath('userData'), ipcMain.handle…).
import { host } from './host'

export * from 'electron'
export const app = host.app
export const ipcMain = host.ipcMain
