const EMOJIS = [
  '📁', '📂', '🗂️', '📦', '💾', '🎬', '🖼️', '🎵', '📄', '📊',
  '🎓', '💼', '🔒', '⭐', '🚀', '🧪', '🏠', '🌍', '📸', '🎨'
]

const COLORS = [
  '#7c6ff7', '#34d399', '#fbbf24', '#f87171', '#60a5fa',
  '#f472b6', '#a78bfa', '#2dd4bf', '#fb923c', '#c084fc'
]

export function EmojiPicker({
  value,
  onChange
}: {
  value: string
  onChange: (e: string) => void
}): JSX.Element {
  return (
    <div className="wrap">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onChange(e)}
          style={{
            fontSize: 18,
            padding: 6,
            borderRadius: 'var(--radius-sm)',
            background: value === e ? 'var(--accent-dim)' : 'var(--bg-overlay)',
            border: `1px solid ${value === e ? 'var(--accent)' : 'transparent'}`
          }}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

export function ColorPicker({
  value,
  onChange
}: {
  value: string
  onChange: (c: string) => void
}): JSX.Element {
  return (
    <div className="wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: c,
            border: value === c ? '2px solid var(--text-primary)' : '2px solid transparent',
            boxShadow: value === c ? '0 0 0 2px var(--bg-elevated)' : 'none'
          }}
        />
      ))}
    </div>
  )
}
