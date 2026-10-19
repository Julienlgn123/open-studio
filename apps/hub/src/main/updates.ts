import { ipcMain } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import type { UpdateState } from '@shared/types'
import { broadcast } from './events'
import { getAutoUpdate } from './store'

// Mises à jour automatiques d'Open Studio et de ses modules, avec un état unique affiché dans
// l'interface (bandeau en bas) et un bouton Annuler à chaque étape.

const IDLE: UpdateState = { phase: 'idle', kind: null, label: '', pct: 0 }
let state: UpdateState = IDLE

export function getUpdateState(): UpdateState {
  return state
}

export function setUpdateState(next: UpdateState): void {
  state = next
  broadcast('updates:state', state)
}

// ─── Modules ───────────────────────────────────────────────────────────────────────────────

let moduleAbort: AbortController | null = null

/** Démarre un lot de mises à jour de modules ; null si une mise à jour d'Open Studio occupe déjà le bandeau. */
export function beginModuleBatch(): AbortController | null {
  if (state.kind === 'app' && state.phase !== 'idle') return null
  moduleAbort = new AbortController()
  return moduleAbort
}

export function endModuleBatch(): void {
  moduleAbort = null
  if (state.kind === 'module') setUpdateState(IDLE)
}

// ─── Open Studio lui-même ─────────────────────────────────────────────────────────────────

let appToken: CancellationToken | null = null
let countdown: NodeJS.Timeout | null = null
let version = ''
/** Version refusée par la personne : on n'insiste pas avant le prochain lancement. */
let declined = ''
let windowVisible: () => boolean = () => true

const RESTART_DELAY_S = 10

async function downloadApp(): Promise<void> {
  appToken = new CancellationToken()
  setUpdateState({ phase: 'downloading', kind: 'app', label: `Téléchargement d’Open Studio v${version}`, pct: -1 })
  try {
    await autoUpdater.downloadUpdate(appToken)
  } catch (err) {
    if (state.kind === 'app' && state.phase === 'downloading') setUpdateState(IDLE)
    if (!appToken?.cancelled) console.error('[autoUpdater] téléchargement', err)
  } finally {
    appToken = null
  }
}

function startCountdown(): void {
  // Fenêtre cachée (démarrage avec l'ordinateur) : personne pour annuler, on installe discrètement à la fermeture.
  if (!windowVisible()) {
    autoUpdater.autoInstallOnAppQuit = true
    setUpdateState(IDLE)
    return
  }
  let left = RESTART_DELAY_S
  const tick = (): void => {
    setUpdateState({ phase: 'ready', kind: 'app', label: `Open Studio v${version} est prêt`, pct: 1, seconds: left })
    if (left-- <= 0) {
      stopCountdown()
      autoUpdater.quitAndInstall(false, true)
    }
  }
  tick()
  countdown = setInterval(tick, 1000)
}

function stopCountdown(): void {
  if (countdown) clearInterval(countdown)
  countdown = null
}

/** Branche electron-updater : vérification au lancement (appelée par l'index), téléchargement automatique si activé. */
export function setupAppUpdater(isWindowVisible: () => boolean): void {
  windowVisible = isWindowVisible
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('update-available', (info) => {
    if (info.version === declined) return
    version = info.version
    if (getAutoUpdate()) void downloadApp()
    else setUpdateState({ phase: 'available', kind: 'app', label: `Open Studio v${version} est disponible`, pct: 0 })
  })
  autoUpdater.on('download-progress', (p) => {
    if (state.kind === 'app' && state.phase === 'downloading') {
      setUpdateState({ ...state, pct: Math.max(0, Math.min(1, p.percent / 100)) })
    }
  })
  autoUpdater.on('update-downloaded', (info) => {
    version = info.version
    startCountdown()
  })
  autoUpdater.on('error', (err) => console.error('[autoUpdater]', err))

  ipcMain.handle('updates:state', () => state)
  // Télécharger maintenant (mises à jour automatiques désactivées).
  ipcMain.handle('updates:start', () => {
    if (state.kind === 'app' && state.phase === 'available') void downloadApp()
  })
  // Redémarrer tout de suite au lieu d'attendre la fin du décompte.
  ipcMain.handle('updates:installNow', () => {
    if (state.kind === 'app' && state.phase === 'ready') {
      stopCountdown()
      autoUpdater.quitAndInstall(false, true)
    }
  })
  ipcMain.handle('updates:cancel', () => cancelUpdate())
}

export function checkAppUpdate(): void {
  autoUpdater.checkForUpdates().catch(() => null)
}

/** Annule ce qui est en cours : téléchargement d'un module, d'Open Studio, ou redémarrage programmé. */
export function cancelUpdate(): void {
  if (state.kind === 'module') {
    moduleAbort?.abort()
    return
  }
  if (state.kind !== 'app') return
  declined = version
  stopCountdown()
  appToken?.cancel()
  autoUpdater.autoInstallOnAppQuit = false
  setUpdateState(IDLE)
}
