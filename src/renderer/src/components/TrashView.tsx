import { useEffect, useState } from 'react'
import { ArrowLeft, Trash2, RotateCcw, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useStore } from '../store'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

const RETENTION_DAYS = 30

function daysLeft(deletedAt?: number): number {
  if (!deletedAt) return RETENTION_DAYS
  const elapsed = (Date.now() - deletedAt) / (24 * 60 * 60 * 1000)
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed))
}

export default function TrashView() {
  const {
    setView, trashedSubjects, trashedCourses, loadTrash,
    restoreSubjectFromTrash, restoreCourseFromTrash,
    purgeSubjectForever, purgeCourseForever, emptyTrash, showToast
  } = useStore()
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState<{ kind: 'subject' | 'course'; id: string; label: string } | null>(null)

  useEscapeToClose(confirmEmpty ? () => setConfirmEmpty(false) : confirmPurge ? () => setConfirmPurge(null) : undefined)

  useEffect(() => { loadTrash() }, [])

  const isEmpty = trashedSubjects.length === 0 && trashedCourses.length === 0

  async function handlePurgeConfirmed() {
    if (!confirmPurge) return
    if (confirmPurge.kind === 'subject') await purgeSubjectForever(confirmPurge.id)
    else await purgeCourseForever(confirmPurge.id)
    setConfirmPurge(null)
    showToast('Supprimé définitivement', 'success')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <Trash2 size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Corbeille</h1>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary btn-sm" disabled={isEmpty} onClick={() => setConfirmEmpty(true)}>
            Vider la corbeille
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginBottom: 20 }}>
          Les matières et cours supprimés restent ici {RETENTION_DAYS} jours avant d'être effacés pour de bon.
        </p>

        {isEmpty ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <div className="empty-state-icon">🗑️</div>
            <div className="empty-state-title">La corbeille est vide</div>
          </div>
        ) : (
          <>
            {trashedSubjects.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Matières
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trashedSubjects.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                      <span style={{ fontSize: 18 }}>{s.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {s.courseCount} cours · supprimée {s.deletedAt ? formatDistanceToNow(s.deletedAt, { addSuffix: true, locale: fr }) : ''} · {daysLeft(s.deletedAt)} j restants
                        </div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={async () => { await restoreSubjectFromTrash(s.id); showToast('Matière restaurée', 'success') }}>
                        <RotateCcw size={13} /> Restaurer
                      </button>
                      <button
                        className="icon-btn"
                        style={{ color: 'var(--danger, #ef4444)' }}
                        data-tooltip="Supprimer définitivement"
                        onClick={() => setConfirmPurge({ kind: 'subject', id: s.id, label: s.name })}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {trashedCourses.length > 0 && (
              <section>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Cours
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trashedCourses.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                      <span style={{ fontSize: 18 }}>{c.emoji ?? '📝'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          supprimé {c.deletedAt ? formatDistanceToNow(c.deletedAt, { addSuffix: true, locale: fr }) : ''} · {daysLeft(c.deletedAt)} j restants
                        </div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={async () => { await restoreCourseFromTrash(c.id); showToast('Cours restauré', 'success') }}>
                        <RotateCcw size={13} /> Restaurer
                      </button>
                      <button
                        className="icon-btn"
                        style={{ color: 'var(--danger, #ef4444)' }}
                        data-tooltip="Supprimer définitivement"
                        onClick={() => setConfirmPurge({ kind: 'course', id: c.id, label: c.title })}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {confirmEmpty && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmEmpty(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 320, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Vider la corbeille ?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Tout son contenu sera définitivement supprimé. Cette action est irréversible.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmEmpty(false)}>Annuler</button>
              <button className="btn" style={{ background: 'var(--danger, #ef4444)', color: '#fff' }} onClick={async () => {
                await emptyTrash()
                setConfirmEmpty(false)
                showToast('Corbeille vidée', 'success')
              }}>Vider</button>
            </div>
          </div>
        </div>
      )}

      {confirmPurge && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmPurge(null)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 320, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Supprimer « {confirmPurge.label} » définitivement ?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Cette action est irréversible, contrairement à la suppression normale.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmPurge(null)}>Annuler</button>
              <button className="btn" style={{ background: 'var(--danger, #ef4444)', color: '#fff' }} onClick={handlePurgeConfirmed}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
