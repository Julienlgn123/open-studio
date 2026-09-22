import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ArrowLeft, Save, History, Mic, Check, Trash2, FileUp, FileDown, FileText, List, BookOpen, Hash, Maximize2, Minimize2, ImagePlus, ChevronLeft, ChevronRight, Compass } from 'lucide-react'
import type { Attachment } from '../../../shared/types'
import { getPdfPageCount, renderPdfPageToDataUrl } from '../lib/pdfPage'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api
import { useStore } from '../store'
import Editor from './Editor'
import RecordingBar from './RecordingBar'
import VersionPanel from './VersionPanel'
import MediaPanel from './MediaPanel'
import ImportDocumentModal from './ImportDocumentModal'
import AttachmentsPanel from './AttachmentsPanel'

export default function EditorView() {
  const { courses, subjects, activeCourseId, setView, setActiveCourse, updateCourse, deleteCourse, showToast,
    focusMode, setFocusMode, settings, saveSettings, startTour } = useStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const course = courses.find((c) => c.id === activeCourseId)
  const subject = course ? subjects.find((s) => s.id === course.subjectId) : undefined

  const [title, setTitle] = useState(course?.title ?? '')
  const [content, setContent] = useState(course?.content ?? '')
  const [saved, setSaved] = useState(true)
  const [showRecording, setShowRecording] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [activeTab, setActiveTab] = useState<'editor' | 'versions' | 'media' | 'files'>('editor')
  const [showOutline, setShowOutline] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [pdfAtts, setPdfAtts] = useState<Attachment[]>([])
  const [pdfPath, setPdfPath] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfPageNum, setPdfPageNum] = useState(1)
  const [extractingPage, setExtractingPage] = useState(false)
  const [stats, setStats] = useState({ words: 0, chars: 0 })
  const [explain, setExplain] = useState<{ term: string; text: string; loading: boolean } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const explainCleanup = useRef<(() => void) | null>(null)
  const editorAreaRef = useRef<HTMLDivElement | null>(null)

  const numberedHeadings = !!settings.numberedHeadings
  const readingMin = Math.max(1, Math.round(stats.words / 200))

  // Runs once per mount of the editor (not per course switch, since EditorView stays
  // mounted while navigating between courses) — offers the toolbar tour the first
  // time someone actually opens a course, rather than forcing it on every session.
  useEffect(() => {
    if (!useStore.getState().settings.editorTourCompleted) {
      const t = setTimeout(() => startTour('editor'), 700)
      return () => clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const headings = useMemo(() => {
    try {
      const doc = new DOMParser().parseFromString(content || '', 'text/html')
      return Array.from(doc.querySelectorAll('h1, h2, h3')).map((el, i) => ({
        i,
        level: Number(el.tagName[1]),
        text: (el.textContent || '').trim() || 'Sans titre'
      }))
    } catch {
      return []
    }
  }, [content])

  function scrollToHeading(i: number) {
    const nodes = editorAreaRef.current?.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')
    const el = nodes?.[i] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const wikiCourses = useMemo(
    () => courses.map((c) => ({ id: c.id, title: c.title, emoji: c.emoji ?? '📝' })),
    [courses]
  )

  const backlinks = useMemo(
    () => courses.filter((c) => c.id !== activeCourseId && c.content.includes(`data-course-id="${activeCourseId}"`)),
    [courses, activeCourseId]
  )

  function navigateToCourse(id: string) {
    if (id === activeCourseId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    save(title, content)
    setActiveCourse(id)
    setShowOutline(false)
  }

  useEffect(() => {
    if (course) {
      setTitle(course.title)
      setContent(course.content)
    }
  }, [activeCourseId])

  useEffect(() => {
    if (!showPdf || !activeCourseId) return
    api.attachments.get(activeCourseId).then((all: Attachment[]) => {
      const pdfs = all.filter((a) => a.fileName.toLowerCase().endsWith('.pdf'))
      setPdfAtts(pdfs)
      setPdfPath((prev) => prev || pdfs[0]?.filePath || '')
    })
  }, [showPdf, activeCourseId])

  useEffect(() => {
    if (!pdfPath) { setPdfUrl(''); return }
    api.media.url(pdfPath).then(setPdfUrl)
  }, [pdfPath])

  useEffect(() => {
    if (!pdfUrl) { setPdfPageCount(0); return }
    setPdfPageNum(1)
    getPdfPageCount(pdfUrl).then(setPdfPageCount).catch(() => setPdfPageCount(0))
  }, [pdfUrl])

  async function insertPdfPageAsImage() {
    if (!pdfUrl || extractingPage) return
    setExtractingPage(true)
    try {
      const dataUrl = await renderPdfPageToDataUrl(pdfUrl, pdfPageNum)
      const img = `<p><img src="${dataUrl}" alt="Page ${pdfPageNum} du PDF" /></p>`
      const newContent = content ? `${content}\n${img}` : img
      setContent(newContent)
      scheduleAutoSave(title, newContent)
      showToast(`Page ${pdfPageNum} insérée dans le cours`, 'success')
    } catch {
      showToast("Impossible d'extraire cette page du PDF", 'error')
    } finally {
      setExtractingPage(false)
    }
  }

  const save = useCallback(async (t: string, c: string) => {
    if (!activeCourseId) return
    await updateCourse(activeCourseId, { title: t, content: c })
    setSaved(true)
  }, [activeCourseId, updateCourse])

  function scheduleAutoSave(t: string, c: string) {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(t, c), 1500)
  }

  function handleTitleChange(v: string) {
    setTitle(v)
    scheduleAutoSave(v, content)
  }

  function handleContentChange(v: string) {
    setContent(v)
    scheduleAutoSave(title, v)
  }

  async function forceSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await save(title, content)
    showToast('Cours sauvegardé', 'success')
  }

  async function exportPdf() {
    const filePath = await api.exportPdf({ title, html: content })
    if (filePath) showToast('PDF exporté : ' + filePath, 'success')
  }

  async function exportMarkdown() {
    const filePath = await api.exportMarkdown({ title, html: content })
    if (filePath) showToast('Markdown exporté : ' + filePath, 'success')
  }

  function explainSelection(text: string) {
    if (!text) { showToast('Sélectionne d\'abord un mot ou un passage', 'info'); return }
    if (!settings.mistralApiKey) { showToast('Configure ta clé API Mistral dans les paramètres', 'error'); return }
    explainCleanup.current?.()
    setExplain({ term: text.length > 60 ? text.slice(0, 60) + '…' : text, text: '', loading: true })
    let acc = ''
    explainCleanup.current = api.ai.stream(
      {
        apiKey: settings.mistralApiKey,
        model: settings.mistralModel || 'open-mistral-7b',
        messages: [
          { role: 'system', content: 'Tu expliques simplement, en 2 à 4 phrases courtes, sans jargon, avec une analogie si possible. Réponds en français, en texte brut.' },
          { role: 'user', content: `Explique de façon simple : « ${text} »\n\nContexte du cours : ${content.replace(/<[^>]+>/g, ' ').slice(0, 1500)}` }
        ]
      },
      (chunk: string) => { acc += chunk; setExplain((e) => e && { ...e, text: acc, loading: true }) },
      () => setExplain((e) => e && { ...e, loading: false }),
      (err: string) => { setExplain((e) => e && { ...e, text: 'Erreur : ' + err, loading: false }) }
    )
  }

  useEffect(() => () => explainCleanup.current?.(), [])

  async function quickFlashcard(text: string) {
    if (!activeCourseId) return
    if (!text) { showToast('Sélectionne d\'abord du texte dans le cours', 'info'); return }
    const front = window.prompt('Question de la flashcard (le texte sélectionné servira de réponse) :', '')
    if (front === null || !front.trim()) return
    try {
      await api.flashcards.create(activeCourseId, [{ front: front.trim(), back: text }])
      showToast('Flashcard créée', 'success')
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }

  function goBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    save(title, content)
    setView(subject ? 'subject' : 'home')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); forceSave() }
      if ((e.ctrlKey || e.metaKey) && e.key === '.') { e.preventDefault(); setFocusMode(!focusMode) }
      if (e.key === 'Escape' && focusMode) setFocusMode(false)
      if (e.key === 'Escape' && showDeleteConfirm) setShowDeleteConfirm(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [title, content, focusMode, setFocusMode, showDeleteConfirm])

  if (!course) return null

  const hasMedia = !!(course.audioPath || course.videoPath)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {focusMode && (
        <button
          className="icon-btn"
          onClick={() => setFocusMode(false)}
          data-tooltip="Quitter le mode focus (Échap)"
          data-tooltip-dir="left-down"
          style={{ position: 'absolute', top: 44, right: 16, zIndex: 50, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Minimize2 size={15} />
        </button>
      )}
      {/* Header */}
      {!focusMode && (
      <div className="page-header" style={{ padding: '10px 16px' }}>
        <div className="page-header-left">
          <button className="icon-btn" onClick={goBack} data-tooltip="Retour" data-tooltip-dir="down">
            <ArrowLeft size={16} />
          </button>
          {subject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14 }}>{subject.emoji}</span>
              <span style={{ fontSize: 12, color: subject.color, fontWeight: 500 }}>{subject.name}</span>
            </div>
          )}
        </div>
        <div className="page-header-right">
          {stats.words > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
              {stats.words} mots · {readingMin} min
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: saved ? 'var(--text-tertiary)' : 'var(--warning)' }}>
            {saved
              ? <><Check size={12} /> Sauvegardé</>
              : <><span className="spinner" style={{ width: 12, height: 12 }} /> Sauvegarde...</>
            }
          </div>
          <button
            className="icon-btn"
            onClick={() => setShowImport(true)}
            data-tooltip="Importer le cours du professeur (PDF, Word, ODT...)"
            data-tooltip-dir="left-down"
          >
            <FileUp size={15} />
          </button>
          <button
            className={`icon-btn ${showRecording ? 'active' : ''}`}
            onClick={() => setShowRecording(!showRecording)}
            data-tooltip="Enregistrement audio/vidéo"
            data-tooltip-dir="left-down"
          >
            <Mic size={15} />
          </button>
          <button
            className={`icon-btn ${activeTab === 'versions' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'versions' ? 'editor' : 'versions')}
            data-tooltip="Historique des versions"
            data-tooltip-dir="left-down"
          >
            <History size={15} />
          </button>
          <button className="icon-btn" onClick={forceSave} data-tooltip="Sauvegarder (Ctrl+S)" data-tooltip-dir="left-down">
            <Save size={15} />
          </button>
          <button
            className={`icon-btn ${showOutline ? 'active' : ''}`}
            onClick={() => setShowOutline((v) => !v)}
            data-tooltip="Plan du cours"
            data-tooltip-dir="left-down"
          >
            <List size={15} />
          </button>
          <button
            className={`icon-btn ${showPdf ? 'active' : ''}`}
            onClick={() => setShowPdf((v) => !v)}
            data-tooltip="Afficher un PDF à côté des notes"
            data-tooltip-dir="left-down"
          >
            <BookOpen size={15} />
          </button>
          <button
            className={`icon-btn ${numberedHeadings ? 'active' : ''}`}
            onClick={() => saveSettings({ ...settings, numberedHeadings: !numberedHeadings })}
            data-tooltip="Numéroter les titres"
            data-tooltip-dir="left-down"
          >
            <Hash size={15} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setFocusMode(true)}
            data-tooltip="Mode focus (Ctrl+.)"
            data-tooltip-dir="left-down"
          >
            <Maximize2 size={15} />
          </button>
          <button className="icon-btn" onClick={exportPdf} data-tooltip="Exporter en PDF" data-tooltip-dir="left-down">
            <FileDown size={15} />
          </button>
          <button className="icon-btn" onClick={exportMarkdown} data-tooltip="Exporter en Markdown" data-tooltip-dir="left-down">
            <FileText size={15} />
          </button>
          <button className="icon-btn" onClick={() => startTour('editor')} data-tooltip="Revoir la visite guidée de l'éditeur" data-tooltip-dir="left-down">
            <Compass size={15} />
          </button>
          <button className="icon-btn" onClick={() => setShowDeleteConfirm(true)} data-tooltip="Supprimer ce cours" data-tooltip-dir="left-down" style={{ color: 'var(--danger, #ef4444)' }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      )}

      {showImport && (
        <ImportDocumentModal
          onClose={() => setShowImport(false)}
          onInsert={(html) => {
            const newContent = content ? `${content}\n${html}` : html
            setContent(newContent)
            scheduleAutoSave(title, newContent)
            showToast('Cours du professeur ajouté aux notes', 'success')
          }}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 320, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Supprimer le cours ?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              « {course?.title} » sera déplacé dans la corbeille — récupérable pendant 30 jours.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
              <button className="btn" style={{ background: 'var(--danger, #ef4444)', color: '#fff' }} onClick={async () => {
                if (!activeCourseId) return
                await deleteCourse(activeCourseId)
                setView(subject ? 'subject' : 'home')
                showToast('Cours déplacé dans la corbeille', 'success')
              }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!focusMode && (
      <div className="tab-bar">
        <div className={`tab ${activeTab === 'editor' ? 'active' : ''}`} onClick={() => setActiveTab('editor')}>Notes</div>
        <div className={`tab ${activeTab === 'versions' ? 'active' : ''}`} onClick={() => setActiveTab('versions')}>
          Versions
          {course.versions.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--bg-overlay)', padding: '1px 5px', borderRadius: 'var(--radius-full)', color: 'var(--text-tertiary)' }}>
              {course.versions.length}
            </span>
          )}
        </div>
        {hasMedia && (
          <div className={`tab ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>
            Médias
            <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--recording-dim)', padding: '1px 5px', borderRadius: 'var(--radius-full)', color: 'var(--recording)' }}>
              {(course.audioPath ? 1 : 0) + (course.videoPath ? 1 : 0)}
            </span>
          </div>
        )}
        <div className={`tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
          Fichiers
        </div>
      </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {activeTab === 'editor' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {showPdf && (
                <div style={{ width: '45%', minWidth: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                    {pdfAtts.length > 1 ? (
                      <select
                        className="field-input"
                        style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
                        value={pdfPath}
                        onChange={(e) => setPdfPath(e.target.value)}
                      >
                        {pdfAtts.map((a) => <option key={a.id} value={a.filePath}>{a.fileName}</option>)}
                      </select>
                    ) : (
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pdfAtts[0]?.fileName ?? 'Aucun PDF joint'}
                      </span>
                    )}
                    <button className="icon-btn" onClick={() => setShowPdf(false)} data-tooltip="Fermer"><ArrowLeft size={14} /></button>
                  </div>
                  {pdfUrl && pdfPageCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        disabled={pdfPageNum <= 1}
                        onClick={() => setPdfPageNum((n) => Math.max(1, n - 1))}
                        data-tooltip="Page précédente"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        Page {pdfPageNum} / {pdfPageCount}
                      </span>
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        disabled={pdfPageNum >= pdfPageCount}
                        onClick={() => setPdfPageNum((n) => Math.min(pdfPageCount, n + 1))}
                        data-tooltip="Page suivante"
                      >
                        <ChevronRight size={13} />
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ marginLeft: 'auto' }}
                        onClick={insertPdfPageAsImage}
                        disabled={extractingPage}
                        data-tooltip="Insérer cette page comme image dans le cours"
                      >
                        {extractingPage ? (
                          <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                        ) : (
                          <ImagePlus size={13} />
                        )}
                        Insérer la page
                      </button>
                    </div>
                  )}
                  {pdfUrl ? (
                    <iframe title="PDF" src={pdfUrl} style={{ flex: 1, border: 'none', background: '#fff' }} />
                  ) : (
                    <div className="empty-state" style={{ padding: 24 }}>
                      <FileUp size={22} style={{ opacity: 0.3 }} />
                      <div style={{ fontSize: 12.5 }}>Joins un PDF dans l'onglet « Fichiers » pour l'afficher ici.</div>
                    </div>
                  )}
                </div>
              )}
              {showOutline && (
                <div style={{
                  width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'auto',
                  padding: '20px 10px', fontSize: 12.5
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '0 6px 8px' }}>
                    Plan
                  </div>
                  {headings.length === 0 && (
                    <div style={{ padding: '4px 6px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      Ajoute des titres (H1, H2, H3) pour voir le plan du cours ici.
                    </div>
                  )}
                  {headings.map((h) => (
                    <div
                      key={h.i}
                      onClick={() => scrollToHeading(h.i)}
                      className="sidebar-item"
                      style={{ paddingLeft: 6 + (h.level - 1) * 12, color: 'var(--text-secondary)' }}
                      title={h.text}
                    >
                      <span className="sidebar-item-name" style={{ fontSize: 12.5 }}>{h.text}</span>
                    </div>
                  ))}

                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '18px 6px 8px' }}>
                    Rétroliens {backlinks.length > 0 && `(${backlinks.length})`}
                  </div>
                  {backlinks.length === 0 && (
                    <div style={{ padding: '4px 6px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      Aucun autre cours ne renvoie ici. Tape <code>[[</code> dans un cours pour créer un lien.
                    </div>
                  )}
                  {backlinks.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => navigateToCourse(c.id)}
                      className="sidebar-item"
                      style={{ paddingLeft: 6, color: 'var(--text-secondary)' }}
                      title={c.title}
                    >
                      <span style={{ fontSize: 12 }}>{c.emoji ?? '📝'}</span>
                      <span className="sidebar-item-name" style={{ fontSize: 12.5 }}>{c.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <div ref={editorAreaRef} className={`editor-area ${numberedHeadings ? 'numbered-headings' : ''}`} style={{ flex: 1, overflow: 'auto', paddingTop: focusMode ? 48 : 24 }}>
                <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>
                  <input
                    className="editor-title-input"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Titre du cours..."
                  />
                  <Editor
                    content={content}
                    onChange={handleContentChange}
                    onQuickFlashcard={quickFlashcard}
                    courses={wikiCourses}
                    onNavigateCourse={navigateToCourse}
                    onStats={setStats}
                    onExplainSelection={explainSelection}
                  />
                </div>
              </div>
            </div>
            {showRecording && (
              <RecordingBar
                courseId={activeCourseId!}
                subjectId={course.subjectId}
                subjectName={subject?.name ?? 'Cours'}
                courseName={course.title}
                onSaved={(type, path) => {
                  updateCourse(activeCourseId!, type === 'audio' ? { audioPath: path } : { videoPath: path })
                  showToast('Enregistrement sauvegardé', 'success')
                  setActiveTab('media')
                }}
              />
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <VersionPanel
            course={course}
            currentContent={content}
            onRestore={(v) => {
              setContent(v.content)
              scheduleAutoSave(title, v.content)
              setActiveTab('editor')
              showToast('Version restaurée', 'success')
            }}
          />
        )}

        {activeTab === 'media' && (
          <MediaPanel course={course} />
        )}

        {activeTab === 'files' && (
          <AttachmentsPanel courseId={course.id} />
        )}
      </div>

      {explain && (
        <div style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 150, width: 320, maxHeight: '60vh', overflow: 'auto',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)', padding: 14
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)' }}>💡 « {explain.term} »</div>
            <button className="icon-btn" onClick={() => { explainCleanup.current?.(); setExplain(null) }} style={{ flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {explain.text}
            {explain.loading && <span style={{ display: 'inline-block', width: 2, height: 13, background: 'var(--accent)', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 0.8s step-end infinite' }} />}
          </div>
        </div>
      )}
    </div>
  )
}
