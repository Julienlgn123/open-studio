import { useState } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import EmojiPickerButton from './EmojiPickerButton'

const COLORS = [
  '#7c6ff7', '#6366f1', '#8b5cf6', '#ec4899',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#ef4444', '#14b8a6', '#a855f7'
]

export default function TagPicker({
  selectedTagIds,
  onChange
}: {
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
}) {
  const { tags, createTag, deleteTag } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏷️')
  const [color, setColor] = useState(COLORS[0])

  function toggle(id: string) {
    onChange(selectedTagIds.includes(id) ? selectedTagIds.filter((x) => x !== id) : [...selectedTagIds, id])
  }

  async function handleCreate() {
    if (!name.trim()) return
    const tag = await createTag({ name: name.trim(), emoji, color })
    onChange([...selectedTagIds, tag.id])
    setName(''); setEmoji('🏷️'); setColor(COLORS[0]); setShowCreate(false)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteTag(id)
    onChange(selectedTagIds.filter((x) => x !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: showCreate ? 10 : 0 }}>
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id)
          return (
            <div
              key={tag.id}
              onClick={() => toggle(tag.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 'var(--radius-full)',
                fontSize: 12.5, cursor: 'pointer',
                background: isSelected ? `${tag.color}22` : 'var(--bg-overlay)',
                border: `1px solid ${isSelected ? tag.color : 'var(--border)'}`,
                color: isSelected ? tag.color : 'var(--text-secondary)'
              }}
            >
              <span>{tag.emoji}</span>
              <span>{tag.name}</span>
              <Trash2 size={11} style={{ opacity: 0.5, marginLeft: 2 }} onClick={(e) => handleDelete(tag.id, e)} />
            </div>
          )
        })}
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '5px 9px', fontSize: 12.5 }}
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus size={12} /> Nouveau tag
        </button>
      </div>

      {showCreate && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          <EmojiPickerButton value={emoji} onChange={setEmoji} size={18} />
          <input
            className="field-input"
            style={{ flex: 1, fontSize: 12.5, padding: '6px 10px' }}
            placeholder="Nom du tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 3 }}>
            {COLORS.map((c) => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text-primary)' : '2px solid transparent' }}
              />
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!name.trim()}>Créer</button>
          <button className="icon-btn" onClick={() => setShowCreate(false)}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}
