import { useState, useEffect } from 'react'
import { X, Upload, FileText, Clipboard, Globe } from 'lucide-react'
import { textToHtml, markdownToHtml, looksLikeMarkdown } from '../utils/text'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export default function ImportDocumentModal({
  onClose,
  onInsert
}: {
  onClose: () => void
  onInsert: (html: string) => void
}) {
  const [mode, setMode] = useState<'file' | 'paste' | 'url'>('file')
  const [pasted, setPasted] = useState('')
  const [fileText, setFileText] = useState('')
  const [fileName, setFileName] = useState('')
  const [url, setUrl] = useState('')
  const [urlText, setUrlText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [asMarkdown, setAsMarkdown] = useState(false)

  async function fetchUrl() {
    if (!url.trim()) return
    setImporting(true)
    setError('')
    try {
      const result = await api.documents.importUrl(url.trim())
      setUrlText(result.text)
      setFileName(result.fileName)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function pickFile() {
    setImporting(true)
    setError('')
    try {
      const result = await api.documents.import()
      if (result) {
        setFileText(result.text)
        setFileName(result.fileName)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  const preview = mode === 'file' ? fileText : mode === 'url' ? urlText : pasted

  // Auto-tick "Markdown" when the incoming text clearly is Markdown
  useEffect(() => {
    if (preview && looksLikeMarkdown(preview)) setAsMarkdown(true)
  }, [preview])

  function insert() {
    if (!preview.trim()) return
    onInsert(asMarkdown ? markdownToHtml(preview) : textToHtml(preview))
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, width: 560, maxWidth: '90vw', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Importer le cours du professeur</div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('file')}>
            <FileText size={13} /> Fichier (PDF, Word, ODT...)
          </button>
          <button className={`btn btn-sm ${mode === 'paste' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('paste')}>
            <Clipboard size={13} /> Copier-coller
          </button>
          <button className={`btn btn-sm ${mode === 'url' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('url')}>
            <Globe size={13} /> Page web
          </button>
        </div>

        {mode === 'url' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              placeholder="https://exemple.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchUrl() }}
            />
            <button className="btn btn-secondary" onClick={fetchUrl} disabled={importing || !url.trim()}>
              {importing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Globe size={14} />}
              Récupérer
            </button>
          </div>
        )}
        {mode === 'url' && error && <div style={{ marginTop: -4, marginBottom: 10, fontSize: 12, color: 'var(--danger)' }}>{error}</div>}

        {mode === 'file' && (
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-secondary" onClick={pickFile} disabled={importing}>
              {importing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Upload size={14} />}
              Choisir un fichier
            </button>
            {fileName && (
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--accent-light)' }}>{fileName}</span>
            )}
            {error && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
          </div>
        )}

        {mode === 'paste' && (
          <textarea
            className="field-input"
            style={{ width: '100%', minHeight: 140, resize: 'vertical', marginBottom: 12 }}
            placeholder="Colle ici le texte du cours fourni par le professeur..."
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        )}

        {preview && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Aperçu ({preview.length.toLocaleString()} caractères) :
          </div>
        )}
        {preview && (
          <div style={{ maxHeight: 160, overflow: 'auto', background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', marginBottom: 16 }}>
            {preview.slice(0, 2000)}{preview.length > 2000 ? '…' : ''}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={asMarkdown} onChange={(e) => setAsMarkdown(e.target.checked)} />
            Interpréter le Markdown (# titres, **gras**, listes…)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={insert} disabled={!preview.trim()}>
              Ajouter aux notes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
