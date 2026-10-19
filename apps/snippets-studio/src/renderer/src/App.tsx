import { useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import {
  Braces,
  ClipboardPaste,
  Clock,
  Code2,
  Copy,
  CopyPlus,
  Download,
  FileCode2,
  FileDown,
  FileUp,
  Flame,
  Play,
  Plus,
  Search,
  Settings2,
  Star,
  Tag,
  Trash2,
  Variable,
  WrapText,
  X
} from 'lucide-react'
import { Empty, Layout, Modal, NavItem, SideTitle, Toasts, relativeTime, toast, uid, useFileDrop, usePersisted, usePrompt } from '@ui'
import 'highlight.js/styles/github-dark.css'
import './snippets.css'

interface SnippetFile {
  id: string
  name: string
  lang: string
  code: string
}
interface Snippet {
  id: string
  title: string
  /** Premier fichier (gardé pour les anciennes versions du module). */
  lang: string
  code: string
  tags: string[]
  fav: boolean
  updatedAt: number
  createdAt?: number
  files?: SnippetFile[]
  notes?: string
  uses?: number
  lastUsed?: number
  vars?: Record<string, string>
}
interface Prefs {
  wrap: boolean
  fontSize: number
  sort: 'recent' | 'used' | 'title'
}

const LANGS: [string, string, string][] = [
  ['javascript', 'JavaScript', 'js'],
  ['typescript', 'TypeScript', 'ts'],
  ['python', 'Python', 'py'],
  ['bash', 'Bash / Shell', 'sh'],
  ['powershell', 'PowerShell', 'ps1'],
  ['html', 'HTML', 'html'],
  ['css', 'CSS', 'css'],
  ['json', 'JSON', 'json'],
  ['sql', 'SQL', 'sql'],
  ['java', 'Java', 'java'],
  ['kotlin', 'Kotlin', 'kt'],
  ['c', 'C', 'c'],
  ['cpp', 'C++', 'cpp'],
  ['csharp', 'C#', 'cs'],
  ['php', 'PHP', 'php'],
  ['go', 'Go', 'go'],
  ['rust', 'Rust', 'rs'],
  ['ruby', 'Ruby', 'rb'],
  ['swift', 'Swift', 'swift'],
  ['lua', 'Lua', 'lua'],
  ['yaml', 'YAML', 'yml'],
  ['xml', 'XML', 'xml'],
  ['ini', 'INI / config', 'ini'],
  ['dockerfile', 'Dockerfile', 'dockerfile'],
  ['makefile', 'Makefile', 'mk'],
  ['diff', 'Diff', 'diff'],
  ['markdown', 'Markdown', 'md'],
  ['plaintext', 'Texte', 'txt']
]
const EXT_ALIASES: Record<string, string> = { jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', tsx: 'typescript', htm: 'html', yaml: 'yaml', h: 'c', hpp: 'cpp', cc: 'cpp', zsh: 'bash', bat: 'powershell', cmd: 'powershell', toml: 'ini', conf: 'ini', env: 'ini' }
const langLabel = (l: string): string => LANGS.find(([x]) => x === l)?.[1] ?? l
const langExt = (l: string): string => LANGS.find(([x]) => x === l)?.[2] ?? 'txt'
const langFromName = (name: string): string | null => {
  const lower = name.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'makefile') return 'makefile'
  const ext = lower.split('.').pop() ?? ''
  return EXT_ALIASES[ext] ?? LANGS.find(([, , e]) => e === ext)?.[0] ?? null
}
const hlLang = (l: string): string => (l === 'html' ? 'xml' : l === 'powershell' ? 'bash' : l)
const COMMENT: Record<string, [string, string?]> = {
  python: ['# '],
  bash: ['# '],
  powershell: ['# '],
  yaml: ['# '],
  ruby: ['# '],
  dockerfile: ['# '],
  makefile: ['# '],
  ini: ['; '],
  sql: ['-- '],
  lua: ['-- '],
  html: ['<!-- ', ' -->'],
  xml: ['<!-- ', ' -->'],
  css: ['/* ', ' */'],
  markdown: ['<!-- ', ' -->']
}
const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'
const DEFAULT_PREFS: Prefs = { wrap: false, fontSize: 13, sort: 'recent' }
const VAR_RE = /\{\{\s*([\wÀ-ſ-]+)(?:\s*:\s*([^}]*))?\s*\}\}/g

function highlight(code: string, lang: string): string {
  try {
    if (!hljs.getLanguage(hlLang(lang))) throw new Error('inconnu')
    return hljs.highlight(code || ' ', { language: hlLang(lang), ignoreIllegals: true }).value
  } catch {
    return code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  }
}

