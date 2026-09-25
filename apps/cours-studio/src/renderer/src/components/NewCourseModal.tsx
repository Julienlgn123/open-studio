import { useState, useEffect } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import { useStore } from '../store'
import { textToHtml, markdownToHtml, looksLikeMarkdown } from '../utils/text'
import { COURSE_TEMPLATES } from '../lib/courseTemplates'
import SubjectModal from './SubjectModal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Props {
  subjectId?: string
  onClose: () => void
}

function stripExt(name: string): string {
  return name.replace(/\.[^./\\]+$/, '')
}

export default function NewCourseModal({ subjectId, onClose }: Props) {
  const { subjects, createCourse, setActiveCourse, setView, showToast } = useStore()
  const [title, setTitle] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjectId ?? subjects[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedText, setImportedText] = useState('')
  const [importedFileName, setImportedFileName] = useState('')
  const [importedAsMarkdown, setImportedAsMarkdown] = useState(false)
  const [showCreateSubject, setShowCreateSubject] = useState(false)
  const [templateId, setTemplateId] = useState('')

  // Lets someone land here with zero subjects (fresh install, or every subject just
  // got deleted) create one without leaving this modal — createSubject() prepends to
  // the list, so the newly created one is always subjects[0].
  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) setSelectedSubjectId(subjects[0].id)
  }, [subjects, selectedSubjectId])

  async function handleImport() {
    setImporting(true)
    try {
      const result = await api.documents.import()
      if (result) {
        setImportedText(result.text)
        setImportedFileName(result.fileName)
        setImportedAsMarkdown(looksLikeMarkdown(result.text))
        setTemplateId('')
        if (!title.trim()) setTitle(stripExt(result.fileName))
        showToast(`Document importé : ${result.fileName}`, 'success')
      }
    } catch (err) {
      showToast('Erreur d\'import : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleCreate() {
    if (!selectedSubjectId) return
    setLoading(true)
    try {
      const template = COURSE_TEMPLATES.find((t) => t.id === templateId)
      const content = importedText
        ? (importedAsMarkdown ? markdownToHtml(importedText) : textToHtml(importedText))
        : template?.html
      const course = await createCourse({
        subjectId: selectedSubjectId,
        title: title.trim() || stripExt(importedFileName) || 'Sans titre',
        content
      })
      setActiveCourse(course.id)
      setView('editor')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') onClose()
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Nouveau cours</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Titre (optionnel)</label>
            <input
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Sans titre — tu pourras le changer après"
              autoFocus
            />
          </div>

          {!subjectId && subjects.length > 0 && (
            <div className="field">
              <label className="field-label">Matière</label>
              <select
                className="field-input"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                ))}
              </select>
            </div>
          )}

          {subjects.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
                Il te faut d'abord une matière.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateSubject(true)}>
                Nouvelle matière
              </button>
            </div>
          )}

          {!importedFileName && (
            <div className="field">
              <label className="field-label">Modèle (optionnel)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setTemplateId('')}
                  style={{ background: !templateId ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: !templateId ? 'var(--accent-light)' : 'var(--text-secondary)', border: `1px solid ${!templateId ? 'var(--accent)' : 'var(--border)'}` }}
                >
                  Vierge
                </button>
                {COURSE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setTemplateId(t.id)}
                    style={{ background: templateId === t.id ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: templateId === t.id ? 'var(--accent-light)' : 'var(--text-secondary)', border: `1px solid ${templateId === t.id ? 'var(--accent)' : 'var(--border)'}` }}
                  >
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label className="field-label">Cours déjà fait (optionnel)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={handleImport} disabled={importing}>
                {importing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Upload size={14} />}
                Importer un fichier (PDF, Word, ODT, TXT, Markdown)
              </button>
            </div>
            {importedFileName && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-light)', background: 'var(--accent-dim)', padding: '4px 10px', borderRadius: 'var(--radius-full)' }}>
                  <FileText size={12} /> {importedFileName} — {importedText.length.toLocaleString()} caractères
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={importedAsMarkdown} onChange={(e) => setImportedAsMarkdown(e.target.checked)} />
                  C'est du Markdown (Notion, Obsidian...)
                </label>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Le contenu du fichier sera mis dans les notes du nouveau cours, prêt à être édité.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={loading || subjects.length === 0 || !selectedSubjectId}
          >
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            Commencer
          </button>
        </div>
      </div>
    </div>

    {showCreateSubject && <SubjectModal onClose={() => setShowCreateSubject(false)} />}
    </>
  )
}
