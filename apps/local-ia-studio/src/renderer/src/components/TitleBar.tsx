import { PanelLeft, SquarePen } from 'lucide-react'
import { useChatStore } from '../store/chatStore'

/** Bouton rond, même gabarit que dans les autres modules d'Open Studio. */
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

/**
 * Afficher / masquer la liste des conversations (Ctrl+B), et nouvelle conversation quand elle est
 * masquée. La fenêtre (feux, titre, thème) est gérée par Open Studio.
 */
export function SidebarToggle(): JSX.Element {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const toggleSidebar = useChatStore((s) => s.toggleSidebar)
  const newConversation = useChatStore((s) => s.newConversation)
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton onClick={toggleSidebar} title={sidebarOpen ? 'Masquer les conversations (Ctrl+B)' : 'Afficher les conversations (Ctrl+B)'}>
        <PanelLeft size={15} />
      </IconButton>
      {!sidebarOpen && (
        <IconButton onClick={newConversation} title="Nouvelle conversation (Ctrl+N)">
          <SquarePen size={15} />
        </IconButton>
      )}
    </div>
  )
}
