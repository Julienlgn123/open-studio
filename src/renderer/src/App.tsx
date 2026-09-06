import { useEffect, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import ToastStack from './components/Toast'
import AppCard from './components/AppCard'
import UpdateBanner from './components/UpdateBanner'
import type { InstallProgress } from '@shared/types'

export default function App(): JSX.Element {
  const { apps, loading, loadSettings, loadApps } = useStore()
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({})
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(new Set())

  function clearProgress(id: string): void {
    setProgress((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  useEffect(() => {
    ;(async () => {
      await loadSettings()
      await loadApps()
      window.api.app.notifyReady()
    })()

    const off = window.api.apps.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }))
    })
    return off
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <main className="main">
          <div className="page-header">
            <div className="page-header-left">
              <LayoutGrid size={16} />
              <span className="page-header-title">Catalogue</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {apps.length} app{apps.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="view-scroll">
            <div className="view-pad">
              <UpdateBanner
                apps={apps}
                dismissed={dismissedUpdates}
                onDismiss={(id) => setDismissedUpdates((prev) => new Set(prev).add(id))}
              />
              {loading ? (
                <div className="empty-state">
                  <div className="spinner" style={{ width: 24, height: 24 }} />
                </div>
              ) : (
                <div className="card-grid">
                  {apps.map((a) => (
                    <AppCard
                      key={a.id}
                      app={a}
                      progress={progress[a.id]}
                      onDone={() => clearProgress(a.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <ToastStack />
    </div>
  )
}
