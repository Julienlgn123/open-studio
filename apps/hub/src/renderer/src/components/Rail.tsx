import { useState } from 'react'
import { Plus, Settings } from 'lucide-react'
import { isInstalled, sortModules, useStore } from '../store'
import Brandmark from './Brandmark'
import ModuleIcon from './ModuleIcon'

const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** Barre d'icônes à gauche : accueil, modules installés, ajout de modules, réglages. */
export default function Rail(): JSX.Element {
  const { modules, view, go, progress, settings, setLayout } = useStore()
  const { layout } = settings
  const all = sortModules(modules.filter(isInstalled), layout.order)
  const installed = all.filter((m) => !layout.hidden.includes(m.id))
  const iconSize = { small: 28, normal: 34, large: 44 }[layout.railSize]
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  const drop = (): void => {
    if (drag && over && drag !== over.id) {
      const ids = all.map((m) => m.id).filter((id) => id !== drag)
      const at = ids.indexOf(over.id) + (over.after ? 1 : 0)
      ids.splice(at, 0, drag)
      void setLayout({ order: ids })
    }
    setDrag(null)
    setOver(null)
  }
  const at = (kind: string, id?: string): boolean => view.kind === kind && (!id || (view.kind === 'module' && view.id === id))

  return (
    <nav className="rail">
      <RailButton active={at('home')} label="Accueil" hint={`${MOD}0`} onClick={() => go({ kind: 'home' })}>
        <Brandmark size={24} />
      </RailButton>

      <div className="rail-sep" />

      <div className="rail-modules">
        {installed.map((m, i) => (
          <RailButton
            key={m.id}
            active={at('module', m.id)}
            label={m.name}
            hint={i < 9 ? `${MOD}${i + 1}` : undefined}
            dot={m.status === 'update' ? 'update' : m.error ? 'error' : undefined}
            busy={!!progress[m.id]}
            side={layout.railSide}
            drag={{
              dragging: drag === m.id,
              mark: over?.id === m.id && drag !== m.id ? (over.after ? 'after' : 'before') : null,
              onStart: () => setDrag(m.id),
              onOver: (after) => setOver({ id: m.id, after }),
              onDrop: drop,
              onEnd: () => {
                setDrag(null)
                setOver(null)
              }
            }}
            onClick={() => go({ kind: 'module', id: m.id })}
          >
            <ModuleIcon module={m} size={iconSize} />
          </RailButton>
        ))}
        <RailButton active={at('store')} label="Ajouter des modules" onClick={() => go({ kind: 'store' })}>
          <span className="rail-add">
            <Plus size={18} />
          </span>
        </RailButton>
      </div>

      <div className="rail-bottom">
        <RailButton active={at('settings')} label="Réglages" onClick={() => go({ kind: 'settings' })}>
          <span className="rail-glyph">
            <Settings size={18} />
          </span>
        </RailButton>
      </div>
    </nav>
  )
}

function RailButton({
  active,
  label,
  hint,
  dot,
  busy,
  side = 'left',
  drag,
  onClick,
  children
}: {
  active: boolean
  label: string
  hint?: string
  dot?: 'update' | 'error'
  busy?: boolean
  side?: 'left' | 'right'
  drag?: {
    dragging: boolean
    mark: 'before' | 'after' | null
    onStart: () => void
    onOver: (after: boolean) => void
    onDrop: () => void
    onEnd: () => void
  }
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  return (
    <button
      className={`rail-btn${active ? ' active' : ''}${drag?.dragging ? ' dragging' : ''}${drag?.mark ? ` drop-${drag.mark}` : ''}`}
      draggable={!!drag}
      onDragStart={drag ? (e) => { e.dataTransfer.effectAllowed = 'move'; drag.onStart() } : undefined}
      onDragOver={drag ? (e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); drag.onOver(e.clientY > r.top + r.height / 2) } : undefined}
      onDrop={drag ? (e) => { e.preventDefault(); drag.onDrop() } : undefined}
      onDragEnd={drag?.onEnd}
      onClick={onClick}
      aria-label={label}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setTip({ x: side === 'right' ? r.left - 12 : r.right + 12, y: r.top + r.height / 2 })
      }}
      onMouseLeave={() => setTip(null)}
    >
      <span className="rail-pill" />
      {children}
      {dot && <span className={`rail-dot ${dot}`} />}
      {busy && <span className="rail-busy" />}
      {tip && (
        <span className={`rail-tip${side === 'right' ? ' left' : ''}`} style={{ left: tip.x, top: tip.y }}>
          {label}
          {hint && <kbd>{hint}</kbd>}
        </span>
      )}
    </button>
  )
}
