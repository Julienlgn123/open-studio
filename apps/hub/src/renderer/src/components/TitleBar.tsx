import { Moon, Sun } from 'lucide-react'
import { useStore } from '../store'

export default function TitleBar(): JSX.Element {
  const { settings, setTheme } = useStore()

  return (
    <div className="titlebar">
      <div className="titlebar-controls">
        <div className="titlebar-btn close" onClick={() => window.api.window.close()} />
        <div className="titlebar-btn minimize" onClick={() => window.api.window.minimize()} />
        <div className="titlebar-btn maximize" onClick={() => window.api.window.maximize()} />
      </div>

      <span className="titlebar-title">OPEN STUDIO</span>

      <div className="titlebar-actions">
        <button
          className="icon-btn"
          onClick={() => setTheme(settings.theme === 'light' ? 'dark' : 'light')}
          data-tooltip="Changer de thème"
        >
          {settings.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  )
}
