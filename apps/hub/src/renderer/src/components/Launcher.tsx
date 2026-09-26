import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import { useStore } from '../store'
import { AppIcon } from './AppCard'

const SHORTCUT = /Mac/i.test(navigator.platform) ? '⌘⌥Espace' : 'Ctrl+Alt+Espace'

/** Palette de lancement : tape quelques lettres, Entrée ouvre l'app (raccourci global ou Ctrl+K). */
export default function Launcher({ onClose }: { onClose: () => void }): JSX.Element {
  const { apps, launch } = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    return apps
      .filter((a) => a.status !== 'not_installed')
      .filter((a) => !query || a.name.toLowerCase().includes(query) || a.category.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [apps, q])

  useEffect(() => input.current?.focus(), [])
  useEffect(() => setSel(0), [q])

  async function open(i: number): Promise<void> {
    const a = list[i]
    if (!a) return
    onClose()
    await launch(a.id)
    // L'app lancée prend le relais : Open Studio se range.
    window.api.window.minimize()
  }

  return (
    <div className="overlay launcher-overlay" onMouseDown={onClose}>
      <div className="launcher" onMouseDown={(e) => e.stopPropagation()}>
        <div className="launcher-search">
          <Search size={16} />
          <input
            ref={input}
            value={q}
            placeholder="Ouvrir une app…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(list.length - 1, s + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
              else if (e.key === 'Enter') void open(sel)
            }}
          />
          <kbd>{SHORTCUT}</kbd>
        </div>
        <div className="launcher-list">
          {list.length === 0 ? (
            <div className="launcher-empty">{apps.some((a) => a.status !== 'not_installed') ? 'Aucune app ne correspond.' : 'Aucune app installée.'}</div>
          ) : (
            list.map((a, i) => (
              <button key={a.id} className={`launcher-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => void open(i)}>
                <AppIcon app={a} />
                <span className="launcher-name">{a.name}</span>
                <span className="launcher-cat">{a.category}</span>
                {i === sel && <CornerDownLeft size={14} className="launcher-enter" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
