import { useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import { Code2, Copy, Plus, Search, Star, Tag, Trash2 } from 'lucide-react'
import { Empty, Layout, Modal, NavItem, SideTitle, Toasts, relativeTime, toast, uid, usePersisted } from '@ui'
import 'highlight.js/styles/github-dark.css'
import './snippets.css'

interface Snippet {
  id: string
  title: string
  lang: string
  code: string
  tags: string[]
  fav: boolean
  updatedAt: number
}

const LANGS: [string, string][] = [
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['bash', 'Bash / Shell'],
  ['powershell', 'PowerShell'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['json', 'JSON'],
  ['sql', 'SQL'],
  ['java', 'Java'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['php', 'PHP'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['yaml', 'YAML'],
  ['markdown', 'Markdown'],
  ['plaintext', 'Texte']
]
const hlLang = (l: string): string => (l === 'html' ? 'xml' : l === 'powershell' ? 'bash' : l)

function highlight(code: string, lang: string): string {
  try {
    return hljs.highlight(code || ' ', { language: hlLang(lang), ignoreIllegals: true }).value
  } catch {
    return code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  }
}

/** Langage probable d'un bout de code collé (pour ne pas avoir à le choisir). */
function guess(code: string): string {
  const r = hljs.highlightAuto(code, LANGS.map(([l]) => hlLang(l)).filter((l) => l !== 'plaintext'))
  const found = r.language === 'xml' ? 'html' : r.language
  return LANGS.some(([l]) => l === found) ? found! : 'plaintext'
}

type Filter = { kind: 'all' } | { kind: 'fav' } | { kind: 'lang'; lang: string } | { kind: 'tag'; tag: string }

export default function App(): JSX.Element {
  const [items, setItems, ready] = usePersisted<Snippet[]>('snippets', [])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [del, setDel] = useState<Snippet | null>(null)

  const create = (code = ''): void => {
    const s: Snippet = { id: uid(), title: '', lang: code ? guess(code) : 'javascript', code, tags: [], fav: false, updatedAt: Date.now() }
    setItems((all) => [s, ...all])
    setActiveId(s.id)
  }

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

  const langs = useMemo(() => [...new Set(items.map((s) => s.lang))].sort(), [items])
  const tags = useMemo(() => [...new Set(items.flatMap((s) => s.tags))].sort(), [items])
  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    return items
      .filter((s) => (filter.kind === 'fav' ? s.fav : filter.kind === 'lang' ? s.lang === filter.lang : filter.kind === 'tag' ? s.tags.includes(filter.tag) : true))
      .filter((s) => !query || s.title.toLowerCase().includes(query) || s.code.toLowerCase().includes(query) || s.tags.some((t) => t.includes(query)))
      .sort((a, b) => Number(b.fav) - Number(a.fav) || b.updatedAt - a.updatedAt)
  }, [items, q, filter])

  useEffect(() => {
    if (ready && !activeId && list[0]) setActiveId(list[0].id)
  }, [ready])

  const active = items.find((s) => s.id === activeId) ?? null
  const update = (p: Partial<Snippet>): void => setItems((all) => all.map((s) => (s.id === activeId ? { ...s, ...p, updatedAt: Date.now() } : s)))
  const is = (f: Filter): boolean => JSON.stringify(f) === JSON.stringify(filter)

  return (
    <Layout
      side={
        <>
          <SideTitle>Snippets</SideTitle>
          <NavItem icon={<Code2 size={15} />} label="Tous" count={items.length} active={is({ kind: 'all' })} onClick={() => setFilter({ kind: 'all' })} />
          <NavItem icon={<Star size={15} />} label="Favoris" count={items.filter((s) => s.fav).length || undefined} active={is({ kind: 'fav' })} onClick={() => setFilter({ kind: 'fav' })} />
          {langs.length > 0 && <div className="ui-side-section">Langages</div>}
          {langs.map((l) => (
            <NavItem key={l} icon={<span className={`lang-dot l-${l}`} />} label={LANGS.find(([x]) => x === l)?.[1] ?? l} count={items.filter((s) => s.lang === l).length} active={is({ kind: 'lang', lang: l })} onClick={() => setFilter({ kind: 'lang', lang: l })} />
          ))}
          {tags.length > 0 && <div className="ui-side-section">Étiquettes</div>}
          {tags.map((t) => (
            <NavItem key={t} icon={<Tag size={13} />} label={t} active={is({ kind: 'tag', tag: t })} onClick={() => setFilter({ kind: 'tag', tag: t })} />
          ))}
        </>
      }
    >
      <div className="snip">
        <div className="snip-list">
          <div className="snip-list-head">
            <label className="search" style={{ minWidth: 0, flex: 1 }}>
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (titre, code, étiquette)" />
            </label>
            <button className="btn btn-primary btn-icon" onClick={() => create()} title="Nouveau snippet (Ctrl+N)">
              <Plus size={16} />
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm paste"
            onClick={() =>
              void window.kit.clipboard.read().then((t) => {
                if (t.trim()) create(t)
                else toast('Le presse-papiers est vide.', 'info')
              })
            }
          >
            Créer depuis le presse-papiers
          </button>
          {list.map((s) => (
            <button key={s.id} className={`snip-item${s.id === activeId ? ' on' : ''}`} onClick={() => setActiveId(s.id)}>
              <span className="snip-item-title">
                {s.fav && <Star size={11} fill="currentColor" />} {s.title || 'Sans titre'}
              </span>
              <code>{s.code.split('\n').find((l) => l.trim())?.slice(0, 60) ?? ''}</code>
              <span className="faint snip-meta">
                <span className={`lang-dot l-${s.lang}`} /> {LANGS.find(([x]) => x === s.lang)?.[1]} · {relativeTime(s.updatedAt)}
              </span>
            </button>
          ))}
        </div>

        {active ? (
          <div className="snip-edit">
            <div className="ui-toolbar">
              <input className="title-input" value={active.title} onChange={(e) => update({ title: e.target.value })} placeholder="Titre du snippet" />
              <select className="select" style={{ width: 150 }} value={active.lang} onChange={(e) => update({ lang: e.target.value })}>
                {LANGS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button className={`btn btn-sm btn-icon ${active.fav ? 'on' : 'btn-ghost'}`} onClick={() => update({ fav: !active.fav })} title="Favori">
                <Star size={15} fill={active.fav ? 'currentColor' : 'none'} />
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => void window.kit.clipboard.write(active.code).then(() => toast('Code copié', 'success'))}>
                <Copy size={14} /> Copier
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDel(active)} title="Supprimer">
                <Trash2 size={15} />
              </button>
            </div>
            <TagsInput tags={active.tags} onChange={(tags) => update({ tags })} />
            <CodeEditor code={active.code} lang={active.lang} onChange={(code) => update({ code })} />
          </div>
        ) : (
          <Empty icon={<Code2 size={24} />} title="Range tes bouts de code" action={<button className="btn btn-primary" onClick={() => create()}><Plus size={14} /> Nouveau snippet</button>}>
            Commandes, requêtes SQL, fonctions utiles… retrouve-les en tapant deux lettres, copie en un clic.
          </Empty>
        )}
      </div>

      {del && (
        <Modal
          title="Supprimer ce snippet ?"
          onClose={() => setDel(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDel(null)}>
                Annuler
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setItems((all) => all.filter((s) => s.id !== del.id))
                  setActiveId(null)
                  setDel(null)
                }}
              >
                Supprimer
              </button>
            </>
          }
        >
          <p className="muted">« {del.title || 'Sans titre'} » sera supprimé définitivement.</p>
        </Modal>
      )}
      <Toasts />
    </Layout>
  )
}

