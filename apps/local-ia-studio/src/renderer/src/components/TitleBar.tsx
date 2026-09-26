import { Moon, PanelLeft, SquarePen, Sun } from 'lucide-react'
import { useChatStore } from '../store/chatStore'

/** Même gabarit que la barre de titre de Cours Studio / Drive Studio. */
export function IconButton({
  onClick,
  title,
  active,
  children
}: {
  onClick: () => void
  title?: string
  active?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] transition ${
        active ? 'bg-accent-500/15 text-accent-400' : 'text-base-300 hover:bg-base-100/[0.04] hover:text-base-100'
      }`}
    >
      {children}
    </button>
  )
}

function TrafficLight({ color, title, onClick }: { color: string; title: string; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ backgroundColor: color }}
      className="h-3 w-3 rounded-full transition-opacity hover:opacity-80"
    />
  )
}

export default function TitleBar(): JSX.Element {
  const theme = useChatStore((s) => s.theme)
  const setTheme = useChatStore((s) => s.setTheme)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const toggleSidebar = useChatStore((s) => s.toggleSidebar)
  const newConversation = useChatStore((s) => s.newConversation)

  return (
    <div className="drag relative z-40 flex h-11 shrink-0 items-center gap-2 border-b border-base-800 bg-base-900 px-3">
      <div className="no-drag flex items-center gap-1.5">
        <TrafficLight color="#ff5f57" title="Fermer" onClick={() => window.api.window.close()} />
        <TrafficLight color="#febc2e" title="Réduire" onClick={() => window.api.window.minimize()} />
        <TrafficLight color="#28c840" title="Agrandir" onClick={() => window.api.window.maximize()} />
      </div>

      <div className="no-drag ml-2 flex items-center gap-1.5">
        <IconButton onClick={toggleSidebar} title={sidebarOpen ? 'Masquer la barre latérale (Ctrl+B)' : 'Afficher la barre latérale (Ctrl+B)'}>
          <PanelLeft size={15} />
        </IconButton>
        {!sidebarOpen && (
          <IconButton onClick={newConversation} title="Nouvelle conversation (Ctrl+N)">
            <SquarePen size={15} />
          </IconButton>
        )}
      </div>

      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[13px] font-medium tracking-[0.02em] text-base-300">
        Local IA Studio
      </span>

      <div className="no-drag ml-auto flex items-center gap-1.5">
        <IconButton onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Changer de thème">
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </IconButton>
      </div>
    </div>
  )
}
