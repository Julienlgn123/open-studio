import { useState, useMemo, useEffect } from 'react'
import { Plus, Search, Clock, Mic, Monitor, Edit2, Layers } from 'lucide-react'
import { useStore } from '../store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import NewCourseModal from './NewCourseModal'
import CourseEditModal from './CourseEditModal'
import type { Course } from '../../../shared/types'

const STALE_DAYS = 7

export default function HomeView() {
  const { subjects, courses, tags, setView, setActiveCourse, loadCourses, searchQuery, setSearchQuery, openGlobalReview } = useStore()
  const [showNew, setShowNew] = useState(false)
  const [editCourse, setEditCourse] = useState<Course | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    loadCourses()
    api.flashcards.dueAll().then((cards: unknown[]) => setDueCount(cards.length)).catch(() => setDueCount(0))
  }, [])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    let base = courses
    if (tagFilter) base = base.filter((c) => c.tagIds?.includes(tagFilter))
    if (!q) return base.slice(0, 20)
    return base.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q)
    ).slice(0, 20)
  }, [courses, searchQuery, tagFilter])

  const recentCourses = courses.slice(0, 6)

  const staleCourses = useMemo(() => {
    const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000
    return courses.filter((c) => c.updatedAt < cutoff)
  }, [courses])

  function openCourse(id: string) {
    setActiveCourse(id)
    setView('editor')
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Hero header */}
      <div style={{
        padding: '32px 32px 24px',
        background: 'linear-gradient(180deg, rgba(124,111,247,0.06) 0%, transparent 100%)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Bonjour 👋</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {courses.length} cours · {subjects.length} matière{subjects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} />
            Nouveau cours
          </button>
        </div>

        {/* Search */}
        <div className="search-bar">
          <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les cours..."
          />
          {searchQuery && (
            <button className="icon-btn btn-sm" onClick={() => setSearchQuery('')} style={{ width: 20, height: 20 }}>✕</button>
          )}
        </div>
      </div>

      {dueCount > 0 && !searchQuery && (
        <div style={{
          margin: '16px 32px 0', padding: '10px 16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--accent-light)'
        }}>
          <Layers size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {dueCount} flashcard{dueCount > 1 ? 's' : ''} à réviser aujourd'hui, toutes matières confondues.
          </span>
          <button className="btn btn-primary btn-sm" onClick={openGlobalReview}>Réviser</button>
        </div>
      )}

      {!reminderDismissed && staleCourses.length > 0 && !searchQuery && (
        <div style={{
          margin: '16px 32px 0', padding: '10px 16px', background: 'var(--warning-dim)', border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--warning)'
        }}>
          <Clock size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {staleCourses.length} cours n'{staleCourses.length > 1 ? 'ont' : 'a'} pas été révisé{staleCourses.length > 1 ? 's' : ''} depuis plus de {STALE_DAYS} jours.
          </span>
          <button className="icon-btn" style={{ color: 'var(--warning)' }} onClick={() => setReminderDismissed(true)}>✕</button>
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '16px 32px 0' }}>
          <button
            className="btn btn-sm"
            onClick={() => setTagFilter(null)}
            style={{ background: !tagFilter ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: !tagFilter ? 'var(--accent-light)' : 'var(--text-secondary)', border: `1px solid ${!tagFilter ? 'var(--accent)' : 'var(--border)'}` }}
          >
            Tous les tags
          </button>
          {tags.map((tag) => (
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

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {(searchQuery || tagFilter) ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}{searchQuery ? ` pour « ${searchQuery} »` : ''}
            </p>
            <div className="course-grid" style={{ padding: 0 }}>
              {filtered.map((c) => {
                const subject = subjects.find((s) => s.id === c.subjectId)
                return <CourseCard key={c.id} course={c} subject={subject} onClick={() => openCourse(c.id)} onEdit={() => setEditCourse(c)} />
              })}
            </div>
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">Aucun cours trouvé</div>
                <div className="empty-state-desc">Essaie un autre mot-clé</div>
              </div>
            )}
          </>
        ) : (
          <>
            {courses.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 40 }}>
                <div className="empty-state-icon">📓</div>
                <div className="empty-state-title">Aucun cours pour l'instant</div>
                <div className="empty-state-desc">
                  {subjects.length === 0
                    ? "Crée ta première matière dans la barre latérale, puis commence un cours."
                    : 'Clique sur « Nouveau cours » pour commencer à prendre des notes.'}
                </div>
                <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ marginTop: 8 }}>
                  <Plus size={14} /> Nouveau cours
                </button>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
                  Récents
                </h2>
                <div className="course-grid" style={{ padding: 0 }}>
                  {recentCourses.map((c) => {
                    const subject = subjects.find((s) => s.id === c.subjectId)
                    return <CourseCard key={c.id} course={c} subject={subject} onClick={() => openCourse(c.id)} onEdit={() => setEditCourse(c)} />
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showNew && <NewCourseModal onClose={() => setShowNew(false)} />}
      {editCourse && <CourseEditModal course={editCourse} onClose={() => setEditCourse(null)} />}
    </div>
  )
}

function CourseCard({ course, subject, onClick, onEdit }: {
  course: Course
  subject?: import('../../../shared/types').Subject
  onClick: () => void
  onEdit: () => void
}) {
  const [hover, setHover] = useState(false)
  const plainText = course.content.replace(/<[^>]+>/g, '').slice(0, 120)

  return (
    <div
      className="course-card"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative' }}
    >
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
      {subject && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>{subject.emoji}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: subject.color }}>{subject.name}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 17 }}>{course.emoji ?? '📝'}</span>
        <div className="course-card-title">{course.title}</div>
      </div>
      {plainText && <div className="course-card-preview">{plainText}</div>}
      <div className="course-card-meta">
        <Clock size={11} style={{ color: 'var(--text-tertiary)' }} />
        <span className="course-card-date">
          {format(new Date(course.updatedAt), 'dd MMM yyyy', { locale: fr })}
        </span>
        <div className="course-card-badges" style={{ marginLeft: 'auto' }}>
          {course.audioPath && (
            <span style={{ color: 'var(--success)', display: 'flex' }}><Mic size={12} /></span>
          )}
          {course.videoPath && (
            <span style={{ color: 'var(--accent)', display: 'flex' }}><Monitor size={12} /></span>
          )}
          {course.versions.length > 0 && (
            <span className="badge" style={{ background: 'var(--bg-overlay)', color: 'var(--text-tertiary)', fontSize: 11 }}>
              {course.versions.length}v
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
