import { Moon, Sun } from 'lucide-react'
import { useStore } from '../store'

/** Même barre que les apps de la suite : feux tricolores à gauche, titre centré. */
export default function TitleBar(): JSX.Element {
  const { settings, setTheme } = useStore()

  return (
    <div className="titlebar">
      <div className="traffic">
        <button style={{ background: '#ff5f57' }} title="Fermer" onClick={() => window.api.window.close()} />
        <button style={{ background: '#febc2e' }} title="Réduire" onClick={() => window.api.window.minimize()} />
        <button style={{ background: '#28c840' }} title="Agrandir" onClick={() => window.api.window.maximize()} />
      </div>
      <span className="titlebar-title">Open Studio</span>
      <div className="titlebar-actions">
        <button
          className="icon-btn"
          onClick={() => setTheme(settings.theme === 'light' ? 'dark' : 'light')}
          title="Changer de thème"
        >
          {settings.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  )
}
