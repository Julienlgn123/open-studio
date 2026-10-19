import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Bold,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  FileDown,
  FileUp,
  Folder,
  FolderPlus,
  Hash,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Settings2,
  Star,
  Strikethrough,
  Table,
  Trash2,
  X
} from 'lucide-react'
import { Empty, Layout, Modal, NavItem, Segmented, Toasts, formatDate, relativeTime, toast, uid, usePersisted, usePrompt } from '@ui'
import { Markdown, checklistOf, linksOf, tagsOf } from './markdown'
import './notes.css'

interface Note {
  id: string
  title: string
  body: string
  color: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  folder?: string
  archived?: boolean
  deletedAt?: number
  reminder?: number
  favorite?: boolean
}
interface NoteFolder {
  id: string
  name: string
}
interface Prefs {
  mode: 'edit' | 'preview' | 'split'
  sort: 'updated' | 'created' | 'title' | 'color'
  fontSize: number
  mono: boolean
  zen: boolean
}
type View = { kind: 'all' } | { kind: 'pinned' } | { kind: 'favorites' } | { kind: 'reminders' } | { kind: 'archive' } | { kind: 'trash' } | { kind: 'folder'; id: string } | { kind: 'tag'; tag: string }

const COLORS = ['', '#facc15', '#fb923c', '#f87171', '#f472b6', '#a78bfa', '#60a5fa', '#34d399']
const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'
const DAY = 86_400_000
const TRASH_DAYS = 30
const DEFAULT_PREFS: Prefs = { mode: 'edit', sort: 'updated', fontSize: 15, mono: false, zen: false }

const TEMPLATES: { id: string; label: string; title: () => string; body: () => string }[] = [
  { id: 'blank', label: 'Note vide', title: () => '', body: () => '' },
  { id: 'todo', label: 'Liste de tâches', title: () => 'À faire', body: () => '- [ ] \n- [ ] \n- [ ] ' },
  { id: 'shopping', label: 'Liste de courses', title: () => 'Courses', body: () => '#courses\n\n## Frais\n- [ ] \n\n## Épicerie\n- [ ] \n\n## Maison\n- [ ] ' },
  {
    id: 'meeting',
    label: 'Compte-rendu de réunion',
    title: () => `Réunion du ${new Date().toLocaleDateString('fr-FR')}`,
    body: () => '#réunion\n\n**Présents :** \n\n## Points abordés\n- \n\n## Décisions\n- \n\n## Actions\n- [ ] … (qui, pour quand)'
  },
  {
    id: 'journal',
    label: 'Journal du jour',
    title: () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    body: () => '#journal\n\n## Aujourd’hui\n\n\n## Ce qui s’est bien passé\n- \n\n## À retenir\n- '
  },
  { id: 'idea', label: 'Idée de projet', title: () => 'Idée : ', body: () => '#idée\n\n## Le problème\n\n## La solution\n\n## Prochaines étapes\n- [ ] ' },
  {
    id: 'course',
    label: 'Fiche de révision',
    title: () => 'Fiche : ',
    body: () => '#révision\n\n## Définitions\n- **Terme** : \n\n## À retenir\n> \n\n## Questions\n- [ ] '
  }
]

/** Titre affiché : le titre, sinon la première ligne du texte. */
const titleOf = (n: Note): string => n.title.trim() || n.body.trim().split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 80) || 'Note sans titre'
const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80).trim() || 'note'
const toMarkdown = (n: Note): string => `${n.title.trim() ? `# ${n.title.trim()}\n\n` : ''}${n.body}`

