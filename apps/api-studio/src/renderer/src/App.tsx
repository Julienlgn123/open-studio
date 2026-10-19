import { useEffect, useMemo, useState } from 'react'
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  CopyPlus,
  Download,
  FileUp,
  Folder,
  Gauge,
  Globe,
  Plus,
  Save,
  Search,
  Send,
  Terminal,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { Layout, Modal, Segmented, SideTitle, Toasts, errorText, formatBytes, relativeTime, toast, uid, usePersisted, usePrompt } from '@ui'
import { fromCurl, fromPostman, jsonPath, toCode, type BodyKind, type Method, type Pair, type Prepared, type Req, type Test, type TestKind } from './extras'
import './api.css'

interface Res {
  status: number
  statusText: string
  ms: number
  size: number
  headers: Record<string, string>
  body: string
  at: number
}
interface HistoryEntry {
  req: Req
  status: number | null
  at: number
  ms?: number
}
interface Env {
  id: string
  name: string
  vars: Pair[]
}
interface TestResult {
  test: Test
  ok: boolean
  got: string
}

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const blank = (): Req => ({
  id: uid(),
  name: '',
  method: 'GET',
  url: '',
  params: [{ on: true, k: '', v: '' }],
  headers: [{ on: true, k: '', v: '' }],
  bodyKind: 'none',
  body: '',
  auth: { kind: 'none', token: '', user: '', pass: '' }
})
const TEST_KINDS: { id: TestKind; label: string; target?: string; expected: string }[] = [
  { id: 'status', label: 'Code de statut égal à', expected: '200' },
  { id: 'statusRange', label: 'Statut de succès (2xx)', expected: '' },
  { id: 'time', label: 'Temps de réponse inférieur à (ms)', expected: '500' },
  { id: 'contains', label: 'La réponse contient le texte', expected: '' },
  { id: 'json', label: 'Valeur JSON au chemin', target: 'data.id', expected: '' },
  { id: 'header', label: 'En-tête présent', target: 'content-type', expected: '' }
]

/** {{nom}} → valeur de la variable. Variables dynamiques : {{$uuid}}, {{$timestamp}}, {{$randomInt}}. */
const fill = (s: string, vars: Pair[]): string =>
  s.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (m, k: string) => {
    if (k === '$uuid') return crypto.randomUUID()
    if (k === '$timestamp') return String(Math.floor(Date.now() / 1000))
    if (k === '$isoDate') return new Date().toISOString()
    if (k === '$randomInt') return String(Math.floor(Math.random() * 1000))
    return vars.find((v) => v.on && v.k === k)?.v ?? m
  })

function buildUrl(r: Req, vars: Pair[]): string {
  const base = fill(r.url.trim(), vars)
  const ps = r.params.filter((p) => p.on && p.k)
  const full = /^https?:\/\//.test(base) ? base : `http://${base}`
  if (!ps.length) return full
  const u = new URL(full)
  for (const p of ps) u.searchParams.append(fill(p.k, vars), fill(p.v, vars))
  return u.toString()
}

function prepare(r: Req, vars: Pair[]): Prepared {
  const url = buildUrl(r, vars)
  const headers: Record<string, string> = {}
  for (const h of r.headers) if (h.on && h.k) headers[fill(h.k, vars)] = fill(h.v, vars)
  if (r.auth.kind === 'bearer' && r.auth.token) headers.Authorization = `Bearer ${fill(r.auth.token, vars)}`
  if (r.auth.kind === 'basic') headers.Authorization = `Basic ${btoa(`${fill(r.auth.user, vars)}:${fill(r.auth.pass, vars)}`)}`
  let body: string | undefined
  if (r.bodyKind !== 'none' && !['GET', 'HEAD'].includes(r.method)) {
    body = fill(r.body, vars)
    const ct = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
    if (!ct) headers['Content-Type'] = r.bodyKind === 'json' ? 'application/json' : r.bodyKind === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain'
  }
  return { url, method: r.method, headers, body }
}

