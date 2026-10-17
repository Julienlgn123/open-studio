import { Plus, Settings } from 'lucide-react'
import { isInstalled, useStore } from '../store'
import Brandmark from './Brandmark'
import ModuleIcon from './ModuleIcon'

const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** Barre d'icônes à gauche : accueil, modules installés, ajout de modules, réglages. */
export default function Rail(): JSX.Element {
  const { modules, view, go, progress } = useStore()
  const installed = modules.filter(isInstalled)
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
            onClick={() => go({ kind: 'module', id: m.id })}
          >
            <ModuleIcon module={m} size={34} />
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
  onClick,
  children
}: {
  active: boolean
  label: string
  hint?: string
  dot?: 'update' | 'error'
  busy?: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button className={`rail-btn${active ? ' active' : ''}`} onClick={onClick} aria-label={label}>
      <span className="rail-pill" />
      {children}
      {dot && <span className={`rail-dot ${dot}`} />}
      {busy && <span className="rail-busy" />}
      <span className="rail-tip">
        {label}
        {hint && <kbd>{hint}</kbd>}
      </span>
    </button>
  )
}
