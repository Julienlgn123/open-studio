import { Moon, Search, Sun } from 'lucide-react'
import { useStore } from '../store'
import ModuleIcon from './ModuleIcon'

const PALETTE_KEY = /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'

/** Barre de la fenêtre : feux à gauche, où l'on est au centre, palette et thème à droite. */
export default function TitleBar({ onPalette }: { onPalette: () => void }): JSX.Element {
  const { settings, setTheme, view, modules } = useStore()
  const current = view.kind === 'module' ? modules.find((m) => m.id === view.id) : null
  const title =
    view.kind === 'store' ? 'Modules' : view.kind === 'settings' ? 'Réglages' : view.kind === 'home' ? 'Accueil' : (current?.name ?? '')

  return (
    <div className="titlebar">
      <div className="traffic">
        <button style={{ background: '#ff5f57' }} title="Fermer" onClick={() => window.api.window.close()} />
        <button style={{ background: '#febc2e' }} title="Réduire" onClick={() => window.api.window.minimize()} />
        <button style={{ background: '#28c840' }} title="Agrandir" onClick={() => window.api.window.maximize()} />
      </div>

      <div className="titlebar-center">
        {current && <ModuleIcon module={current} size={18} />}
        <span className="titlebar-title">{title}</span>
      </div>

      <div className="titlebar-actions">
        <button className="palette-btn" onClick={onPalette} title="Aller à… (modules, réglages)">
          <Search size={13} />
          <span>Aller à…</span>
          <kbd>{PALETTE_KEY}</kbd>
        </button>
        <button
          className="icon-btn"
          onClick={() => void setTheme(settings.effectiveTheme === 'light' ? 'dark' : 'light')}
          title={settings.effectiveTheme === 'light' ? 'Passer en sombre' : 'Passer en clair'}
        >
          {settings.effectiveTheme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  )
}
