import { useEffect, useState } from 'react'
import { AlertTriangle, FolderOpen, FolderSync, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { formatBytes, formatRelative } from '../lib/format'
import type { SyncFolder, SyncProgress } from '@shared/types'

const INTERVALS = [
  { v: 5, l: 'toutes les 5 min' },
  { v: 15, l: 'toutes les 15 min' },
  { v: 60, l: 'toutes les heures' },
  { v: 360, l: 'toutes les 6 h' },
  { v: 1440, l: 'une fois par jour' }
]

/** Dossiers du PC envoyés automatiquement sur les Drive (sens PC → Drive, jamais de suppression). */
export default function SyncView(): JSX.Element {
  const { toast, loadFiles, loadFolders, loadDashboard } = useStore()
  const [list, setList] = useState<SyncFolder[]>([])
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [recent, setRecent] = useState<{ relPath: string; size: number; syncedAt: number }[]>([])
  const refresh = (): void => void window.api.sync.list().then(setList)

  useEffect(() => {
    refresh()
    const off = window.api.sync.onProgress((p) => {
      setProgress(p.total ? p : null)
      if (!p.total) {
        refresh()
        loadFiles()
        loadFolders()
        loadDashboard()
      }
    })
    const t = setInterval(refresh, 20_000)
    return () => {
      off()
      clearInterval(t)
    }
  }, [])
  useEffect(() => {
    if (open) void window.api.sync.files(open).then(setRecent)
  }, [open, list])

  async function add(): Promise<void> {
    try {
      const s = await window.api.sync.add()
      if (s) {
        toast(`« ${s.name} » sera sauvegardé automatiquement`, 'success')
        refresh()
      }
    } catch (err) {
      toast(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Échec', 'error')
    }
  }

  return (
    <div className="view-scroll">
      <div className="page-header">
        <span className="page-header-title">Dossiers synchronisés</span>
        <button className="btn btn-primary" onClick={() => void add()}>
          <Plus size={14} /> Ajouter un dossier
        </button>
      </div>
      <div className="view-pad">
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 640, marginTop: 0 }}>
          Choisis un dossier de ton PC (Documents, Photos, un projet…) : les nouveaux fichiers et ceux que tu modifies partent tout seuls sur tes Drive, répartis comme d’habitude. C’est une
          sauvegarde : si tu supprimes un fichier du PC, il <b>reste</b> sur le Drive.
        </p>

        {list.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FolderSync size={28} />
            </div>
            <div className="empty-state-title">Aucun dossier synchronisé</div>
            <div className="empty-state-desc">Ajoute ton dossier Documents pour ne plus jamais perdre un fichier important.</div>
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {list.map((s) => {
              const p = progress && progress.syncId === s.id ? progress : null
              return (
                <div key={s.id} className="card col" style={{ gap: 10 }}>
                  <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                    <FolderSync size={18} style={{ color: s.enabled ? 'var(--accent-light)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                    <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{s.name}</span>
                      <span className="muted mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.path}
                      </span>
                    </div>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {s.files} fichier{s.files > 1 ? 's' : ''} · {formatBytes(s.bytes)}
                    </span>
                    <button className="icon-btn" onClick={() => void window.api.sync.open(s.path)} data-tooltip="Ouvrir le dossier">
                      <FolderOpen size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => void window.api.sync.run(s.id).then((r) => r && toast(r.sent ? `${r.sent} fichier(s) envoyé(s)` : 'Tout est à jour', 'info'))}
                      disabled={s.running || !s.enabled}
                      data-tooltip="Synchroniser maintenant"
                    >
                      <RefreshCw size={14} style={s.running ? { animation: 'spin 0.7s linear infinite' } : undefined} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => void window.api.sync.update(s.id, { enabled: !s.enabled }).then(refresh)}
                      data-tooltip={s.enabled ? 'Mettre en pause' : 'Reprendre'}
                    >
                      {s.enabled ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => {
                        if (!window.confirm(`Arrêter la synchronisation de « ${s.name} » ? Les fichiers déjà envoyés restent sur Google Drive.`)) return
                        void window.api.sync.remove(s.id).then(refresh)
                      }}
                      data-tooltip="Arrêter la synchro"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {p && (
                    <div className="col" style={{ gap: 4 }}>
                      <div className="progress">
                        <div className="progress-bar accent" style={{ width: `${(p.done / p.total) * 100}%` }} />
                      </div>
                      <span className="muted" style={{ fontSize: 11 }}>
                        Envoi {p.done + 1}/{p.total} · {p.current}
                      </span>
                    </div>
                  )}
                  {!s.exists && (
                    <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--warning)' }}>
                      <AlertTriangle size={13} /> Dossier introuvable (disque débranché ou dossier déplacé ?)
                    </span>
                  )}
                  {s.lastError && s.exists && (
                    <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--danger)' }}>
                      <AlertTriangle size={13} /> {s.lastError}
                    </span>
                  )}

                  <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                    <span className="muted">Dernier passage : {formatRelative(s.lastScan)}</span>
                    <select
                      className="input"
                      value={s.intervalMin}
                      onChange={(e) => void window.api.sync.update(s.id, { intervalMin: Number(e.target.value) }).then(refresh)}
                      style={{ padding: '3px 8px', fontSize: 12, width: 'auto' }}
                    >
                      {INTERVALS.map((i) => (
                        <option key={i.v} value={i.v}>
                          {i.l}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      {open === s.id ? 'Masquer les détails' : 'Détails et exclusions'}
                    </button>
                  </div>

                  {open === s.id && (
                    <div className="col" style={{ gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <label className="col" style={{ gap: 4, fontSize: 12 }}>
                        <span className="muted">Ne pas envoyer (un motif par ligne ou séparés par des virgules : *.iso, Cache, brouillons)</span>
                        <textarea
                          className="input"
                          defaultValue={s.exclude}
                          rows={2}
                          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
                          onBlur={(e) => e.target.value !== s.exclude && void window.api.sync.update(s.id, { exclude: e.target.value }).then(refresh)}
                          placeholder="*.iso&#10;node_modules"
                        />
                      </label>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Derniers envois :
                      </div>
                      {recent.length === 0 ? (
                        <span className="muted" style={{ fontSize: 12 }}>
                          Rien d’envoyé pour l’instant.
                        </span>
                      ) : (
                        <div className="col" style={{ gap: 2, maxHeight: 160, overflowY: 'auto' }}>
                          {recent.slice(0, 40).map((r) => (
                            <div key={r.relPath} className="row" style={{ gap: 10, fontSize: 12 }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.relPath}</span>
                              <span className="muted">{formatBytes(r.size)}</span>
                              <span className="muted">{formatRelative(r.syncedAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
