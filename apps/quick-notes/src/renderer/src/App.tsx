import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, NotebookPen, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import { Empty, Layout, Modal, Toasts, relativeTime, toast, uid, usePersisted } from '@ui'
import './notes.css'

interface Note {
  id: string
  title: string
  body: string
  color: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

const COLORS = ['', '#facc15', '#fb923c', '#f87171', '#f472b6', '#a78bfa', '#60a5fa', '#34d399']
const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'

/** Titre affiché : le titre, sinon la première ligne du texte. */
const titleOf = (n: Note): string => n.title.trim() || n.body.trim().split('\n')[0]?.slice(0, 80) || 'Note sans titre'

export default function App(): JSX.Element {
  const [notes, setNotes, ready] = usePersisted<Note[]>('notes', [])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const create = (): void => {
    const n: Note = { id: uid(), title: '', body: '', color: '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() }
    setNotes((all) => [n, ...all])
    setActiveId(n.id)
    setQ('')
    setTimeout(() => bodyRef.current?.focus(), 30)
  }

  // Raccourci global (Ctrl+Alt+N) et Ctrl+N dans le module.
  const readyRef = useRef(false)
  readyRef.current = ready
  useEffect(
    () =>
      window.kit.on('notes:new', () => {
        if (readyRef.current) void window.kit.invoke<boolean>('notes:takePending').then((p) => p && create())
      }),
    []
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        create()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Une note vide qu'on quitte disparaît toute seule.
  useEffect(() => {
    if (ready) setNotes((all) => all.filter((n) => n.id === activeId || n.title.trim() || n.body.trim()))
  }, [activeId])

  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    return notes
      .filter((n) => !query || n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
  }, [notes, q])

  useEffect(() => {
    if (!ready) return
    void window.kit.invoke<boolean>('notes:takePending').then((p) => {
      if (p) create()
      else if (!activeId && list.length) setActiveId(list[0].id)
    })
  }, [ready])

  const active = notes.find((n) => n.id === activeId) ?? null
  const update = (patch: Partial<Note>): void =>
    setNotes((all) => all.map((n) => (n.id === activeId ? { ...n, ...patch, updatedAt: Date.now() } : n)))

  const words = active ? (active.body.trim().match(/\S+/g)?.length ?? 0) : 0

  return (
    <Layout
      side={
        <>
          <div className="notes-side-head">
            <label className="search" style={{ minWidth: 0, flex: 1 }}>
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" />
            </label>
            <button className="btn btn-primary btn-icon" onClick={create} title={`Nouvelle note (${MOD}+N)`}>
              <Plus size={16} />
            </button>
          </div>
          <div className="notes-list">
            {list.map((n) => (
              <button key={n.id} className={`note-item${n.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(n.id)} style={{ ['--nc' as string]: n.color || 'transparent' }}>
                <span className="note-item-title">
                  {n.pinned && <Pin size={11} />}
                  {titleOf(n)}
                </span>
                <span className="note-item-preview">{(n.title.trim() ? n.body : n.body.split('\n').slice(1).join(' ')).trim().slice(0, 90) || ' '}</span>
                <span className="note-item-date">{relativeTime(n.updatedAt)}</span>
              </button>
            ))}
            {ready && list.length === 0 && <div className="faint notes-none">{q ? 'Aucune note ne correspond.' : 'Aucune note pour l’instant.'}</div>}
          </div>
          <div className="ui-side-foot faint notes-hint">
            <kbd>{MOD}</kbd> <kbd>Alt</kbd> <kbd>N</kbd> depuis n’importe où
          </div>
        </>
      }
    >
      {active ? (
        <div className="editor" style={{ ['--nc' as string]: active.color || 'var(--accent)' }}>
          <div className="ui-toolbar">
            <div className="colors">
              {COLORS.map((c) => (
                <button
                  key={c || 'none'}
                  className={`color${active.color === c ? ' on' : ''}`}
                  style={{ background: c || 'var(--surface-3)' }}
                  onClick={() => update({ color: c })}
                  title={c ? 'Couleur' : 'Sans couleur'}
                />
              ))}
            </div>
            <div className="spacer" />
            <span className="faint">
              {words} mot{words > 1 ? 's' : ''} · modifiée {relativeTime(active.updatedAt)}
            </span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => update({ pinned: !active.pinned })} title={active.pinned ? 'Désépingler' : 'Épingler en haut'}>
              {active.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              title="Copier le texte"
              onClick={() => void window.kit.clipboard.write(`${active.title ? active.title + '\n\n' : ''}${active.body}`).then(() => toast('Note copiée', 'success'))}
            >
              <Copy size={15} />
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setConfirmDelete(active)} title="Supprimer">
              <Trash2 size={15} />
            </button>
          </div>
          <div className="editor-body">
            <input className="editor-title" value={active.title} onChange={(e) => update({ title: e.target.value })} placeholder="Titre" />
            <textarea
              ref={bodyRef}
              className="editor-text"
              value={active.body}
              onChange={(e) => update({ body: e.target.value })}
              placeholder="Écris ici… tout est enregistré automatiquement."
              spellCheck
            />
          </div>
        </div>
      ) : (
        <Empty
          icon={<NotebookPen size={24} />}
          title="Note la moindre idée"
          action={
            <button className="btn btn-primary" onClick={create}>
              <Plus size={14} /> Nouvelle note
            </button>
          }
        >
          {MOD}+N ici, ou {MOD}+Alt+N depuis n’importe quelle app : la note s’ouvre, tu tapes, c’est enregistré.
        </Empty>
      )}

      {confirmDelete && (
        <Modal
          title="Supprimer cette note ?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                Annuler
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setNotes((all) => all.filter((n) => n.id !== confirmDelete.id))
                  setActiveId(null)
                  setConfirmDelete(null)
                }}
              >
                Supprimer
              </button>
            </>
          }
        >
          <p className="muted">« {titleOf(confirmDelete)} » sera supprimée définitivement.</p>
        </Modal>
      )}
      <Toasts />
    </Layout>
  )
}
