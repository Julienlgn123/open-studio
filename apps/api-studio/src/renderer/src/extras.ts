// Fonctions utilitaires du client API : cURL, génération de code, chemins JSON, Postman.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type BodyKind = 'none' | 'json' | 'text' | 'form'
export interface Pair {
  on: boolean
  k: string
  v: string
}
export type TestKind = 'status' | 'statusRange' | 'contains' | 'json' | 'time' | 'header'
export interface Test {
  id: string
  kind: TestKind
  /** Chemin JSON ou nom d'en-tête selon le type. */
  target: string
  expected: string
}
export interface Req {
  id: string
  name: string
  method: Method
  url: string
  params: Pair[]
  headers: Pair[]
  bodyKind: BodyKind
  body: string
  auth: { kind: 'none' | 'bearer' | 'basic'; token: string; user: string; pass: string }
  folder?: string
  tests?: Test[]
  /** Variables à remplir depuis la réponse : k = nom de variable, v = chemin JSON. */
  extract?: Pair[]
}

const empty = (): Pair[] => [{ on: true, k: '', v: '' }]

/** Lit un chemin du type `data.items[0].id` (ou `$.data.items[0].id`) dans un objet. */
export function jsonPath(data: unknown, path: string): unknown {
  const parts = path
    .trim()
    .replace(/^\$\.?/, '')
    .split(/\.|\[(\d+)\]/)
    .filter((p) => p !== undefined && p !== '')
  let cur: unknown = data
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = Array.isArray(cur) && /^\d+$/.test(p) ? cur[Number(p)] : (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Découpe une ligne de commande comme un shell (guillemets simples/doubles, échappements). */
function shellSplit(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: '"' | "'" | null = null
  let has = false
  const s = cmd.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]
      else cur += c
    } else if (c === '"' || c === "'") {
      q = c
      has = true
    } else if (c === '\\' && i + 1 < s.length) cur += s[++i]
    else if (/\s/.test(c)) {
      if (cur || has) out.push(cur)
      cur = ''
      has = false
    } else cur += c
  }
  if (cur || has) out.push(cur)
  return out
}

