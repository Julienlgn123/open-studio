import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useStore, type PairedDevice } from '../store'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface PlanItem {
  id: string
  title: string
  emoji: string
  subjectName: string
  direction: 'push' | 'pull'
  reason: string
  conflict: boolean
}

const clean = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Compare les cours avec un PC associé et échange ce qui a changé, dans le bon sens. */
export default function PeerSyncModal({ peer, onClose }: { peer: PairedDevice; onClose: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{ pushed: number; pulled: number } | null>(null)

  useEscapeToClose(() => !running && onClose())

  async function load() {
    setItems(null)
    setError(null)
    setResult(null)
    try {
      const list: PlanItem[] = await api.peers.plan(peer.id)
      setItems(list)
      setSelected(new Set(list.map((i) => i.id)))
    } catch (err) {
      setError(clean(err))
    }
  }

  useEffect(() => {
    void load()
    return api.peers.on('peersync:progress', (p: { peerId: string; done: number; total: number }) => {
      if (p.peerId === peer.id) setProgress({ done: p.done, total: p.total })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id])

  async function run() {
    if (!items) return
    const chosen = items.filter((i) => selected.has(i.id))
    setRunning(true)
    setError(null)
    setProgress({ done: 0, total: chosen.length })
    try {
      const r = await api.peers.run(peer.id, chosen)
      setResult(r)
      showToast(`Synchronisé avec ${peer.name}`, 'success')
    } catch (err) {
      setError(clean(err))
    } finally {
      setRunning(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const give = items?.filter((i) => i.direction === 'push') ?? []
  const take = items?.filter((i) => i.direction === 'pull') ?? []

  const Section = ({ list, title, icon }: { list: PlanItem[]; title: string; icon: JSX.Element }) =>
    list.length ? (
      <div style={{ marginBottom: 14 }}>
        <div className="peer-section">
          {icon}
          {title}
          <span>{list.length}</span>
        </div>
        {list.map((i) => (
          <label key={i.id} className={`peer-row${i.conflict ? ' conflict' : ''}`}>
            <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} disabled={running} />
            <span className="peer-row-emoji">{i.emoji}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="peer-row-title">{i.title}</span>
              <span className="peer-row-reason">
                {i.subjectName && <>{i.subjectName} · </>}
                {i.conflict && <TriangleAlert size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}
                {i.reason}
              </span>
            </span>
          </label>
        ))}
      </div>
    ) : null

  return (
    <div className="modal-overlay" onClick={() => !running && onClose()}>
      <div className="modal fade-in" style={{ maxWidth: 520, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Synchro avec {peer.name}</span>
          <button className="icon-btn" onClick={onClose} disabled={running}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
              <div style={{ fontWeight: 600, marginTop: 10 }}>Les deux PC sont à jour</div>
              <p className="peer-muted">
                {result.pushed} cours envoyé{result.pushed > 1 ? 's' : ''} à {peer.name}, {result.pulled} récupéré
                {result.pulled > 1 ? 's' : ''}. Les versions remplacées restent dans l’historique de chaque cours.
              </p>
            </div>
          ) : error ? (
            <div className="sync-warning" style={{ color: 'var(--danger)', background: 'var(--danger-dim)' }}>
              <TriangleAlert size={15} />
              {error}
            </div>
          ) : !items ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 18, color: 'var(--text-tertiary)' }}>
              <div className="spinner" style={{ width: 14, height: 14 }} />
              Comparaison des cours avec {peer.name}…
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircle2 size={34} style={{ color: 'var(--success)' }} />
              <div style={{ fontWeight: 600, marginTop: 10 }}>Déjà synchronisés</div>
              <p className="peer-muted">Ce PC et {peer.name} ont exactement les mêmes cours.</p>
            </div>
          ) : (
            <>
              <p className="peer-muted" style={{ marginBottom: 14 }}>
                Pour chaque cours, celui qui l’a modifié depuis la dernière synchro donne sa version. Modifié des deux côtés : la
                plus récente gagne, l’autre reste dans l’historique du cours.
              </p>
              <Section list={give} title={`Ce PC donne à ${peer.name}`} icon={<ArrowRight size={14} />} />
              <Section list={take} title={`${peer.name} donne à ce PC`} icon={<ArrowLeft size={14} />} />
              {running && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {progress.done} / {progress.total} cours
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                        background: 'var(--accent)',
                        transition: 'width 200ms'
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {!result && items && items.length > 0 ? (
            <>
              <button className="btn btn-ghost" onClick={load} disabled={running}>
                <RefreshCw size={13} /> Recomparer
              </button>
              <button className="btn btn-primary" onClick={run} disabled={running || selected.size === 0}>
                {running ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={14} />}
                Synchroniser {selected.size} cours
              </button>
            </>
          ) : (
            <>
              {error && (
                <button className="btn btn-ghost" onClick={load}>
                  <RefreshCw size={13} /> Réessayer
                </button>
              )}
              <button className="btn btn-primary" onClick={onClose}>
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
