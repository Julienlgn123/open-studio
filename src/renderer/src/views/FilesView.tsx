import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Upload,
  Download,
  Share2,
  Trash2,
  Info,
  FileArchive,
  MoreVertical,
  FolderInput,
  RefreshCw,
  ExternalLink,
  Cloud,
  X,
  CheckSquare,
  Loader2
} from 'lucide-react'
import { useStore } from '../store'
import ContextMenu from '../components/ContextMenu'
import FileInfoModal from '../components/FileInfoModal'
import ShareModal from '../components/ShareModal'
import ProgressBar from '../components/ProgressBar'
import {
  formatBytes,
  formatRelative,
  accountColor,
  mimeCategory
} from '../lib/format'
import type { FileMeta } from '@shared/types'

interface Props {
  folderId?: string | null
}

export default function FilesView({ folderId }: Props): JSX.Element {
  const {
    files,
    accounts,
    folders,
    filesAccountFilter,
    scanningAccountId,
    scanCount,
    loadFiles,
    loadFolders,
    loadDashboard,
    loadAccounts,
    syncDriveFiles,
    toast
  } = useStore()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState<string>(filesAccountFilter ?? '')
  const [catFilter, setCatFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; file: FileMeta } | null>(null)
  const [infoFile, setInfoFile] = useState<FileMeta | null>(null)
  const [shareFiles, setShareFiles] = useState<FileMeta[] | null>(null)
  // Ids en cours de suppression (animation par ligne) + progression globale de
  // l'action groupée en cours (barre "X / Y" dans la barre d'outils).
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [bulkProgress, setBulkProgress] = useState<{
    action: 'delete' | 'upload'
    done: number
    total: number
  } | null>(null)
  // Dernière ligne cliquée : sert de point de départ pour la sélection par plage (Shift+clic).
  const lastClickedId = useRef<string | null>(null)

  const folder = folders.find((f) => f.id === folderId)
  const scanning = scanningAccountId !== null

  useEffect(() => {
    loadFiles()
    setSelected(new Set())
  }, [folderId])

  // Consomme le pré-filtre par compte (clic depuis la page Comptes).
  useEffect(() => {
    if (filesAccountFilter) {
      setAccountFilter(filesAccountFilter)
      useStore.setState({ filesAccountFilter: null })
    }
  }, [filesAccountFilter])

  const rows = useMemo(() => {
    let base = folderId ? files.filter((f) => f.folderIds?.includes(folderId)) : files
    if (accountFilter) base = base.filter((f) => f.accountId === accountFilter)
    if (catFilter) base = base.filter((f) => mimeCategory(f.mimeType) === catFilter)
    if (sourceFilter) base = base.filter((f) => f.source === sourceFilter)
    const q = search.toLowerCase().trim()
    if (q) base = base.filter((f) => f.originalFilename.toLowerCase().includes(q))
    return base
  }, [files, folderId, accountFilter, catFilter, sourceFilter, search])

  async function scan(): Promise<void> {
    await syncDriveFiles()
    await Promise.all([loadFiles(), loadAccounts(), loadDashboard()])
    toast('Contenu des Drive actualisé', 'success')
  }

  function toggle(id: string): void {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
    lastClickedId.current = id
  }

  /**
   * Clic n'importe où sur la ligne (hors boutons/liens) : sélectionne sans
   * avoir à viser la case à cocher. Shift+clic étend la sélection depuis la
   * dernière ligne cliquée (comme un explorateur de fichiers classique).
   */
  function onRowClick(id: string, e: React.MouseEvent): void {
    if (e.shiftKey && lastClickedId.current) {
      const ids = rows.map((r) => r.id)
      const a = ids.indexOf(lastClickedId.current)
      const b = ids.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a]
        setSelected((s) => {
          const n = new Set(s)
          for (let i = from; i <= to; i++) n.add(ids[i])
          return n
        })
        return
      }
    }
    toggle(id)
  }

  function selectAll(): void {
    setSelected(new Set(rows.map((r) => r.id)))
  }

  function clearSelection(): void {
    setSelected(new Set())
  }

  async function deleteSelected(): Promise<void> {
    const ids = [...selected]
    if (!ids.length) return
    if (
      !window.confirm(
        `Supprimer ${ids.length} fichier${ids.length > 1 ? 's' : ''} de Google Drive ? Irréversible.`
      )
    )
      return
    setDeletingIds(new Set(ids))
    setBulkProgress({ action: 'delete', done: 0, total: ids.length })
    let ok = 0
    let failed = 0
    let lastError: string | null = null
    for (const id of ids) {
      try {
        await window.api.files.delete(id)
        ok++
      } catch (err) {
        failed++
        lastError = err instanceof Error ? err.message : String(err)
      }
      setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
      setDeletingIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
    await Promise.all([loadFiles(), loadFolders(), loadDashboard()])
    setSelected(new Set())
    setBulkProgress(null)
    toast(
      `${ok} fichier(s) supprimé(s)` +
        (failed ? ` · ${failed} en échec : ${lastError}` : ''),
      failed ? 'error' : 'success'
    )
  }

  async function pickUpload(): Promise<void> {
    setBulkProgress({ action: 'upload', done: 0, total: 0 })
    try {
      const res = await window.api.files.pickAndUpload()
      if (res.length) {
        if (folderId) {
          for (const f of res) await window.api.folders.addFile(folderId, f.id)
        }
        await Promise.all([loadFiles(), loadFolders(), loadDashboard()])
        toast(`${res.length} fichier(s) envoyé(s)`, 'success')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec upload', 'error')
    } finally {
      setBulkProgress(null)
    }
  }

  async function download(f: FileMeta): Promise<void> {
    try {
      const res = await window.api.files.download(f.id)
      if (res) toast(res.verified ? 'Téléchargé · checksum vérifié ✓' : 'Téléchargé', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec téléchargement', 'error')
    }
  }

  async function del(f: FileMeta): Promise<void> {
    if (!window.confirm(`Supprimer « ${f.originalFilename} » de Google Drive ? Irréversible.`)) return
    setDeletingIds((s) => new Set(s).add(f.id))
    try {
      await window.api.files.delete(f.id)
      await Promise.all([loadFiles(), loadFolders(), loadDashboard()])
      toast('Fichier supprimé', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec suppression', 'error')
    } finally {
      setDeletingIds((s) => {
        const n = new Set(s)
        n.delete(f.id)
        return n
      })
    }
  }

  async function exportSelected(zip: boolean): Promise<void> {
    const ids = [...selected]
    if (!ids.length) return
    try {
      const res = await window.api.files.export(ids, zip)
      if (res) {
        toast(
          `${res.count} fichier(s) exporté(s)` +
            (res.verified ? ` · ${res.verified} vérifié(s)` : '') +
            (res.failed ? ` · ${res.failed} en échec` : ''),
          res.failed ? 'error' : 'success'
        )
        setSelected(new Set())
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec export', 'error')
    }
  }

  async function addToFolder(f: FileMeta, fid: string): Promise<void> {
    await window.api.folders.addFile(fid, f.id)
    await Promise.all([loadFiles(), loadFolders()])
    toast('Ajouté au dossier', 'success')
  }

  return (
    <div className="view-scroll">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-header-title">
            {folder ? `${folder.emoji} ${folder.name}` : 'Tous les fichiers'}
          </span>
          <span className="muted" style={{ fontSize: 13 }}>
            {rows.length} fichier{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="page-header-right">
          {bulkProgress?.action === 'delete' && (
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--danger)' }} />
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                Suppression {bulkProgress.done}/{bulkProgress.total}…
              </span>
              <ProgressBar
                ratio={bulkProgress.total ? bulkProgress.done / bulkProgress.total : 0}
                variant="accent"
                height={4}
              />
            </div>
          )}
          {bulkProgress?.action === 'upload' && (
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--accent)' }} />
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                Envoi en cours…
              </span>
            </div>
          )}
          {!bulkProgress && selected.size > 0 && (
            <>
              <span className="muted" style={{ fontSize: 12 }}>
                {selected.size} sélectionné(s)
              </span>
              <button className="btn btn-sm btn-secondary" onClick={clearSelection}>
                <X size={13} /> Désélectionner
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => exportSelected(false)}>
                <Download size={13} /> Exporter
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => exportSelected(true)}>
                <FileArchive size={13} /> ZIP
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setShareFiles(rows.filter((r) => selected.has(r.id)))}
              >
                <Share2 size={13} /> Partager ({selected.size})
              </button>
              <button className="btn btn-sm btn-danger" onClick={deleteSelected}>
                <Trash2 size={13} /> Supprimer ({selected.size})
              </button>
            </>
          )}
          {!bulkProgress && rows.length > 0 && selected.size === 0 && (
            <button className="btn btn-sm btn-secondary" onClick={selectAll}>
              <CheckSquare size={13} /> Tout sélectionner
            </button>
          )}
          <button
            className="btn btn-sm btn-secondary"
            onClick={scan}
            disabled={scanning || !!bulkProgress || accounts.length === 0}
            data-tooltip="Scanner le contenu réel de chaque Drive"
          >
            <RefreshCw size={13} style={scanning ? { animation: 'spin 0.7s linear infinite' } : undefined} />
            {scanning ? `Scan… ${scanCount || ''}` : 'Actualiser'}
          </button>
          <button className="btn btn-primary" onClick={pickUpload} disabled={!!bulkProgress}>
            <Upload size={15} /> Ajouter
          </button>
        </div>
      </div>

      <div className="view-pad col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un fichier…"
            />
          </div>
          <select
            className="field-input"
            style={{ width: 'auto' }}
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">Tous les comptes</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
          <select
            className="field-input"
            style={{ width: 'auto' }}
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="">Tous les types</option>
            <option value="image">Images</option>
            <option value="video">Vidéos</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
            <option value="archive">Archives</option>
            <option value="autre">Autre</option>
          </select>
          <select
            className="field-input"
            style={{ width: 'auto' }}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">Toute origine</option>
            <option value="app">Ajoutés via l'app</option>
            <option value="drive">Déjà sur le Drive</option>
          </select>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">Aucun fichier</div>
            <div className="empty-state-desc">
              Glisse-dépose des fichiers dans la fenêtre ou clique sur « Ajouter ». L'app choisit
              automatiquement le compte principal le plus libre.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.size > 0 && selected.size < rows.length
                      }}
                      onChange={() => (selected.size === rows.length ? clearSelection() : selectAll())}
                    />
                  </th>
                  <th>Nom</th>
                  <th style={{ width: 90 }}>Taille</th>
                  <th style={{ width: 110 }}>Type</th>
                  <th style={{ width: 190 }}>Compte</th>
                  <th style={{ width: 130 }}>Modifié</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const accIndex = accounts.findIndex((a) => a.id === f.accountId)
                  const acc = accounts[accIndex]
                  const isDeleting = deletingIds.has(f.id)
                  return (
                    <tr
                      key={f.id}
                      className={
                        [selected.has(f.id) && 'row-selected', isDeleting && 'row-deleting']
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      onClick={(e) => !isDeleting && onRowClick(f.id, e)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        if (!isDeleting) setMenu({ x: e.clientX, y: e.clientY, file: f })
                      }}
                      style={{ cursor: isDeleting ? 'default' : 'pointer' }}
                    >
                      <td>
                        {isDeleting ? (
                          <Loader2
                            size={14}
                            style={{ animation: 'spin 0.7s linear infinite', color: 'var(--danger)' }}
                          />
                        ) : (
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={selected.has(f.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggle(f.id)}
                          />
                        )}
                      </td>
                      <td>
                        <div className="cell-name">
                          <span>{f.originalFilename}</span>
                          {f.source === 'drive' && (
                            <span
                              className="badge"
                              style={{ background: 'var(--bg-overlay)', color: 'var(--text-tertiary)' }}
                              title="Déjà présent sur le Drive (pas ajouté via l'app)"
                            >
                              <Cloud size={10} /> Drive
                            </span>
                          )}
                          {f.replicatedOn.length > 0 && (
                            <span
                              className="badge"
                              style={{ background: 'var(--success-dim)', color: 'var(--success)' }}
                              title={`Présent sur ${f.replicatedOn.length + 1} compte(s)`}
                            >
                              ×{f.replicatedOn.length + 1}
                            </span>
                          )}
                          {f.webViewLink && (
                            <button
                              className="icon-btn"
                              style={{ width: 20, height: 20 }}
                              title="Ouvrir dans Google Drive"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.api.shell.openExternal(f.webViewLink!)
                              }}
                            >
                              <ExternalLink size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{formatBytes(f.fileSize)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{mimeCategory(f.mimeType)}</td>
                      <td>
                        <span className="account-tag">
                          <span
                            className="dot"
                            style={{ background: accountColor(accIndex < 0 ? 0 : accIndex) }}
                          />
                          {acc?.email.split('@')[0] ?? '—'}
                        </span>
                      </td>
                      <td>{formatRelative(f.modifiedAt || f.uploadedAt)}</td>
                      <td>
                        <div className="cell-actions">
                          <button
                            className="icon-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              download(f)
                            }}
                            disabled={isDeleting}
                            data-tooltip="Télécharger"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setMenu({ x: r.left, y: r.bottom, file: f })
                            }}
                            disabled={isDeleting}
                          >
                            <MoreVertical size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Détails', icon: <Info size={14} />, onClick: () => setInfoFile(menu.file) },
            {
              label: 'Télécharger',
              icon: <Download size={14} />,
              onClick: () => download(menu.file)
            },
            { label: 'Partager', icon: <Share2 size={14} />, onClick: () => setShareFiles([menu.file]) },
            ...folders.map((fld) => ({
              label: `Ajouter à ${fld.emoji} ${fld.name}`,
              icon: <FolderInput size={14} />,
              onClick: () => addToFolder(menu.file, fld.id)
            })),
            {
              label: 'Supprimer',
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => del(menu.file)
            }
          ]}
        />
      )}

      {infoFile && <FileInfoModal file={infoFile} onClose={() => setInfoFile(null)} />}
      {shareFiles && <ShareModal files={shareFiles} onClose={() => setShareFiles(null)} />}
    </div>
  )
}
