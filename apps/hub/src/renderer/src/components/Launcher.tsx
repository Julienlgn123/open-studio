import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Home, Plus, Search, Settings } from 'lucide-react'
import { isInstalled, useStore, type View } from '../store'
import ModuleIcon from './ModuleIcon'
import Brandmark from './Brandmark'

interface Item {
  key: string
  label: string
  hint: string
  icon: JSX.Element
  view: View
}

/** Palette « Aller à… » : quelques lettres, Entrée. Ctrl+K, ou Ctrl+Alt+Espace de n'importe où. */
export default function Launcher({ onClose }: { onClose: () => void }): JSX.Element {
  const { modules, go } = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const all: Item[] = [
      ...modules.filter(isInstalled).map((m) => ({
        key: m.id,
        label: m.name,
        hint: m.tagline,
        icon: <ModuleIcon module={m} size={26} />,
        view: { kind: 'module', id: m.id } as View
      })),
      { key: 'home', label: 'Accueil', hint: 'Tes modules', icon: <span className="launcher-glyph"><Home size={15} /></span>, view: { kind: 'home' } },
      { key: 'store', label: 'Ajouter des modules', hint: 'Catalogue', icon: <span className="launcher-glyph"><Plus size={15} /></span>, view: { kind: 'store' } },
      { key: 'settings', label: 'Réglages', hint: 'Thème, démarrage', icon: <span className="launcher-glyph"><Settings size={15} /></span>, view: { kind: 'settings' } }
    ]
    const query = q.trim().toLowerCase()
    return all.filter((i) => !query || i.label.toLowerCase().includes(query) || i.hint.toLowerCase().includes(query))
  }, [modules, q])

  useEffect(() => input.current?.focus(), [])
  useEffect(() => setSel(0), [q])

  const open = (i: number): void => {
    const item = items[i]
    if (!item) return
    onClose()
    go(item.view)
  }

  return (
    <div className="overlay launcher-overlay" onMouseDown={onClose}>
      <div className="launcher" onMouseDown={(e) => e.stopPropagation()}>
        <div className="launcher-search">
          <Search size={16} />
          <input
            ref={input}
            value={q}
            placeholder="Aller à…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
              else if (e.key === 'Enter') open(sel)
            }}
          />
          <Brandmark size={18} />
        </div>
        <div className="launcher-list">
          {items.length === 0 ? (
            <div className="launcher-empty">Rien ne correspond.</div>
          ) : (
            items.map((it, i) => (
              <button key={it.key} className={`launcher-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => open(i)}>
                {it.icon}
                <span className="launcher-name">{it.label}</span>
                <span className="launcher-cat">{it.hint}</span>
                {i === sel && <CornerDownLeft size={14} className="launcher-enter" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
