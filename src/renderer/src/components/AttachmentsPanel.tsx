import { useEffect, useState, useCallback } from 'react'
import { Paperclip, FolderOpen, ExternalLink, Trash2, UploadCloud, Eye, EyeOff } from 'lucide-react'
import type { Attachment } from '../../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const isImage = (name: string): boolean => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)
const isPdf = (name: string): boolean => /\.pdf$/i.test(name)

export default function AttachmentsPanel({ courseId }: { courseId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [expandedPdf, setExpandedPdf] = useState<string | null>(null)

  const load = useCallback(async () => {
    setAttachments(await api.attachments.get(courseId))
  }, [courseId])

  useEffect(() => { load() }, [load])

  // Thumbnails for images load right away; a PDF's iframe only loads once expanded.
  useEffect(() => {
    for (const a of attachments) {
      if (isImage(a.fileName) && !previewUrls[a.id]) {
        api.media.url(a.filePath).then((url: string) => setPreviewUrls((p) => ({ ...p, [a.id]: url })))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments])

  function togglePdfPreview(a: Attachment): void {
    if (expandedPdf === a.id) { setExpandedPdf(null); return }
    if (!previewUrls[a.id]) {
      api.media.url(a.filePath).then((url: string) => setPreviewUrls((p) => ({ ...p, [a.id]: url })))
    }
    setExpandedPdf(a.id)
  }

  async function addFiles(paths: string[]) {
    if (paths.length === 0) return
    setImporting(true)
    try {
      for (const sourcePath of paths) {
        await api.attachments.add({ courseId, sourcePath })
      }
      await load()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setImporting(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    const paths = files.map((f) => {
      try { return api.attachments.getPathForFile(f) } catch { return '' }
    }).filter(Boolean)
    addFiles(paths)
  }

  async function handleDelete(id: string) {
    await api.attachments.delete(id)
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Fichiers joints
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '32px 20px',
            textAlign: 'center',
            background: dragOver ? 'var(--accent-dim)' : 'var(--bg-surface)',
            transition: 'all 0.15s'
          }}
        >
          <UploadCloud size={26} style={{ color: dragOver ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {importing ? 'Import en cours...' : 'Glisse-dépose des fichiers ici (PDF, images, documents...)'}
          </div>
        </div>

        {attachments.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <Paperclip size={20} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12 }}>Aucun fichier joint pour ce cours</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attachments.map((a) => (
              <div key={a.id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                  {isImage(a.fileName) && previewUrls[a.id] ? (
                    <img src={previewUrls[a.id]} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                  ) : (
                    <Paperclip size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.fileName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatSize(a.size)}</div>
                  </div>
                  {isPdf(a.fileName) && (
                    <button className="icon-btn" title={expandedPdf === a.id ? 'Masquer l\'aperçu' : 'Aperçu'} onClick={() => togglePdfPreview(a)}>
                      {expandedPdf === a.id ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                  <button className="icon-btn" title="Ouvrir" onClick={() => api.attachments.open(a.filePath)}>
                    <ExternalLink size={14} />
                  </button>
                  <button className="icon-btn" title="Afficher dans le dossier" onClick={() => api.attachments.reveal(a.filePath)}>
                    <FolderOpen size={14} />
                  </button>
                  <button className="icon-btn" title="Supprimer" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(a.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {isPdf(a.fileName) && expandedPdf === a.id && previewUrls[a.id] && (
                  <iframe title={a.fileName} src={previewUrls[a.id]} style={{ width: '100%', height: 420, border: 'none', borderTop: '1px solid var(--border)', background: '#fff' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
