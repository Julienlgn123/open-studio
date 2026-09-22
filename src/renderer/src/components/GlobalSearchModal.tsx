import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useStore } from '../store'

export default function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const { courses, subjects, tags, setActiveCourse, setView } = useStore()
  const [query, setQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    let base = subjectFilter ? courses.filter((c) => c.subjectId === subjectFilter) : courses
    if (!q) return base.slice(0, 15)
    return base.filter((c) => {
      const courseTags = tags.filter((t) => c.tagIds?.includes(t.id)).map((t) => t.name.toLowerCase())
      return (
        c.title.toLowerCase().includes(q) ||
        c.content.replace(/<[^>]+>/g, ' ').toLowerCase().includes(q) ||
        courseTags.some((t) => t.includes(q))
      )
    }).slice(0, 30)
  }, [courses, tags, query, subjectFilter])

  function openCourse(id: string) {
    setActiveCourse(id)
    setView('editor')
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div className="modal fade-in" style={{ maxWidth: 560, width: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && results[0]) openCourse(results[0].id) }}
            placeholder="Chercher dans tous les cours, toutes les matières..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
          />
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        {subjects.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px 0' }}>
            <button
              className="btn btn-sm"
              onClick={() => setSubjectFilter('')}
              style={{ background: !subjectFilter ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: !subjectFilter ? 'var(--accent-light)' : 'var(--text-secondary)', border: `1px solid ${!subjectFilter ? 'var(--accent)' : 'var(--border)'}` }}
            >
              Toutes les matières
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                className="btn btn-sm"
                onClick={() => setSubjectFilter(subjectFilter === s.id ? '' : s.id)}
                style={{ background: subjectFilter === s.id ? `${s.color}22` : 'var(--bg-overlay)', color: subjectFilter === s.id ? s.color : 'var(--text-secondary)', border: `1px solid ${subjectFilter === s.id ? s.color : 'var(--border)'}` }}
              >
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {results.length === 0 && (
            <div className="empty-state" style={{ padding: 30 }}>
              <div style={{ fontSize: 12 }}>Aucun résultat</div>
            </div>
          )}
          {results.map((course) => {
            const subject = subjects.find((s) => s.id === course.subjectId)
            const plainText = course.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 90)
            return (
              <div
                key={course.id}
                onClick={() => openCourse(course.id)}
                className="sidebar-item"
                style={{ height: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: 2, padding: '8px 10px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{course.emoji ?? '📝'}</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{course.title}</span>
                  {subject && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: subject.color }}>{subject.emoji} {subject.name}</span>
                  )}
                </div>
                {plainText && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', paddingLeft: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plainText}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-tertiary)' }}>
          Entrée pour ouvrir le premier résultat · Échap pour fermer
        </div>
      </div>
    </div>
  )
}
