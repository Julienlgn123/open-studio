import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: 'Récents', icon: '🕐',
    emojis: ['📝', '📚', '🔬', '🧮', '🌍', '💡', '🎨', '🎵', '📖', '⚗️']
  },
  {
    label: 'Études & Livres', icon: '📚',
    emojis: ['📚', '📖', '📝', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📃', '📄', '📑', '🗒️', '📋', '📊', '📈', '📉', '🗂️', '🗃️', '📁', '📂', '🗄️', '📌', '📍', '📎', '🖇️', '✂️', '🖊️', '✏️', '🖋️', '🖌️', '🔏', '🔓', '🔒', '🔑']
  },
  {
    label: 'Sciences', icon: '🔬',
    emojis: ['🔬', '🧬', '⚗️', '🧪', '🧫', '🔭', '💊', '🩺', '🩻', '🧲', '⚡', '🔋', '💡', '🔌', '🧯', '🌡️', '⚙️', '🔧', '🔩', '🛠️', '🧰', '🔬', '🧪', '🌊', '🌪️', '☄️', '🌋', '🏔️', '🌍', '🌎', '🌏', '🪐', '⭐', '🌙', '☀️']
  },
  {
    label: 'Maths & Tech', icon: '🧮',
    emojis: ['🧮', '📐', '📏', '∞', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '💾', '💿', '📀', '📡', '📱', '☎️', '📟', '📠', '🤖', '🧠', '💾', '🔢', '➕', '➖', '✖️', '➗', '🔣', '📊', '📈', '📉', '🎯', '🧩']
  },
  {
    label: 'Arts & Culture', icon: '🎨',
    emojis: ['🎨', '🖼️', '🎭', '🎬', '🎤', '🎸', '🎹', '🎺', '🎻', '🥁', '🎷', '🎵', '🎶', '🎼', '🎤', '🎧', '🎙️', '📺', '📻', '🎥', '📷', '📸', '🎞️', '🎠', '🎡', '🎢', '🎪', '🎭', '🎫', '🎟️', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️']
  },
  {
    label: 'Histoire & Géo', icon: '🌍',
    emojis: ['🌍', '🌎', '🌏', '🗺️', '🧭', '🗼', '🏛️', '⛩️', '🕌', '🕍', '🛕', '⛪', '🏰', '🏯', '🗿', '🗽', '🗼', '🌁', '🏟️', '🏗️', '🌆', '🌇', '🌉', '🌃', '🌌', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️', '🏝️', '🏞️', '🌊', '🌬️']
  },
  {
    label: 'Sport & Santé', icon: '🏋️',
    emojis: ['🏋️', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🥊', '🥋', '🤸', '🏊', '🚴', '🧘', '🤼', '🤺', '🏇', '⛷️', '🏂', '🪂', '🏋️', '🤾', '🏌️', '🏄', '🧗', '🚵', '🏆', '🥇', '🩺', '💪', '🦷', '👁️', '🫀', '🫁', '🧬']
  },
  {
    label: 'Nature', icon: '🌿',
    emojis: ['🌿', '🌱', '🌲', '🌳', '🌴', '🌵', '🪴', '🎋', '🎍', '🌾', '🍀', '🍁', '🍂', '🍃', '🌺', '🌸', '🌼', '🌻', '🌹', '🌷', '🌊', '🐾', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🦋', '🐝', '🐞', '🦎']
  },
  {
    label: 'Nourriture', icon: '🍕',
    emojis: ['🍕', '🍔', '🌮', '🌯', '🥪', '🥙', '🧆', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍟', '🍣', '🍱', '🍛', '🍜', '🍝', '🍲', '🥣', '🥗', '🍿', '🧂', '🥫', '🍱', '🍰', '🎂', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🍵']
  },
  {
    label: 'Voyage', icon: '✈️',
    emojis: ['✈️', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚕', '🚗', '🚙', '🛻', '🚚', '🚛', '🛵', '🏍️', '🚲', '🛴', '⛵', '🚤', '🛥️', '🛳️', '🚢', '🛸', '🚁', '🛶', '⛺', '🏠']
  },
  {
    label: 'Symboles', icon: '💫',
    emojis: ['💫', '⭐', '🌟', '✨', '🎇', '🎆', '🔥', '💥', '❄️', '🌊', '💧', '🌈', '☁️', '⛈️', '🌩️', '⚡', '🌙', '☀️', '🌤️', '⛅', '🌥️', '🌦️', '🌧️', '🌨️', '🌪️', '🌫️', '🌬️', '🌀', '🌂', '☂️', '☔', '💡', '🔦', '🕯️', '🪔', '💎', '🔮', '🧿', '🎱', '🪬']
  }
]

const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.emojis)

interface Props {
  value: string
  onChange: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ value, onChange, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = search
    ? ALL_EMOJIS.filter((e) => {
        // Simple: show all when no real search (emoji names hard without data)
        // At minimum filter by trying to find emoji in search
        return true
      }).slice(0, 80)
    : EMOJI_CATEGORIES[category]?.emojis ?? []

  // Custom emoji input
  const [custom, setCustom] = useState('')

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        zIndex: 3000,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Search */}
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
        <div className="search-bar" style={{ padding: '6px 10px' }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher ou taper un emoji..."
            autoFocus
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      {/* Custom emoji input */}
      {search && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Emoji personnalisé :</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 20, width: 40, textAlign: 'center', background: 'var(--bg-overlay)', borderRadius: 6, border: '1px solid var(--border)', padding: '2px' }}
          />
          <button className="btn btn-secondary btn-sm" onClick={() => { onChange(search); onClose() }}>
            Utiliser
          </button>
        </div>
      )}

      {/* Categories */}
      {!search && (
        <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={i}
              onClick={() => setCategory(i)}
              style={{
                fontSize: 16, padding: '3px 5px', borderRadius: 6, cursor: 'pointer',
                background: category === i ? 'var(--accent-dim)' : 'transparent',
                border: '1px solid transparent',
                borderColor: category === i ? 'var(--accent)' : 'transparent'
              }}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, padding: 8, maxHeight: 220, overflowY: 'auto' }}>
        {(search ? ALL_EMOJIS : filtered).map((e, i) => (
          <button
            key={i}
            onClick={() => { onChange(e); onClose() }}
            style={{
              fontSize: 20, padding: 4, borderRadius: 6, cursor: 'pointer', border: 'none',
              background: value === e ? 'var(--accent-dim)' : 'transparent',
              transition: 'background 100ms'
            }}
            onMouseOver={(ev) => (ev.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseOut={(ev) => (ev.currentTarget.style.background = value === e ? 'var(--accent-dim)' : 'transparent')}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
