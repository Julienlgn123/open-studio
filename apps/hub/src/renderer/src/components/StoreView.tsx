import { useState } from 'react'
import { History, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { useStore } from '../store'
import ModuleIcon from './ModuleIcon'
import ModuleActions from './ModuleActions'
import { formatBytes } from '../lib/format'

/** Tous les modules : installer, mettre à jour, retirer. */
export default function StoreView(): JSX.Element {
  const { modules, catalog, loadModules } = useStore()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const query = q.trim().toLowerCase()
  const categories = [...new Set(modules.map((m) => m.category))].sort((a, b) => a.localeCompare(b, 'fr'))
  const list = modules
    .filter((m) => !cat || m.category === cat)
    .filter((m) => !query || [m.name, m.tagline, m.description, m.category].some((s) => s.toLowerCase().includes(query)))
    .sort((a, b) => Number(b.status !== 'available') - Number(a.status !== 'available') || a.name.localeCompare(b.name, 'fr'))

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">Modules</h1>
            <div className="page-sub">Ajoute seulement ce dont tu as besoin. Retirer un module ne supprime jamais tes données.</div>
          </div>
          <div className="page-tools">
            <label className="search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" />
            </label>
            <button
              className="btn btn-ghost btn-icon"
              title="Rechercher des mises à jour"
              disabled={refreshing}
              onClick={() => {
                setRefreshing(true)
                void loadModules(true).finally(() => setRefreshing(false))
              }}
            >
              <RefreshCw size={15} className={refreshing ? 'spin-icon' : undefined} />
            </button>
          </div>
        </div>

        {catalog && !catalog.ok && (
          <div className="callout warn">
            <TriangleAlert size={16} />
            <div>
              <strong>Catalogue indisponible.</strong> <span>{catalog.error}</span>
            </div>
          </div>
        )}

        {categories.length > 1 && (
          <div className="cats">
            <button className={`cat${cat === null ? ' on' : ''}`} onClick={() => setCat(null)}>
              Tous <span className="faint">{modules.length}</span>
            </button>
            {categories.map((c) => (
              <button key={c} className={`cat${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
                {c} <span className="faint">{modules.filter((m) => m.category === c).length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="rows">
          {list.map((m) => (
            <div key={m.id} className="row" style={{ ['--accent-m' as string]: m.accent }}>
              <ModuleIcon module={m} size={56} />
              <div className="row-main">
                <div className="row-title">
                  {m.name}
                  {m.status === 'update' && <span className="chip accent">v{m.latestVersion} disponible</span>}
                  {m.error && <span className="chip danger" title={m.error}>Ne démarre pas</span>}
                </div>
                <div className="row-tagline">{m.tagline}</div>
                <p className="row-desc">{m.description}</p>
                <div className="row-meta">
                  <span>{m.category}</span>
                  <span>v{m.installedVersion ?? m.latestVersion}</span>
                  {m.size != null && <span>{formatBytes(m.size)}</span>}
                  {m.legacy?.hasData && (
                    <span className="meta-ok">
                      <History size={12} />
                      {m.status === 'available' ? 'Données de l’ancienne app trouvées' : 'Données de l’ancienne app reprises'}
                    </span>
                  )}
                </div>
                {m.error && <div className="row-error">{m.error}</div>}
              </div>
              <div className="row-actions">
                <ModuleActions module={m} />
              </div>
            </div>
          ))}
          {list.length === 0 && modules.length > 0 && <div className="empty">Aucun module ne correspond à « {q} ».</div>}
        </div>

        {catalog?.ok && catalog.source !== 'GitHub' && <div className="source-note">Modules de test : {catalog.source}</div>}
      </div>
    </div>
  )
}
