import { useState } from 'react'
import {
  LayoutDashboard,
  Files,
  Users,
  DatabaseBackup,
  ScrollText,
  Settings,
  Share2,
  Plus,
  Trash2,
  Pencil
} from 'lucide-react'
import { useStore, type ViewName } from '../store'
import ContextMenu from './ContextMenu'
import FolderModal from './FolderModal'
import type { VirtualFolder } from '@shared/types'

const NAV: { view: ViewName; label: string; icon: JSX.Element }[] = [
  { view: 'dashboard', label: 'Accueil', icon: <LayoutDashboard size={15} /> },
  { view: 'files', label: 'Fichiers', icon: <Files size={15} /> },
  { view: 'accounts', label: 'Comptes', icon: <Users size={15} /> },
  { view: 'backup', label: 'Backup', icon: <DatabaseBackup size={15} /> },
  { view: 'shared', label: 'Partages', icon: <Share2 size={15} /> },
  { view: 'logs', label: 'Logs', icon: <ScrollText size={15} /> },
  { view: 'settings', label: 'Réglages', icon: <Settings size={15} /> }
]

export default function Sidebar(): JSX.Element {
  const { view, activeFolderId, setView, folders, accounts, loadFolders, toast } = useStore()
  const [showNew, setShowNew] = useState(false)
  const [editFolder, setEditFolder] = useState<VirtualFolder | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; folder: VirtualFolder } | null>(null)

  async function del(id: string): Promise<void> {
    await window.api.folders.delete(id)
    await loadFolders()
    if (activeFolderId === id) setView('files')
    toast('Dossier supprimé', 'success')
  }

  return (
    <>
      <nav className="sidebar">
        <div style={{ padding: '12px 8px 4px' }}>
          {NAV.map((n) => (
            <button
              key={n.view}
              className={`sidebar-item ${view === n.view ? 'active' : ''}`}
              onClick={() => setView(n.view)}
            >
              {n.icon}
              <span className="sidebar-item-name">{n.label}</span>
              {n.view === 'accounts' && accounts.length > 0 && (
                <span className="sidebar-item-count">{accounts.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="divider" style={{ margin: '4px 12px' }} />

        <div className="sidebar-header" style={{ paddingTop: 4 }}>
          <span className="sidebar-section-label" style={{ padding: 0 }}>
            Dossiers
          </span>
          <button className="icon-btn" onClick={() => setShowNew(true)} data-tooltip="Nouveau dossier">
            <Plus size={14} />
          </button>
        </div>

        <div className="sidebar-scroll">
          {folders.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              Aucun dossier virtuel.
            </div>
          )}
          {folders.map((f) => (
            <button
              key={f.id}
              className={`sidebar-item ${view === 'folder' && activeFolderId === f.id ? 'active' : ''}`}
              onClick={() => setView('folder', f.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, folder: f })
              }}
            >
              <span className="sidebar-item-emoji">{f.emoji}</span>
              <span className="sidebar-item-name">{f.name}</span>
              <span className="sidebar-item-count">{f.fileCount ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="row" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span
              className="legend-dot"
              style={{ background: accounts.some((a) => a.status === 'error') ? 'var(--danger)' : 'var(--success)' }}
            />
            {accounts.length} compte{accounts.length !== 1 ? 's' : ''} lié{accounts.length !== 1 ? 's' : ''}
          </div>
        </div>
      </nav>

      {showNew && <FolderModal onClose={() => setShowNew(false)} />}
      {editFolder && <FolderModal folder={editFolder} onClose={() => setEditFolder(null)} />}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Renommer',
              icon: <Pencil size={14} />,
              onClick: () => setEditFolder(menu.folder)
            },
            {
              label: 'Supprimer',
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => del(menu.folder.id)
            }
          ]}
        />
      )}
    </>
  )
}