/** Langage probable d'un bout de code collé (pour ne pas avoir à le choisir). */
function guess(code: string): string {
  const r = hljs.highlightAuto(code, LANGS.map(([l]) => hlLang(l)).filter((l) => l !== 'plaintext' && hljs.getLanguage(l)))
  const found = r.language === 'xml' && /<(html|div|body|span|p|a)\b/i.test(code) ? 'html' : r.language
  return LANGS.some(([l]) => l === found) ? found! : 'plaintext'
}

/** Tous les fichiers d'un snippet (les anciens snippets n'en ont qu'un, implicite). */
const filesOf = (s: Snippet): SnippetFile[] => (s.files?.length ? s.files : [{ id: 'main', name: '', lang: s.lang, code: s.code }])
const allCode = (s: Snippet): string => filesOf(s).map((f) => f.code).join('\n')
const varsOf = (code: string): { name: string; def: string }[] => {
  const seen = new Map<string, string>()
  for (const m of code.matchAll(VAR_RE)) if (!seen.has(m[1])) seen.set(m[1], (m[2] ?? '').trim())
  return [...seen].map(([name, def]) => ({ name, def }))
}
const fillVars = (code: string, values: Record<string, string>): string => code.replace(VAR_RE, (_, n: string, d?: string) => values[n] ?? (d ?? '').trim())

type Filter = { kind: 'all' } | { kind: 'fav' } | { kind: 'used' } | { kind: 'recent' } | { kind: 'lang'; lang: string } | { kind: 'tag'; tag: string }

