import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { isInstalled, sortModules, useStore } from './store'
import TitleBar from './components/TitleBar'
import Rail from './components/Rail'
import HomeView from './components/HomeView'
import StoreView from './components/StoreView'
import SettingsView from './components/SettingsView'
import ModuleFrames from './components/ModuleFrames'
import Launcher from './components/Launcher'
import ToastStack from './components/Toast'
import ConfirmDialog from './components/ConfirmDialog'
import Tour from './components/Tour'

export default function App(): JSX.Element {
  const { view, loadSettings, loadModules, setProgress, applyTheme, openModule, go } = useStore()
  const [palette, setPalette] = useState(false)
  const [selfUpdate, setSelfUpdate] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      await loadSettings()
      await loadModules()
      window.api.app.notifyReady()
      // Premier lancement : visite guidée. Sinon, reprend là où on s'était arrêté.
      const { settings, openTour } = useStore.getState()
      if (!settings.tourSeen) openTour()
      else if (settings.lastModule) openModule(settings.lastModule)
    })()

    /** Ctrl+0 accueil, Ctrl+1…9 modules de la barre de gauche. */
    const digit = (key: string): void => {
      const n = Number(key)
      if (n === 0) return go({ kind: 'home' })
      const { modules, settings } = useStore.getState()
      const m = sortModules(modules.filter(isInstalled), settings.layout.order).filter((x) => !settings.layout.hidden.includes(x.id))[n - 1]
      if (m) go({ kind: 'module', id: m.id })
    }
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        digit(e.key)
      }
    }
    window.addEventListener('keydown', onKey)

    const offs = [
      window.api.modules.onProgress(setProgress),
      window.api.modules.onChanged(() => void loadModules()),
      window.api.modules.onAutoUpdated((p) => useStore.getState().toast(`${p.name} mis à jour${p.version ? ` (v${p.version})` : ''}`, 'success')),
      window.api.settings.onTheme(applyTheme),
      window.api.app.onNavigate(openModule),
      window.api.app.onLauncher(() => setPalette(true)),
      window.api.app.onShortcut((k) => k.startsWith('digit:') && digit(k.slice(6))),
      window.api.app.onUpdateReady((p) => setSelfUpdate(p.version))
    ]
    return () => {
      window.removeEventListener('keydown', onKey)
      offs.forEach((off) => off())
    }
  }, [])

  return (
    <div className="app">
      <TitleBar onPalette={() => setPalette(true)} />
      <div className="app-body">
        <Rail />
        <main className="main">
          {view.kind === 'home' && <HomeView />}
          {view.kind === 'store' && <StoreView />}
          {view.kind === 'settings' && <SettingsView />}
          <ModuleFrames />
        </main>
      </div>

      {selfUpdate && (
        <div className="update-pill">
          <Loader2 size={14} className="spin-icon" />
          Open Studio v{selfUpdate} est prêt : redémarrage dans quelques secondes…
        </div>
      )}
      <ToastStack />
      <ConfirmDialog />
      <Tour />
      {palette && <Launcher onClose={() => setPalette(false)} />}
    </div>
  )
}
