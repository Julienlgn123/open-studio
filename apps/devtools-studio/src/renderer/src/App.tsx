import { useEffect, useMemo, useState } from 'react'
import { Binary, Braces, CalendarClock, CaseSensitive, Clock, Code, Copy, FileDiff, Fingerprint, Globe2, Hash, Image, KeyRound, Link, LockKeyhole, Palette, QrCode, Regex, Repeat2, Search, Shield, Star, Text } from 'lucide-react'
import { Layout, NavItem, Page, Segmented, SideTitle, Toasts, toast, usePersisted } from '@ui'
import { ChmodTool, ConvertTool, CronTool, DiffTool, HtmlEntitiesTool, HttpCodesTool, ImageB64Tool, LoremTool, PasswordTool, QrTool } from './more'
import './devtools.css'

type Tool =
  | 'json'
  | 'base64'
  | 'url'
  | 'hash'
  | 'regex'
  | 'color'
  | 'uuid'
  | 'time'
  | 'jwt'
  | 'text'
  | 'password'
  | 'diff'
  | 'convert'
  | 'qr'
  | 'imgb64'
  | 'entities'
  | 'cron'
  | 'chmod'
  | 'http'
  | 'lorem'
const TOOLS: { id: Tool; label: string; icon: JSX.Element; cat: string; keywords?: string }[] = [
  { id: 'json', label: 'JSON', icon: <Braces size={15} />, cat: 'Données', keywords: 'formater valider minifier' },
  { id: 'convert', label: 'JSON ⇄ YAML ⇄ CSV', icon: <Repeat2 size={15} />, cat: 'Données', keywords: 'typescript interface tableur excel' },
  { id: 'diff', label: 'Comparer deux textes', icon: <FileDiff size={15} />, cat: 'Données', keywords: 'différence diff' },
  { id: 'regex', label: 'Regex', icon: <Regex size={15} />, cat: 'Données', keywords: 'expression régulière' },
  { id: 'base64', label: 'Base64', icon: <Binary size={15} />, cat: 'Encodage' },
  { id: 'imgb64', label: 'Image ⇄ Base64', icon: <Image size={15} />, cat: 'Encodage', keywords: 'data uri' },
  { id: 'url', label: 'URL', icon: <Link size={15} />, cat: 'Encodage', keywords: 'encoder décoder paramètres' },
  { id: 'entities', label: 'Entités HTML', icon: <Code size={15} />, cat: 'Encodage', keywords: 'amp lt gt' },
  { id: 'qr', label: 'QR code', icon: <QrCode size={15} />, cat: 'Encodage', keywords: 'wifi contact' },
  { id: 'password', label: 'Mots de passe', icon: <LockKeyhole size={15} />, cat: 'Sécurité', keywords: 'générateur pin phrase' },
  { id: 'hash', label: 'Hash', icon: <Hash size={15} />, cat: 'Sécurité', keywords: 'md5 sha256' },
  { id: 'jwt', label: 'JWT', icon: <KeyRound size={15} />, cat: 'Sécurité', keywords: 'jeton token' },
  { id: 'uuid', label: 'UUID', icon: <Fingerprint size={15} />, cat: 'Sécurité', keywords: 'identifiant guid' },
  { id: 'chmod', label: 'Permissions Unix', icon: <Shield size={15} />, cat: 'Système', keywords: 'chmod droits linux' },
  { id: 'cron', label: 'Expression cron', icon: <CalendarClock size={15} />, cat: 'Système', keywords: 'planification tâche' },
  { id: 'time', label: 'Horodatage', icon: <Clock size={15} />, cat: 'Système', keywords: 'timestamp unix date' },
  { id: 'http', label: 'Codes HTTP', icon: <Globe2 size={15} />, cat: 'Web', keywords: '404 500 statut' },
  { id: 'color', label: 'Couleurs', icon: <Palette size={15} />, cat: 'Web', keywords: 'hex rgb hsl' },
  { id: 'text', label: 'Texte', icon: <CaseSensitive size={15} />, cat: 'Texte', keywords: 'majuscules compter' },
  { id: 'lorem', label: 'Faux texte', icon: <Text size={15} />, cat: 'Texte', keywords: 'lorem ipsum' }
]
const CATS = ['Données', 'Encodage', 'Sécurité', 'Système', 'Web', 'Texte']

