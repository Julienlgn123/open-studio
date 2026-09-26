import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, ArrowLeft, Clock, Mic, Monitor, Edit2, Trash2, FileDown, X, Send } from 'lucide-react'
import { useStore } from '../store'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import NewCourseModal from './NewCourseModal'
import CourseEditModal from './CourseEditModal'
import ContextMenu from './ContextMenu'
import type { Course } from '../../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export default function SubjectView() {
  const {
    subjects, courses, tags, activeSubjectId, setView, setActiveCourse, setActiveSubject, loadCourses, deleteCourse, searchQuery, setSearchQuery, showToast,
    selectedCourseIds, toggleCourseSelected, clearCourseSelection, bulkMoveCourses, bulkDeleteCourses, bulkAddTag
  } = useStore()
  const [showNew, setShowNew] = useState(false)
  const [editCourse, setEditCourse] = useState<Course | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; course: Course } | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  useEffect(() => { clearCourseSelection() }, [activeSubjectId])

  const subject = subjects.find((s) => s.id === activeSubjectId)
  const usedTags = useMemo(() => {
    const ids = new Set(courses.filter((c) => c.subjectId === activeSubjectId).flatMap((c) => c.tagIds))
    return tags.filter((t) => ids.has(t.id))
  }, [courses, tags, activeSubjectId])

  const subjectCourses = useMemo(() => {
    let filtered = courses.filter((c) => c.subjectId === activeSubjectId)
    if (tagFilter) filtered = filtered.filter((c) => c.tagIds.includes(tagFilter))
    if (!searchQuery) return filtered
    const q = searchQuery.toLowerCase()
    return filtered.filter((c) => c.title.toLowerCase().includes(q) || c.content.toLowerCase().includes(q))
  }, [courses, activeSubjectId, searchQuery, tagFilter])

  function openCourse(id: string) {
    setActiveCourse(id)
    setView('editor')
  }

  async function exportSubjectPdf() {
    if (!subject || subjectCourses.length === 0) return
    const html = subjectCourses
      .map((c) => `<h2>${c.emoji ?? '📝'} ${c.title}</h2>${c.content}<hr>`)
      .join('\n')
    const filePath = await api.exportPdf({ title: subject.name, html })
    if (filePath) showToast('PDF exporté : ' + filePath, 'success')
  }

  async function handleDelete(id: string) {
    await deleteCourse(id)
    setContextMenu(null)
    showToast('Cours déplacé dans la corbeille', 'success')
  }

  if (!subject) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => { setActiveSubject(null); setView('home') }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ fontSize: 20 }}>{subject.emoji}</span>
          <h1 className="page-header-title" style={{ color: subject.color }}>{subject.name}</h1>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-overlay)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
            {subjectCourses.length} cours
          </span>
        </div>
        <div className="page-header-right">
          <div className="search-bar" style={{ width: 220 }}>
            <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
            />
          </div>
          <button className="btn btn-secondary" onClick={exportSubjectPdf} disabled={subjectCourses.length === 0}>
            <FileDown size={14} /> Exporter en PDF
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={14} /> Nouveau cours
          </button>
        </div>
      </div>

      {usedTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <button
            className="btn btn-sm"
            onClick={() => setTagFilter(null)}
            style={{ background: !tagFilter ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: !tagFilter ? 'var(--accent-light)' : 'var(--text-secondary)', border: `1px solid ${!tagFilter ? 'var(--accent)' : 'var(--border)'}` }}
          >
            Tous
          </button>
          {usedTags.map((tag) => (
            <button
              key={tag.id}
              className="btn btn-sm"
              onClick={() => setTagFilter(tagFilter === tag.id ? null : tag.id)}
              style={{
                background: tagFilter === tag.id ? `${tag.color}22` : 'var(--bg-overlay)',
                color: tagFilter === tag.id ? tag.color : 'var(--text-secondary)',
                border: `1px solid ${tagFilter === tag.id ? tag.color : 'var(--border)'}`
              }}
            >
              {tag.emoji} {tag.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {subjectCourses.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <div className="empty-state-icon">{subject.emoji}</div>
            <div className="empty-state-title">Aucun cours</div>
            <div className="empty-state-desc">Lance le premier cours de {subject.name}.</div>
            <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ marginTop: 8 }}>
              <Plus size={14} /> Nouveau cours
            </button>
          </div>
        ) : (
          <div className="course-grid">
            {subjectCourses.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                subject={subject}
                selected={selectedCourseIds.includes(c.id)}
                onClick={() => openCourse(c.id)}
                onEdit={() => setEditCourse(c)}
                onToggleSelect={() => toggleCourseSelected(c.id)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, course: c }) }}
              />
            ))}
          </div>
        )}
      </div>

      {selectedCourseIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 150,
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)'
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{selectedCourseIds.length} sélectionné{selectedCourseIds.length > 1 ? 's' : ''}</span>

          <select
            className="field-input"
            style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
            value=""
            onChange={(e) => { if (e.target.value) bulkMoveCourses(selectedCourseIds, e.target.value) }}
          >
            <option value="" disabled>Déplacer vers...</option>
            {subjects.filter((s) => s.id !== activeSubjectId).map((s) => (
              <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
            ))}
          </select>

          {tags.length > 0 && (
            <select
              className="field-input"
              style={{ fontSize: 12, padding: '4px 8px', width: 'auto' }}
              value=""
              onChange={(e) => { if (e.target.value) bulkAddTag(selectedCourseIds, e.target.value) }}
            >
              <option value="" disabled>Ajouter le tag...</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>
              ))}
            </select>
          )}

          <button className="btn btn-sm" style={{ color: 'var(--danger, #ef4444)' }} onClick={() => setConfirmBulkDelete(true)}>
            <Trash2 size={13} /> Supprimer
          </button>
          <button className="icon-btn" onClick={clearCourseSelection}><X size={14} /></button>
        </div>
      )}

      {confirmBulkDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmBulkDelete(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 320, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Supprimer {selectedCourseIds.length} cours ?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Ils seront déplacés dans la corbeille — récupérables pendant 30 jours.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmBulkDelete(false)}>Annuler</button>
              <button className="btn" style={{ background: 'var(--danger, #ef4444)', color: '#fff' }} onClick={async () => {
                await bulkDeleteCourses(selectedCourseIds)
                setConfirmBulkDelete(false)
                showToast('Cours déplacés dans la corbeille', 'success')
              }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {showNew && <NewCourseModal subjectId={activeSubjectId!} onClose={() => setShowNew(false)} />}
      {editCourse && <CourseEditModal course={editCourse} onClose={() => setEditCourse(null)} />}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Ouvrir', icon: <Edit2 size={14} />, onClick: () => openCourse(contextMenu.course.id) },
            { label: 'Renommer', icon: <Edit2 size={14} />, onClick: () => { setEditCourse(contextMenu.course); setContextMenu(null) } },
            ...useStore.getState().paired.filter((p) => p.online).map((p) => ({
              label: `Envoyer à ${p.name}`,
              icon: <Send size={14} />,
              onClick: () => {
                const c = contextMenu.course
                setContextMenu(null)
                ;(window as any).api.peers
                  .send(p.id, [c.id])
                  .then(() => useStore.getState().showToast(`« ${c.title} » envoyé à ${p.name}`, 'success'))
                  .catch((err: Error) => useStore.getState().showToast(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error'))
              }
            })),
            { label: 'Supprimer', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDelete(contextMenu.course.id) }
          ]}
        />
      )}
    </div>
  )
}

