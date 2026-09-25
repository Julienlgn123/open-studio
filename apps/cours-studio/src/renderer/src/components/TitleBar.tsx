import { Sparkles, Settings, HelpCircle, Layers, Search, BarChart3, Timer } from 'lucide-react'
import { useStore } from '../store'
import SettingsModal from './SettingsModal'
import { useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export default function TitleBar() {
  const { view, setView, pomodoroOpen, togglePomodoro } = useStore()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <div className="titlebar">
        <div className="titlebar-controls">
          <div className="titlebar-btn close" onClick={() => api.window.close()} />
          <div className="titlebar-btn minimize" onClick={() => api.window.minimize()} />
          <div className="titlebar-btn maximize" onClick={() => api.window.maximize()} />
        </div>

        <span className="titlebar-title">Cours Studio</span>

        <div className="titlebar-actions">
          <button
            className="icon-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
            data-tooltip="Rechercher (Ctrl+K)"
            data-tooltip-dir="left-down"
          >
            <Search size={15} />
          </button>
          <button
            className={`icon-btn ${view === 'flashcards' ? 'active' : ''}`}
            onClick={() => setView(view === 'flashcards' ? 'home' : 'flashcards')}
            data-tooltip="Flashcards"
            data-tooltip-dir="left-down"
          >
            <Layers size={15} />
          </button>
          <button
            className={`icon-btn ${view === 'ai' ? 'active' : ''}`}
            onClick={() => setView(view === 'ai' ? 'home' : 'ai')}
            data-tooltip="Studio IA"
            data-tooltip-dir="left-down"
          >
            <Sparkles size={15} />
          </button>
          <button
            className={`icon-btn ${view === 'quiz' ? 'active' : ''}`}
            onClick={() => setView(view === 'quiz' ? 'home' : 'quiz')}
            data-tooltip="Quiz IA"
            data-tooltip-dir="left-down"
          >
            <HelpCircle size={15} />
          </button>
          <button
            className={`icon-btn ${view === 'stats' ? 'active' : ''}`}
            onClick={() => setView(view === 'stats' ? 'home' : 'stats')}
            data-tooltip="Statistiques"
            data-tooltip-dir="left-down"
          >
            <BarChart3 size={15} />
          </button>
          <button
            className={`icon-btn ${pomodoroOpen ? 'active' : ''}`}
            onClick={togglePomodoro}
            data-tooltip="Minuteur Pomodoro"
            data-tooltip-dir="left-down"
          >
            <Timer size={15} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            data-tooltip="Paramètres"
            data-tooltip-dir="left-down"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}