const copy = (s: string): void => void window.kit.clipboard.write(s).then(() => toast('Copié', 'success'))

function Out({ value, error, mono = true }: { value: string; error?: string | null; mono?: boolean }): JSX.Element {
  return (
    <div className="out">
      {error ? <div className="out-error">{error}</div> : <pre className={mono ? 'mono' : ''}>{value || <span className="faint">—</span>}</pre>}
      {value && !error && (
        <button className="btn btn-ghost btn-sm btn-icon copy" onClick={() => copy(value)} title="Copier">
          <Copy size={13} />
        </button>
      )}
    </div>
  )
}

// UTF-8 sûr (btoa/atob seuls cassent les accents).
const b64enc = (s: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const b64dec = (s: string): string => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')), (c) => c.charCodeAt(0)))

export default function App(): JSX.Element {
  const [tool, setTool] = usePersisted<Tool>('tool', 'json')
  const [favs, setFavs] = usePersisted<Tool[]>('favs', [])
  const [q, setQ] = useState('')
  const t = TOOLS.find((x) => x.id === tool) ?? TOOLS[0]
  const match = (x: (typeof TOOLS)[number]): boolean => !q || `${x.label} ${x.keywords ?? ''} ${x.cat}`.toLowerCase().includes(q.toLowerCase())
  const item = (x: (typeof TOOLS)[number]): JSX.Element => <NavItem key={x.id} icon={x.icon} label={x.label} active={tool === x.id} onClick={() => setTool(x.id)} />
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.tool-search input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const isFav = favs.includes(tool)
  return (
    <Layout
      side={
        <>
          <SideTitle>Boîte à outils</SideTitle>
          <label className="search tool-search">
            <Search size={13} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher un outil (Ctrl+K)"
              onKeyDown={(e) => {
                const first = TOOLS.find(match)
                if (e.key === 'Enter' && first) {
                  setTool(first.id)
                  setQ('')
                }
              }}
            />
          </label>
          {!q && favs.length > 0 && (
            <>
              <div className="ui-side-section">Favoris</div>
              {TOOLS.filter((x) => favs.includes(x.id)).map(item)}
            </>
          )}
          {CATS.map((c) => {
            const list = TOOLS.filter((x) => x.cat === c && match(x) && (q || !favs.includes(x.id)))
            return list.length ? (
              <div key={c}>
                <div className="ui-side-section">{c}</div>
                {list.map(item)}
              </div>
            ) : null
          })}
        </>
      }
    >
      <Page
        title={t.label}
        tools={
          <button className={`btn btn-sm ${isFav ? 'on' : 'btn-ghost'}`} onClick={() => setFavs(isFav ? favs.filter((x) => x !== tool) : [...favs, tool])} title="Épingler cet outil en haut">
            <Star size={14} fill={isFav ? 'currentColor' : 'none'} /> {isFav ? 'Favori' : 'Ajouter aux favoris'}
          </button>
        }
      >
        {tool === 'json' && <JsonTool />}
        {tool === 'base64' && <Base64Tool />}
        {tool === 'url' && <UrlTool />}
        {tool === 'hash' && <HashTool />}
        {tool === 'regex' && <RegexTool />}
        {tool === 'color' && <ColorTool />}
        {tool === 'uuid' && <UuidTool />}
        {tool === 'time' && <TimeTool />}
        {tool === 'jwt' && <JwtTool />}
        {tool === 'text' && <TextTool />}
        {tool === 'password' && <PasswordTool />}
        {tool === 'diff' && <DiffTool />}
        {tool === 'convert' && <ConvertTool />}
        {tool === 'qr' && <QrTool />}
        {tool === 'imgb64' && <ImageB64Tool />}
        {tool === 'entities' && <HtmlEntitiesTool />}
        {tool === 'cron' && <CronTool />}
        {tool === 'chmod' && <ChmodTool />}
        {tool === 'http' && <HttpCodesTool />}
        {tool === 'lorem' && <LoremTool />}
      </Page>
      <Toasts />
    </Layout>
  )
}

/** Ligne de l'erreur : « position N », « line N », ou l'extrait cité par le moteur retrouvé dans le texte. */
function errorLine(input: string, msg: string): number {
  const lineOf = (pos: number): number => input.slice(0, pos).split('\n').length
  const pos = /position (\d+)/.exec(msg)
  if (pos) return lineOf(Number(pos[1]))
  const ln = /line (\d+)/.exec(msg)
  if (ln) return Number(ln[1])
  if (/end of JSON input/i.test(msg)) return input.split('\n').length
  // V8 : Unexpected token '}', ..."<extrait>"... is not valid JSON
  const ctx = /Unexpected token '(.)', (?:\.\.\.)?"([\s\S]*?)"(?:\.\.\.)? is not valid JSON/.exec(msg)
  if (ctx) {
    const at = input.indexOf(ctx[2])
    if (at >= 0) return lineOf(at + ctx[2].lastIndexOf(ctx[1]))
  }
  return 0
}

function JsonTool(): JSX.Element {
  const [input, setInput] = usePersisted('json', '{"nom":"Julien","outils":["json","base64"],"actif":true}')
  const [indent, setIndent] = useState<'2' | '4' | '0'>('2')
  const [sort, setSort] = useState(false)
  const res = useMemo(() => {
    if (!input.trim()) return { out: '', err: null as string | null, stats: '' }
    try {
      let v = JSON.parse(input)
      const sortKeys = (x: unknown): unknown =>
        Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x
      if (sort) v = sortKeys(v)
      const keys = (x: unknown): number => (Array.isArray(x) ? x.reduce((n: number, y) => n + keys(y), 0) : x && typeof x === 'object' ? Object.values(x).reduce((n: number, y) => n + 1 + keys(y), 0) : 0)
      return { out: JSON.stringify(v, null, Number(indent)), err: null, stats: `JSON valide · ${keys(v)} clés` }
    } catch (e) {
      const msg = (e as Error).message
      const line = errorLine(input, msg)
      return { out: '', err: `JSON invalide${line ? ` (ligne ${line})` : ''} : ${msg}`, stats: '' }
    }
  }, [input, indent, sort])
  return (
    <div className="two">
      <div className="ui-col">
        <textarea className="textarea mono big" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder="Colle ton JSON" />
      </div>
      <div className="ui-col">
        <div className="ui-row">
          <Segmented value={indent} onChange={setIndent} options={[{ id: '2', label: '2 espaces' }, { id: '4', label: '4 espaces' }, { id: '0', label: 'Minifié' }]} />
          <label className="ui-row faint">
            <input type="checkbox" checked={sort} onChange={(e) => setSort(e.target.checked)} /> Trier les clés
          </label>
          {res.stats && <span className="chip success">{res.stats}</span>}
        </div>
        <Out value={res.out} error={res.err} />
      </div>
    </div>
  )
}

function Base64Tool(): JSX.Element {
  const [mode, setMode] = useState<'enc' | 'dec'>('enc')
  const [input, setInput] = useState('')
  let out = ''
  let err: string | null = null
  try {
    out = input ? (mode === 'enc' ? b64enc(input) : b64dec(input)) : ''
  } catch {
    err = 'Ce texte n’est pas du Base64 valide.'
  }
  return (
    <div className="ui-col">
      <div className="ui-row">
        <Segmented value={mode} onChange={setMode} options={[{ id: 'enc', label: 'Encoder' }, { id: 'dec', label: 'Décoder' }]} />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            void window.kit.files.open({ title: 'Fichier à encoder' }).then(async ([p]) => {
              if (!p) return
              const b = await window.kit.files.readBase64(p)
              setMode('dec')
              setInput('')
              copy(b)
            })
          }
        >
          Encoder un fichier (copié)
        </button>
      </div>
      <textarea className="textarea mono" rows={7} value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === 'enc' ? 'Texte à encoder' : 'Base64 à décoder'} spellCheck={false} />
      <Out value={out} error={err} />
    </div>
  )
}

