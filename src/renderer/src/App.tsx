import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, ArrowUpCircle } from 'lucide-react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import ToastStack from './components/Toast'
import AppCard from './components/AppCard'
import UpdateBanner from './components/UpdateBanner'
import { getCategoryColor } from './lib/categories'
import type { InstallProgress } from '@shared/types'

type SortMode = 'name' | 'status'

export default function App(): JSX.Element {
  const { apps, loading, loadSettings, loadApps } = useStore()
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({})
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(new Set())
  const [selfUpdate, setSelfUpdate] = useState<{ version: string } | null>(null)
  const [installingSelfUpdate, setInstallingSelfUpdate] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('name')

  const categories = useMemo(
    () => Array.from(new Set(apps.map((a) => a.category))).sort(),
    [apps]
  )

  const visibleApps = useMemo(() => {
    const filtered = activeCategory ? apps.filter((a) => a.category === activeCategory) : apps
    const sorted = [...filtered]
    if (sortMode === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      // Statut : installé/màj d'abord, puis non installé — pratique pour
      // retrouver vite ce qui est déjà prêt à lancer.
      const rank: Record<string, number> = {
        update_available: 0,
        installed: 0,
        not_installed: 1,
        error: 2
      }
      sorted.sort((a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1) || a.name.localeCompare(b.name))
    }
    return sorted
  }, [apps, activeCategory, sortMode])

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

    const offProgress = window.api.apps.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.id]: p }))
    })
    const offUpdate = window.api.app.onUpdateReady((p) => setSelfUpdate(p))
    return () => {
      offProgress()
      offUpdate()
    }
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
                {visibleApps.length} app{visibleApps.length !== 1 ? 's' : ''}
                {activeCategory ? ` · ${activeCategory}` : ''}
              </span>
            </div>
          </div>

          <div className="view-scroll">
            <div className="view-pad">
              {selfUpdate && (
                <div className="update-banner fade-in" style={{ marginBottom: 14 }}>
                  <ArrowUpCircle size={18} className="update-banner-icon" />
                  <div className="update-banner-text">
                    <div className="update-banner-title">
                      Mise à jour d'Open Studio prête — v{selfUpdate.version}
                    </div>
                    <div className="update-banner-sub muted">
                      Téléchargée en arrière-plan, un redémarrage suffit pour l'appliquer.
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setSelfUpdate(null)}
                      disabled={installingSelfUpdate}
                    >
                      Plus tard
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={installingSelfUpdate}
                      onClick={() => {
                        setInstallingSelfUpdate(true)
                        window.api.app.installUpdate().catch(() => setInstallingSelfUpdate(false))
                      }}
                    >
                      {installingSelfUpdate ? (
                        <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      ) : null}
                      Redémarrer maintenant
                    </button>
                  </div>
                </div>
              )}
              <UpdateBanner
                apps={apps}
                dismissed={dismissedUpdates}
                onDismiss={(id) => setDismissedUpdates((prev) => new Set(prev).add(id))}
              />
              {categories.length > 1 && (
                <div className="filter-row">
                  <button
                    className={`filter-chip${activeCategory === null ? ' active' : ''}`}
                    onClick={() => setActiveCategory(null)}
                  >
                    Tous
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`filter-chip${activeCategory === cat ? ' active' : ''}`}
                      style={{ ['--chip-color' as string]: getCategoryColor(cat) }}
                      onClick={() => setActiveCategory((prev) => (prev === cat ? null : cat))}
                    >
                      <span className="filter-chip-dot" />
                      {cat}
                    </button>
                  ))}
                  <select
                    className="sort-select"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                  >
                    <option value="name">Trier : Nom (A→Z)</option>
                    <option value="status">Trier : Installées d'abord</option>
                  </select>
                </div>
              )}
              {loading ? (
                <div className="empty-state">
                  <div className="spinner" style={{ width: 24, height: 24 }} />
                </div>
              ) : visibleApps.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-title">Aucune app dans "{activeCategory}"</div>
                </div>
              ) : (
                <div className="card-grid">
                  {visibleApps.map((a) => (
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
