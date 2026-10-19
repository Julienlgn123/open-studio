import { useEffect, useMemo, useState } from 'react'
import { Copy, HardDrive, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { formatBytes, formatDate } from '../lib/format'
import type { DuplicateGroup, FileMeta } from '@shared/types'

type Tab = 'dups' | 'big' | 'old'
const TYPE_COLORS: Record<string, string> = { Images: '#34d399', Vidéos: '#f472b6', Audio: '#fbbf24', PDF: '#fb7185', Archives: '#a78bfa', Documents: '#38bdf8', Autres: '#94a3b8' }

/** Faire de la place : doublons, plus gros fichiers, fichiers anciens. Rien ne part sans confirmation. */
export default function CleanupView(): JSX.Element {
  const { accounts, toast, loadFiles, loadAccounts, loadDashboard, loadFolders } = useStore()
  const [tab, setTab] = useState<Tab>('dups')
  const [dups, setDups] = useState<DuplicateGroup[] | null>(null)
  const [big, setBig] = useState<FileMeta[] | null>(null)
  const [old, setOld] = useState<FileMeta[] | null>(null)
  const [days, setDays] = useState(365)
  const [types, setTypes] = useState<{ type: string; bytes: number; count: number }[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    void window.api.cleanup.duplicates().then(setDups)
    void window.api.cleanup.largest(100).then(setBig)
    void window.api.cleanup.byType().then(setTypes)
  }
  useEffect(load, [])
  useEffect(() => void window.api.cleanup.old(days).then(setOld), [days])
  useEffect(() => setSel(new Set()), [tab])

  const email = (id: string): string => accounts.find((a) => a.id === id)?.email.split('@')[0] ?? '?'
  const toggle = (id: string): void => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))
  const allFiles = useMemo(() => [...(big ?? []), ...(old ?? []), ...(dups ?? []).flatMap((g) => g.files)], [big, old, dups])
  const selBytes = [...sel].reduce((s, id) => s + (allFiles.find((f) => f.id === id)?.fileSize ?? 0), 0)
  const totalBytes = types.reduce((s, t) => s + t.bytes, 0)
  const wasted = (dups ?? []).reduce((s, g) => s + g.size * (g.files.length - 1), 0)

  async function remove(): Promise<void> {
    if (!sel.size) return
    if (!window.confirm(`Supprimer ${sel.size} fichier(s) (${formatBytes(selBytes)}) de Google Drive ?\n\nIls iront dans la corbeille de Drive, où tu peux encore les récupérer un moment.`)) return
    setBusy(true)
    try {
      const r = await window.api.cleanup.deleteMany([...sel])
      toast(r.failed.length ? `${r.deleted} supprimé(s), ${r.failed.length} échec(s)` : `${r.deleted} fichier(s) supprimé(s)`, r.failed.length ? 'error' : 'success')
      setSel(new Set())
      load()
      void window.api.cleanup.old(days).then(setOld)
      await Promise.all([loadFiles(), loadAccounts(), loadDashboard(), loadFolders()])
    } finally {
      setBusy(false)
    }
  }

  /** Garde le plus ancien de chaque groupe, coche tous les autres. */
  const selectExtraCopies = (): void => setSel(new Set((dups ?? []).filter((g) => g.exact).flatMap((g) => g.files.slice(1).map((f) => f.id))))

  const row = (f: FileMeta, extra?: string): JSX.Element => (
    <label key={f.id} className="row" style={{ gap: 10, alignItems: 'center', padding: '6px 4px', fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.originalFilename}>
        {f.originalFilename}
      </span>
      <span className="muted" style={{ fontSize: 11 }}>
        {extra ?? ''} {email(f.accountId)}
      </span>
      <span className="muted" style={{ fontSize: 11, width: 90, textAlign: 'right' }}>
        {formatDate(f.modifiedAt || f.uploadedAt).split(' · ')[0]}
      </span>
      <span style={{ width: 70, textAlign: 'right' }}>{formatBytes(f.fileSize)}</span>
    </label>
  )

  return (
    <div className="view-scroll">
      <div className="page-header">
        <span className="page-header-title">Faire de la place</span>
        <button className="btn btn-danger" disabled={!sel.size || busy} onClick={() => void remove()}>
          <Trash2 size={14} /> Supprimer la sélection{sel.size ? ` (${sel.size} · ${formatBytes(selBytes)})` : ''}
        </button>
      </div>
      <div className="view-pad">
        {totalBytes > 0 && (
          <div className="card col" style={{ gap: 10, marginBottom: 14 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <HardDrive size={15} /> <b style={{ fontSize: 13 }}>Ce qui prend de la place</b>
              <span className="muted" style={{ fontSize: 12 }}>
                {formatBytes(totalBytes)} dans tes fichiers
              </span>
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
              {types.map((t) => (
                <div key={t.type} title={`${t.type} : ${formatBytes(t.bytes)}`} style={{ width: `${(t.bytes / totalBytes) * 100}%`, background: TYPE_COLORS[t.type] ?? '#94a3b8' }} />
              ))}
            </div>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
              {types.map((t) => (
                <span key={t.type} className="row" style={{ gap: 5, alignItems: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: TYPE_COLORS[t.type] ?? '#94a3b8' }} />
                  {t.type} <span className="muted">{formatBytes(t.bytes)} · {t.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 6, marginBottom: 12 }}>
          {(
            [
              ['dups', `Doublons${dups ? ` (${dups.length})` : ''}`],
              ['big', 'Plus gros fichiers'],
              ['old', 'Fichiers anciens']
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`btn btn-sm ${tab === id ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'dups' && (
          <>
            {!dups ? (
              <span className="muted">Analyse…</span>
            ) : dups.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Copy size={26} />
                </div>
                <div className="empty-state-title">Aucun doublon</div>
                <div className="empty-state-desc">Aucun fichier identique n’occupe de la place en double.</div>
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13 }}>
                    <b>{formatBytes(wasted)}</b> récupérables en gardant un seul exemplaire de chaque.
                  </span>
                  <button className="btn btn-sm btn-secondary" onClick={selectExtraCopies}>
                    Cocher les copies en trop (garde le plus ancien)
                  </button>
                  {sel.size > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setSel(new Set())}>
                      Tout décocher
                    </button>
                  )}
                </div>
                <div className="col" style={{ gap: 10 }}>
                  {dups.map((g) => (
                    <div key={g.key} className="card" style={{ padding: '8px 12px' }}>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
                        {g.exact ? 'Contenu identique' : 'Même nom et même taille (à vérifier)'} · {g.files.length} exemplaires de {formatBytes(g.size)}
                      </div>
                      {g.files.map((f, i) => row(f, i === 0 ? '★ le plus ancien ·' : ''))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {tab === 'big' && <div className="card" style={{ padding: '6px 12px' }}>{(big ?? []).map((f) => row(f))}</div>}
        {tab === 'old' && (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 13 }}>
              Non modifiés depuis
              <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto', padding: '3px 8px' }}>
                <option value={90}>3 mois</option>
                <option value={180}>6 mois</option>
                <option value={365}>1 an</option>
                <option value={730}>2 ans</option>
                <option value={1825}>5 ans</option>
              </select>
              <span className="muted">{old?.length ?? 0} fichier(s)</span>
            </div>
            <div className="card" style={{ padding: '6px 12px' }}>{(old ?? []).map((f) => row(f))}</div>
          </>
        )}
      </div>
    </div>
  )
}