function UrlTool(): JSX.Element {
  const [input, setInput] = useState('https://exemple.fr/recherche?q=école d’été&page=2#haut')
  const parsed = useMemo(() => {
    try {
      return new URL(input)
    } catch {
      return null
    }
  }, [input])
  let decoded = ''
  try {
    decoded = decodeURIComponent(input)
  } catch {
    decoded = 'Séquence % invalide'
  }
  return (
    <div className="ui-col">
      <textarea className="textarea mono" rows={3} value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
      <div className="field">
        <span className="field-label">Encodé (pour mettre dans une URL)</span>
        <Out value={encodeURIComponent(input)} />
      </div>
      <div className="field">
        <span className="field-label">Décodé</span>
        <Out value={decoded} />
      </div>
      {parsed && (
        <div className="ui-card">
          <table className="table">
            <tbody>
              {[
                ['Protocole', parsed.protocol],
                ['Hôte', parsed.host],
                ['Chemin', decodeURIComponent(parsed.pathname)],
                ['Ancre', parsed.hash]
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="faint" style={{ width: 120 }}>
                    {k}
                  </td>
                  <td className="mono">{v || '—'}</td>
                </tr>
              ))}
              {[...parsed.searchParams.entries()].map(([k, v], i) => (
                <tr key={i}>
                  <td className="faint">?{k}</td>
                  <td className="mono">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HashTool(): JSX.Element {
  const [input, setInput] = useState('')
  const [hashes, setHashes] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    void Promise.all((['md5', 'sha1', 'sha256', 'sha512'] as const).map(async (a) => [a, await window.kit.hash(a, input)] as const)).then((r) => alive && setHashes(Object.fromEntries(r)))
    return () => {
      alive = false
    }
  }, [input])
  return (
    <div className="ui-col">
      <textarea className="textarea mono" rows={5} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Texte à hacher" spellCheck={false} />
      {Object.entries(hashes).map(([k, v]) => (
        <div key={k} className="field">
          <span className="field-label">{k.toUpperCase()}</span>
          <Out value={v} />
        </div>
      ))}
    </div>
  )
}

function RegexTool(): JSX.Element {
  const [pattern, setPattern] = usePersisted('regex', '(\\w+)@(\\w+)\\.(fr|com)')
  const [flags, setFlags] = usePersisted('regexFlags', 'gi')
  const [text, setText] = usePersisted('regexText', 'Écris à julien@exemple.fr ou contact@site.com\nmais pas à faux@adresse')
  const res = useMemo(() => {
    if (!pattern) return { html: '', matches: [] as RegExpMatchArray[], err: null as string | null }
    try {
      const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
      const matches = [...text.matchAll(re)].slice(0, 500)
      const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
      let html = ''
      let last = 0
      for (const m of matches) {
        const i = m.index ?? 0
        html += esc(text.slice(last, i)) + `<mark>${esc(m[0]) || '​'}</mark>`
        last = i + m[0].length
      }
      html += esc(text.slice(last))
      return { html, matches, err: null }
    } catch (e) {
      return { html: '', matches: [], err: (e as Error).message }
    }
  }, [pattern, flags, text])
  return (
    <div className="ui-col">
      <div className="regex-bar">
        <span className="faint mono">/</span>
        <input className="input mono" value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} />
        <span className="faint mono">/</span>
        <input className="input mono flags" value={flags} onChange={(e) => setFlags(e.target.value.replace(/[^gimsuy]/g, ''))} title="g : toutes · i : majuscules ignorées · m : multiligne · s : . inclut les retours" />
      </div>
      {res.err && <div className="out-error">{res.err}</div>}
      <textarea className="textarea mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="ui-card">
        <div className="ui-card-title">
          {res.matches.length} correspondance{res.matches.length > 1 ? 's' : ''}
        </div>
        <pre className="mono highlight" dangerouslySetInnerHTML={{ __html: res.html }} />
      </div>
      {res.matches.some((m) => m.length > 1) && (
        <div className="ui-card">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Texte</th>
                {Array.from({ length: Math.max(...res.matches.map((m) => m.length)) - 1 }, (_, i) => (
                  <th key={i}>Groupe {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {res.matches.map((m, i) => (
                <tr key={i}>
                  <td className="faint">{i + 1}</td>
                  {[...m].map((g, j) => (
                    <td key={j} className="mono">
                      {g ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}
const lum = ([r, g, b]: [number, number, number]): number => {
  const f = (c: number): number => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ColorTool(): JSX.Element {
  const [hex, setHex] = usePersisted('color', '#7c6ff7')
  const rgb = hexToRgb(hex)
  const hsl = rgb ? rgbToHsl(rgb) : null
  const contrast = (other: [number, number, number]): number => {
    if (!rgb) return 0
    const [a, b] = [lum(rgb), lum(other)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  }
  const shades = rgb && hsl ? [90, 75, 60, 45, 30, 15].map((l) => `hsl(${hsl[0]} ${hsl[1]}% ${l}%)`) : []
  return (
    <div className="ui-col">
      <div className="ui-row">
        <input type="color" value={rgb ? hex : '#000000'} onChange={(e) => setHex(e.target.value)} className="big-color" />
        <input className="input mono" style={{ maxWidth: 200 }} value={hex} onChange={(e) => setHex(e.target.value)} />
      </div>
      {rgb && hsl ? (
        <>
          <div className="swatch-big" style={{ background: hex }}>
            <span style={{ color: '#fff' }}>Texte blanc · {contrast([255, 255, 255]).toFixed(2)}:1</span>
            <span style={{ color: '#000' }}>Texte noir · {contrast([0, 0, 0]).toFixed(2)}:1</span>
          </div>
          <div className="ui-grid">
            {[
              ['HEX', hex.toLowerCase()],
              ['RGB', `rgb(${rgb.join(', ')})`],
              ['HSL', `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`],
              ['CSS (nouvelle syntaxe)', `rgb(${rgb.join(' ')})`]
            ].map(([k, v]) => (
              <button key={k} className="ui-card color-val" onClick={() => copy(v)}>
                <span className="faint">{k}</span>
                <b className="mono">{v}</b>
              </button>
            ))}
          </div>
          <div className="shades">
            {shades.map((s) => (
              <button key={s} style={{ background: s }} onClick={() => copy(s)} title={s} />
            ))}
          </div>
          <p className="faint">Un contraste d’au moins 4,5:1 est recommandé pour du texte lisible (WCAG AA).</p>
        </>
      ) : (
        <div className="out-error">Couleur invalide (exemples : #7c6ff7, #fff).</div>
      )}
    </div>
  )
}

function UuidTool(): JSX.Element {
  const [n, setN] = useState(5)
  const [upper, setUpper] = useState(false)
  const [list, setList] = useState<string[]>([])
  const gen = (): void => setList(Array.from({ length: n }, () => (upper ? crypto.randomUUID().toUpperCase() : crypto.randomUUID())))
  useEffect(gen, [n, upper])
  return (
    <div className="ui-col">
      <div className="ui-row">
        <input className="input" type="number" min={1} max={500} value={n} onChange={(e) => setN(Math.max(1, Math.min(500, Number(e.target.value))))} style={{ width: 90 }} />
        <label className="ui-row faint">
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> Majuscules
        </label>
        <button className="btn btn-primary" onClick={gen}>
          Régénérer
        </button>
      </div>
      <Out value={list.join('\n')} />
    </div>
  )
}

function TimeTool(): JSX.Element {
  const [now, setNow] = useState(Date.now())
  const [input, setInput] = useState(String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const n = Number(input)
  const asDate = isFinite(n) && input.trim() ? new Date(input.trim().length > 11 ? n : n * 1000) : null
  const fromDate = new Date(date)
  return (
    <div className="ui-col">
      <div className="ui-card">
        <div className="ui-card-title">Maintenant</div>
        <div className="mono big-num">{Math.floor(now / 1000)}</div>
        <div className="faint">{new Date(now).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium' })}</div>
      </div>
      <div className="field">
        <span className="field-label">Horodatage Unix → date (secondes ou millisecondes)</span>
        <input className="input mono" value={input} onChange={(e) => setInput(e.target.value)} />
        <Out value={asDate && !isNaN(asDate.getTime()) ? `${asDate.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium' })}\n${asDate.toISOString()}` : ''} mono={false} />
      </div>
      <div className="field">
        <span className="field-label">Date → horodatage</span>
        <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        <Out value={isNaN(fromDate.getTime()) ? '' : `${Math.floor(fromDate.getTime() / 1000)} (secondes)\n${fromDate.getTime()} (millisecondes)`} />
      </div>
    </div>
  )
}

function JwtTool(): JSX.Element {
  const [token, setToken] = useState('')
  const parts = token.trim().split('.')
  let header = ''
  let payload = ''
  let err: string | null = null
  let exp: Date | null = null
  if (token.trim()) {
    try {
      if (parts.length < 2) throw new Error()
      header = JSON.stringify(JSON.parse(b64dec(parts[0])), null, 2)
      const p = JSON.parse(b64dec(parts[1]))
      payload = JSON.stringify(p, null, 2)
      if (typeof p.exp === 'number') exp = new Date(p.exp * 1000)
    } catch {
      err = 'Ce n’est pas un JWT valide (trois parties séparées par des points).'
    }
  }
  return (
    <div className="ui-col">
      <textarea className="textarea mono" rows={4} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Colle un jeton JWT (eyJhbGciOi…)" spellCheck={false} />
      <p className="faint">Décodé localement, rien n’est envoyé. La signature n’est pas vérifiée.</p>
      {err && <div className="out-error">{err}</div>}
      {payload && (
        <>
          {exp && <span className={`chip ${exp.getTime() < Date.now() ? 'danger' : 'success'}`}>{exp.getTime() < Date.now() ? 'Expiré le' : 'Expire le'} {exp.toLocaleString('fr-FR')}</span>}
          <div className="two">
            <div className="field">
              <span className="field-label">En-tête</span>
              <Out value={header} />
            </div>
            <div className="field">
              <span className="field-label">Contenu</span>
              <Out value={payload} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TextTool(): JSX.Element {
  const [t, setT] = usePersisted('text', '')
  const words = t.trim().match(/\S+/g)?.length ?? 0
  const slug = t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const camel = slug.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
  const transforms: [string, string][] = [
    ['MAJUSCULES', t.toUpperCase()],
    ['minuscules', t.toLowerCase()],
    ['Première Lettre', t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())],
    ['slug-pour-url', slug],
    ['camelCase', camel],
    ['snake_case', slug.replace(/-/g, '_')],
    ['Sans espaces en trop', t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()],
    ['Lignes triées', t.split('\n').sort((a, b) => a.localeCompare(b, 'fr')).join('\n')],
    ['Lignes sans doublons', [...new Set(t.split('\n'))].join('\n')]
  ]
  return (
    <div className="ui-col">
      <textarea className="textarea" rows={7} value={t} onChange={(e) => setT(e.target.value)} placeholder="Colle ton texte" />
      <div className="ui-row stats">
        <span className="chip">{t.length} caractères</span>
        <span className="chip">{t.replace(/\s/g, '').length} sans espaces</span>
        <span className="chip">{words} mots</span>
        <span className="chip">{t ? t.split('\n').length : 0} lignes</span>
        <span className="chip">~{Math.max(1, Math.round(words / 230))} min de lecture</span>
      </div>
      {t && (
        <div className="ui-grid">
          {transforms.map(([k, v]) => (
            <button key={k} className="ui-card color-val" onClick={() => copy(v)}>
              <span className="faint">{k}</span>
              <span className="mono clip">{v}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
