import { useState } from 'react'
import { ArrowUpCircle } from 'lucide-react'
import { useStore } from '../store'
import type { AppState } from '@shared/types'

/**
 * Propose activement les mises à jour dispo au lieu d'attendre que la personne
 * remarque la petite pastille "Mise à jour dispo" sur une carte. Refuser
 * ("Plus tard") masque juste la proposition pour cette app jusqu'au prochain
 * lancement d'Open Studio — ça ne modifie rien de son côté.
 */
export default function UpdateBanner({
  apps,
  dismissed,
  onDismiss
}: {
  apps: AppState[]
  dismissed: Set<string>
  onDismiss: (id: string) => void
}): JSX.Element | null {
  const { update } = useStore()
  const [updating, setUpdating] = useState<Set<string>>(new Set())

  const pending = apps.filter((a) => a.status === 'update_available' && !dismissed.has(a.id))
  if (pending.length === 0) return null

  async function onUpdate(id: string): Promise<void> {
    setUpdating((prev) => new Set(prev).add(id))
    try {
      await update(id)
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div className="update-banner-stack">
      {pending.map((a) => {
        const busy = updating.has(a.id)
        return (
          <div key={a.id} className="update-banner fade-in">
            <ArrowUpCircle size={18} className="update-banner-icon" />
            <div className="update-banner-text">
              <div className="update-banner-title">Mise à jour disponible — {a.name}</div>
              <div className="update-banner-sub muted">
                {a.installedVersion ?? '?'} → {a.latestVersion ?? '?'}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => onDismiss(a.id)}
                disabled={busy}
              >
                Plus tard
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => onUpdate(a.id)}
                disabled={busy}
              >
                {busy ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : null}
                Mettre à jour
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
