import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import type { Course } from '../../../shared/types'
import EmojiPickerButton from './EmojiPickerButton'
import TagPicker from './TagPicker'

interface Props {
  course: Course
  onClose: () => void
}

export default function CourseEditModal({ course, onClose }: Props) {
  const { subjects, updateCourse, setCourseTags, showToast } = useStore()
  const [title, setTitle] = useState(course.title)
  const [emoji, setEmoji] = useState(course.emoji ?? '📝')
  const [subjectId, setSubjectId] = useState(course.subjectId)
  const [tagIds, setTagIds] = useState<string[]>(course.tagIds ?? [])
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setLoading(true)
    try {
      await updateCourse(course.id, { title: title.trim(), emoji, subjectId })
      await setCourseTags(course.id, tagIds)
      showToast('Cours mis à jour', 'success')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Modifier le cours</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Emoji + Title row */}
          <div className="field">
            <label className="field-label">Titre & Emoji</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <EmojiPickerButton value={emoji} onChange={setEmoji} />
              <input
                className="field-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre du cours"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
                autoFocus
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Subject */}
          <div className="field">
            <label className="field-label">Matière</label>
            <select
              className="field-input"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="field">
            <label className="field-label">Tags</label>
            <TagPicker selectedTagIds={tagIds} onChange={setTagIds} />
          </div>

          {/* Preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'var(--bg-overlay)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)'
          }}>
            <span style={{ fontSize: 20 }}>{emoji}</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{title || 'Sans titre'}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading || !title.trim()}
          >
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
