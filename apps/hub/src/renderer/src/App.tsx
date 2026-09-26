import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import Sidebar, { type View } from './components/Sidebar'
import ToastStack from './components/Toast'
import AppCard from './components/AppCard'
import UpdateBanner from './components/UpdateBanner'
import Onboarding from './components/Onboarding'
import type { AppState, InstallProgress } from '@shared/types'

const byName = (a: AppState, b: AppState): number => a.name.localeCompare(b.name)

export default function App(): JSX.Element {
  const { apps, loading, settings, loadSettings, loadApps, setOnboardingSeen } = useStore()
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({})
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<string>>(new Set())
  const [selfUpdate, setSelfUpdate] = useState<{ version: string } | null>(null)
  const [view, setView] = useState<View>({ kind: 'all' })
  const [query, setQuery] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

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
      if (p.phase === 'done') clearProgress(p.id)
      else setProgress((prev) => ({ ...prev, [p.id]: p }))
    })
    const offUpdate = window.api.app.onUpdateReady((p) => setSelfUpdate(p))
    // Mise à jour automatique d'une app gérée (faite en arrière-plan par Open Studio).
    const offAuto = window.api.apps.onAutoUpdated((p) => {
      clearProgress(p.id)
      if (p.error) useStore.getState().toast(`Mise à jour de ${p.name} impossible : ${p.error}`, 'error')
      else useStore.getState().toast(`${p.name} mis à jour${p.version ? ` (v${p.version})` : ''}`, 'success')
      void loadApps()
    })
    return () => {
      offProgress()
      offUpdate()
      offAuto()
    }
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (a: AppState): boolean =>
    !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)

  const sections = useMemo(() => {
    const list = apps.filter(matches)
    const installed = list.filter((a) => a.status !== 'not_installed').sort(byName)
    const available = list.filter((a) => a.status === 'not_installed').sort(byName)
    switch (view.kind) {
      case 'installed':
        return [{ title: 'Installées', items: installed }]
      case 'updates':
        return []
      case 'category':
        return [{ title: view.name, items: list.filter((a) => a.category === view.name).sort(byName) }]
      default:
        return [
          { title: 'Installées', items: installed },
          { title: 'À découvrir', items: available }
        ].filter((s) => s.items.length)
    }
  }, [apps, view, q])

  const head =
    view.kind === 'installed'
      ? { title: 'Installées', sub: 'Les apps prêtes à être ouvertes sur cet ordinateur.' }
      : view.kind === 'updates'
        ? { title: 'Mises à jour', sub: 'Les nouvelles versions de tes apps.' }
        : view.kind === 'category'
          ? { title: view.name, sub: `Les apps de la catégorie ${view.name}.` }
          : { title: 'Bibliothèque', sub: 'Installe, ouvre et mets à jour les apps de la suite.' }

  let cardIndex = 0
  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          apps={apps}
          view={view}
          onView={setView}
          onHelp={() => setShowOnboarding(true)}
          selfUpdating={selfUpdate?.version ?? null}
        />
        <main className="main">
          <div className="main-inner">
            <div className="page-head">
              <div>
                <h1 className="page-title">{head.title}</h1>
                <div className="page-sub">{head.sub}</div>
              </div>
              {view.kind !== 'updates' && (
                <label className="search">
                  <Search size={14} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une app" />
                </label>
              )}
            </div>

            {selfUpdate && (
              <div className="notice">
                <Loader2 size={15} className="spin-icon" style={{ animation: 'spin 0.9s linear infinite' }} />
                Open Studio v{selfUpdate.version} est prêt : redémarrage automatique dans quelques secondes…
              </div>
            )}

            {(view.kind === 'all' || view.kind === 'updates') && !loading && (
              <UpdateBanner
                apps={apps}
                dismissed={view.kind === 'updates' ? new Set() : dismissedUpdates}
                onDismiss={(id) => setDismissedUpdates((prev) => new Set(prev).add(id))}
                showEmpty={view.kind === 'updates'}
              />
            )}

            {loading ? (
              <div className="grid">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton" />
                ))}
              </div>
            ) : view.kind === 'updates' ? null : sections.every((s) => !s.items.length) ? (
              <div className="empty">
                <div className="empty-title">{q ? `Aucune app ne correspond à « ${query} »` : 'Rien ici pour l’instant'}</div>
                {q ? 'Essaie un autre mot-clé.' : view.kind === 'installed' ? 'Installe une app depuis la bibliothèque.' : ''}
              </div>
            ) : (
              sections.map((s) => (
                <section key={s.title}>
                  {sections.length > 1 && (
                    <h2 className="section-title">
                      {s.title} <span>{s.items.length}</span>
                    </h2>
                  )}
                  <div className="grid">
                    {s.items.map((a) => (
                      <AppCard key={a.id} app={a} progress={progress[a.id]} onDone={() => clearProgress(a.id)} index={cardIndex++} />
                    ))}
                  </div>
                </section>
              ))
            )}
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