/** Corps de réponse lisible : JSON indenté et coloré, avec surlignage de la recherche. */
function pretty(body: string, headers: Record<string, string>, find: string): { html: string; json: boolean; hits: number } {
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  let html: string
  let json = false
  try {
    if (!/json/i.test(headers['content-type'] ?? '') && !/^\s*[[{]/.test(body)) throw 0
    const txt = JSON.stringify(JSON.parse(body), null, 2)
    json = true
    html = esc(txt).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon, kw, n) =>
      str ? `<span class="${colon ? 'j-key' : 'j-str'}">${str}</span>${colon ?? ''}` : kw ? `<span class="j-kw">${kw}</span>` : n ? `<span class="j-num">${n}</span>` : m
    )
  } catch {
    html = esc(body)
  }
  let hits = 0
  if (find.trim()) {
    const needle = esc(find.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Surligne seulement le texte, pas l'intérieur des balises de coloration.
    html = html.replace(/(<[^>]+>)|([^<]+)/g, (_, tag: string, text: string) => tag ?? text.replace(new RegExp(needle, 'gi'), (x) => (hits++, `<mark>${x}</mark>`)))
  }
  return { html, json, hits }
}

function runTests(tests: Test[], res: Res): TestResult[] {
  let data: unknown
  try {
    data = JSON.parse(res.body)
  } catch {
    data = undefined
  }
  return tests.map((t) => {
    switch (t.kind) {
      case 'status':
        return { test: t, ok: String(res.status) === t.expected.trim(), got: String(res.status) }
      case 'statusRange':
        return { test: t, ok: res.status >= 200 && res.status < 300, got: String(res.status) }
      case 'time':
        return { test: t, ok: res.ms < Number(t.expected), got: `${res.ms} ms` }
      case 'contains':
        return { test: t, ok: !!t.expected && res.body.includes(t.expected), got: res.body.includes(t.expected) ? 'trouvé' : 'absent' }
      case 'header': {
        const v = Object.entries(res.headers).find(([k]) => k.toLowerCase() === t.target.toLowerCase())?.[1]
        return { test: t, ok: v !== undefined && (!t.expected || v.includes(t.expected)), got: v ?? 'absent' }
      }
      case 'json': {
        const v = jsonPath(data, t.target)
        const got = v === undefined ? 'absent' : typeof v === 'object' ? JSON.stringify(v) : String(v)
        return { test: t, ok: v !== undefined && (!t.expected || got === t.expected), got }
      }
    }
  })
}

export default function App(): JSX.Element {
  const [req, setReq] = useState<Req>(blank)
  const [res, setRes] = useState<Res | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'tests' | 'vars'>('params')
  const [resTab, setResTab] = useState<'body' | 'headers' | 'tests' | 'preview'>('body')
  const [history, setHistory] = usePersisted<HistoryEntry[]>('history', [])
  const [saved, setSaved] = usePersisted<Req[]>('collection', [])
  const [legacyVars] = usePersisted<Pair[]>('variables', [{ on: true, k: 'base', v: 'https://jsonplaceholder.typicode.com' }])
  const [envs, setEnvs, envReady] = usePersisted<Env[]>('environments', [])
  const [envId, setEnvId] = usePersisted<string>('environment', '')
  const [side, setSide] = useState<'saved' | 'history'>('saved')
  const [sideQ, setSideQ] = useState('')
  const [closed, setClosed] = useState<string[]>([])
  const [find, setFind] = useState('')
  const [codeOpen, setCodeOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [benchOpen, setBenchOpen] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const [promptNode, ask] = usePrompt()

  // Les anciennes « variables » deviennent l'environnement par défaut.
  useEffect(() => {
    if (envReady && !envs.length) {
      const e = { id: uid(), name: 'Par défaut', vars: legacyVars.length ? legacyVars : [{ on: true, k: '', v: '' }] }
      setEnvs([e])
      setEnvId(e.id)
    }
  }, [envReady, legacyVars])
  const env = envs.find((e) => e.id === envId) ?? envs[0]
  const vars = env?.vars ?? []
  const setVars = (v: Pair[]): void => setEnvs(envs.map((e) => (e.id === env?.id ? { ...e, vars: v } : e)))

  const send = async (r: Req = req): Promise<void> => {
    if (!r.url.trim()) return
    setBusy(true)
    setError(null)
    setResults([])
    try {
      if (r.bodyKind === 'json' && !['GET', 'HEAD'].includes(r.method) && r.body.trim()) JSON.parse(fill(r.body, vars)) // erreur claire avant l'envoi
      const p = prepare(r, vars)
      const out = await window.kit.net.fetch(p.url, { method: p.method, headers: p.headers, body: p.body, timeoutMs: 60_000 })
      const response: Res = { status: out.status, statusText: out.statusText, ms: out.ms, size: out.size, headers: out.headers, body: out.body, at: Date.now() }
      setRes(response)
      setHistory((h) => [{ req: r, status: out.status, at: Date.now(), ms: out.ms }, ...h].slice(0, 100))
      if (r.tests?.length) {
        const tr = runTests(r.tests, response)
        setResults(tr)
        const bad = tr.filter((x) => !x.ok).length
        toast(bad ? `${bad} test${bad > 1 ? 's' : ''} échoué${bad > 1 ? 's' : ''}` : `${tr.length} test${tr.length > 1 ? 's' : ''} réussi${tr.length > 1 ? 's' : ''}`, bad ? 'error' : 'success')
      }
      // Variables extraites de la réponse (ex. jeton de connexion).
      const ex = (r.extract ?? []).filter((e) => e.on && e.k && e.v)
      if (ex.length && env) {
        try {
          const data = JSON.parse(out.body)
          const next = [...env.vars.filter((v) => v.k)]
          const done: string[] = []
          for (const e of ex) {
            const v = jsonPath(data, e.v)
            if (v === undefined) continue
            const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
            const i = next.findIndex((x) => x.k === e.k)
            if (i >= 0) next[i] = { ...next[i], v: val, on: true }
            else next.push({ on: true, k: e.k, v: val })
            done.push(e.k)
          }
          if (done.length) {
            setEnvs(envs.map((x) => (x.id === env.id ? { ...x, vars: [...next, { on: true, k: '', v: '' }] } : x)))
            toast(`Variable${done.length > 1 ? 's' : ''} mise${done.length > 1 ? 's' : ''} à jour : ${done.join(', ')}`, 'success')
          }
        } catch {
          /* réponse non JSON : rien à extraire */
        }
      }
    } catch (err) {
      const msg = errorText(err)
      setError(err instanceof SyntaxError ? `Corps JSON invalide : ${msg}` : msg)
      setRes(null)
      setHistory((h) => [{ req: r, status: null, at: Date.now() }, ...h].slice(0, 100))
    } finally {
      setBusy(false)
    }
  }

  const saveReq = async (): Promise<void> => {
    const name = req.name || (await ask('Nom de la requête', `${req.method} ${req.url.replace(/^https?:\/\//, '').slice(0, 40)}`))
    if (!name) return
    const r = { ...req, name }
    setReq(r)
    setSaved((s) => (s.some((x) => x.id === r.id) ? s.map((x) => (x.id === r.id ? r : x)) : [r, ...s]))
    toast('Requête enregistrée', 'success')
  }

  // Coller une commande cURL directement dans le champ URL : elle est convertie.
  const onUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    const text = e.clipboardData.getData('text')
    if (!/^\s*curl\s/i.test(text)) return
    e.preventDefault()
    const r = fromCurl(text, req.id)
    if (r) {
      setReq({ ...r, name: req.name || r.name, folder: req.folder })
      toast('Commande cURL importée', 'success')
    }
  }

  const exportCollection = async (): Promise<void> => {
    const path = await window.kit.files.save({ title: 'Exporter la collection', defaultPath: 'collection-api.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (!path) return
    await window.kit.files.writeText(path, JSON.stringify({ app: 'api-studio', version: 2, requests: saved, environments: envs }, null, 2))
    toast('Collection exportée', 'success')
  }

  const view = useMemo(() => (res ? pretty(res.body, res.headers, find) : null), [res, find])
  const statusCls = !res ? '' : res.status < 300 ? 'success' : res.status < 400 ? 'info' : res.status < 500 ? 'warning' : 'danger'
  const isHtml = res && /html/i.test(res.headers['content-type'] ?? '')
  const folders = useMemo(() => [...new Set(saved.map((r) => r.folder ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))), [saved])
  const match = (r: Req): boolean => !sideQ || `${r.name} ${r.url} ${r.method}`.toLowerCase().includes(sideQ.toLowerCase())
  const passed = results.filter((r) => r.ok).length

  return (
    <Layout
      side={
        <>
          <SideTitle>Client API</SideTitle>
          <div className="ui-row side-actions">
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={() => {
                setReq(blank())
                setRes(null)
                setError(null)
                setResults([])
              }}
            >
              <Plus size={14} /> Nouvelle requête
            </button>
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setImportOpen(true)} title="Importer (cURL, Postman, collection)">
              <FileUp size={14} />
            </button>
          </div>
          <div className="env-row">
            <Globe size={13} className="faint" />
            <select className="select select-sm" value={env?.id ?? ''} onChange={(e) => setEnvId(e.target.value)} title="Environnement : jeu de variables actif">
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              title="Nouvel environnement (copie des variables actuelles)"
              onClick={() =>
                void ask('Nom de l’environnement', 'Production').then((name) => {
                  if (!name) return
                  const e = { id: uid(), name, vars: vars.map((v) => ({ ...v })) }
                  setEnvs([...envs, e])
                  setEnvId(e.id)
                })
              }
            >
              <Plus size={13} />
            </button>
          </div>
          <div style={{ margin: '8px 0 4px' }}>
            <Segmented value={side} onChange={setSide} options={[{ id: 'saved', label: <><Bookmark size={12} /> Collection</> }, { id: 'history', label: <><Clock size={12} /> Historique</> }]} />
          </div>
          <label className="search side-search">
            <Search size={12} />
            <input value={sideQ} onChange={(e) => setSideQ(e.target.value)} placeholder="Filtrer" />
          </label>
          {side === 'saved'
            ? folders.map((f) => {
                const list = saved.filter((r) => (r.folder ?? '') === f && match(r))
                if (!list.length) return null
                const isClosed = closed.includes(f)
                return (
                  <div key={f || '_'}>
                    {(f || folders.length > 1) && (
                      <button className="folder-row" onClick={() => setClosed(isClosed ? closed.filter((x) => x !== f) : [...closed, f])}>
                        {isClosed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        <Folder size={12} /> {f || 'Sans dossier'} <span className="faint">{list.length}</span>
                      </button>
                    )}
                    {!isClosed &&
                      list.map((r) => (
                        <div key={r.id} className={`req-item${r.id === req.id ? ' on' : ''}${f ? ' nested' : ''}`} onClick={() => (setReq(r), setResults([]))}>
                          <span className={`m m-${r.method}`}>{r.method}</span>
                          <span className="req-name">{r.name}</span>
                          <button
                            className="faint del"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSaved((s) => s.filter((x) => x.id !== r.id))
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                  </div>
                )
              })
            : history
                .filter((h) => match(h.req))
                .map((h, i) => (
                  <div key={i} className="req-item" onClick={() => setReq({ ...h.req, id: uid() })} title={new Date(h.at).toLocaleString('fr-FR')}>
                    <span className={`m m-${h.req.method}`}>{h.req.method}</span>
                    <span className="req-name">{h.req.url.replace(/^https?:\/\//, '')}</span>
                    {h.ms !== undefined && <span className="faint ms">{h.ms} ms</span>}
                    <span className={`st ${h.status == null ? 'err' : h.status < 400 ? 'ok' : 'err'}`}>{h.status ?? '✕'}</span>
                  </div>
                ))}
          {side === 'saved' && !saved.length && <p className="faint small">Enregistre une requête pour la retrouver ici, ou importe une collection Postman.</p>}
          <div className="ui-side-foot">
            {side === 'history' && history.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setHistory([])}>
                <Trash2 size={12} /> Vider l’historique
              </button>
            )}
            {side === 'saved' && saved.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => void exportCollection()}>
                <Download size={12} /> Exporter la collection
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="api">
        <div className="request-bar">
          <select className={`select method m-${req.method}`} value={req.method} onChange={(e) => setReq({ ...req, method: e.target.value as Method })}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            className="input mono"
            placeholder="https://api.exemple.com/utilisateurs, {{base}}/posts/1, ou colle une commande cURL"
            value={req.url}
            onChange={(e) => setReq({ ...req, url: e.target.value })}
            onPaste={onUrlPaste}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy || !req.url.trim()}>
            {busy ? <span className="spinner" /> : <Send size={14} />} Envoyer
          </button>
          <button className="btn btn-secondary btn-icon" onClick={() => void saveReq()} title="Enregistrer dans la collection">
            <Save size={15} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setCodeOpen(true)} title="Voir en code (cURL, fetch, Python…)" disabled={!req.url.trim()}>
            <Code2 size={15} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setBenchOpen(true)} title="Envoyer en rafale (mesurer les temps)" disabled={!req.url.trim()}>
            <Gauge size={15} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setReq({ ...req, id: uid(), name: req.name ? `${req.name} (copie)` : '' })} title="Dupliquer">
            <CopyPlus size={15} />
          </button>
        </div>
        {req.name && (
          <div className="req-meta">
            <input className="name-input" value={req.name} onChange={(e) => setReq({ ...req, name: e.target.value })} />
            <Folder size={12} className="faint" />
            <input className="folder-input" list="folders" value={req.folder ?? ''} onChange={(e) => setReq({ ...req, folder: e.target.value || undefined })} placeholder="Dossier" />
            <datalist id="folders">
              {folders.filter(Boolean).map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        )}

        <div className="req-tabs">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'params', label: `Paramètres${req.params.filter((p) => p.k).length ? ` (${req.params.filter((p) => p.k).length})` : ''}` },
              { id: 'headers', label: `En-têtes${req.headers.filter((p) => p.k).length ? ` (${req.headers.filter((p) => p.k).length})` : ''}` },
              { id: 'body', label: 'Corps' },
              { id: 'auth', label: 'Authentification' },
              { id: 'tests', label: `Tests${req.tests?.length ? ` (${req.tests.length})` : ''}` },
              { id: 'vars', label: `Variables · ${env?.name ?? ''}` }
            ]}
          />
        </div>
        <div className="req-panel">
          {tab === 'params' && <Pairs pairs={req.params} onChange={(params) => setReq({ ...req, params })} />}
          {tab === 'headers' && <Pairs pairs={req.headers} onChange={(headers) => setReq({ ...req, headers })} placeholder={['Content-Type', 'application/json']} />}
          {tab === 'vars' && (
            <>
              <p className="faint small">
                Écris {'{{nom}}'} dans l’URL, les en-têtes ou le corps. Variables automatiques : {'{{$uuid}}'}, {'{{$timestamp}}'}, {'{{$isoDate}}'}, {'{{$randomInt}}'}.
              </p>
              <Pairs pairs={vars} onChange={setVars} placeholder={['token', 'abc123']} />
              <div className="ui-row" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => env && void ask('Renommer l’environnement', env.name).then((n) => n && setEnvs(envs.map((e) => (e.id === env.id ? { ...e, name: n } : e))))}>
                  Renommer « {env?.name} »
                </button>
                {envs.length > 1 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const rest = envs.filter((e) => e.id !== env?.id)
                      setEnvs(rest)
                      setEnvId(rest[0].id)
                    }}
                  >
                    <Trash2 size={12} /> Supprimer cet environnement
                  </button>
                )}
              </div>
            </>
          )}
          {tab === 'body' && (
            <div className="ui-col">
              <Segmented<BodyKind>
                value={req.bodyKind}
                onChange={(bodyKind) => setReq({ ...req, bodyKind })}
                options={[
                  { id: 'none', label: 'Aucun' },
                  { id: 'json', label: 'JSON' },
                  { id: 'text', label: 'Texte' },
                  { id: 'form', label: 'Formulaire' }
                ]}
              />
              {req.bodyKind !== 'none' && (
                <textarea
                  className="textarea mono"
                  rows={9}
                  value={req.body}
                  onChange={(e) => setReq({ ...req, body: e.target.value })}
                  placeholder={req.bodyKind === 'json' ? '{\n  "nom": "Julien"\n}' : req.bodyKind === 'form' ? 'nom=Julien&age=20' : ''}
                  spellCheck={false}
                />
              )}
              {req.bodyKind === 'json' && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    try {
                      setReq({ ...req, body: JSON.stringify(JSON.parse(req.body), null, 2) })
                    } catch (e) {
                      toast(`JSON invalide : ${(e as Error).message}`, 'error')
                    }
                  }}
                >
                  Mettre en forme
                </button>
              )}
            </div>
          )}
          {tab === 'auth' && (
            <div className="ui-col">
              <Segmented
                value={req.auth.kind}
                onChange={(kind) => setReq({ ...req, auth: { ...req.auth, kind } })}
                options={[
                  { id: 'none', label: 'Aucune' },
                  { id: 'bearer', label: 'Jeton (Bearer)' },
                  { id: 'basic', label: 'Identifiant / mot de passe' }
                ]}
              />
              {req.auth.kind === 'bearer' && <input className="input mono" placeholder="Jeton (ou {{token}})" value={req.auth.token} onChange={(e) => setReq({ ...req, auth: { ...req.auth, token: e.target.value } })} />}
              {req.auth.kind === 'basic' && (
                <div className="ui-row">
                  <input className="input" placeholder="Identifiant" value={req.auth.user} onChange={(e) => setReq({ ...req, auth: { ...req.auth, user: e.target.value } })} />
                  <input className="input" type="password" placeholder="Mot de passe" value={req.auth.pass} onChange={(e) => setReq({ ...req, auth: { ...req.auth, pass: e.target.value } })} />
                </div>
              )}
            </div>
          )}
          {tab === 'tests' && <TestsEditor req={req} onChange={setReq} />}
        </div>

        <div className="response">
          {error ? (
            <div className="callout danger">
              <X size={15} />
              <span>{error}</span>
            </div>
          ) : res ? (
            <>
              <div className="res-head">
                <span className={`chip ${statusCls}`}>
                  {res.status} {res.statusText}
                </span>
                <span className="faint">{res.ms} ms</span>
                <span className="faint">{formatBytes(res.size)}</span>
                {results.length > 0 && (
                  <span className={`chip ${passed === results.length ? 'success' : 'danger'}`}>
                    Tests {passed}/{results.length}
                  </span>
                )}
                <span className="spacer" />
                {resTab === 'body' && (
                  <label className="search res-find">
                    <Search size={12} />
                    <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Chercher" />
                    {find && <span className="faint">{view?.hits ?? 0}</span>}
                  </label>
                )}
                <Segmented
                  value={resTab}
                  onChange={setResTab}
                  options={[
                    { id: 'body', label: 'Réponse' },
                    ...(isHtml ? [{ id: 'preview' as const, label: 'Aperçu' }] : []),
                    { id: 'headers', label: `En-têtes (${Object.keys(res.headers).length})` },
                    ...(results.length ? [{ id: 'tests' as const, label: 'Tests' }] : [])
                  ]}
                />
                <button className="btn btn-ghost btn-sm btn-icon" title="Copier" onClick={() => void window.kit.clipboard.write(resTab === 'headers' ? JSON.stringify(res.headers, null, 2) : res.body).then(() => toast('Copié', 'success'))}>
                  <Copy size={14} />
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  title="Enregistrer la réponse dans un fichier"
                  onClick={() =>
                    void window.kit.files.save({ title: 'Enregistrer la réponse', defaultPath: view?.json ? 'reponse.json' : isHtml ? 'reponse.html' : 'reponse.txt' }).then(async (p) => {
                      if (!p) return
                      await window.kit.files.writeText(p, view?.json ? JSON.stringify(JSON.parse(res.body), null, 2) : res.body)
                      toast('Réponse enregistrée', 'success')
                    })
                  }
                >
                  <Download size={14} />
                </button>
              </div>
              {resTab === 'body' && <pre className="res-body" dangerouslySetInnerHTML={{ __html: view?.html || '<span class="faint">(réponse vide)</span>' }} />}
              {resTab === 'preview' && <iframe className="res-preview" sandbox="" srcDoc={res.body} title="Aperçu" />}
              {resTab === 'headers' && (
                <table className="table">
                  <tbody>
                    {Object.entries(res.headers).map(([k, v]) => (
                      <tr key={k}>
                        <td className="mono" style={{ width: 240, color: 'var(--accent-text)' }}>
                          {k}
                        </td>
                        <td className="mono" style={{ wordBreak: 'break-all' }}>
                          {v}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {resTab === 'tests' && (
                <div className="test-results">
                  {results.map((r) => (
                    <div key={r.test.id} className={`test-res ${r.ok ? 'ok' : 'ko'}`}>
                      {r.ok ? <Check size={14} /> : <X size={14} />}
                      <span>
                        {TEST_KINDS.find((k) => k.id === r.test.kind)?.label} {r.test.target && <code>{r.test.target}</code>} {r.test.expected && <b>{r.test.expected}</b>}
                      </span>
                      <span className="faint got">obtenu : {r.got.length > 80 ? `${r.got.slice(0, 80)}…` : r.got}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="faint res-empty">La réponse s’affichera ici. Astuce : essaie {'{{base}}'}/posts/1 puis Entrée, ou colle une commande cURL dans l’adresse.</div>
          )}
        </div>
      </div>
      {codeOpen && <CodeModal p={prepare(req, vars)} onClose={() => setCodeOpen(false)} />}
      {benchOpen && <BenchModal p={prepare(req, vars)} onClose={() => setBenchOpen(false)} />}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onCurl={(r) => {
            setReq(r)
            setImportOpen(false)
            toast('Commande cURL importée', 'success')
          }}
          onRequests={(list, envList) => {
            setSaved((s) => [...list, ...s])
            if (envList?.length) setEnvs([...envs, ...envList.filter((e) => !envs.some((x) => x.id === e.id))])
            setImportOpen(false)
            setSide('saved')
            toast(`${list.length} requête${list.length > 1 ? 's' : ''} importée${list.length > 1 ? 's' : ''}`, 'success')
          }}
        />
      )}
      {promptNode}
      <Toasts />
    </Layout>
  )
}

function TestsEditor({ req, onChange }: { req: Req; onChange: (r: Req) => void }): JSX.Element {
  const tests = req.tests ?? []
  const set = (t: Test[]): void => onChange({ ...req, tests: t })
  const extract = req.extract?.length ? req.extract : [{ on: true, k: '', v: '' }]
  return (
    <div className="ui-col">
      <p className="faint small">Vérifiés automatiquement à chaque envoi.</p>
      {tests.map((t, i) => {
        const def = TEST_KINDS.find((k) => k.id === t.kind)!
        return (
          <div key={t.id} className="test-row">
            <select className="select select-sm" value={t.kind} onChange={(e) => {
              const k = TEST_KINDS.find((x) => x.id === e.target.value)!
              set(tests.map((x, j) => (j === i ? { ...x, kind: k.id, target: k.target ?? '', expected: k.expected } : x)))
            }}>
              {TEST_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            {def.target !== undefined && <input className="input mono" value={t.target} onChange={(e) => set(tests.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} placeholder={def.target} />}
            {t.kind !== 'statusRange' && (
              <input className="input mono" value={t.expected} onChange={(e) => set(tests.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))} placeholder={t.kind === 'json' || t.kind === 'header' ? 'valeur attendue (facultatif)' : 'valeur attendue'} />
            )}
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => set(tests.filter((_, j) => j !== i))}>
              <X size={13} />
            </button>
          </div>
        )
      })}
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set([...tests, { id: uid(), kind: 'status', target: '', expected: '200' }])}>
        <Plus size={13} /> Ajouter un test
      </button>
      <hr className="sep-line" />
      <b className="small">Récupérer des valeurs de la réponse</b>
      <p className="faint small">Après l’envoi, la valeur trouvée au chemin JSON est copiée dans la variable (pratique pour un jeton de connexion : token ← data.access_token).</p>
      <Pairs pairs={extract} onChange={(p) => onChange({ ...req, extract: p })} placeholder={['nom de variable', 'chemin JSON (ex. data.token)']} />
    </div>
  )
}

function CodeModal({ p, onClose }: { p: Prepared; onClose: () => void }): JSX.Element {
  const [lang, setLang] = usePersisted<'curl' | 'fetch' | 'axios' | 'python' | 'powershell'>('codeLang', 'curl')
  const code = toCode(p, lang)
  return (
    <Modal
      title={
        <>
          <Terminal size={15} /> Cette requête en code
        </>
      }
      onClose={onClose}
      width={720}
      footer={
        <button className="btn btn-primary" onClick={() => void window.kit.clipboard.write(code).then(() => toast('Code copié', 'success'))}>
          <Copy size={14} /> Copier
        </button>
      }
    >
      <Segmented
        value={lang}
        onChange={setLang}
        options={[
          { id: 'curl', label: 'cURL' },
          { id: 'fetch', label: 'JavaScript (fetch)' },
          { id: 'axios', label: 'Axios' },
          { id: 'python', label: 'Python' },
          { id: 'powershell', label: 'PowerShell' }
        ]}
      />
      <pre className="code-out">{code}</pre>
    </Modal>
  )
}

function BenchModal({ p, onClose }: { p: Prepared; onClose: () => void }): JSX.Element {
  const [count, setCount] = useState(20)
  const [parallel, setParallel] = useState(4)
  const [times, setTimes] = useState<{ ms: number; ok: boolean }[]>([])
  const [running, setRunning] = useState(false)
  const run = async (): Promise<void> => {
    setTimes([])
    setRunning(true)
    let left = count
    const worker = async (): Promise<void> => {
      while (left > 0) {
        left--
        const t0 = performance.now()
        try {
          const r = await window.kit.net.fetch(p.url, { method: p.method, headers: p.headers, body: p.body, timeoutMs: 30_000 })
          setTimes((t) => [...t, { ms: r.ms, ok: r.ok }])
        } catch {
          setTimes((t) => [...t, { ms: Math.round(performance.now() - t0), ok: false }])
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(parallel, count) }, worker))
    setRunning(false)
  }
  const ms = times.map((t) => t.ms).sort((a, b) => a - b)
  const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0
  const p95 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : 0
  const max = Math.max(1, ...ms)
  return (
    <Modal
      title={
        <>
          <Gauge size={15} /> Envoi en rafale
        </>
      }
      onClose={onClose}
      width={640}
      footer={
        <button className="btn btn-primary" onClick={() => void run()} disabled={running}>
          {running ? <span className="spinner" /> : <Send size={14} />} Lancer
        </button>
      }
    >
      <p className="faint small">
        {p.method} {p.url} — à n’utiliser que sur tes propres serveurs.
      </p>
      <div className="ui-row">
        <label className="ui-row faint">
          Requêtes <input type="range" min={5} max={200} step={5} value={count} onChange={(e) => setCount(Number(e.target.value))} /> <b>{count}</b>
        </label>
        <label className="ui-row faint">
          En parallèle <input type="range" min={1} max={10} value={parallel} onChange={(e) => setParallel(Number(e.target.value))} /> <b>{parallel}</b>
        </label>
      </div>
      {times.length > 0 && (
        <>
          <div className="bench-stats">
            <div>
              <span className="faint">Réussies</span>
              <b>
                {times.filter((t) => t.ok).length}/{times.length}
              </b>
            </div>
            <div>
              <span className="faint">Moyenne</span>
              <b>{avg} ms</b>
            </div>
            <div>
              <span className="faint">Plus rapide</span>
              <b>{ms[0]} ms</b>
            </div>
            <div>
              <span className="faint">95 % sous</span>
              <b>{p95} ms</b>
            </div>
            <div>
              <span className="faint">Plus lente</span>
              <b>{ms[ms.length - 1]} ms</b>
            </div>
          </div>
          <div className="bench-bars">
            {times.map((t, i) => (
              <span key={i} className={t.ok ? 'ok' : 'ko'} style={{ height: `${(t.ms / max) * 100}%` }} title={`${t.ms} ms`} />
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

function ImportModal({ onClose, onCurl, onRequests }: { onClose: () => void; onCurl: (r: Req) => void; onRequests: (r: Req[], envs?: Env[]) => void }): JSX.Element {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const importText = (t: string): void => {
    setErr('')
    if (/^\s*curl\s/i.test(t)) {
      const r = fromCurl(t, uid())
      return r ? onCurl(r) : setErr('Commande cURL non reconnue.')
    }
    try {
      const data = JSON.parse(t) as { requests?: Req[]; environments?: Env[]; info?: unknown; item?: unknown[] }
      if (Array.isArray(data.requests)) return onRequests(data.requests.map((r) => ({ ...r, id: uid() })), data.environments)
      const pm = fromPostman(data, uid)
      if (pm.length) return onRequests(pm)
      setErr('Aucune requête trouvée dans ce fichier.')
    } catch {
      setErr('Ni une commande cURL, ni une collection JSON valide.')
    }
  }
  return (
    <Modal
      title={
        <>
          <Upload size={15} /> Importer
        </>
      }
      onClose={onClose}
      width={640}
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={() =>
              void window.kit.files.open({ title: 'Collection à importer', filters: [{ name: 'JSON', extensions: ['json'] }] }).then(async ([p]) => {
                if (p) importText(await window.kit.files.readText(p))
              })
            }
          >
            <FileUp size={14} /> Choisir un fichier…
          </button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => importText(text)}>
            Importer
          </button>
        </>
      }
    >
      <p className="faint small">Colle une commande cURL (« Copier en cURL » dans les outils de dev du navigateur), une collection Postman, ou une collection exportée d’ici.</p>
      <textarea className="textarea mono" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={"curl 'https://api.exemple.com/items' -H 'Authorization: Bearer …'"} autoFocus />
      {err && <p className="err small">{err}</p>}
    </Modal>
  )
}

function Pairs({ pairs, onChange, placeholder = ['clé', 'valeur'] }: { pairs: Pair[]; onChange: (p: Pair[]) => void; placeholder?: [string, string] }): JSX.Element {
  const rows = pairs.length ? pairs : [{ on: true, k: '', v: '' }]
  const set = (i: number, p: Partial<Pair>): void => {
    const next = rows.map((x, j) => (j === i ? { ...x, ...p } : x))
    // Toujours une ligne vide à la fin pour en ajouter une.
    if (next[next.length - 1]?.k || next[next.length - 1]?.v) next.push({ on: true, k: '', v: '' })
    onChange(next)
  }
  return (
    <div className="pairs">
      {rows.map((p, i) => (
        <div key={i} className="pair">
          <input type="checkbox" checked={p.on} onChange={(e) => set(i, { on: e.target.checked })} />
          <input className="input mono" placeholder={placeholder[0]} value={p.k} onChange={(e) => set(i, { k: e.target.value })} />
          <input className="input mono" placeholder={placeholder[1]} value={p.v} onChange={(e) => set(i, { v: e.target.value })} />
          <button className="btn btn-ghost btn-sm btn-icon" disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
