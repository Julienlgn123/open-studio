import { useEffect, useState } from 'react'
import { ArrowUpCircle, CircleCheck, HelpCircle, LayoutGrid } from 'lucide-react'
import Brandmark from './Brandmark'
import { getCategoryColor } from '../lib/categories'
import type { AppState } from '@shared/types'

export type View = { kind: 'all' } | { kind: 'installed' } | { kind: 'updates' } | { kind: 'category'; name: string }

export default function Sidebar({
  apps,
  view,
  onView,
  onHelp,
  selfUpdating
}: {
  apps: AppState[]
  view: View
  onView: (v: View) => void
  onHelp: () => void
  selfUpdating: string | null
}): JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.api.app.getVersion().then(setVersion).catch(() => {})
  }, [])

  const installed = apps.filter((a) => a.status !== 'not_installed').length
  const updates = apps.filter((a) => a.status === 'update_available').length
  const categories = Array.from(new Set(apps.map((a) => a.category))).sort()
  const is = (v: View): boolean =>
    v.kind === view.kind && (v.kind !== 'category' || (view.kind === 'category' && view.name === v.name))

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Brandmark size={28} />
        <div>
          <div className="sidebar-brand-name">Open Studio</div>
          <div className="sidebar-brand-sub">La suite d’apps</div>
        </div>
      </div>

      <button className={`nav-item${is({ kind: 'all' }) ? ' active' : ''}`} onClick={() => onView({ kind: 'all' })}>
        <LayoutGrid size={15} />
        Bibliothèque
        <span className="nav-count">{apps.length}</span>
      </button>
      <button
        className={`nav-item${is({ kind: 'installed' }) ? ' active' : ''}`}
        onClick={() => onView({ kind: 'installed' })}
      >
        <CircleCheck size={15} />
        Installées
        <span className="nav-count">{installed}</span>
      </button>
      <button className={`nav-item${is({ kind: 'updates' }) ? ' active' : ''}`} onClick={() => onView({ kind: 'updates' })}>
        <ArrowUpCircle size={15} />
        Mises à jour
        {updates > 0 && <span className="nav-count badge">{updates}</span>}
      </button>

      {categories.length > 1 && (
        <>
          <div className="sidebar-section">Catégories</div>
          {categories.map((name) => (
            <button
              key={name}
              className={`nav-item${is({ kind: 'category', name }) ? ' active' : ''}`}
              onClick={() => onView({ kind: 'category', name })}
            >
              <span className="nav-dot" style={{ background: getCategoryColor(name) }} />
              {name}
              <span className="nav-count">{apps.filter((a) => a.category === name).length}</span>
            </button>
          ))}
        </>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-version" title={selfUpdating ? `Mise à jour vers v${selfUpdating} en cours` : 'Open Studio est à jour'}>
          <span className={`dot${selfUpdating ? ' busy' : ''}`} />
          {selfUpdating ? `Mise à jour v${selfUpdating}…` : `v${version}`}
        </div>
        <button className="icon-btn" onClick={onHelp} title="Comment ça marche">
          <HelpCircle size={15} />
        </button>
      </div>
    </aside>
  )
}
