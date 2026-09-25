import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ToastStack from './components/Toast'
import TransfersPanel from './components/TransfersPanel'
import Onboarding from './components/Onboarding'
import ReconnectBanner from './components/ReconnectBanner'
import DashboardView from './views/DashboardView'
import FilesView from './views/FilesView'
import AccountsView from './views/AccountsView'
import BackupView from './views/BackupView'
import LogsView from './views/LogsView'
import SettingsView from './views/SettingsView'
import SharedView from './views/SharedView'

export default function App(): JSX.Element {
  const {
    view,
    activeFolderId,
    settings,
    accounts,
    onboardingDismissed,
    loadAll,
    loadAccounts,
    loadFiles,
    loadFolders,
    loadDashboard,
    loadJobs,
    syncQuotas,
    syncDriveFiles,
    pushTransfer,
    toast
  } = useStore()
  const [dragging, setDragging] = useState(false)

  const showOnboarding = !onboardingDismissed && (!settings.googleConfigured || accounts.length === 0)

  useEffect(() => {
    ;(async () => {
      await loadAll()
      window.api.app.notifyReady()
      // Au démarrage : quotas + scan complet du contenu de chaque Drive.
      syncQuotas({ silent: true })
      syncDriveFiles({ silent: true })
    })()

    const offTransfer = window.api.transfers.onProgress((t) => {
      pushTransfer(t)
      if (t.status === 'done' && (t.kind === 'upload' || t.kind === 'replicate')) {
        loadFiles()
        loadFolders()
        loadDashboard()
        loadJobs()
        loadAccounts()
      }
    })
    const offScanning = window.api.accounts.onFilesScanning((p) => {
      useStore.setState({ scanningAccountId: p.accountId, scanCount: p.count })
    })
    const offScanned = window.api.accounts.onFilesSynced((p) => {
      if (p.result.added || p.result.removed || p.result.updated) {
        loadFiles()
        loadAccounts()
        loadDashboard()
      }
    })
    // Refresh des tokens au lancement (voir main/index.ts) : si un ou
    // plusieurs comptes n'ont pas pu être rafraîchis, on prévient l'utilisateur
    // (refresh_token révoqué/expiré → passe en statut erreur, bouton
    // "Reconnecter" disponible sur la page Comptes).
    const offTokens = window.api.accounts.onTokensRefreshed((p) => {
      loadAccounts()
      if (p.failed.length) {
        toast(
          `${p.failed.length} compte(s) à reconnecter : ${p.failed.join(', ')}`,
          'error'
        )
      }
    })
    return () => {
      offTransfer()
      offScanning()
      offScanned()
      offTokens()
    }
  }, [])

  // Backup terminé (event dédié) → recharge jobs + comptes + dashboard.
  useEffect(() => {
    const off = window.api.backup.onProgress((p) => {
      if (p.status === 'completed' || p.status === 'failed') {
        loadJobs()
        loadDashboard()
        loadAccounts()
        loadFiles()
      }
    })
    return off
  }, [])

  // Fraîcheur des données : synchro périodique (pause si fenêtre cachée) +
  // au retour sur la fenêtre. Rien à faire manuellement.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return
      syncQuotas({ silent: true, minIntervalMs: 45_000 })
    }, 60_000)
    // Scan complet du contenu des Drive toutes les 5 min.
    const filesInterval = setInterval(() => {
      if (document.hidden) return
      syncDriveFiles({ silent: true })
    }, 300_000)
    function onFocus(): void {
      syncQuotas({ silent: true, minIntervalMs: 20_000 })
      loadJobs()
      loadDashboard()
    }
    function onVisible(): void {
      if (!document.hidden) onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      clearInterval(filesInterval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Chaque changement de page rafraîchit ses données (throttlé).
  useEffect(() => {
    syncQuotas({ silent: true, minIntervalMs: 15_000 })
    loadDashboard()
    loadJobs()
    loadFolders()
  }, [view])

  // Drag & drop de fichiers n'importe où dans la fenêtre → upload
  useEffect(() => {
    let depth = 0
    function onDragEnter(e: DragEvent): void {
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) {
        depth++
        setDragging(true)
      }
    }
    function onDragOver(e: DragEvent): void {
      e.preventDefault()
    }
    function onDragLeave(e: DragEvent): void {
      e.preventDefault()
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    async function onDrop(e: DragEvent): Promise<void> {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length === 0) return
      const paths = files.map((f) => window.api.files.pathForFile(f)).filter(Boolean)
      if (paths.length === 0) return
      try {
        const res = await window.api.files.uploadPaths(paths)
        const folderId = useStore.getState().activeFolderId
        if (folderId && useStore.getState().view === 'folder') {
          for (const r of res) await window.api.folders.addFile(folderId, r.id)
        }
        await Promise.all([loadFiles(), loadFolders(), loadDashboard()])
        toast(`${res.length} fichier(s) envoyé(s)`, 'success')
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Échec upload', 'error')
      }
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <ReconnectBanner />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <AnimatePresence mode="wait">
            <motion.div
              key={view + (activeFolderId ?? '')}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {view === 'dashboard' && <DashboardView />}
              {view === 'files' && <FilesView />}
              {view === 'folder' && <FilesView folderId={activeFolderId} />}
              {view === 'accounts' && <AccountsView />}
              {view === 'backup' && <BackupView />}
              {view === 'shared' && <SharedView />}
              {view === 'logs' && <LogsView />}
              {view === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {dragging && <div className="dropzone-overlay">Déposez pour envoyer vers Drive</div>}
      <TransfersPanel />
      <ToastStack />
      {showOnboarding && <Onboarding />}
    </div>
  )
}
