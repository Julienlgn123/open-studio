import { useEffect, useState } from 'react'
import { Folder, Check, Download, RotateCcw } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../store'
import { formatBytes, formatDate, accountColor } from '../lib/format'
import type { DriveRevision, FileHistoryEntry, FileMeta, FileReplica } from '@shared/types'

type Tab = 'details' | 'versions' | 'replication' | 'history' | 'folders'

const ACTION_LABEL: Record<string, string> = {
  upload: 'Envoi',
  download: 'Téléchargement',
  replicate: 'Copie de sauvegarde',
  backup: 'Sauvegarde',
  delete: 'Suppression',
  share: 'Partage',
  unshare: 'Fin du partage'
}

export default function FileInfoModal({
  file,
  onClose
}: {
  file: FileMeta
  onClose: () => void
}): JSX.Element {
  const { accounts, folders, loadFiles, loadFolders, toast } = useStore()
  const [tab, setTab] = useState<Tab>('details')
  const [revisions, setRevisions] = useState<DriveRevision[] | null>(null)
  const [revError, setRevError] = useState<string | null>(null)
  const [fileFolders, setFileFolders] = useState<string[]>(file.folderIds ?? [])
  const [replicas, setReplicas] = useState<FileReplica[] | null>(null)
  const [history, setHistory] = useState<FileHistoryEntry[] | null>(null)
  const [busyReplica, setBusyReplica] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'replication' && !replicas) window.api.files.replicas(file.id).then(setReplicas).catch(() => setReplicas([]))
    if (tab === 'history' && !history) window.api.files.history(file.id).then(setHistory).catch(() => setHistory([]))
  }, [tab, file.id, replicas, history])

  const errText = (e: unknown): string =>
    (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

  async function downloadCopy(accountId: string): Promise<void> {
    setBusyReplica(accountId)
    try {
      const r = await window.api.files.downloadReplica(file.id, accountId)
      if (r) toast(`Copie restaurée${r.verified ? ' (intégrité vérifiée ✓)' : ''}`, 'success')
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusyReplica(null)
    }
  }

  async function promote(accountId: string, email: string): Promise<void> {
    if (!window.confirm(`Utiliser la copie de ${email} comme fichier principal ? À faire si l'original a disparu ou est abîmé.`)) return
    setBusyReplica(accountId)
    try {
      await window.api.files.restoreReplica(file.id, accountId)
      toast('Copie de sauvegarde restaurée comme original', 'success')
      await loadFiles()
      onClose()
    } catch (e) {
      toast(errText(e), 'error')
    } finally {
      setBusyReplica(null)
    }
  }

  const account = accounts.find((a) => a.id === file.accountId)
  const accIndex = accounts.findIndex((a) => a.id === file.accountId)

  useEffect(() => {
    if (tab !== 'versions' || revisions) return
    window.api.files
      .revisions(file.id)
      .then(setRevisions)
      .catch((e) => setRevError(e instanceof Error ? e.message : String(e)))
  }, [tab, file.id, revisions])

  async function toggleFolder(folderId: string): Promise<void> {
    const has = fileFolders.includes(folderId)
    if (has) {
      await window.api.folders.removeFile(folderId, file.id)
      setFileFolders((f) => f.filter((x) => x !== folderId))
    } else {
      await window.api.folders.addFile(folderId, file.id)
      setFileFolders((f) => [...f, folderId])
    }
    await Promise.all([loadFiles(), loadFolders()])
  }

  return (
    <Modal title={file.originalFilename} onClose={onClose} maxWidth={540}>
      <div className="tab-bar" style={{ margin: '-4px -4px 4px', padding: 0 }}>
        {(
          [
            ['details', 'Détails'],
            ['versions', 'Versions'],
            ['replication', 'Sauvegardes'],
            ['history', 'Historique'],
            ['folders', 'Dossiers']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <div key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </div>
        ))}
      </div>

      {tab === 'details' && (
        <div className="col" style={{ gap: 10, fontSize: 13 }}>
          <Row k="Taille" v={formatBytes(file.fileSize)} />
          <Row k="Type" v={file.mimeType} />
          <Row k="Compte" v={account?.email ?? file.accountId} />
          <Row
            k="Origine"
            v={file.source === 'drive' ? 'Déjà présent sur le Drive' : "Envoyé via l'application"}
          />
          <Row k="Modifié le" v={formatDate(file.modifiedAt || file.uploadedAt)} />
          <Row k="Repéré le" v={formatDate(file.uploadedAt)} />
          <Row k="Statut" v={file.status} />
          <Row k="Chiffrement" v={file.encrypted ? '🔒 Chiffré sur ce PC avant l’envoi' : 'Non chiffré'} />
          <Row
            k={file.checksum.length === 64 ? 'SHA-256' : 'MD5 (Drive)'}
            v={file.checksum || '—'}
            mono
          />
          <Row k="ID Drive" v={file.driveFileId} mono />
          {file.webViewLink && (
            <button
              className="btn btn-sm btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => window.api.shell.openExternal(file.webViewLink!)}
            >
              Ouvrir dans Google Drive
            </button>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <div className="col" style={{ gap: 6 }}>
          {revError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{revError}</p>}
          {!revError && !revisions && <div className="spinner" />}
          {revisions && revisions.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Aucune version antérieure enregistrée par Google Drive.
            </p>
          )}
          {revisions?.map((r, i) => (
            <div
              key={r.id}
              className="spread"
              style={{
                padding: '8px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12.5
              }}
            >
              <div className="col" style={{ gap: 2 }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  {i === 0 ? 'Version actuelle' : `Version ${revisions.length - i}`}
                </span>
                <span className="muted">
                  {formatDate(r.modifiedTime)} · {formatBytes(r.size)}
                  {r.lastModifyingUser ? ` · ${r.lastModifyingUser}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'replication' && (
        <div className="col" style={{ gap: 8 }}>
          <div
            className="row"
            style={{ fontSize: 13, padding: '8px 10px', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-md)' }}
          >
            <span className="legend-dot" style={{ background: accountColor(accIndex) }} />
            <span style={{ color: 'var(--text-primary)' }}>{account?.email}</span>
            <span className="badge" style={{ marginLeft: 'auto', background: 'var(--accent-dim)', color: 'var(--accent-light)' }}>
              principal
            </span>
          </div>
          {file.replicatedOn.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Ce fichier n'est répliqué sur aucun compte de backup. Lance un backup pour le
              dupliquer.
            </p>
          )}
          {file.replicatedOn.map((id) => {
            const acc = accounts.find((a) => a.id === id)
            const idx = accounts.findIndex((a) => a.id === id)
            const rep = replicas?.find((r) => r.accountId === id)
            return (
              <div
                key={id}
                className="row"
                style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', gap: 8 }}
              >
                <span className="legend-dot" style={{ background: accountColor(idx) }} />
                <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{acc?.email ?? id}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {rep?.replicatedAt ? `copie du ${formatDate(rep.replicatedAt)}` : rep && !rep.driveFileId ? 'copie ancienne (non restaurable depuis ici)' : 'copie'}
                  </span>
                </span>
                {rep?.driveFileId ? (
                  <>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={!!busyReplica}
                      onClick={() => downloadCopy(id)}
                      title="Télécharger cette copie de sauvegarde sur ton PC"
                    >
                      {busyReplica === id ? <span className="spinner" /> : <Download size={13} />}
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={!!busyReplica}
                      onClick={() => promote(id, acc?.email ?? id)}
                      title="En faire le fichier principal (si l'original a disparu ou est abîmé)"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </>
                ) : (
                  <Check size={14} style={{ color: 'var(--success)' }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'history' && (
        <div className="col" style={{ gap: 4 }}>
          {!history && <div className="spinner" />}
          {history?.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Aucun événement enregistré pour ce fichier.</p>}
          {history?.map((h, i) => {
            const acc = accounts.find((a) => a.id === h.accountId)
            return (
              <div key={i} className="row" style={{ gap: 10, fontSize: 12.5, padding: '7px 2px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: h.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>{h.status === 'success' ? '●' : '✕'}</span>
                <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {ACTION_LABEL[h.action] ?? h.action}
                    {acc ? ` · ${acc.email}` : ''}
                  </span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {h.label}
                    {h.errorDetails ? ` — ${h.errorDetails}` : ''}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{formatDate(h.timestamp)}</span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'folders' && (
        <div className="col" style={{ gap: 6 }}>
          {folders.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Crée un dossier virtuel dans la barre latérale.
            </p>
          )}
          {folders.map((f) => {
            const on = fileFolders.includes(f.id)
            return (
              <button
                key={f.id}
                className="pick-item"
                style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-dim)' } : undefined}
                onClick={() => toggleFolder(f.id)}
              >
                <span>{f.emoji}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{f.name}</span>
                {on ? <Check size={14} style={{ color: 'var(--accent-light)' }} /> : <Folder size={14} className="muted" />}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }): JSX.Element {
  return (
    <div className="spread" style={{ alignItems: 'flex-start' }}>
      <span className="muted" style={{ flexShrink: 0 }}>
        {k}
      </span>
      <span
        className={mono ? 'mono' : ''}
        style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-all', fontSize: mono ? 11.5 : 13 }}
      >
        {v}
      </span>
    </div>
  )
}
