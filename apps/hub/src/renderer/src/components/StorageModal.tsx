import { useEffect, useState } from 'react'
import { HardDrive, Sparkles, X } from 'lucide-react'
import { useStore } from '../store'
import { formatBytes } from '../lib/format'
import type { AppStorage } from '@shared/types'

const PARTS: { key: keyof AppStorage; label: string; color: string }[] = [
  { key: 'appBytes', label: 'Application', color: 'var(--accent)' },
  { key: 'dataBytes', label: 'Données', color: 'var(--success)' },
  { key: 'backupBytes', label: 'Sauvegardes', color: 'var(--warning)' },
  { key: 'cacheBytes', label: 'Cache', color: 'var(--text-3)' }
]

/** Place prise par chaque app, et ménage de ce qui peut partir sans risque. */
export default function StorageModal({ onClose }: { onClose: () => void }): JSX.Element {
  const toast = useStore((s) => s.toast)
  const [list, setList] = useState<AppStorage[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = (): void => {
    window.api.storage.list().then(setList).catch(() => setList([]))
  }
  useEffect(load, [])

  async function clean(a: AppStorage): Promise<void> {
    setBusy(a.id)
    try {
      const freed = await window.api.storage.clean(a.id)
      toast(`${formatBytes(freed)} libérés pour ${a.name}`, 'success')
      load()
    } catch (err) {
      toast((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error')
    } finally {
      setBusy(null)
    }
  }

  const total = list?.reduce((n, a) => n + a.appBytes + a.dataBytes + a.backupBytes + a.cacheBytes, 0) ?? 0
  const reclaimable = list?.reduce((n, a) => n + a.reclaimableBytes, 0) ?? 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal storage-modal" onClick={(e) => e.stopPropagation()}>
        <div className="storage-head">
          <HardDrive size={18} />
          <div style={{ flex: 1 }}>
            <div className="modal-title" style={{ marginTop: 0 }}>Espace disque</div>
            <div className="updates-sub">
              {list ? `${formatBytes(total)} au total · ${formatBytes(reclaimable)} récupérables` : 'Calcul…'}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="storage-body">
          {!list ? (
            <div className="empty">
              <span className="spinner" />
            </div>
          ) : (
            list.map((a) => {
              const sum = a.appBytes + a.dataBytes + a.backupBytes + a.cacheBytes || 1
              return (
                <div key={a.id} className="storage-row">
                  <div className="storage-row-top">
                    <strong>{a.name}</strong>
                    <span>{formatBytes(sum)}</span>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => void clean(a)}
                      disabled={!!busy || a.reclaimableBytes < 1024 * 1024}
                      title="Supprime les caches, anciens installateurs et vieilles sauvegardes (les 3 plus récentes sont gardées)"
                    >
                      {busy === a.id ? <span className="spinner" /> : <Sparkles size={13} />}
                      {a.reclaimableBytes >= 1024 * 1024 ? `Libérer ${formatBytes(a.reclaimableBytes)}` : 'Rien à nettoyer'}
                    </button>
                  </div>
                  <div className="storage-bar">
                    {PARTS.map((p) => (
                      <span key={p.key} style={{ width: `${((a[p.key] as number) / sum) * 100}%`, background: p.color }} />
                    ))}
                  </div>
                  <div className="storage-legend">
                    {PARTS.map((p) => (
                      <span key={p.key}>
                        <i style={{ background: p.color }} />
                        {p.label} {formatBytes(a[p.key] as number)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
        <p className="storage-note">Le nettoyage ne touche jamais tes données : cours, conversations et fichiers restent intacts.</p>
      </div>
    </div>
  )
}
