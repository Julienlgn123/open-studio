import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import type { Subject } from '../../../shared/types'
import EmojiPickerButton from './EmojiPickerButton'

const COLORS = [
  '#7c6ff7', '#6366f1', '#8b5cf6', '#ec4899',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#ef4444', '#14b8a6', '#a855f7'
]

interface Props {
  subject?: Subject
  onClose: () => void
}

export default function SubjectModal({ subject, onClose }: Props) {
  const { createSubject, updateSubject, showToast } = useStore()
  const [name, setName] = useState(subject?.name ?? '')
  const [color, setColor] = useState(subject?.color ?? COLORS[0])
  const [emoji, setEmoji] = useState(subject?.emoji ?? '📚')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) return
    setLoading(true)
    try {
      if (subject) {
        await updateSubject(subject.id, { name: name.trim(), color, emoji })
        showToast('Matière mise à jour', 'success')
      } else {
        await createSubject({ name: name.trim(), color, emoji })
        showToast('Matière créée', 'success')
      }
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{subject ? 'Modifier la matière' : 'Nouvelle matière'}</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Nom & Emoji</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <EmojiPickerButton value={emoji} onChange={setEmoji} />
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
                placeholder="ex: Mathématiques"
                autoFocus
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label">Couleur</label>
            <div className="color-picker-row">
              {COLORS.map((c) => (
                <div
                  key={c}
                  className={`color-swatch ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {name && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px',
              background: 'var(--bg-overlay)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)'
            }}>
              <span style={{ fontSize: 18 }}>{emoji}</span>
              <span style={{ fontWeight: 600, color }}>{name}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
          >
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            {subject ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
