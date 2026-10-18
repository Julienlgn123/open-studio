import { useState } from 'react'
import { ArrowRight, History, Sparkles } from 'lucide-react'
import { isInstalled, sortModules, useStore } from '../store'
import ModuleIcon from './ModuleIcon'
import ModuleActions from './ModuleActions'
import LegacyNotice from './LegacyNotice'

const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'
}

/** Accueil : tes modules en grand, ceux à découvrir en dessous. */
export default function HomeView(): JSX.Element {
  const { modules, loaded, go, catalog, settings, setLayout } = useStore()
  const { layout } = settings
  const installed = sortModules(modules.filter(isInstalled), layout.order)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const drop = (): void => {
    if (drag && over && drag !== over) {
      const ids = installed.map((m) => m.id)
      ids.splice(ids.indexOf(drag), 1)
      ids.splice(ids.indexOf(over), 0, drag)
      void setLayout({ order: ids })
    }
    setDrag(null)
    setOver(null)
  }
  const others = modules.filter((m) => !isInstalled(m))
  const withOldData = others.filter((m) => m.legacy?.hasData)

  return (
    <div className="page">
      <div className="page-inner">
        {layout.showHero && (
        <header className="hero">
          <h1>{greeting()} 👋</h1>
          <p>{installed.length ? 'Tout ton espace de travail, au même endroit.' : 'Open Studio rassemble tes outils en un seul endroit. Choisis tes modules pour commencer.'}</p>
        </header>
        )}

        <LegacyNotice />

        {withOldData.length > 0 && (
          <div className="callout">
            <History size={16} />
            <div>
              <strong>On a retrouvé tes données de {withOldData.map((m) => m.name).join(', ').replace(/, ([^,]*)$/, ' et $1')}.</strong>
              <span> Installe {withOldData.length > 1 ? 'les modules' : 'le module'} : tout sera là, sans rien importer à la main.</span>
            </div>
          </div>
        )}

        {installed.length > 0 && (
          <section>
            <h2 className="section-title">Tes modules</h2>
            <div className={`tiles${layout.homeView === 'list' ? ' list' : ''}`}>
              {installed.map((m) => (
                <button
                  key={m.id}
                  className={`tile${drag === m.id ? ' dragging' : ''}${over === m.id && drag !== m.id ? ' drop-target' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDrag(m.id)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(m.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    drop()
                  }}
                  onDragEnd={() => {
                    setDrag(null)
                    setOver(null)
                  }}
                  style={{ ['--accent-m' as string]: m.accent }} onClick={() => go({ kind: 'module', id: m.id })}>
                  <div className="tile-glow" />
                  <ModuleIcon module={m} size={52} />
                  <div className="tile-text">
                    <div className="tile-name">{m.name}</div>
                    <div className="tile-tagline">{m.tagline}</div>
                  </div>
                  <div className="tile-foot">
                    {(() => { const k = installed.filter((x) => !layout.hidden.includes(x.id)).indexOf(m); return k >= 0 && k < 9 ? <kbd>{`${MOD}${k + 1}`}</kbd> : null })()}
                    {m.status === 'update' && <span className="chip accent">Mise à jour dispo</span>}
                    {m.error && <span className="chip danger">Erreur</span>}
                    <ArrowRight size={15} className="tile-arrow" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {layout.showDiscover && others.length > 0 && (
          <section>
            <h2 className="section-title">{installed.length ? 'À découvrir' : 'Modules disponibles'}</h2>
            <div className="cards">
              {others.map((m) => (
                <div key={m.id} className="card" style={{ ['--accent-m' as string]: m.accent }}>
                  <div className="card-head">
                    <ModuleIcon module={m} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div className="card-title">{m.name}</div>
                      <div className="card-meta">{m.category}</div>
                    </div>
                  </div>
                  <p className="card-desc">{m.tagline}</p>
                  {m.legacy?.hasData && (
                    <div className="chip success">
                      <History size={12} /> Tes données seront reprises
                    </div>
                  )}
                  <div className="card-foot">
                    <ModuleActions module={m} compact />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {loaded && modules.length === 0 && (
          <div className="empty">
            <Sparkles size={22} />
            <div className="empty-title">Aucun module trouvé</div>
            {catalog?.error ?? 'Vérifie ta connexion, puis réessaie.'}
          </div>
        )}
      </div>
    </div>
  )
}
