import { useEffect, useMemo, useState } from 'react'
import { ArrowUpCircle } from 'lucide-react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import ToastStack from './components/Toast'
import AppCard from './components/AppCard'
import UpdateBanner from './components/UpdateBanner'
import Onboarding from './components/Onboarding'
import Brandmark from './components/Brandmark'
import { getCategoryColor } from './lib/categories'
import type { InstallProgress } from '@shared/types'

type SortMode = 'name' | 'status'

export default function App(): JSX.Element {
  const { apps, loading, settings, loadSettings, loadApps, setOnboardingSeen } = useStore()
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({})
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(new Set())
  const [selfUpdate, setSelfUpdate] = useState<{ version: string } | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [showOnboarding, setShowOnboarding] = useState(false)

  const installedCount = useMemo(() => apps.filter((a) => a.status !== 'not_installed').length, [apps])

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
      if (!useStore.getState().settings.onboardingSeen) setShowOnboarding(true)
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
      <TitleBar onHelp={() => setShowOnboarding(true)} />
      <div className="app-body">
        <main className="main">
          <div className="hero">
            <div className="hero-row">
              <div className="hero-title">
                <Brandmark size={34} />
                <div>
                  <h1>Catalogue</h1>
                  <div className="hero-sub">
                    Installe, lance et mets à jour les apps de la suite depuis un seul endroit.
                  </div>
                </div>
              </div>
              <div className="hero-stats">
                <strong>{installedCount}</strong>&nbsp;installée{installedCount !== 1 ? 's' : ''} sur{' '}
                <strong>{apps.length}</strong>
                {activeCategory && <>&nbsp;· {activeCategory}</>}
              </div>
            </div>
          </div>

          <div className="view-scroll">
            <div className="view-pad">
              {selfUpdate && (
                <div className="update-banner fade-in" style={{ marginBottom: 14 }}>
                  <ArrowUpCircle size={18} className="update-banner-icon" />
                  <div className="update-banner-text">
                    <div className="update-banner-title">
                      Mise à jour d'Open Studio — v{selfUpdate.version}
                    </div>
                    <div className="update-banner-sub muted">
                      Téléchargée en arrière-plan, installation automatique dans quelques secondes…
                    </div>
                  </div>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
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
      {showOnboarding && (
        <Onboarding
          onClose={() => {
            setShowOnboarding(false)
            if (!settings.onboardingSeen) setOnboardingSeen(true)
          }}
        />
      )}
    </div>
  )
}