function CourseCard({ course, subject, selected, onClick, onEdit, onToggleSelect, onContextMenu }: {
  course: Course
  subject: import('../../../shared/types').Subject
  selected: boolean
  onClick: () => void
  onEdit: () => void
  onToggleSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const [hover, setHover] = useState(false)
  const plainText = course.content.replace(/<[^>]+>/g, '').slice(0, 100)
  const { tags } = useStore()
  const courseTags = tags.filter((t) => course.tagIds?.includes(t.id))

  return (
    <div
      className="course-card"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', outline: selected ? '2px solid var(--accent)' : undefined }}
    >
      {(hover || selected) && (
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, width: 15, height: 15, cursor: 'pointer' }}
        />
      )}
      {/* Edit button on hover */}
      {hover && (
        <button
          className="icon-btn"
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          title="Modifier"
        >
          <Edit2 size={13} />
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{course.emoji ?? '📝'}</span>
        <div className="course-card-title" style={{ flex: 1 }}>{course.title}</div>
      </div>

      {plainText && <div className="course-card-preview">{plainText}</div>}

      {courseTags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {courseTags.map((tag) => (
            <span key={tag.id} style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: `${tag.color}22`, color: tag.color }}>
              {tag.emoji} {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="course-card-meta">
        <Clock size={11} style={{ color: 'var(--text-tertiary)' }} />
        <span className="course-card-date">{format(new Date(course.updatedAt), 'dd MMM yyyy', { locale: fr })}</span>
        <div className="course-card-badges" style={{ marginLeft: 'auto' }}>
          {course.audioPath && <Mic size={12} style={{ color: 'var(--success)' }} />}
          {course.videoPath && <Monitor size={12} style={{ color: 'var(--accent)' }} />}
          {course.versions.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-overlay)', padding: '1px 5px', borderRadius: 'var(--radius-full)' }}>
              {course.versions.length}v
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
