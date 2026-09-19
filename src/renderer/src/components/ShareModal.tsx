import { useEffect, useState } from 'react'
import { Copy, Link2, Trash2, Loader2, Clock } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../store'
import type { FileMeta, SharedLink, ShareRole } from '@shared/types'

const ROLES: { value: ShareRole; label: string }[] = [
  { value: 'reader', label: 'Lecture seule' },
  { value: 'commenter', label: 'Commentaire' },
  { value: 'writer', label: 'Édition' }
]

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'expiré'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ShareModal({
  files,
  onClose
}: {
  files: FileMeta[]
  onClose: () => void
}): JSX.Element {
  const { toast, loadFiles } = useStore()
  const [role, setRole] = useState<ShareRole>('reader')
  const [links, setLinks] = useState<Record<string, SharedLink | null>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    Promise.all(files.map((f) => window.api.share.forFile(f.id))).then((res) => {
      const map: Record<string, SharedLink | null> = {}
      files.forEach((f, i) => (map[f.id] = res[i]))
      setLinks(map)
    })
  }, [files])

  // Rafraîchit le compte à rebours affiché toutes les secondes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  async function create(fileId: string): Promise<void> {
    setBusy((b) => ({ ...b, [fileId]: true }))
    try {
      await window.api.share.create(fileId, role)
      const link = await window.api.share.forFile(fileId)
      setLinks((m) => ({ ...m, [fileId]: link }))
      await loadFiles()
      toast('Lien temporaire créé (1h) et copié dans le presse-papiers', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur de partage', 'error')
    } finally {
      setBusy((b) => ({ ...b, [fileId]: false }))
    }
  }

  async function createAll(): Promise<void> {
    for (const f of files) {
      if (!links[f.id] || links[f.id]!.expiresAt <= now) await create(f.id)
    }
  }

  async function revoke(fileId: string): Promise<void> {
    setBusy((b) => ({ ...b, [fileId]: true }))
    try {
      await window.api.share.revoke(fileId)
      setLinks((m) => ({ ...m, [fileId]: null }))
      toast('Partage révoqué', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy((b) => ({ ...b, [fileId]: false }))
    }
  }

  const title =
    files.length === 1 ? `Partager « ${files[0].originalFilename} »` : `Partager ${files.length} fichiers`

  return (
    <Modal title={title} onClose={onClose}>
      <div className="field">
        <label className="field-label">Niveau d'accès</label>
        <select
          className="field-input"
          value={role}
          onChange={(e) => setRole(e.target.value as ShareRole)}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Chaque lien « toute personne disposant du lien » est valable <strong>1 heure</strong>, puis
        il s'autodétruit automatiquement (le partage est révoqué sur le Drive).
      </p>

      <div className="col" style={{ gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {files.map((f) => {
          const link = links[f.id]
          const active = link && link.expiresAt > now
          return (
            <div key={f.id} className="card col" style={{ gap: 6, padding: 10 }}>
              <span
                style={{
                  fontSize: 12.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {f.originalFilename}
              </span>
              {active ? (
                <>
                  <div className="search-bar">
                    <Link2 size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <input readOnly value={link!.url} />
                    <button
                      className="icon-btn"
                      onClick={() => {
                        window.api.clipboard.write(link!.url)
                        toast('Lien copié', 'success')
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="muted" style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <Clock size={11} /> Expire dans {formatCountdown(link!.expiresAt - now)}
                    </span>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => revoke(f.id)}
                      disabled={busy[f.id]}
                    >
                      <Trash2 size={13} /> Révoquer
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => create(f.id)} disabled={busy[f.id]}>
                  {busy[f.id] ? (
                    <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} />
                  ) : (
                    <Link2 size={13} />
                  )}
                  Générer un lien (1h)
                </button>
              )}
            </div>
          )
        })}
      </div>

      {files.length > 1 && (
        <button className="btn btn-secondary" onClick={createAll}>
          <Link2 size={14} /> Générer tous les liens manquants
        </button>
      )}
    </Modal>
  )
}