export default function App(): JSX.Element {
  const [notes, setNotes, ready] = usePersisted<Note[]>('notes', [])
  const [folders, setFolders] = usePersisted<NoteFolder[]>('folders', [])
  const [prefs, setPrefs] = usePersisted<Prefs>('prefs', DEFAULT_PREFS)
  const [view, setView] = useState<View>({ kind: 'all' })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<null | { title: string; text: string; ok: string; run: () => void }>(null)
  const [reminderFor, setReminderFor] = useState<Note | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptNode, ask] = usePrompt()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const p = { ...DEFAULT_PREFS, ...prefs }

  const create = (tpl = TEMPLATES[0], extra: Partial<Note> = {}): Note => {
    const n: Note = {
      id: uid(),
      title: tpl.title(),
      body: tpl.body(),
      color: '',
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      folder: view.kind === 'folder' ? view.id : undefined,
      ...extra
    }
    if (view.kind === 'tag' && !n.body.includes(`#${view.tag}`)) n.body = `#${view.tag}\n\n${n.body}`
    setNotes((all) => [n, ...all])
    if (!['all', 'folder', 'tag'].includes(view.kind)) setView({ kind: 'all' })
    setActiveId(n.id)
    setQ('')
    setNewOpen(false)
    if (p.mode === 'preview') setPrefs({ ...p, mode: 'edit' })
    setTimeout(() => {
      const ta = bodyRef.current
      if (!ta) return
      ta.focus()
      const pos = ta.value.indexOf('- [ ] ') >= 0 ? ta.value.indexOf('- [ ] ') + 6 : ta.value.length
      ta.setSelectionRange(pos, pos)
    }, 40)
    return n
  }

  /** Note du jour : retrouvée si elle existe déjà. */
  const journal = (): void => {
    const tpl = TEMPLATES.find((t) => t.id === 'journal')!
    const title = tpl.title()
    const found = notes.find((n) => !n.deletedAt && n.title === title)
    if (found) {
      setView({ kind: 'all' })
      setActiveId(found.id)
    } else create(tpl)
  }

  // Raccourci global (Ctrl+Alt+N), rappel cliqué, et Ctrl+N dans le module.
  const readyRef = useRef(false)
  readyRef.current = ready
  useEffect(
    () =>
      window.kit.on('notes:new', () => {
        if (readyRef.current) void window.kit.invoke<boolean>('notes:takePending').then((pend) => pend && create())
      }),
    []
  )
  useEffect(() => window.kit.on('notes:open', (id: string) => (setView({ kind: 'all' }), setActiveId(id))), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (e.shiftKey) setNewOpen(true)
        else create()
      } else if (ctrl && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setPrefs((x) => ({ ...DEFAULT_PREFS, ...x, mode: x.mode === 'preview' ? 'edit' : 'preview' }))
      } else if (ctrl && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.notes-search input')?.focus()
      } else if (e.key === 'Escape' && p.zen) setPrefs({ ...p, zen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Corbeille : vidée automatiquement au bout de 30 jours. Note vide quittée : supprimée.
  useEffect(() => {
    if (!ready) return
    setNotes((all) => all.filter((n) => !(n.deletedAt && Date.now() - n.deletedAt > TRASH_DAYS * DAY)))
  }, [ready])
  useEffect(() => {
    if (ready) setNotes((all) => all.filter((n) => n.id === activeId || n.title.trim() || n.body.trim()))
  }, [activeId])

  const live = notes.filter((n) => !n.deletedAt)
  const allTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const n of live) if (!n.archived) for (const t of tagsOf(`${n.title} ${n.body}`)) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])

  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    const byView = (n: Note): boolean => {
      switch (view.kind) {
        case 'trash':
          return !!n.deletedAt
        case 'archive':
          return !n.deletedAt && !!n.archived
        default:
          if (n.deletedAt || n.archived) return false
      }
      switch (view.kind) {
        case 'pinned':
          return n.pinned
        case 'favorites':
          return !!n.favorite
        case 'reminders':
          return !!n.reminder
        case 'folder':
          return n.folder === view.id
        case 'tag':
          return tagsOf(`${n.title} ${n.body}`).includes(view.tag)
        default:
          return true
      }
    }
    const match = (n: Note): boolean => {
      if (!query) return true
      if (query.startsWith('#')) return tagsOf(`${n.title} ${n.body}`).some((t) => t.startsWith(query.slice(1)))
      return query.split(/\s+/).every((w) => n.title.toLowerCase().includes(w) || n.body.toLowerCase().includes(w))
    }
    const sorters: Record<Prefs['sort'], (a: Note, b: Note) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => titleOf(a).localeCompare(titleOf(b), 'fr'),
      color: (a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || b.updatedAt - a.updatedAt
    }
    return notes
      .filter((n) => byView(n) && match(n))
      .sort((a, b) => (view.kind === 'reminders' ? (a.reminder ?? 0) - (b.reminder ?? 0) : Number(b.pinned) - Number(a.pinned) || sorters[p.sort](a, b)))
  }, [notes, q, view, p.sort])

  useEffect(() => {
    if (!ready) return
    void window.kit.invoke<boolean>('notes:takePending').then((pend) => {
      if (pend) create()
      else if (!activeId && list.length) setActiveId(list[0].id)
    })
  }, [ready])

  const active = notes.find((n) => n.id === activeId) ?? null
  const patch = (id: string, change: Partial<Note>, touch = true): void =>
    setNotes((all) => all.map((n) => (n.id === id ? { ...n, ...change, ...(touch ? { updatedAt: Date.now() } : {}) } : n)))
  const update = (change: Partial<Note>): void => {
    if (activeId) patch(activeId, change)
  }

  const trash = (n: Note): void => {
    patch(n.id, { deletedAt: Date.now(), pinned: false }, false)
    if (n.id === activeId) setActiveId(null)
    toast('Note mise à la corbeille', 'info')
  }
  const restore = (n: Note): void => {
    patch(n.id, { deletedAt: undefined }, false)
    toast('Note restaurée', 'success')
  }
  const duplicate = (n: Note): void => {
    const copy = { ...n, id: uid(), title: `${titleOf(n)} (copie)`, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), reminder: undefined }
    setNotes((all) => [copy, ...all])
    setActiveId(copy.id)
  }

  // ───── Mise en forme dans l'éditeur ─────
  const edit = (fn: (text: string, s: number, e: number) => [string, number, number]): void => {
    const ta = bodyRef.current
    if (!ta || !active) return
    const [text, s, e] = fn(ta.value, ta.selectionStart, ta.selectionEnd)
    update({ body: text })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s, e)
    })
  }
  const wrap = (before: string, after = before, placeholder = 'texte'): void =>
    edit((t, s, e) => {
      const sel = t.slice(s, e) || placeholder
      return [t.slice(0, s) + before + sel + after + t.slice(e), s + before.length, s + before.length + sel.length]
    })
  const linePrefix = (prefix: string): void =>
    edit((t, s, e) => {
      const ls = t.lastIndexOf('\n', s - 1) + 1
      const le = t.indexOf('\n', e) === -1 ? t.length : t.indexOf('\n', e)
      const block = t.slice(ls, le)
      const lines = block.split('\n')
      const has = lines.every((l) => l.startsWith(prefix))
      const next = lines.map((l, i) => (has ? l.slice(prefix.length) : (prefix === '1. ' ? `${i + 1}. ` : prefix) + l)).join('\n')
      return [t.slice(0, ls) + next + t.slice(le), ls, ls + next.length]
    })
  const insert = (text: string): void => edit((t, s, e) => [t.slice(0, s) + text + t.slice(e), s + text.length, s + text.length])

  /** Entrée dans une liste : continue la liste (puce, numéro, case à cocher). */
  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const ta = e.currentTarget
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 'b') return e.preventDefault(), wrap('**')
    if (ctrl && e.key.toLowerCase() === 'i') return e.preventDefault(), wrap('*')
    if (ctrl && e.key.toLowerCase() === 'k') return e.preventDefault(), wrap('[', '](https://)', 'lien')
    if (ctrl && e.key === 'Enter') return e.preventDefault(), linePrefix('- [ ] ')
    if (e.key === 'Tab') {
      e.preventDefault()
      return edit((t, s, en) => {
        const ls = t.lastIndexOf('\n', s - 1) + 1
        if (e.shiftKey) return t.slice(ls, ls + 2) === '  ' ? [t.slice(0, ls) + t.slice(ls + 2), Math.max(ls, s - 2), Math.max(ls, en - 2)] : [t, s, en]
        return [t.slice(0, ls) + '  ' + t.slice(ls), s + 2, en + 2]
      })
    }
    if (e.key !== 'Enter' || e.shiftKey) return
    const s = ta.selectionStart
    const t = ta.value
    const ls = t.lastIndexOf('\n', s - 1) + 1
    const line = t.slice(ls, s)
    const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)[.)] |> )/)
    if (!m) return
    e.preventDefault()
    if (line.trim() === m[2].trim()) {
      // Ligne de liste vide : on sort de la liste.
      edit((tx) => [tx.slice(0, ls) + tx.slice(s), ls, ls])
      return
    }
    const next = m[3] ? `${Number(m[3]) + 1}. ` : m[2].replace(/\[[xX]\]/, '[ ]')
    insert(`\n${m[1]}${next}`)
  }

  const toggleLine = (lineNo: number): void => {
    if (!active) return
    const lines = active.body.split('\n')
    const l = lines[lineNo]
    if (!l) return
    lines[lineNo] = /\[[xX]\]/.test(l) ? l.replace(/\[[xX]\]/, '[ ]') : l.replace('[ ]', '[x]')
    update({ body: lines.join('\n') })
  }
  const openLink = (title: string): void => {
    const t = title.trim().toLowerCase()
    const found = live.find((n) => titleOf(n).toLowerCase() === t)
    if (found) {
      setView({ kind: 'all' })
      setActiveId(found.id)
    } else create(TEMPLATES[0], { title: title.trim() })
  }
  const mdHandlers = {
    onToggle: toggleLine,
    onWikiLink: openLink,
    onTag: (tag: string) => setView({ kind: 'tag', tag }),
    onLink: (url: string) => void window.kit.openExternal(url)
  }
  const backlinks = active ? live.filter((n) => n.id !== active.id && linksOf(n.body).includes(titleOf(active).toLowerCase())) : []

  // ───── Import / export ─────
  const exportNote = async (n: Note): Promise<void> => {
    const path = await window.kit.files.save({
      title: 'Exporter la note',
      defaultPath: `${safeName(titleOf(n))}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Texte', extensions: ['txt'] }
      ]
    })
    if (!path) return
    await window.kit.files.writeText(path, path.endsWith('.txt') ? `${n.title ? `${n.title}\n\n` : ''}${n.body}` : toMarkdown(n))
    toast('Note exportée', 'success')
  }
  const exportAll = async (): Promise<void> => {
    const [dir] = await window.kit.files.open({ title: 'Dossier où exporter toutes les notes', directory: true })
    if (!dir) return
    const used = new Set<string>()
    for (const n of live) {
      let name = safeName(titleOf(n))
      while (used.has(name.toLowerCase())) name += '-'
      used.add(name.toLowerCase())
      await window.kit.files.writeText(`${dir}/${name}.md`, toMarkdown(n))
    }
    toast(`${live.length} notes exportées en Markdown`, 'success')
  }
  const importFiles = async (): Promise<void> => {
    const paths = await window.kit.files.open({ title: 'Importer des notes', multi: true, filters: [{ name: 'Notes', extensions: ['md', 'txt', 'markdown'] }] })
    if (!paths.length) return
    const created: Note[] = []
    for (const path of paths) {
      const text = await window.kit.files.readText(path)
      const m = text.match(/^#\s+(.+)\n+/)
      const name = path.split(/[\\/]/).pop()!.replace(/\.(md|txt|markdown)$/i, '')
      created.push({
        id: uid(),
        title: m ? m[1].trim() : name,
        body: m ? text.slice(m[0].length) : text,
        color: '',
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        folder: view.kind === 'folder' ? view.id : undefined
      })
    }
    setNotes((all) => [...created, ...all])
    setActiveId(created[0].id)
    toast(`${created.length} note${created.length > 1 ? 's' : ''} importée${created.length > 1 ? 's' : ''}`, 'success')
  }

  // ───── Carnets ─────
  const addFolder = async (): Promise<void> => {
    const name = await ask('Nouveau carnet')
    if (!name) return
    const f = { id: uid(), name: name.trim() }
    setFolders((all) => [...all, f])
    setView({ kind: 'folder', id: f.id })
  }
  const renameFolder = async (f: NoteFolder): Promise<void> => {
    const name = await ask('Renommer le carnet', f.name)
    if (name) setFolders((all) => all.map((x) => (x.id === f.id ? { ...x, name: name.trim() } : x)))
  }
  const deleteFolder = (f: NoteFolder): void =>
    setConfirm({
      title: `Supprimer le carnet « ${f.name} » ?`,
      text: 'Ses notes ne sont pas supprimées : elles retournent dans « Toutes les notes ».',
      ok: 'Supprimer le carnet',
      run: () => {
        setFolders((all) => all.filter((x) => x.id !== f.id))
        setNotes((all) => all.map((n) => (n.folder === f.id ? { ...n, folder: undefined } : n)))
        setView({ kind: 'all' })
      }
    })

  const counts = {
    all: live.filter((n) => !n.archived).length,
    pinned: live.filter((n) => n.pinned && !n.archived).length,
    favorites: live.filter((n) => n.favorite && !n.archived).length,
    reminders: live.filter((n) => n.reminder && !n.archived).length,
    archive: live.filter((n) => n.archived).length,
    trash: notes.filter((n) => n.deletedAt).length
  }
  const viewTitle =
    view.kind === 'folder'
      ? folders.find((f) => f.id === view.id)?.name ?? 'Carnet'
      : view.kind === 'tag'
        ? `#${view.tag}`
        : { all: 'Toutes les notes', pinned: 'Épinglées', favorites: 'Favoris', reminders: 'Rappels', archive: 'Archives', trash: 'Corbeille' }[view.kind]

  const words = active ? (active.body.trim().match(/\S+/g)?.length ?? 0) : 0
  const [done, total] = active ? checklistOf(active.body) : [0, 0]
  const inTrash = !!active?.deletedAt
  const isView = (v: View): boolean => JSON.stringify(v) === JSON.stringify(view)

  const side = (
    <>
      <div className="notes-new">
        <button className="btn btn-primary" onClick={() => create()} title={`Nouvelle note (${MOD}+N)`}>
          <Plus size={15} /> Nouvelle note
        </button>
        <button className="btn btn-primary btn-icon" onClick={() => setNewOpen(true)} title={`À partir d’un modèle (${MOD}+Maj+N)`}>
          <ChevronDown size={15} />
        </button>
      </div>
      <NavItem icon={<NotebookPen size={15} />} label="Toutes les notes" count={counts.all || undefined} active={isView({ kind: 'all' })} onClick={() => setView({ kind: 'all' })} />
      <NavItem icon={<Pin size={15} />} label="Épinglées" count={counts.pinned || undefined} active={isView({ kind: 'pinned' })} onClick={() => setView({ kind: 'pinned' })} />
      <NavItem icon={<Star size={15} />} label="Favoris" count={counts.favorites || undefined} active={isView({ kind: 'favorites' })} onClick={() => setView({ kind: 'favorites' })} />
      <NavItem icon={<Bell size={15} />} label="Rappels" count={counts.reminders || undefined} active={isView({ kind: 'reminders' })} onClick={() => setView({ kind: 'reminders' })} />
      <NavItem icon={<CalendarDays size={15} />} label="Note du jour" onClick={journal} />

      <div className="ui-side-section side-section-row">
        Carnets
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void addFolder()} title="Nouveau carnet">
          <FolderPlus size={13} />
        </button>
      </div>
      {folders.map((f) => (
        <NavItem
          key={f.id}
          icon={<Folder size={15} />}
          label={f.name}
          count={live.filter((n) => n.folder === f.id && !n.archived).length || undefined}
          active={isView({ kind: 'folder', id: f.id })}
          onClick={() => setView({ kind: 'folder', id: f.id })}
          onContextMenu={(e) => {
            e.preventDefault()
            void renameFolder(f)
          }}
        />
      ))}
      {!folders.length && <p className="faint side-hint">Range tes notes par thème (cours, perso, travail…).</p>}

      {allTags.length > 0 && (
        <>
          <div className="ui-side-section">Étiquettes</div>
          <div className="tag-cloud">
            {allTags.slice(0, 30).map(([t, c]) => (
              <button key={t} className={`chip tag-chip${isView({ kind: 'tag', tag: t }) ? ' on' : ''}`} onClick={() => setView({ kind: 'tag', tag: t })}>
                #{t} <span className="faint">{c}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="ui-side-foot">
        <NavItem icon={<Archive size={15} />} label="Archives" count={counts.archive || undefined} active={isView({ kind: 'archive' })} onClick={() => setView({ kind: 'archive' })} />
        <NavItem icon={<Trash2 size={15} />} label="Corbeille" count={counts.trash || undefined} active={isView({ kind: 'trash' })} onClick={() => setView({ kind: 'trash' })} />
        <NavItem icon={<Settings2 size={15} />} label="Réglages et export" onClick={() => setSettingsOpen(true)} />
      </div>
    </>
  )

  return (
    <Layout side={p.zen ? undefined : side}>
      <div className="notes-main">
        {!p.zen && (
          <div className="notes-col">
            <div className="notes-col-head">
              <div className="notes-col-title">
                <b>{viewTitle}</b>
                {view.kind === 'folder' && (
                  <span className="ui-row">
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void renameFolder(folders.find((f) => f.id === view.id)!)} title="Renommer">
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => deleteFolder(folders.find((f) => f.id === view.id)!)} title="Supprimer le carnet">
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
                {view.kind === 'trash' && counts.trash > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setConfirm({
                        title: 'Vider la corbeille ?',
                        text: `${counts.trash} note${counts.trash > 1 ? 's' : ''} seront supprimées définitivement.`,
                        ok: 'Vider',
                        run: () => {
                          setNotes((all) => all.filter((n) => !n.deletedAt))
                          setActiveId(null)
                        }
                      })
                    }
                  >
                    Vider
                  </button>
                )}
              </div>
              <label className="search notes-search">
                <Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (ou #étiquette)" />
                {q && (
                  <button className="btn-icon clear" onClick={() => setQ('')}>
                    <X size={12} />
                  </button>
                )}
              </label>
              <select className="select select-sm" value={p.sort} onChange={(e) => setPrefs({ ...p, sort: e.target.value as Prefs['sort'] })}>
                <option value="updated">Modifiées récemment</option>
                <option value="created">Créées récemment</option>
                <option value="title">Par titre (A → Z)</option>
                <option value="color">Par couleur</option>
              </select>
            </div>
            <div className="notes-list">
              {list.map((n) => {
                const [d, t] = checklistOf(n.body)
                return (
                  <button key={n.id} className={`note-item${n.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(n.id)} style={{ ['--nc' as string]: n.color || 'transparent' }}>
                    <span className="note-item-title">
                      {n.pinned && <Pin size={11} />}
                      {n.favorite && <Star size={11} />}
                      {titleOf(n)}
                    </span>
                    <span className="note-item-preview">
                      {(n.title.trim() ? n.body : n.body.split('\n').slice(1).join(' '))
                        .replace(/[#*_`>~=[\]]/g, '')
                        .trim()
                        .slice(0, 90) || ' '}
                    </span>
                    <span className="note-item-meta">
                      <span>{n.deletedAt ? `supprimée ${relativeTime(n.deletedAt)}` : relativeTime(n.updatedAt)}</span>
                      {t > 0 && (
                        <span className={d === t ? 'meta-done' : ''}>
                          <CheckSquare size={10} /> {d}/{t}
                        </span>
                      )}
                      {n.reminder && (
                        <span className={n.reminder < Date.now() ? 'meta-late' : ''}>
                          <Bell size={10} /> {formatDate(n.reminder, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {n.folder && view.kind !== 'folder' && (
                        <span>
                          <Folder size={10} /> {folders.find((f) => f.id === n.folder)?.name}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
              {ready && list.length === 0 && (
                <div className="faint notes-none">
                  {q ? 'Aucune note ne correspond.' : view.kind === 'trash' ? `La corbeille est vide. Les notes y restent ${TRASH_DAYS} jours.` : 'Aucune note ici pour l’instant.'}
                </div>
              )}
            </div>
            <div className="faint notes-hint">
              <kbd>{MOD}</kbd> <kbd>Alt</kbd> <kbd>N</kbd> depuis n’importe où
            </div>
          </div>
        )}

        {active ? (
          <div className="editor" style={{ ['--nc' as string]: active.color || 'var(--accent)', ['--fs' as string]: `${p.fontSize}px` }}>
            <div className="ui-toolbar">
              {inTrash ? (
                <>
                  <span className="faint">Cette note est dans la corbeille.</span>
                  <div className="spacer" />
                  <button className="btn btn-secondary btn-sm" onClick={() => restore(active)}>
                    <RotateCcw size={13} /> Restaurer
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() =>
                      setConfirm({
                        title: 'Supprimer définitivement ?',
                        text: `« ${titleOf(active)} » sera effacée pour de bon.`,
                        ok: 'Supprimer',
                        run: () => {
                          setNotes((all) => all.filter((n) => n.id !== active.id))
                          setActiveId(null)
                        }
                      })
                    }
                  >
                    <Trash2 size={13} /> Supprimer
                  </button>
                </>
              ) : (
                <>
                  <div className="colors">
                    {COLORS.map((c) => (
                      <button key={c || 'none'} className={`color${active.color === c ? ' on' : ''}`} style={{ background: c || 'var(--surface-3)' }} onClick={() => update({ color: c })} title={c ? 'Couleur' : 'Sans couleur'} />
                    ))}
                  </div>
                  <select className="select select-sm folder-select" value={active.folder ?? ''} onChange={(e) => update({ folder: e.target.value || undefined })} title="Carnet">
                    <option value="">Sans carnet</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <div className="spacer" />
                  <Segmented
                    value={p.mode}
                    onChange={(mode) => setPrefs({ ...p, mode })}
                    options={[
                      { id: 'edit', label: <Pencil size={13} /> },
                      { id: 'split', label: <Columns2 size={13} /> },
                      { id: 'preview', label: <Eye size={13} /> }
                    ]}
                  />
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => update({ pinned: !active.pinned })} title={active.pinned ? 'Désépingler' : 'Épingler en haut'}>
                    {active.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button className={`btn btn-ghost btn-sm btn-icon${active.favorite ? ' fav' : ''}`} onClick={() => update({ favorite: !active.favorite })} title="Favori">
                    <Star size={15} />
                  </button>
                  <button className={`btn btn-ghost btn-sm btn-icon${active.reminder ? ' fav' : ''}`} onClick={() => setReminderFor(active)} title="Me rappeler cette note">
                    <Bell size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" title="Copier le texte" onClick={() => void window.kit.clipboard.write(toMarkdown(active)).then(() => toast('Note copiée', 'success'))}>
                    <Copy size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" title="Dupliquer" onClick={() => duplicate(active)}>
                    <BookOpen size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" title="Exporter (.md / .txt)" onClick={() => void exportNote(active)}>
                    <Download size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" title={active.archived ? 'Désarchiver' : 'Archiver'} onClick={() => update({ archived: !active.archived })}>
                    {active.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => trash(active)} title="Mettre à la corbeille">
                    <Trash2 size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPrefs({ ...p, zen: !p.zen })} title="Mode concentration (Échap pour sortir)">
                    {p.zen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </>
              )}
            </div>
            {p.mode !== 'preview' && !inTrash && (
              <div className="format-bar">
                <button onClick={() => linePrefix('## ')} title="Titre">
                  <Heading2 size={14} />
                </button>
                <button onClick={() => wrap('**')} title={`Gras (${MOD}+B)`}>
                  <Bold size={14} />
                </button>
                <button onClick={() => wrap('*')} title={`Italique (${MOD}+I)`}>
                  <Italic size={14} />
                </button>
                <button onClick={() => wrap('~~')} title="Barré">
                  <Strikethrough size={14} />
                </button>
                <button onClick={() => wrap('==')} title="Surligner">
                  <span className="hl-icon">A</span>
                </button>
                <span className="sep" />
                <button onClick={() => linePrefix('- ')} title="Liste à puces">
                  <List size={14} />
                </button>
                <button onClick={() => linePrefix('1. ')} title="Liste numérotée">
                  <ListOrdered size={14} />
                </button>
                <button onClick={() => linePrefix('- [ ] ')} title={`Case à cocher (${MOD}+Entrée)`}>
                  <CheckSquare size={14} />
                </button>
                <button onClick={() => linePrefix('> ')} title="Citation">
                  <Quote size={14} />
                </button>
                <button onClick={() => wrap('`')} title="Code">
                  <Code size={14} />
                </button>
                <button onClick={() => insert('\n| Colonne 1 | Colonne 2 |\n| --- | --- |\n|  |  |\n')} title="Tableau">
                  <Table size={14} />
                </button>
                <span className="sep" />
                <button onClick={() => wrap('[', '](https://)', 'lien')} title={`Lien (${MOD}+K)`}>
                  <Link2 size={14} />
                </button>
                <button onClick={() => wrap('[[', ']]', 'Titre d’une note')} title="Lien vers une autre note">
                  <span className="txt-icon">[[ ]]</span>
                </button>
                <button onClick={() => insert('#')} title="Étiquette">
                  <Hash size={14} />
                </button>
                <button onClick={() => insert(new Date().toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))} title="Insérer la date et l’heure">
                  <CalendarDays size={14} />
                </button>
              </div>
            )}
            <div className={`editor-body mode-${inTrash ? 'preview' : p.mode}`}>
              <input className="editor-title" value={active.title} onChange={(e) => update({ title: e.target.value })} placeholder="Titre" readOnly={inTrash} />
              <div className="editor-panes">
                {p.mode !== 'preview' && !inTrash && (
                  <textarea
                    ref={bodyRef}
                    className={`editor-text${p.mono ? ' mono' : ''}`}
                    value={active.body}
                    onChange={(e) => update({ body: e.target.value })}
                    onKeyDown={onBodyKey}
                    placeholder={'Écris ici… tout est enregistré automatiquement.\n\n- [ ] une case à cocher\n#étiquette  ·  [[lien vers une autre note]]  ·  **gras**'}
                    spellCheck
                  />
                )}
                {(p.mode !== 'edit' || inTrash) && (
                  <div className="editor-preview" onDoubleClick={() => p.mode === 'preview' && !inTrash && setPrefs({ ...p, mode: 'edit' })}>
                    {active.body.trim() ? <Markdown source={active.body} handlers={mdHandlers} /> : <p className="faint">Rien à afficher. Double-clic pour écrire.</p>}
                  </div>
                )}
              </div>
              {backlinks.length > 0 && (
                <div className="backlinks">
                  <span className="faint">Mentionnée dans :</span>
                  {backlinks.map((n) => (
                    <button key={n.id} className="chip" onClick={() => setActiveId(n.id)}>
                      {titleOf(n)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="editor-foot faint">
              <span>
                {words} mot{words > 1 ? 's' : ''} · {active.body.length} caractères · {Math.max(1, Math.round(words / 200))} min de lecture
              </span>
              {total > 0 && (
                <span className="progress-inline">
                  <span className="bar">
                    <span style={{ width: `${(done / total) * 100}%` }} />
                  </span>
                  {done}/{total} fait{done > 1 ? 's' : ''}
                </span>
              )}
              {active.reminder && (
                <span>
                  <Bell size={11} /> {formatDate(active.reminder, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <span className="spacer" />
              <span>Créée {relativeTime(active.createdAt)} · modifiée {relativeTime(active.updatedAt)}</span>
            </div>
          </div>
        ) : (
          <Empty
            icon={<NotebookPen size={24} />}
            title="Note la moindre idée"
            action={
              <div className="ui-row">
                <button className="btn btn-primary" onClick={() => create()}>
                  <Plus size={14} /> Nouvelle note
                </button>
                <button className="btn btn-secondary" onClick={() => setNewOpen(true)}>
                  Depuis un modèle
                </button>
              </div>
            }
          >
            {MOD}+N ici, ou {MOD}+Alt+N depuis n’importe quelle app. Markdown, cases à cocher, #étiquettes, [[liens entre notes]] et rappels.
          </Empty>
        )}
      </div>

      {newOpen && (
        <Modal title="Nouvelle note depuis un modèle" onClose={() => setNewOpen(false)}>
          <div className="tpl-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="tpl" onClick={() => create(t)}>
                <b>{t.label}</b>
                <span className="faint">{t.body().replace(/[#*\-[\]]/g, '').trim().slice(0, 60) || 'Page blanche'}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {reminderFor && (
        <ReminderModal
          note={reminderFor}
          onClose={() => setReminderFor(null)}
          onSet={(at) => {
            patch(reminderFor.id, { reminder: at }, false)
            setReminderFor(null)
            if (at) toast(`Rappel le ${formatDate(at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`, 'success')
          }}
        />
      )}
      {settingsOpen && (
        <Modal title="Réglages et export" onClose={() => setSettingsOpen(false)}>
          <div className="ui-col settings">
            <label className="ui-row">
              <span style={{ flex: 1 }}>Taille du texte</span>
              <input type="range" min={12} max={22} value={p.fontSize} onChange={(e) => setPrefs({ ...p, fontSize: Number(e.target.value) })} />
              <b>{p.fontSize}px</b>
            </label>
            <label className="ui-row">
              <input type="checkbox" checked={p.mono} onChange={(e) => setPrefs({ ...p, mono: e.target.checked })} /> Police à chasse fixe dans l’éditeur
            </label>
            <hr />
            <button className="btn btn-secondary" onClick={() => void exportAll()}>
              <FileDown size={14} /> Exporter toutes les notes (.md)
            </button>
            <button className="btn btn-secondary" onClick={() => void importFiles()}>
              <FileUp size={14} /> Importer des fichiers .md / .txt
            </button>
            <p className="faint">
              {live.length} notes · {folders.length} carnets · {allTags.length} étiquettes
            </p>
            <hr />
            <div className="shortcuts">
              <span>Nouvelle note / depuis un modèle</span>
              <kbd>
                {MOD}+N · {MOD}+Maj+N
              </kbd>
              <span>Basculer écriture / aperçu</span>
              <kbd>{MOD}+E</kbd>
              <span>Rechercher</span>
              <kbd>{MOD}+F</kbd>
              <span>Gras · italique · lien</span>
              <kbd>
                {MOD}+B · {MOD}+I · {MOD}+K
              </kbd>
              <span>Case à cocher</span>
              <kbd>{MOD}+Entrée</kbd>
              <span>Indenter / désindenter</span>
              <kbd>Tab · Maj+Tab</kbd>
            </div>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                Annuler
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  confirm.run()
                  setConfirm(null)
                }}
              >
                {confirm.ok}
              </button>
            </>
          }
        >
          <p className="muted">{confirm.text}</p>
        </Modal>
      )}
      {promptNode}
      <Toasts />
    </Layout>
  )
}

function ReminderModal({ note, onClose, onSet }: { note: Note; onClose: () => void; onSet: (at: number | undefined) => void }): JSX.Element {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const local = (t: number): string => {
    const d = new Date(t)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [value, setValue] = useState(local(note.reminder ?? Date.now() + 3_600_000))
  const at = (h: number, dayOffset = 0): number => {
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    d.setHours(h, 0, 0, 0)
    return d.getTime()
  }
  const quick: [string, number][] = [
    ['Dans 1 heure', Date.now() + 3_600_000],
    ['Ce soir 19 h', at(19)],
    ['Demain 9 h', at(9, 1)],
    ['Dans une semaine', at(9, 7)]
  ]
  return (
    <Modal
      title={
        <>
          <Bell size={15} /> Me rappeler « {titleOf(note)} »
        </>
      }
      onClose={onClose}
      footer={
        <>
          {note.reminder && (
            <button className="btn btn-ghost" onClick={() => onSet(undefined)}>
              <BellOff size={14} /> Retirer le rappel
            </button>
          )}
          <button className="btn btn-primary" onClick={() => onSet(new Date(value).getTime())}>
            Programmer
          </button>
        </>
      }
    >
      <div className="ui-row wrap">
        {quick
          .filter(([, t]) => t > Date.now())
          .map(([label, t]) => (
            <button key={label} className="btn btn-secondary btn-sm" onClick={() => onSet(t)}>
              {label}
            </button>
          ))}
      </div>
      <input className="input" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} style={{ marginTop: 12 }} />
      <p className="faint" style={{ marginTop: 8 }}>
        Une notification apparaît à l’heure dite, même si les notes ne sont pas ouvertes (Open Studio doit tourner).
      </p>
    </Modal>
  )
}
