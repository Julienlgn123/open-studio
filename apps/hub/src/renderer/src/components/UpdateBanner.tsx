import { useState } from 'react'
import { ArrowUpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useStore } from '../store'
import { AppIcon } from './AppCard'
import type { AppState } from '@shared/types'

/**
 * Mises à jour disponibles. Open Studio les installe aussi tout seul quand l'app est fermée ;
 * ce panneau permet de le faire tout de suite. « Plus tard » masque juste la ligne jusqu'au
 * prochain lancement.
 */
export default function UpdateBanner({
  apps,
  dismissed,
  onDismiss,
  showEmpty
}: {
  apps: AppState[]
  dismissed: Set<string>
  onDismiss: (id: string) => void
  showEmpty?: boolean
}): JSX.Element | null {
  const { update } = useStore()
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const pending = apps.filter((a) => a.status === 'update_available' && !dismissed.has(a.id))
  if (pending.length === 0) {
    return showEmpty ? (
      <div className="empty">
        <div className="empty-title">Tout est à jour</div>
        Open Studio vérifie les nouvelles versions toutes les 30 minutes.
      </div>
    ) : null
  }

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  async function onUpdate(id: string): Promise<void> {
    setUpdating((prev) => new Set(prev).add(id))
    try {
      await update(id)
    } finally {
      setUpdating((prev) => toggle(prev, id))
    }
  }

  async function onUpdateAll(): Promise<void> {
    for (const a of pending) await onUpdate(a.id)
  }

  return (
    <div className="updates">
      <div className="updates-head">
        <div className="updates-icon">
          <ArrowUpCircle size={18} />
        </div>
        <div>
          <div className="updates-title">
            {pending.length === 1 ? '1 mise à jour disponible' : `${pending.length} mises à jour disponibles`}
          </div>
          <div className="updates-sub">Installées automatiquement dès que l’app est fermée, ou maintenant :</div>
        </div>
        {pending.length > 1 && (
          <button className="btn btn-sm btn-primary" onClick={onUpdateAll} disabled={updating.size > 0}>
            Tout mettre à jour
          </button>
        )}
      </div>
      {pending.map((a) => {
        const busy = updating.has(a.id)
        const open = expanded.has(a.id)
        return (
          <div key={a.id} className="update-row">
            <AppIcon app={a} />
            <div className="update-row-main">
              <div className="update-row-name">{a.name}</div>
              <div className="update-row-version">
                v{a.installedVersion ?? '?'} → v{a.latestVersion ?? '?'}
              </div>
              {a.latestChangelog && (
                <>
                  <button className="link-btn" onClick={() => setExpanded((prev) => toggle(prev, a.id))}>
                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Nouveautés
                  </button>
                  {open && <div className="changelog">{a.latestChangelog}</div>}
                </>
              )}
            </div>
            <div className="update-row-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => onDismiss(a.id)} disabled={busy}>
                Plus tard
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => onUpdate(a.id)} disabled={busy}>
                {busy && <span className="spinner" />}
                Mettre à jour
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
