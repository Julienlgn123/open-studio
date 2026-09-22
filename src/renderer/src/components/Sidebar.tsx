import { useState } from 'react'
import { Plus, Home, BookOpen, MoreHorizontal } from 'lucide-react'
import { useStore } from '../store'
import SubjectModal from './SubjectModal'
import ContextMenu from './ContextMenu'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export default function Sidebar() {
  const { subjects, activeSubjectId, view, setActiveSubject, setView, loadCourses, deleteSubject, showToast } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  const [editSubject, setEditSubject] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; subjectId: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteConfirmCount, setDeleteConfirmCount] = useState(0)

  function askDelete(subjectId: string) {
    setDeleteConfirm(subjectId)
    setDeleteConfirmCount(0)
    // Le state global `courses` peut ne contenir que les cours de la matière actuellement
    // ouverte (loadCourses(id)) plutôt que la totalité — on va chercher le vrai compte pour
    // cette matière précise plutôt que de se fier à un filtre sur un state potentiellement
    // désynchronisé.
    api.courses.bySubject(subjectId).then((list: unknown[]) => setDeleteConfirmCount(list.length))
  }

  function openSubject(id: string) {
    setActiveSubject(id)
    loadCourses(id)
    setView('subject')
  }

  function handleContextMenu(e: React.MouseEvent, subjectId: string) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, subjectId })
  }

  async function handleDelete(id: string) {
    await deleteSubject(id)
    setDeleteConfirm(null)
    showToast('Matière supprimée', 'success')
  }

  const subject = editSubject ? subjects.find((s) => s.id === editSubject) : undefined
  const subjectToDelete = deleteConfirm ? subjects.find((s) => s.id === deleteConfirm) : undefined

  return (
    <>
      <nav className="sidebar">
        <div style={{ padding: '12px 8px 4px' }}>
          <button
            className={`sidebar-item ${view === 'home' && !activeSubjectId ? 'active' : ''}`}
            style={{ width: '100%' }}
            onClick={() => { setActiveSubject(null); setView('home') }}
          >
            <Home size={15} />
            <span className="sidebar-item-name">Accueil</span>
          </button>
        </div>

        <div className="divider" style={{ margin: '4px 12px' }} />

        <div className="sidebar-header" style={{ paddingTop: 4 }}>
          <span className="sidebar-section-label">Matières</span>
          <button className="icon-btn" onClick={() => setShowCreate(true)} data-tooltip="Nouvelle matière">
            <Plus size={14} />
          </button>
        </div>

        <div className="sidebar-scroll">
          {subjects.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
              Aucune matière.<br />Crée-en une pour commencer.
            </div>
          )}
          {subjects.map((sub) => (
            <div
              key={sub.id}
              className={`sidebar-item ${activeSubjectId === sub.id && view === 'subject' ? 'active' : ''}`}
              onClick={() => openSubject(sub.id)}
              onContextMenu={(e) => handleContextMenu(e, sub.id)}
            >
              {activeSubjectId === sub.id && view === 'subject' && (
                <div className="sidebar-item-dot" style={{ background: sub.color }} />
              )}
              <span className="sidebar-item-emoji">{sub.emoji}</span>
              <span className="sidebar-item-name">{sub.name}</span>
              <div
                style={{ width: 6, height: 6, borderRadius: '50%', background: sub.color, marginLeft: 'auto', flexShrink: 0 }}
              />
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
            <BookOpen size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {subjects.length} matière{subjects.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </nav>

      {showCreate && (
        <SubjectModal onClose={() => setShowCreate(false)} />
      )}

      {editSubject && subject && (
        <SubjectModal subject={subject} onClose={() => setEditSubject(null)} />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Modifier',
              icon: <MoreHorizontal size={14} />,
              onClick: () => { setEditSubject(contextMenu.subjectId); setContextMenu(null) }
            },
            {
              label: 'Supprimer',
              icon: <MoreHorizontal size={14} />,
              danger: true,
              onClick: () => { askDelete(contextMenu.subjectId); setContextMenu(null) }
            }
          ]}
        />
      )}

      {deleteConfirm && subjectToDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 320, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Supprimer « {subjectToDelete.emoji} {subjectToDelete.name} » ?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {deleteConfirmCount > 0
                ? `Cette matière et ${deleteConfirmCount === 1 ? 'son cours' : `ses ${deleteConfirmCount} cours`} seront définitivement supprimés. Cette action est irréversible.`
                : 'Cette matière sera définitivement supprimée. Cette action est irréversible.'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button className="btn" style={{ background: 'var(--danger, #ef4444)', color: '#fff' }} onClick={() => handleDelete(deleteConfirm)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
