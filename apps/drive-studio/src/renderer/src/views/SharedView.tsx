import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Trash2, Link2, Clock } from 'lucide-react'
import { useStore } from '../store'
import type { FileMeta, SharedLink } from '@shared/types'

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'expiré'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SharedView(): JSX.Element {
  const { files, loadFiles, toast } = useStore()
  const [links, setLinks] = useState<SharedLink[]>([])
  const [now, setNow] = useState(Date.now())

  function refresh(): void {
    window.api.share.list().then(setLinks)
  }
  useEffect(() => {
    refresh()
    loadFiles()
  }, [])

  // Rafraîchit le compte à rebours et relance la liste régulièrement (les
  // liens expirés sont autodétruits en arrière-plan, cette page s'aligne dessus).
  useEffect(() => {
    const t1 = setInterval(() => setNow(Date.now()), 1000)
    const t2 = setInterval(refresh, 15_000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [])

  const fileOf = (id: string): FileMeta | undefined => files.find((f) => f.id === id)
  const active = links.filter((l) => l.expiresAt > now)

  async function revoke(fileId: string): Promise<void> {
    await window.api.share.revoke(fileId)
    refresh()
    toast('Partage révoqué', 'success')
  }

  return (
    <div className="view-scroll">
      <div className="page-header">
        <span className="page-header-title">Liens temporaires</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {active.length} lien{active.length !== 1 ? 's' : ''} actif{active.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="view-pad">
        {active.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔗</div>
            <div className="empty-state-title">Aucun lien de partage actif</div>
            <div className="empty-state-desc">
              Depuis Fichiers, clic droit sur un fichier → Partager pour générer un lien valable 1h.
              Il s'autodétruit ensuite automatiquement.
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            {active.map((l) => {
              const f = fileOf(l.fileId)
              return (
                <div key={l.id} className="card row" style={{ gap: 12, alignItems: 'center' }}>
                  <Link2 size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
                  <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                      {f?.originalFilename ?? l.fileId}
                    </span>
                    <span className="muted mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.url}
                    </span>
                    <span className="muted" style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
                      {l.role} · <Clock size={11} /> expire dans {formatCountdown(l.expiresAt - now)}
                    </span>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      window.api.clipboard.write(l.url)
                      toast('Lien copié', 'success')
                    }}
                    data-tooltip="Copier"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => window.api.shell.openExternal(l.url)}
                    data-tooltip="Ouvrir"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button className="icon-btn danger" onClick={() => revoke(l.fileId)} data-tooltip="Révoquer">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