export default function App(): JSX.Element {
  const [items, setItems, ready] = usePersisted<Snippet[]>('snippets', [])
  const [prefs, setPrefs] = usePersisted<Prefs>('prefs', DEFAULT_PREFS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fileId, setFileId] = useState<string>('main')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [del, setDel] = useState<Snippet | null>(null)
  const [varsFor, setVarsFor] = useState<Snippet | null>(null)
  const [run, setRun] = useState<{ kind: 'js' | 'html'; code: string } | null>(null)
  const [settings, setSettings] = useState(false)
  const [promptNode, ask] = usePrompt()
  const searchRef = useRef<HTMLInputElement>(null)
  const p = { ...DEFAULT_PREFS, ...prefs }

  const create = (code = '', extra: Partial<Snippet> = {}): void => {
    const lang = extra.lang ?? (code ? guess(code) : 'javascript')
    const s: Snippet = { id: uid(), title: '', lang, code, tags: [], fav: false, updatedAt: Date.now(), createdAt: Date.now(), ...extra }
    if (filter.kind === 'tag') s.tags = [...new Set([...s.tags, filter.tag])]
    setItems((all) => [s, ...all])
    setActiveId(s.id)
    setFileId('main')
  }

  // Ctrl+Alt+S depuis n'importe où : Open Studio s'ouvre ici, recherche prête.
  useEffect(
    () =>
      window.kit.on('snippets:search', () => {
        setQ('')
        setTimeout(() => searchRef.current?.focus(), 50)
      }),
    []
  )
  useEffect(() => {
    void window.kit.invoke<boolean>('snippets:takePending').then((pend) => pend && setTimeout(() => searchRef.current?.focus(), 50))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        create()
      } else if (ctrl && e.key.toLowerCase() === 'f' && !(e.target as HTMLElement).closest('.code')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const langs = useMemo(() => [...new Set(items.flatMap((s) => filesOf(s).map((f) => f.lang)))].sort(), [items])
  const tags = useMemo(() => {
    const c = new Map<string, number>()
    items.forEach((s) => s.tags.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1)))
    return [...c].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hay = (s: Snippet): string => `${s.title} ${s.tags.join(' ')} ${s.notes ?? ''} ${filesOf(s).map((f) => `${f.name} ${f.code}`).join(' ')}`.toLowerCase()
    const sorted = items
      .filter((s) => {
        switch (filter.kind) {
          case 'fav':
            return s.fav
          case 'used':
            return (s.uses ?? 0) > 0
          case 'recent':
            return Date.now() - s.updatedAt < 7 * 86_400_000
          case 'lang':
            return filesOf(s).some((f) => f.lang === filter.lang)
          case 'tag':
            return s.tags.includes(filter.tag)
          default:
            return true
        }
      })
      .filter((s) => !words.length || words.every((w) => hay(s).includes(w)))
    const by: Record<Prefs['sort'], (a: Snippet, b: Snippet) => number> = {
      recent: (a, b) => b.updatedAt - a.updatedAt,
      used: (a, b) => (b.uses ?? 0) - (a.uses ?? 0) || (b.lastUsed ?? 0) - (a.lastUsed ?? 0),
      title: (a, b) => (a.title || '~').localeCompare(b.title || '~', 'fr')
    }
    return sorted.sort((a, b) => Number(b.fav) - Number(a.fav) || (filter.kind === 'used' ? by.used(a, b) : by[p.sort](a, b)))
  }, [items, q, filter, p.sort])

  useEffect(() => {
    if (ready && !activeId && list[0]) setActiveId(list[0].id)
  }, [ready])

  const active = items.find((s) => s.id === activeId) ?? null
  const files = active ? filesOf(active) : []
  const file = files.find((f) => f.id === fileId) ?? files[0]
  const update = (patch: Partial<Snippet>): void => setItems((all) => all.map((s) => (s.id === activeId ? { ...s, ...patch, updatedAt: Date.now() } : s)))
  /** Modifie un fichier ; le premier reste aussi dans code/lang (compatibilité). */
  const updateFile = (patch: Partial<SnippetFile>): void => {
    if (!active || !file) return
    const next = files.map((f) => (f.id === file.id ? { ...f, ...patch } : f))
    update({ files: next.length > 1 || active.files ? next : undefined, code: next[0].code, lang: next[0].lang })
  }
  const addFile = async (): Promise<void> => {
    if (!active) return
    const name = await ask('Nom du fichier', `fichier${files.length + 1}.${langExt(file?.lang ?? 'javascript')}`)
    if (!name) return
    const f: SnippetFile = { id: uid(), name: name.trim(), lang: langFromName(name) ?? file?.lang ?? 'plaintext', code: '' }
    const base = files.map((x, i) => (i === 0 && !x.name ? { ...x, id: x.id === 'main' ? uid() : x.id, name: `principal.${langExt(x.lang)}` } : x))
    update({ files: [...base, f] })
    setFileId(f.id)
  }
  const removeFile = (id: string): void => {
    if (!active || files.length < 2) return
    const next = files.filter((f) => f.id !== id)
    update({ files: next, code: next[0].code, lang: next[0].lang })
    setFileId(next[0].id)
  }
  const renameFile = async (f: SnippetFile): Promise<void> => {
    const name = await ask('Renommer le fichier', f.name)
    if (!name) return
    const lang = langFromName(name)
    if (!active) return
    const next = files.map((x) => (x.id === f.id ? { ...x, name: name.trim(), lang: lang ?? x.lang } : x))
    update({ files: next, code: next[0].code, lang: next[0].lang })
  }

  /** Copie (avec remplissage des {{variables}} s'il y en a). */
  const copy = async (s: Snippet, text?: string): Promise<void> => {
    const code = text ?? (file && s.id === active?.id ? file.code : filesOf(s)[0].code)
    if (text === undefined && varsOf(code).length) return setVarsFor(s)
    await window.kit.clipboard.write(code)
    setItems((all) => all.map((x) => (x.id === s.id ? { ...x, uses: (x.uses ?? 0) + 1, lastUsed: Date.now() } : x)))
    toast('Code copié', 'success')
  }

  const duplicate = (s: Snippet): void => {
    const c: Snippet = { ...s, id: uid(), title: `${s.title || 'Sans titre'} (copie)`, fav: false, uses: 0, lastUsed: undefined, updatedAt: Date.now(), createdAt: Date.now(), files: s.files?.map((f) => ({ ...f, id: uid() })) }
    setItems((all) => [c, ...all])
    setActiveId(c.id)
  }

  const exportFile = async (): Promise<void> => {
    if (!active || !file) return
    const name = file.name || `${(active.title || 'snippet').replace(/[\\/:*?"<>|]+/g, '-')}.${langExt(file.lang)}`
    const path = await window.kit.files.save({ title: 'Enregistrer le fichier', defaultPath: name })
    if (!path) return
    await window.kit.files.writeText(path, file.code)
    toast('Fichier enregistré', 'success')
  }
  const exportAll = async (): Promise<void> => {
    const path = await window.kit.files.save({ title: 'Exporter la collection', defaultPath: 'snippets.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!path) return
    await window.kit.files.writeText(path, JSON.stringify({ app: 'snippets-studio', version: 1, snippets: items }, null, 2))
    toast(`${items.length} snippets exportés`, 'success')
  }
  const importPaths = async (paths: string[]): Promise<void> => {
    let n = 0
    for (const path of paths) {
      const name = path.split(/[\\/]/).pop()!
      const text = await window.kit.files.readText(path)
      if (name.toLowerCase().endsWith('.json')) {
        try {
          const data = JSON.parse(text) as { snippets?: Snippet[] }
          if (Array.isArray(data.snippets)) {
            const known = new Set(items.map((s) => s.id))
            const fresh = data.snippets.filter((s) => s && typeof s.code === 'string').map((s) => (known.has(s.id) ? { ...s, id: uid() } : s))
            setItems((all) => [...fresh, ...all])
            n += fresh.length
            continue
          }
        } catch {
          /* pas une collection : importé comme simple fichier */
        }
      }
      create(text, { title: name, lang: langFromName(name) ?? guess(text) })
      n++
    }
    if (n) toast(`${n} snippet${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`, 'success')
  }
  const importFiles = async (): Promise<void> => {
    const paths = await window.kit.files.open({ title: 'Importer des fichiers de code ou une collection .json', multi: true })
    if (paths.length) await importPaths(paths)
  }
  const drop = useFileDrop((paths) => void importPaths(paths))

  const formatJson = (): void => {
    if (!file) return
    try {
      updateFile({ code: JSON.stringify(JSON.parse(file.code), null, 2) })
    } catch (e) {
      toast(`JSON invalide : ${(e as Error).message}`, 'error')
    }
  }

  const is = (f: Filter): boolean => JSON.stringify(f) === JSON.stringify(filter)
  const vars = file ? varsOf(file.code) : []
  const canRun = file && (file.lang === 'javascript' || file.lang === 'html')

  return (
    <Layout
      side={
        <>
          <SideTitle>Snippets</SideTitle>
          <NavItem icon={<Code2 size={15} />} label="Tous" count={items.length} active={is({ kind: 'all' })} onClick={() => setFilter({ kind: 'all' })} />
          <NavItem icon={<Star size={15} />} label="Favoris" count={items.filter((s) => s.fav).length || undefined} active={is({ kind: 'fav' })} onClick={() => setFilter({ kind: 'fav' })} />
          <NavItem icon={<Flame size={15} />} label="Les plus utilisés" active={is({ kind: 'used' })} onClick={() => setFilter({ kind: 'used' })} />
          <NavItem icon={<Clock size={15} />} label="Modifiés cette semaine" active={is({ kind: 'recent' })} onClick={() => setFilter({ kind: 'recent' })} />
          {langs.length > 0 && <div className="ui-side-section">Langages</div>}
          {langs.map((l) => (
            <NavItem key={l} icon={<span className={`lang-dot l-${l}`} />} label={langLabel(l)} count={items.filter((s) => filesOf(s).some((f) => f.lang === l)).length} active={is({ kind: 'lang', lang: l })} onClick={() => setFilter({ kind: 'lang', lang: l })} />
          ))}
          {tags.length > 0 && <div className="ui-side-section">Étiquettes</div>}
          {tags.map(([t, c]) => (
            <NavItem key={t} icon={<Tag size={13} />} label={t} count={c} active={is({ kind: 'tag', tag: t })} onClick={() => setFilter({ kind: 'tag', tag: t })} />
          ))}
          <div className="ui-side-foot">
            <NavItem icon={<Settings2 size={15} />} label="Réglages, import, export" onClick={() => setSettings(true)} />
            <p className="faint side-hint">
              <kbd>{MOD}</kbd> <kbd>Alt</kbd> <kbd>S</kbd> : chercher un snippet depuis n’importe où
            </p>
          </div>
        </>
      }
    >
      <div className="snip">
        <div className={`snip-list${drop.over ? ' drop' : ''}`} {...drop.bind}>
          <div className="snip-list-head">
            <label className="search" style={{ minWidth: 0, flex: 1 }}>
              <Search size={14} />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (titre, code, étiquette)"
                onKeyDown={(e) => {
                  // Entrée dans la recherche : copie le premier résultat (le plus rapide).
                  if (e.key === 'Enter' && list[0]) {
                    setActiveId(list[0].id)
                    void copy(list[0])
                  }
                }}
              />
            </label>
            <button className="btn btn-primary btn-icon" onClick={() => create()} title={`Nouveau snippet (${MOD}+N)`}>
              <Plus size={16} />
            </button>
          </div>
          <div className="ui-row list-tools">
            <button
              className="btn btn-ghost btn-sm paste"
              onClick={() =>
                void window.kit.clipboard.read().then((t) => {
                  if (t.trim()) create(t)
                  else toast('Le presse-papiers est vide.', 'info')
                })
              }
            >
              <ClipboardPaste size={13} /> Depuis le presse-papiers
            </button>
            <select className="select select-sm" value={p.sort} onChange={(e) => setPrefs({ ...p, sort: e.target.value as Prefs['sort'] })} title="Trier">
              <option value="recent">Récents</option>
              <option value="used">Plus utilisés</option>
              <option value="title">A → Z</option>
            </select>
          </div>
          {list.map((s) => {
            const fs = filesOf(s)
            return (
              <button key={s.id} className={`snip-item${s.id === activeId ? ' on' : ''}`} onClick={() => (setActiveId(s.id), setFileId(fs[0].id))} onDoubleClick={() => void copy(s)} title="Double-clic pour copier">
                <span className="snip-item-title">
                  {s.fav && <Star size={11} fill="currentColor" />} {s.title || 'Sans titre'}
                </span>
                <code>{fs[0].code.split('\n').find((l) => l.trim())?.slice(0, 60) ?? ''}</code>
                <span className="faint snip-meta">
                  <span className={`lang-dot l-${fs[0].lang}`} /> {langLabel(fs[0].lang)}
                  {fs.length > 1 && ` + ${fs.length - 1} fichier${fs.length > 2 ? 's' : ''}`} · {relativeTime(s.updatedAt)}
                  {(s.uses ?? 0) > 0 && <span className="uses">· copié {s.uses}×</span>}
                </span>
              </button>
            )
          })}
          {ready && !list.length && <p className="faint none">{q ? 'Aucun résultat.' : 'Rien ici. Glisse des fichiers de code dans cette colonne pour les importer.'}</p>}
        </div>

        {active && file ? (
          <div className="snip-edit">
            <div className="ui-toolbar">
              <input className="title-input" value={active.title} onChange={(e) => update({ title: e.target.value })} placeholder="Titre du snippet" />
              <select className="select" style={{ width: 150 }} value={file.lang} onChange={(e) => updateFile({ lang: e.target.value })}>
                {LANGS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button className={`btn btn-sm btn-icon ${active.fav ? 'on' : 'btn-ghost'}`} onClick={() => update({ fav: !active.fav })} title="Favori">
                <Star size={15} fill={active.fav ? 'currentColor' : 'none'} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => duplicate(active)} title="Dupliquer">
                <CopyPlus size={15} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void exportFile()} title="Enregistrer ce fichier sur le disque">
                <Download size={15} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDel(active)} title="Supprimer">
                <Trash2 size={15} />
              </button>
              {canRun && (
                <button className="btn btn-secondary btn-sm" onClick={() => setRun({ kind: file.lang === 'html' ? 'html' : 'js', code: fillVars(file.code, active.vars ?? {}) })} title="Exécuter dans un bac à sable isolé">
                  <Play size={14} /> {file.lang === 'html' ? 'Aperçu' : 'Exécuter'}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => void copy(active)}>
                {vars.length ? <Variable size={14} /> : <Copy size={14} />} {vars.length ? 'Remplir et copier' : 'Copier'}
              </button>
            </div>
            <TagsInput tags={active.tags} onChange={(t) => update({ tags: t })} suggestions={tags.map(([t]) => t)} />
            <div className="file-tabs">
              {files.map((f) => (
                <button key={f.id} className={`file-tab${f.id === file.id ? ' on' : ''}`} onClick={() => setFileId(f.id)} onDoubleClick={() => files.length > 1 && void renameFile(f)} title={files.length > 1 ? 'Double-clic pour renommer' : undefined}>
                  <span className={`lang-dot l-${f.lang}`} />
                  {f.name || (files.length > 1 ? 'principal' : langLabel(f.lang))}
                  {files.length > 1 && (
                    <span
                      className="close"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(f.id)
                      }}
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>
              ))}
              <button className="file-tab add" onClick={() => void addFile()} title="Ajouter un fichier à ce snippet (ex. HTML + CSS + JS)">
                <FileCode2 size={13} /> Fichier
              </button>
              <div className="spacer" />
              {file.lang === 'json' && (
                <button className="btn btn-ghost btn-sm" onClick={formatJson}>
                  <Braces size={13} /> Mettre en forme
                </button>
              )}
              <button className={`btn btn-sm btn-icon ${p.wrap ? 'on' : 'btn-ghost'}`} onClick={() => setPrefs({ ...p, wrap: !p.wrap })} title="Retour à la ligne automatique">
                <WrapText size={14} />
              </button>
            </div>
            <CodeEditor key={`${active.id}-${file.id}`} code={file.code} lang={file.lang} wrap={p.wrap} fontSize={p.fontSize} onChange={(code) => updateFile({ code })} />
            <div className="snip-foot">
              <textarea className="notes-input" value={active.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} placeholder="Notes : à quoi ça sert, d’où ça vient, comment l’utiliser…" rows={2} />
              <div className="faint foot-meta">
                {file.code.split('\n').length} lignes · {file.code.length} caractères
                {vars.length > 0 && (
                  <span>
                    · variables : {vars.map((v) => `{{${v.name}}}`).join(', ')}
                  </span>
                )}
                {(active.uses ?? 0) > 0 && <span>· copié {active.uses} fois, la dernière {relativeTime(active.lastUsed ?? 0)}</span>}
                {!vars.length && <span className="tip">Astuce : écris {'{{nom}}'} ou {'{{port:3000}}'} dans le code pour le remplir au moment de copier.</span>}
              </div>
            </div>
          </div>
        ) : (
          <Empty
            icon={<Code2 size={24} />}
            title="Range tes bouts de code"
            action={
              <div className="ui-row">
                <button className="btn btn-primary" onClick={() => create()}>
                  <Plus size={14} /> Nouveau snippet
                </button>
                <button className="btn btn-secondary" onClick={() => void importFiles()}>
                  <FileUp size={14} /> Importer
                </button>
              </div>
            }
          >
            Commandes, requêtes SQL, fonctions utiles… retrouve-les en tapant deux lettres, copie en un clic. Les {'{{variables}}'} se remplissent au moment de copier.
          </Empty>
        )}
      </div>

      {varsFor && <VarsModal snippet={varsFor} code={varsFor.id === active?.id && file ? file.code : filesOf(varsFor)[0].code} onClose={() => setVarsFor(null)} onDone={(text, values) => {
        setItems((all) => all.map((x) => (x.id === varsFor.id ? { ...x, vars: values } : x)))
        void copy(varsFor, text)
        setVarsFor(null)
      }} />}
      {run && <RunModal kind={run.kind} code={run.code} files={active ? filesOf(active) : []} onClose={() => setRun(null)} />}
      {settings && (
        <Modal title="Réglages, import et export" onClose={() => setSettings(false)}>
          <div className="ui-col">
            <label className="ui-row">
              <span style={{ flex: 1 }}>Taille du code</span>
              <input type="range" min={11} max={20} value={p.fontSize} onChange={(e) => setPrefs({ ...p, fontSize: Number(e.target.value) })} />
              <b>{p.fontSize}px</b>
            </label>
            <button className="btn btn-secondary" onClick={() => void exportAll()}>
              <FileDown size={14} /> Exporter toute la collection (.json)
            </button>
            <button className="btn btn-secondary" onClick={() => void importFiles()}>
              <FileUp size={14} /> Importer une collection ou des fichiers de code
            </button>
            <p className="faint">
              {items.length} snippets · {langs.length} langages · {tags.length} étiquettes. Tu peux aussi glisser des fichiers dans la liste.
            </p>
            <div className="shortcuts">
              <span>Chercher depuis n’importe où</span>
              <kbd>{MOD}+Alt+S</kbd>
              <span>Copier le 1er résultat</span>
              <kbd>Entrée dans la recherche</kbd>
              <span>Nouveau snippet</span>
              <kbd>{MOD}+N</kbd>
              <span>Commenter / décommenter</span>
              <kbd>{MOD}+/</kbd>
              <span>Dupliquer la ligne</span>
              <kbd>{MOD}+D</kbd>
              <span>Indenter / désindenter</span>
              <kbd>Tab · Maj+Tab</kbd>
            </div>
          </div>
        </Modal>
      )}
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
      {promptNode}
      <Toasts />
    </Layout>
  )
}

function VarsModal({ snippet, code, onClose, onDone }: { snippet: Snippet; code: string; onClose: () => void; onDone: (text: string, values: Record<string, string>) => void }): JSX.Element {
  const vars = varsOf(code)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(vars.map((v) => [v.name, snippet.vars?.[v.name] ?? v.def])))
  const out = fillVars(code, values)
  return (
    <Modal
      title={
        <>
          <Variable size={15} /> Remplir « {snippet.title || 'Sans titre'} »
        </>
      }
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={() => onDone(out, values)}>
            <Copy size={14} /> Copier
          </button>
        </>
      }
    >
      <div className="vars-grid">
        {vars.map((v, i) => (
          <label key={v.name} className="field">
            <span className="field-label">{v.name}</span>
            <input
              className="input"
              autoFocus={i === 0}
              value={values[v.name] ?? ''}
              placeholder={v.def}
              onChange={(e) => setValues({ ...values, [v.name]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onDone(out, values)}
            />
          </label>
        ))}
      </div>
      <pre className="vars-preview">{out}</pre>
    </Modal>
  )
}

/** Exécute du JavaScript ou affiche du HTML dans un cadre isolé (aucun accès à l'app ni aux fichiers). */
function RunModal({ kind, code, files, onClose }: { kind: 'js' | 'html'; code: string; files: SnippetFile[]; onClose: () => void }): JSX.Element {
  const [logs, setLogs] = useState<{ level: string; text: string }[]>([])
  const token = useMemo(() => uid(), [])
  useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      const d = e.data as { token?: string; level?: string; text?: string }
      if (d?.token === token) setLogs((l) => [...l, { level: d.level ?? 'log', text: d.text ?? '' }].slice(-300))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [token])
  const bridge = `<script>(function(){var T=${JSON.stringify(token)};function f(v){try{return typeof v==='string'?v:JSON.stringify(v,null,2)}catch(e){return String(v)}}
['log','info','warn','error'].forEach(function(l){var o=console[l];console[l]=function(){parent.postMessage({token:T,level:l,text:[].map.call(arguments,f).join(' ')},'*');o&&o.apply(console,arguments)}});
window.onerror=function(m,s,li){parent.postMessage({token:T,level:'error',text:m+(li?' (ligne '+li+')':'')},'*')};
window.onunhandledrejection=function(e){parent.postMessage({token:T,level:'error',text:'Promesse rejetée : '+f(e.reason)},'*')};})()</script>`
  // Snippet multi-fichiers : le CSS et le JS des autres fichiers sont injectés dans la page HTML.
  const css = files.filter((f) => f.lang === 'css').map((f) => f.code).join('\n')
  const js = files.filter((f) => f.lang === 'javascript').map((f) => f.code).join('\n;\n')
  const doc =
    kind === 'html'
      ? `${bridge}<style>${css}</style>${code}${js && !code.includes(js) ? `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>` : ''}`
      : `<!doctype html><meta charset="utf-8">${bridge}<script>(async function(){try{${code.replace(/<\/script/gi, '<\\/script')}\n}catch(e){console.error(e&&e.stack||String(e))}})()</script>`
  return (
    <Modal
      title={
        <>
          <Play size={15} /> {kind === 'html' ? 'Aperçu HTML' : 'Exécution JavaScript'}
        </>
      }
      onClose={onClose}
      width={820}
    >
      <iframe className={`run-frame ${kind}`} sandbox="allow-scripts allow-modals" srcDoc={doc} title="Bac à sable" />
      <div className="console">
        <div className="console-head faint">
          Console {logs.length > 0 && `(${logs.length})`}
          {logs.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setLogs([])}>
              Effacer
            </button>
          )}
        </div>
        {logs.map((l, i) => (
          <pre key={i} className={`log ${l.level}`}>
            {l.text}
          </pre>
        ))}
        {!logs.length && <p className="faint">{kind === 'js' ? 'Les console.log() s’affichent ici.' : 'Rien dans la console.'}</p>}
      </div>
    </Modal>
  )
}

