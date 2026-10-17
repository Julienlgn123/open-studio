import { ArrowRight, History, Sparkles } from 'lucide-react'
import { isInstalled, useStore } from '../store'
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
  const { modules, loaded, go, catalog } = useStore()
  const installed = modules.filter(isInstalled)
  const others = modules.filter((m) => !isInstalled(m))
  const withOldData = others.filter((m) => m.legacy?.hasData)

  return (
    <div className="page">
      <div className="page-inner">
        <header className="hero">
          <h1>{greeting()} 👋</h1>
          <p>{installed.length ? 'Tout ton espace de travail, au même endroit.' : 'Open Studio rassemble tes outils en un seul endroit. Choisis tes modules pour commencer.'}</p>
        </header>

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
            <div className="tiles">
              {installed.map((m, i) => (
                <button key={m.id} className="tile" style={{ ['--accent-m' as string]: m.accent }} onClick={() => go({ kind: 'module', id: m.id })}>
                  <div className="tile-glow" />
                  <ModuleIcon module={m} size={52} />
                  <div className="tile-text">
                    <div className="tile-name">{m.name}</div>
                    <div className="tile-tagline">{m.tagline}</div>
                  </div>
                  <div className="tile-foot">
                    {i < 9 && <kbd>{`${MOD}${i + 1}`}</kbd>}
                    {m.status === 'update' && <span className="chip accent">Mise à jour dispo</span>}
                    {m.error && <span className="chip danger">Erreur</span>}
                    <ArrowRight size={15} className="tile-arrow" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
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