/** Zone de code colorée : un textarea transparent posé sur le rendu coloré. */
function CodeEditor({ code, lang, onChange }: { code: string; lang: string; onChange: (c: string) => void }): JSX.Element {
  const pre = useRef<HTMLPreElement>(null)
  const html = useMemo(() => highlight(code, lang) + '\n', [code, lang])
  return (
    <div className="code">
      <div className="gutter">
        {code.split('\n').map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="code-stack">
        <pre ref={pre} className="hljs" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          value={code}
          spellCheck={false}
          placeholder="Colle ou écris ton code ici…"
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (pre.current) {
              pre.current.scrollTop = e.currentTarget.scrollTop
              pre.current.scrollLeft = e.currentTarget.scrollLeft
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const t = e.currentTarget
              const { selectionStart: a, selectionEnd: b } = t
              onChange(code.slice(0, a) + '  ' + code.slice(b))
              requestAnimationFrame(() => (t.selectionStart = t.selectionEnd = a + 2))
            }
          }}
        />
      </div>
    </div>
  )
}

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }): JSX.Element {
  const [v, setV] = useState('')
  return (
    <div className="tags">
      <Tag size={13} className="faint" />
      {tags.map((t) => (
        <span key={t} className="chip accent">
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input
        value={v}
        placeholder={tags.length ? '' : 'Ajouter une étiquette (Entrée)'}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && v.trim()) {
            e.preventDefault()
            const t = v.trim().toLowerCase()
            if (!tags.includes(t)) onChange([...tags, t])
            setV('')
          } else if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1))
        }}
      />
    </div>
  )
}
