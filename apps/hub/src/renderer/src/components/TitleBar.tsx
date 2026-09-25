import { HelpCircle, Minus, Moon, Square, Sun, X } from 'lucide-react'
import { useStore } from '../store'
import Brandmark from './Brandmark'

export default function TitleBar({ onHelp }: { onHelp: () => void }): JSX.Element {
  const { settings, setTheme } = useStore()

  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <Brandmark size={16} />
        <span className="titlebar-title">Open Studio</span>
      </div>

      <div className="titlebar-actions">
        <button className="titlebar-winbtn" onClick={onHelp} data-tooltip="Comment ça marche">
          <HelpCircle size={14} />
        </button>
        <button
          className="titlebar-winbtn"
          onClick={() => setTheme(settings.theme === 'light' ? 'dark' : 'light')}
          data-tooltip="Changer de thème"
        >
          {settings.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <span style={{ width: 8 }} />
        <button className="titlebar-winbtn" onClick={() => window.api.window.minimize()}>
          <Minus size={13} />
        </button>
        <button className="titlebar-winbtn" onClick={() => window.api.window.maximize()}>
          <Square size={11} />
        </button>
        <button className="titlebar-winbtn danger" onClick={() => window.api.window.close()}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