/** Zone de code colorée : un textarea transparent posé sur le rendu coloré. */
function CodeEditor({ code, lang, wrap, fontSize, onChange }: { code: string; lang: string; wrap: boolean; fontSize: number; onChange: (c: string) => void }): JSX.Element {
  const pre = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const html = useMemo(() => highlight(code, lang) + '\n', [code, lang])

  const apply = (t: HTMLTextAreaElement, next: string, s: number, e = s): void => {
    onChange(next)
    requestAnimationFrame(() => {
      t.selectionStart = s
      t.selectionEnd = e
    })
  }
  const lineRange = (t: HTMLTextAreaElement): [number, number] => {
    const ls = code.lastIndexOf('\n', t.selectionStart - 1) + 1
    const le0 = code.indexOf('\n', Math.max(t.selectionStart, t.selectionEnd - 1))
    return [ls, le0 === -1 ? code.length : le0]
  }
  const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const t = e.currentTarget
    const { selectionStart: a, selectionEnd: b } = t
    const ctrl = e.ctrlKey || e.metaKey
    if (e.key === 'Tab') {
      e.preventDefault()
      const [ls, le] = lineRange(t)
      if (a === b && !e.shiftKey) return apply(t, code.slice(0, a) + '  ' + code.slice(b), a + 2)
      const block = code.slice(ls, le)
      const next = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ')
      return apply(t, code.slice(0, ls) + next + code.slice(le), ls, ls + next.length)
    }
    if (e.key === 'Enter') {
      // Garde l'indentation, et l'augmente après { [ ( ou :
      e.preventDefault()
      const ls = code.lastIndexOf('\n', a - 1) + 1
      const indent = code.slice(ls, a).match(/^\s*/)?.[0] ?? ''
      const before = code.slice(0, a).trimEnd().slice(-1)
      const after = code.slice(b).trimStart()[0]
      const extra = /[{[(:]/.test(before) ? '  ' : ''
      if (extra && after && PAIRS[before] === after) {
        const ins = `\n${indent}${extra}\n${indent}`
        return apply(t, code.slice(0, a) + ins + code.slice(b), a + indent.length + extra.length + 1)
      }
      const ins = `\n${indent}${extra}`
      return apply(t, code.slice(0, a) + ins + code.slice(b), a + ins.length)
    }
    if (ctrl && e.key === '/') {
      e.preventDefault()
      const [open, close = ''] = COMMENT[lang] ?? ['// ']
      const [ls, le] = lineRange(t)
      const lines = code.slice(ls, le).split('\n')
      const all = lines.every((l) => !l.trim() || l.trimStart().startsWith(open.trim()))
      const next = lines
        .map((l) => {
          if (!l.trim()) return l
          if (all) {
            const ind = l.match(/^\s*/)![0]
            let rest = l.slice(ind.length).replace(open.trim(), '').replace(/^ /, '')
            if (close) rest = rest.replace(close.trim(), '').trimEnd()
            return ind + rest
          }
          const ind = l.match(/^\s*/)![0]
          return ind + open + l.slice(ind.length) + close
        })
        .join('\n')
      return apply(t, code.slice(0, ls) + next + code.slice(le), ls, ls + next.length)
    }
    if (ctrl && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      const [ls, le] = lineRange(t)
      const block = code.slice(ls, le)
      return apply(t, code.slice(0, le) + '\n' + block + code.slice(le), a + block.length + 1, b + block.length + 1)
    }
    // Fermeture automatique des parenthèses, crochets, guillemets.
    if (PAIRS[e.key] && !ctrl) {
      if (a !== b) {
        e.preventDefault()
        return apply(t, code.slice(0, a) + e.key + code.slice(a, b) + PAIRS[e.key] + code.slice(b), a + 1, b + 1)
      }
      const next = code[a]
      if ((e.key === '"' || e.key === "'" || e.key === '`') && next === e.key) {
        e.preventDefault()
        return apply(t, code, a + 1)
      }
      if (!next || /[\s)\]};,]/.test(next)) {
        if ((e.key === "'" || e.key === '"') && /\w/.test(code[a - 1] ?? '')) return
        e.preventDefault()
        return apply(t, code.slice(0, a) + e.key + PAIRS[e.key] + code.slice(b), a + 1)
      }
    }
    if ((e.key === ')' || e.key === ']' || e.key === '}') && a === b && code[a] === e.key) {
      e.preventDefault()
      return apply(t, code, a + 1)
    }
    if (e.key === 'Backspace' && a === b && a > 0 && PAIRS[code[a - 1]] === code[a]) {
      e.preventDefault()
      return apply(t, code.slice(0, a - 1) + code.slice(a + 1), a - 1)
    }
  }

  return (
    <div className={`code${wrap ? ' wrap' : ''}`} style={{ ['--code-fs' as string]: `${fontSize}px` }}>
      {!wrap && (
        <div className="gutter" ref={gutter}>
          {code.split('\n').map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
      )}
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
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
          }}
          onKeyDown={onKey}
        />
      </div>
    </div>
  )
}

function TagsInput({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }): JSX.Element {
  const [v, setV] = useState('')
  const sugg = v.trim() ? suggestions.filter((s) => s.startsWith(v.trim().toLowerCase()) && !tags.includes(s)).slice(0, 5) : []
  const add = (t: string): void => {
    const x = t.trim().toLowerCase()
    if (x && !tags.includes(x)) onChange([...tags, x])
    setV('')
  }
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
            add(v)
          } else if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1))
        }}
      />
      {sugg.map((s) => (
        <button key={s} className="chip sugg" onClick={() => add(s)}>
          + {s}
        </button>
      ))}
    </div>
  )
}