/** Transforme une commande cURL (copiée depuis le navigateur ou une doc) en requête. */
export function fromCurl(cmd: string, id: string): Req | null {
  const a = shellSplit(cmd.trim())
  if (!a.length || !/^curl(\.exe)?$/i.test(a[0])) return null
  const r: Req = { id, name: '', method: 'GET', url: '', params: empty(), headers: [], bodyKind: 'none', body: '', auth: { kind: 'none', token: '', user: '', pass: '' } }
  let explicitMethod = false
  for (let i = 1; i < a.length; i++) {
    const t = a[i]
    const next = (): string => a[++i] ?? ''
    if (t === '-X' || t === '--request') {
      r.method = next().toUpperCase() as Req['method']
      explicitMethod = true
    } else if (t === '-H' || t === '--header') {
      const h = next()
      const idx = h.indexOf(':')
      if (idx > 0) {
        const k = h.slice(0, idx).trim()
        const v = h.slice(idx + 1).trim()
        if (/^authorization$/i.test(k) && /^bearer\s+/i.test(v)) r.auth = { ...r.auth, kind: 'bearer', token: v.replace(/^bearer\s+/i, '') }
        else r.headers.push({ on: true, k, v })
      }
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode', '--json'].includes(t)) {
      const d = next()
      r.body = r.body ? `${r.body}&${d}` : d
      if (!explicitMethod) r.method = 'POST'
      if (t === '--json') r.headers.push({ on: true, k: 'Content-Type', v: 'application/json' })
    } else if (t === '-u' || t === '--user') {
      const [user, ...pass] = next().split(':')
      r.auth = { ...r.auth, kind: 'basic', user, pass: pass.join(':') }
    } else if (t === '-I' || t === '--head') {
      r.method = 'HEAD'
      explicitMethod = true
    } else if (t === '--url') r.url = next()
    else if (t === '-b' || t === '--cookie') r.headers.push({ on: true, k: 'Cookie', v: next() })
    else if (t === '-A' || t === '--user-agent') r.headers.push({ on: true, k: 'User-Agent', v: next() })
    else if (t === '-e' || t === '--referer') r.headers.push({ on: true, k: 'Referer', v: next() })
    else if (['-o', '--output', '-m', '--max-time', '--connect-timeout', '-w', '--write-out', '-x', '--proxy'].includes(t)) next()
    else if (!t.startsWith('-') && !r.url) r.url = t
  }
  if (r.body) {
    const ct = r.headers.find((h) => /^content-type$/i.test(h.k))?.v ?? ''
    r.bodyKind = /json/i.test(ct) || /^\s*[[{]/.test(r.body) ? 'json' : /form/i.test(ct) || /^[\w%.-]+=/.test(r.body) ? 'form' : 'text'
    if (r.bodyKind === 'json') {
      try {
        r.body = JSON.stringify(JSON.parse(r.body), null, 2)
      } catch {
        /* gardé tel quel */
      }
    }
  }
  // Les paramètres de l'URL passent dans l'onglet Paramètres.
  try {
    const u = new URL(r.url)
    const ps = [...u.searchParams].map(([k, v]) => ({ on: true, k, v }))
    if (ps.length) {
      r.params = [...ps, ...empty()]
      r.url = `${u.origin}${u.pathname}`
    }
  } catch {
    /* URL avec variables : laissée telle quelle */
  }
  r.headers.push(...empty())
  r.name = `${r.method} ${r.url.replace(/^https?:\/\//, '').slice(0, 40)}`
  return r
}

export interface Prepared {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

const sq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

export function toCode(p: Prepared, lang: 'curl' | 'fetch' | 'python' | 'powershell' | 'axios'): string {
  const h = Object.entries(p.headers)
  switch (lang) {
    case 'curl':
      return [`curl -X ${p.method} ${sq(p.url)}`, ...h.map(([k, v]) => `  -H ${sq(`${k}: ${v}`)}`), ...(p.body ? [`  --data-raw ${sq(p.body)}`] : [])].join(' \\\n')
    case 'fetch':
      return `const res = await fetch(${JSON.stringify(p.url)}, {\n  method: ${JSON.stringify(p.method)},${h.length ? `\n  headers: ${JSON.stringify(Object.fromEntries(h), null, 2).replace(/\n/g, '\n  ')},` : ''}${p.body ? `\n  body: ${JSON.stringify(p.body)},` : ''}\n})\nconst data = await res.${/json/i.test(p.headers['Accept'] ?? 'json') ? 'json' : 'text'}()\nconsole.log(res.status, data)`
    case 'axios':
      return `import axios from 'axios'\n\nconst { status, data } = await axios({\n  method: ${JSON.stringify(p.method.toLowerCase())},\n  url: ${JSON.stringify(p.url)},${h.length ? `\n  headers: ${JSON.stringify(Object.fromEntries(h), null, 2).replace(/\n/g, '\n  ')},` : ''}${p.body ? `\n  data: ${JSON.stringify(p.body)},` : ''}\n})\nconsole.log(status, data)`
    case 'python':
      return `import requests\n\nres = requests.request(\n    ${JSON.stringify(p.method)},\n    ${JSON.stringify(p.url)},${h.length ? `\n    headers=${JSON.stringify(Object.fromEntries(h), null, 4).replace(/\n/g, '\n    ')},` : ''}${p.body ? `\n    data=${JSON.stringify(p.body)},` : ''}\n)\nprint(res.status_code)\nprint(res.text)`
    case 'powershell':
      return `$headers = @{\n${h.map(([k, v]) => `  ${JSON.stringify(k)} = ${JSON.stringify(v)}`).join('\n')}\n}\nInvoke-RestMethod -Method ${p.method} -Uri ${JSON.stringify(p.url)} -Headers $headers${p.body ? ` -Body '${p.body.replace(/'/g, "''")}'` : ''}`
  }
}

/** Collection Postman v2.x (champs courants) → requêtes. */
export function fromPostman(json: unknown, newId: () => string): Req[] {
  const out: Req[] = []
  const walk = (items: unknown[], folder?: string): void => {
    for (const it of items as Record<string, unknown>[]) {
      if (Array.isArray(it.item)) {
        walk(it.item, String(it.name ?? folder ?? ''))
        continue
      }
      const rq = it.request as Record<string, unknown> | string | undefined
      if (!rq) continue
      const req = typeof rq === 'string' ? { url: rq } : rq
      const url = typeof req.url === 'string' ? req.url : String((req.url as Record<string, unknown>)?.raw ?? '')
      const headers = ((req.header as { key: string; value: string; disabled?: boolean }[]) ?? []).map((h) => ({ on: !h.disabled, k: h.key, v: h.value }))
      const body = req.body as { mode?: string; raw?: string; urlencoded?: { key: string; value: string }[] } | undefined
      let bodyKind: BodyKind = 'none'
      let text = ''
      if (body?.mode === 'raw' && body.raw) {
        text = body.raw
        bodyKind = /^\s*[[{]/.test(text) ? 'json' : 'text'
      } else if (body?.mode === 'urlencoded' && body.urlencoded) {
        text = body.urlencoded.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
        bodyKind = 'form'
      }
      const auth = req.auth as { type?: string; bearer?: { key: string; value: string }[]; basic?: { key: string; value: string }[] } | undefined
      const val = (arr: { key: string; value: string }[] | undefined, k: string): string => arr?.find((x) => x.key === k)?.value ?? ''
      out.push({
        id: newId(),
        name: String(it.name ?? url),
        method: String(req.method ?? 'GET').toUpperCase() as Method,
        url: url.replace(/\{\{(\w+)\}\}/g, '{{$1}}'),
        params: empty(),
        headers: [...headers, ...empty()],
        bodyKind,
        body: text,
        auth:
          auth?.type === 'bearer'
            ? { kind: 'bearer', token: val(auth.bearer, 'token'), user: '', pass: '' }
            : auth?.type === 'basic'
              ? { kind: 'basic', token: '', user: val(auth.basic, 'username'), pass: val(auth.basic, 'password') }
              : { kind: 'none', token: '', user: '', pass: '' },
        folder
      })
    }
  }
  const root = json as { item?: unknown[] }
  if (Array.isArray(root?.item)) walk(root.item)
  return out
}
