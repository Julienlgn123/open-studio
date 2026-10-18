import { useMemo, useState } from 'react'
import { Bookmark, Clock, Copy, Plus, Save, Send, Trash2, X } from 'lucide-react'
import { Layout, Segmented, SideTitle, Toasts, errorText, formatBytes, relativeTime, toast, uid, usePersisted, usePrompt } from '@ui'
import './api.css'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
type BodyKind = 'none' | 'json' | 'text' | 'form'
interface Pair {
  on: boolean
  k: string
  v: string
}
interface Req {
  id: string
  name: string
  method: Method
  url: string
  params: Pair[]
  headers: Pair[]
  bodyKind: BodyKind
  body: string
  auth: { kind: 'none' | 'bearer' | 'basic'; token: string; user: string; pass: string }
}
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

/** {{nom}} → valeur de la variable. */
const fill = (s: string, vars: Pair[]): string => s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => vars.find((v) => v.on && v.k === k)?.v ?? m)

function buildUrl(r: Req, vars: Pair[]): string {
  const base = fill(r.url.trim(), vars)
  const ps = r.params.filter((p) => p.on && p.k)
  if (!ps.length) return base
  const u = new URL(/^https?:\/\//.test(base) ? base : `http://${base}`)
  for (const p of ps) u.searchParams.append(fill(p.k, vars), fill(p.v, vars))
  return u.toString()
}

/** Corps de réponse lisible : JSON indenté et coloré. */
function pretty(body: string, headers: Record<string, string>): { html: string; json: boolean } {
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  try {
    if (!/json/i.test(headers['content-type'] ?? '') && !/^\s*[[{]/.test(body)) throw 0
    const txt = JSON.stringify(JSON.parse(body), null, 2)
    return {
      json: true,
      html: esc(txt).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (m, str, colon, kw, n) =>
        str ? `<span class="${colon ? 'j-key' : 'j-str'}">${str}</span>${colon ?? ''}` : kw ? `<span class="j-kw">${kw}</span>` : n ? `<span class="j-num">${n}</span>` : m
      )
    }
  } catch {
    return { json: false, html: esc(body) }
  }
}

export default function App(): JSX.Element {
  const [req, setReq] = useState<Req>(blank)
  const [res, setRes] = useState<Res | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'vars'>('params')
  const [resTab, setResTab] = useState<'body' | 'headers'>('body')
  const [history, setHistory] = usePersisted<HistoryEntry[]>('history', [])
  const [saved, setSaved] = usePersisted<Req[]>('collection', [])
  const [vars, setVars] = usePersisted<Pair[]>('variables', [{ on: true, k: 'base', v: 'https://jsonplaceholder.typicode.com' }])
  const [side, setSide] = useState<'saved' | 'history'>('saved')
  const [promptNode, ask] = usePrompt()

  const send = async (): Promise<void> => {
    if (!req.url.trim()) return
    setBusy(true)
    setError(null)
    try {
      const url = buildUrl(req, vars)
      const headers: Record<string, string> = {}
      for (const h of req.headers) if (h.on && h.k) headers[fill(h.k, vars)] = fill(h.v, vars)
      if (req.auth.kind === 'bearer' && req.auth.token) headers.Authorization = `Bearer ${fill(req.auth.token, vars)}`
      if (req.auth.kind === 'basic') headers.Authorization = `Basic ${btoa(`${fill(req.auth.user, vars)}:${fill(req.auth.pass, vars)}`)}`
      let body: string | undefined
      if (req.bodyKind !== 'none' && !['GET', 'HEAD'].includes(req.method)) {
        body = fill(req.body, vars)
        const ct = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
        if (!ct) headers['Content-Type'] = req.bodyKind === 'json' ? 'application/json' : req.bodyKind === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain'
        if (req.bodyKind === 'json') JSON.parse(body) // erreur claire avant l'envoi
      }
      const r = await window.kit.net.fetch(url, { method: req.method, headers, body, timeoutMs: 60_000 })
      setRes({ status: r.status, statusText: r.statusText, ms: r.ms, size: r.size, headers: r.headers, body: r.body, at: Date.now() })
      setHistory((h) => [{ req, status: r.status, at: Date.now() }, ...h].slice(0, 60))
    } catch (err) {
      const msg = errorText(err)
      setError(err instanceof SyntaxError ? `Corps JSON invalide : ${msg}` : msg)
      setRes(null)
      setHistory((h) => [{ req, status: null, at: Date.now() }, ...h].slice(0, 60))
    } finally {
      setBusy(false)
    }
  }

  const saveReq = async (): Promise<void> => {
    const name = req.name || (await ask('Nom de la requête', `${req.method} ${req.url.replace(/^https?:\/\//, '').slice(0, 40)}`))
    if (!name) return
    const r = { ...req, name }
    setReq(r)
    setSaved((s) => [r, ...s.filter((x) => x.id !== r.id)])
    toast('Requête enregistrée', 'success')
  }

  const view = useMemo(() => (res ? pretty(res.body, res.headers) : null), [res])
  const statusCls = !res ? '' : res.status < 300 ? 'success' : res.status < 400 ? 'info' : res.status < 500 ? 'warning' : 'danger'

  return (
    <Layout
      side={
        <>
          <SideTitle>Client API</SideTitle>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setReq(blank())
              setRes(null)
              setError(null)
            }}
          >
            <Plus size={14} /> Nouvelle requête
          </button>
          <div style={{ margin: '10px 0 4px' }}>
            <Segmented value={side} onChange={setSide} options={[{ id: 'saved', label: <><Bookmark size={12} /> Enregistrées</> }, { id: 'history', label: <><Clock size={12} /> Historique</> }]} />
          </div>
          {side === 'saved'
            ? saved.map((r) => (
                <div key={r.id} className={`req-item${r.id === req.id ? ' on' : ''}`} onClick={() => setReq(r)}>
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
              ))
            : history.map((h, i) => (
                <div key={i} className="req-item" onClick={() => setReq({ ...h.req, id: uid() })}>
                  <span className={`m m-${h.req.method}`}>{h.req.method}</span>
                  <span className="req-name">{h.req.url.replace(/^https?:\/\//, '')}</span>
                  <span className={`st ${h.status == null ? 'err' : h.status < 400 ? 'ok' : 'err'}`}>{h.status ?? '✕'}</span>
                </div>
              ))}
          {side === 'saved' && !saved.length && <p className="faint small">Enregistre une requête pour la retrouver ici.</p>}
          {side === 'history' && history.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setHistory([])}>
              <Trash2 size={12} /> Vider
            </button>
          )}
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
            placeholder="https://api.exemple.com/utilisateurs  ou  {{base}}/posts/1"
            value={req.url}
            onChange={(e) => setReq({ ...req, url: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy || !req.url.trim()}>
            {busy ? <span className="spinner" /> : <Send size={14} />} Envoyer
          </button>
          <button className="btn btn-secondary btn-icon" onClick={() => void saveReq()} title="Enregistrer dans la collection">
            <Save size={15} />
          </button>
        </div>

        <div className="req-tabs">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'params', label: `Paramètres${req.params.filter((p) => p.k).length ? ` (${req.params.filter((p) => p.k).length})` : ''}` },
              { id: 'headers', label: `En-têtes${req.headers.filter((p) => p.k).length ? ` (${req.headers.filter((p) => p.k).length})` : ''}` },
              { id: 'body', label: 'Corps' },
              { id: 'auth', label: 'Authentification' },
              { id: 'vars', label: 'Variables' }
            ]}
          />
        </div>
        <div className="req-panel">
          {tab === 'params' && <Pairs pairs={req.params} onChange={(params) => setReq({ ...req, params })} />}
          {tab === 'headers' && <Pairs pairs={req.headers} onChange={(headers) => setReq({ ...req, headers })} placeholder={['Content-Type', 'application/json']} />}
          {tab === 'vars' && (
            <>
              <p className="faint small">Écris {'{{nom}}'} dans l’URL, les en-têtes ou le corps : la valeur est remplacée à l’envoi.</p>
              <Pairs pairs={vars} onChange={setVars} placeholder={['token', 'abc123']} />
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
              {req.auth.kind === 'bearer' && <input className="input mono" placeholder="Jeton" value={req.auth.token} onChange={(e) => setReq({ ...req, auth: { ...req.auth, token: e.target.value } })} />}
              {req.auth.kind === 'basic' && (
                <div className="ui-row">
                  <input className="input" placeholder="Identifiant" value={req.auth.user} onChange={(e) => setReq({ ...req, auth: { ...req.auth, user: e.target.value } })} />
                  <input className="input" type="password" placeholder="Mot de passe" value={req.auth.pass} onChange={(e) => setReq({ ...req, auth: { ...req.auth, pass: e.target.value } })} />
                </div>
              )}
            </div>
          )}
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
                <span className="faint">{relativeTime(res.at)}</span>
                <span className="spacer" />
                <Segmented value={resTab} onChange={setResTab} options={[{ id: 'body', label: 'Réponse' }, { id: 'headers', label: `En-têtes (${Object.keys(res.headers).length})` }]} />
                <button className="btn btn-ghost btn-sm btn-icon" title="Copier" onClick={() => void window.kit.clipboard.write(resTab === 'body' ? res.body : JSON.stringify(res.headers, null, 2)).then(() => toast('Copié', 'success'))}>
                  <Copy size={14} />
                </button>
              </div>
              {resTab === 'body' ? (
                <pre className="res-body" dangerouslySetInnerHTML={{ __html: view?.html || '<span class="faint">(réponse vide)</span>' }} />
              ) : (
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
            </>
          ) : (
            <div className="faint res-empty">La réponse s’affichera ici. Astuce : essaie {'{{base}}'}/posts/1 puis Entrée.</div>
          )}
        </div>
      </div>
      {promptNode}
      <Toasts />
    </Layout>
  )
}

function Pairs({ pairs, onChange, placeholder = ['clé', 'valeur'] }: { pairs: Pair[]; onChange: (p: Pair[]) => void; placeholder?: [string, string] }): JSX.Element {
  const set = (i: number, p: Partial<Pair>): void => {
    const next = pairs.map((x, j) => (j === i ? { ...x, ...p } : x))
    // Toujours une ligne vide à la fin pour en ajouter une.
    if (next[next.length - 1]?.k || next[next.length - 1]?.v) next.push({ on: true, k: '', v: '' })
    onChange(next)
  }
  return (
    <div className="pairs">
      {pairs.map((p, i) => (
        <div key={i} className="pair">
          <input type="checkbox" checked={p.on} onChange={(e) => set(i, { on: e.target.checked })} />
          <input className="input mono" placeholder={placeholder[0]} value={p.k} onChange={(e) => set(i, { k: e.target.value })} />
          <input className="input mono" placeholder={placeholder[1]} value={p.v} onChange={(e) => set(i, { v: e.target.value })} />
          <button className="btn btn-ghost btn-sm btn-icon" disabled={pairs.length === 1} onClick={() => onChange(pairs.filter((_, j) => j !== i))}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
