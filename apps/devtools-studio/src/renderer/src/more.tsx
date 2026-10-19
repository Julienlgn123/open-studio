import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import yaml from 'js-yaml'
import { Copy, Download, ImageUp, RefreshCw, Search } from 'lucide-react'
import { Segmented, toast, usePersisted } from '@ui'

// Outils ajoutés : mots de passe, comparaison de textes, conversions JSON/YAML/CSV/TypeScript,
// QR codes, image ↔ Base64, entités HTML, cron, permissions Unix, codes HTTP, faux texte.

const copy = (s: string): void => void window.kit.clipboard.write(s).then(() => toast('Copié', 'success'))

function CopyBox({ value, error, rows }: { value: string; error?: string | null; rows?: number }): JSX.Element {
  return (
    <div className="out">
      {error ? <div className="out-error">{error}</div> : <pre className="mono" style={rows ? { maxHeight: rows * 20 } : undefined}>{value || <span className="faint">—</span>}</pre>}
      {value && !error && (
        <button className="btn btn-ghost btn-sm btn-icon copy" onClick={() => copy(value)} title="Copier">
          <Copy size={13} />
        </button>
      )}
    </div>
  )
}

// ─── Mots de passe ─────────────────────────────────────────────────────────────────────────

const WORDS =
  'abricot balcon cactus dauphin eclair falaise girafe hamac igloo jardin koala lagune mangue nuage olive papillon quartz radis sapin tortue univers vanille wagon xylophone yaourt zebre ancre biscuit cerise domino ecume fusee grenade hibou iris jongleur kiwi lavande marmotte noisette orage panda quiche renard soleil tulipe velours violon bambou citron dragon epice flute gazelle hiver ivoire lutin moka neige orchidee pirate rubis sirop tigre vague comete prairie baleine cascade chocolat crayon etoile fromage glacier horizon lampion mirage ocean pepite rocher tempete voilier'.split(
    ' '
  )
const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/' }
const AMBIGUOUS = /[Il1O0o]/g
const rand = (n: number): number => {
  // Aléatoire cryptographique, sans biais de modulo.
  const max = Math.floor(0x100000000 / n) * n
  const a = new Uint32Array(1)
  do crypto.getRandomValues(a)
  while (a[0] >= max)
  return a[0] % n
}

export function PasswordTool(): JSX.Element {
  const [mode, setMode] = usePersisted<'chars' | 'words' | 'pin'>('pwMode', 'chars')
  const [len, setLen] = usePersisted('pwLen', 20)
  const [opts, setOpts] = usePersisted('pwOpts', { lower: true, upper: true, digits: true, symbols: true, noAmbiguous: false })
  const [wordCount, setWordCount] = usePersisted('pwWords', 5)
  const [count, setCount] = useState(5)
  const [seed, setSeed] = useState(0)

  const pool = useMemo(() => {
    let p = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => opts[k]).map((k) => SETS[k]).join('')
    if (opts.noAmbiguous) p = p.replace(AMBIGUOUS, '')
    return p
  }, [opts])
  const one = (): string => {
    if (mode === 'pin') return Array.from({ length: len }, () => rand(10)).join('')
    if (mode === 'words') {
      const ws = Array.from({ length: wordCount }, () => WORDS[rand(WORDS.length)])
      return ws.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join('-') + rand(100)
    }
    if (!pool) return ''
    // Au moins un caractère de chaque famille choisie.
    const chosen = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => opts[k])
    const chars = Array.from({ length: len }, () => pool[rand(pool.length)])
    chosen.forEach((k, i) => {
      if (i < len) {
        const set = opts.noAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]
        chars[rand(len)] = set[rand(set.length)]
      }
    })
    return chars.join('')
  }
  const list = useMemo(() => Array.from({ length: count }, one), [mode, len, opts, wordCount, count, seed, pool])
  const bits = mode === 'pin' ? len * Math.log2(10) : mode === 'words' ? wordCount * Math.log2(WORDS.length) + Math.log2(100) : len * Math.log2(Math.max(1, pool.length))
  const strength = bits < 40 ? ['Faible', 'weak'] : bits < 64 ? ['Moyen', 'mid'] : bits < 90 ? ['Solide', 'good'] : ['Excellent', 'great']
  // Temps pour tout essayer à 10 milliards d'essais/seconde.
  const secs = Math.pow(2, bits) / 1e10
  const crack = secs < 1 ? 'moins d’une seconde' : secs < 3600 ? `${Math.round(secs / 60)} minutes` : secs < 86400 * 365 ? `${Math.round(secs / 86400)} jours` : secs < 86400 * 365 * 1e6 ? `${Math.round(secs / (86400 * 365)).toLocaleString('fr-FR')} ans` : 'plus que l’âge de l’univers'

  return (
    <div className="ui-col">
      <div className="ui-row wrap-row">
        <Segmented value={mode} onChange={setMode} options={[{ id: 'chars', label: 'Caractères' }, { id: 'words', label: 'Phrase de passe' }, { id: 'pin', label: 'Code PIN' }]} />
        {mode === 'words' ? (
          <label className="ui-row faint">
            Mots <input type="range" min={3} max={10} value={wordCount} onChange={(e) => setWordCount(Number(e.target.value))} /> <b>{wordCount}</b>
          </label>
        ) : (
          <label className="ui-row faint">
            Longueur <input type="range" min={mode === 'pin' ? 4 : 6} max={mode === 'pin' ? 12 : 64} value={len} onChange={(e) => setLen(Number(e.target.value))} /> <b>{len}</b>
          </label>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setSeed(seed + 1)}>
          <RefreshCw size={13} /> Regénérer
        </button>
      </div>
      {mode === 'chars' && (
        <div className="ui-row wrap-row">
          {(
            [
              ['lower', 'a-z'],
              ['upper', 'A-Z'],
              ['digits', '0-9'],
              ['symbols', '!@#…'],
              ['noAmbiguous', 'Sans caractères ambigus (l, 1, O, 0)']
            ] as [keyof typeof opts, string][]
          ).map(([k, label]) => (
            <label key={k} className="ui-row faint">
              <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}
            </label>
          ))}
        </div>
      )}
      <div className={`strength ${strength[1]}`}>
        <div className="strength-bar">
          <span style={{ width: `${Math.min(100, (bits / 110) * 100)}%` }} />
        </div>
        <span>
          <b>{strength[0]}</b> · {Math.round(bits)} bits d’entropie · trouvé par force brute en {crack}
        </span>
      </div>
      <div className="pw-list">
        {list.map((p, i) => (
          <button key={i} className="pw mono" onClick={() => copy(p)} title="Cliquer pour copier">
            {p}
            <Copy size={13} />
          </button>
        ))}
      </div>
      <label className="ui-row faint">
        Nombre de propositions <input type="range" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} /> <b>{count}</b>
      </label>
      <p className="faint">Générés sur ton PC avec l’aléatoire cryptographique du système ; rien n’est envoyé ni enregistré.</p>
    </div>
  )
}

// ─── Comparer deux textes ──────────────────────────────────────────────────────────────────

type Op = { t: 'same' | 'add' | 'del'; a?: number; b?: number; text: string }
/** Différence ligne à ligne (plus longue sous-suite commune). */
function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  if (n * m > 4_000_000) return [{ t: 'del', text: '(textes trop longs pour être comparés ligne à ligne)' }]
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) out.push({ t: 'same', a: ++i, b: ++j, text: a[i - 1] })
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', a: ++i, text: a[i - 1] })
    else out.push({ t: 'add', b: ++j, text: b[j - 1] })
  }
  while (i < n) out.push({ t: 'del', a: ++i, text: a[i - 1] })
  while (j < m) out.push({ t: 'add', b: ++j, text: b[j - 1] })
  return out
}

export function DiffTool(): JSX.Element {
  const [a, setA] = usePersisted('diffA', 'Bonjour à tous\nVoici la version 1\nFin du texte')
  const [b, setB] = usePersisted('diffB', 'Bonjour à tous\nVoici la version 2\nAvec une ligne en plus\nFin du texte')
  const [ignoreSpace, setIgnoreSpace] = useState(false)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [onlyChanges, setOnlyChanges] = useState(false)
  const ops = useMemo(() => {
    const norm = (s: string): string => {
      let x = s
      if (ignoreSpace) x = x.replace(/\s+/g, ' ').trim()
      if (ignoreCase) x = x.toLowerCase()
      return x
    }
    const la = a.split('\n')
    const lb = b.split('\n')
    const raw = diffLines(la.map(norm), lb.map(norm))
    return raw.map((o) => ({ ...o, text: o.t === 'add' ? lb[(o.b ?? 1) - 1] : la[(o.a ?? 1) - 1] ?? o.text }))
  }, [a, b, ignoreSpace, ignoreCase])
  const adds = ops.filter((o) => o.t === 'add').length
  const dels = ops.filter((o) => o.t === 'del').length
  return (
    <div className="ui-col">
      <div className="two">
        <textarea className="textarea mono" rows={9} value={a} onChange={(e) => setA(e.target.value)} placeholder="Texte d’origine" spellCheck={false} />
        <textarea className="textarea mono" rows={9} value={b} onChange={(e) => setB(e.target.value)} placeholder="Texte modifié" spellCheck={false} />
      </div>
      <div className="ui-row wrap-row">
        <span className="chip success">+{adds} ajoutée{adds > 1 ? 's' : ''}</span>
        <span className="chip danger">−{dels} supprimée{dels > 1 ? 's' : ''}</span>
        {!adds && !dels && <span className="chip">Textes identiques</span>}
        <label className="ui-row faint">
          <input type="checkbox" checked={ignoreSpace} onChange={(e) => setIgnoreSpace(e.target.checked)} /> Ignorer les espaces
        </label>
        <label className="ui-row faint">
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> Ignorer majuscules
        </label>
        <label className="ui-row faint">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Seulement les différences
        </label>
      </div>
      <div className="diff mono">
        {ops
          .filter((o) => !onlyChanges || o.t !== 'same')
          .map((o, i) => (
            <div key={i} className={`dl ${o.t}`}>
              <span className="ln">{o.a ?? ''}</span>
              <span className="ln">{o.b ?? ''}</span>
              <span className="sign">{o.t === 'add' ? '+' : o.t === 'del' ? '−' : ' '}</span>
              <span className="txt">{o.text || ' '}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ─── Conversions de données ────────────────────────────────────────────────────────────────

type Fmt = 'json' | 'yaml' | 'csv' | 'ts'

function parseCsv(text: string): Record<string, string>[] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : text.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()))
  if (!head) return []
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])))
}
function toCsv(data: unknown): string {
  const arr = Array.isArray(data) ? data : [data]
  const keys = [...new Set(arr.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : ['valeur'])))]
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [keys.join(','), ...arr.map((r) => keys.map((k) => esc(r && typeof r === 'object' ? (r as Record<string, unknown>)[k] : r)).join(','))].join('\n')
}
/** Interfaces TypeScript déduites d'un exemple JSON. */
function toTs(data: unknown, name = 'Racine'): string {
  const out: string[] = []
  const pascal = (s: string): string => s.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/^\d/, '_$&') || 'Element'
  const typeOf = (v: unknown, key: string): string => {
    if (v === null) return 'null'
    if (Array.isArray(v)) {
      if (!v.length) return 'unknown[]'
      const types = [...new Set(v.map((x) => typeOf(x, key.replace(/s$/, ''))))]
      return types.length === 1 ? `${types[0]}[]` : `(${types.join(' | ')})[]`
    }
    if (typeof v === 'object') {
      const n = pascal(key)
      emit(v as Record<string, unknown>, n)
      return n
    }
    return typeof v
  }
  const seen = new Set<string>()
  const emit = (obj: Record<string, unknown>, n: string): void => {
    if (seen.has(n)) return
    seen.add(n)
    const lines = Object.entries(obj).map(([k, v]) => `  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${typeOf(v, k)}`)
    out.push(`export interface ${n} {\n${lines.join('\n')}\n}`)
  }
  const root = typeOf(data, name)
  if (!out.length) return `export type ${name} = ${root}`
  if (Array.isArray(data)) out.push(`export type ${name}Liste = ${root}`)
  return out.reverse().join('\n\n')
}

export function ConvertTool(): JSX.Element {
  const [from, setFrom] = usePersisted<Fmt>('convFrom', 'json')
  const [to, setTo] = usePersisted<Fmt>('convTo', 'yaml')
  const [input, setInput] = usePersisted('convInput', '[\n  { "nom": "Alice", "age": 31, "ville": "Lyon" },\n  { "nom": "Bob", "age": 27, "ville": "Tours" }\n]')
  const { out, err } = useMemo(() => {
    if (!input.trim()) return { out: '', err: null as string | null }
    try {
      const data = from === 'json' ? JSON.parse(input) : from === 'yaml' ? yaml.load(input) : parseCsv(input)
      const out = to === 'json' ? JSON.stringify(data, null, 2) : to === 'yaml' ? yaml.dump(data, { lineWidth: 120 }) : to === 'csv' ? toCsv(data) : toTs(data)
      return { out, err: null }
    } catch (e) {
      return { out: '', err: `Entrée ${from.toUpperCase()} invalide : ${(e as Error).message}` }
    }
  }, [input, from, to])
  const fmts: { id: Fmt; label: string }[] = [
    { id: 'json', label: 'JSON' },
    { id: 'yaml', label: 'YAML' },
    { id: 'csv', label: 'CSV' }
  ]
  return (
    <div className="two">
      <div className="ui-col">
        <Segmented value={from === 'ts' ? 'json' : from} onChange={setFrom} options={fmts} />
        <textarea className="textarea mono big" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
      </div>
      <div className="ui-col">
        <Segmented value={to} onChange={setTo} options={[...fmts, { id: 'ts', label: 'TypeScript' }]} />
        <CopyBox value={out} error={err} />
      </div>
    </div>
  )
}

// ─── QR code ───────────────────────────────────────────────────────────────────────────────

export function QrTool(): JSX.Element {
  const [kind, setKind] = usePersisted<'text' | 'wifi' | 'contact'>('qrKind', 'text')
  const [text, setText] = usePersisted('qrText', 'https://github.com/Julienlgn123/open-studio')
  const [wifi, setWifi] = usePersisted('qrWifi', { ssid: '', pass: '', sec: 'WPA' })
  const [card, setCard] = usePersisted('qrCard', { name: '', phone: '', email: '' })
  const [fg, setFg] = usePersisted('qrFg', '#111111')
  const [bg, setBg] = usePersisted('qrBg', '#ffffff')
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M')
  const [url, setUrl] = useState('')
  const [svg, setSvg] = useState('')
  const esc = (s: string): string => s.replace(/([\\;,:"])/g, '\\$1')
  const payload =
    kind === 'wifi'
      ? `WIFI:T:${wifi.sec};S:${esc(wifi.ssid)};P:${esc(wifi.pass)};;`
      : kind === 'contact'
        ? `BEGIN:VCARD\nVERSION:3.0\nFN:${card.name}\nTEL:${card.phone}\nEMAIL:${card.email}\nEND:VCARD`
        : text
  useEffect(() => {
    if (!payload.trim()) return setUrl('')
    const o = { errorCorrectionLevel: level, margin: 2, color: { dark: fg, light: bg }, width: 640 }
    QRCode.toDataURL(payload, o).then(setUrl, () => setUrl(''))
    QRCode.toString(payload, { ...o, type: 'svg' }).then(setSvg, () => setSvg(''))
  }, [payload, fg, bg, level])
  const save = async (fmt: 'png' | 'svg'): Promise<void> => {
    const path = await window.kit.files.save({ title: 'Enregistrer le QR code', defaultPath: `qrcode.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] })
    if (!path) return
    if (fmt === 'png') await window.kit.files.writeBase64(path, url.split(',')[1])
    else await window.kit.files.writeText(path, svg)
    toast('QR code enregistré', 'success')
  }
  return (
    <div className="two">
      <div className="ui-col">
        <Segmented value={kind} onChange={setKind} options={[{ id: 'text', label: 'Lien ou texte' }, { id: 'wifi', label: 'Wi-Fi' }, { id: 'contact', label: 'Contact' }]} />
        {kind === 'text' && <textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Un lien, un texte…" />}
        {kind === 'wifi' && (
          <>
            <input className="input" value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} placeholder="Nom du réseau (SSID)" />
            <input className="input" value={wifi.pass} onChange={(e) => setWifi({ ...wifi, pass: e.target.value })} placeholder="Mot de passe" />
            <select className="select" value={wifi.sec} onChange={(e) => setWifi({ ...wifi, sec: e.target.value })}>
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Sans mot de passe</option>
            </select>
            <p className="faint">Les invités scannent et se connectent sans taper le mot de passe.</p>
          </>
        )}
        {kind === 'contact' && (
          <>
            <input className="input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Nom" />
            <input className="input" value={card.phone} onChange={(e) => setCard({ ...card, phone: e.target.value })} placeholder="Téléphone" />
            <input className="input" value={card.email} onChange={(e) => setCard({ ...card, email: e.target.value })} placeholder="E-mail" />
          </>
        )}
        <div className="ui-row wrap-row">
          <label className="ui-row faint">
            Couleur <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
          </label>
          <label className="ui-row faint">
            Fond <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
          </label>
          <label className="ui-row faint">
            Robustesse
            <select className="select select-sm" value={level} onChange={(e) => setLevel(e.target.value as 'M')}>
              <option value="L">Faible (7 %)</option>
              <option value="M">Normale (15 %)</option>
              <option value="Q">Bonne (25 %)</option>
              <option value="H">Maximale (30 %)</option>
            </select>
          </label>
        </div>
      </div>
      <div className="ui-col qr-out">
        {url ? <img src={url} alt="QR code" className="qr-img" /> : <p className="faint">Le QR code apparaîtra ici.</p>}
        {url && (
          <div className="ui-row">
            <button className="btn btn-primary btn-sm" onClick={() => void save('png')}>
              <Download size={13} /> PNG
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => void save('svg')}>
              <Download size={13} /> SVG (vectoriel)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Image ↔ Base64 ────────────────────────────────────────────────────────────────────────

export function ImageB64Tool(): JSX.Element {
  const [data, setData] = useState('')
  const [info, setInfo] = useState('')
  const [input, setInput] = useState('')
  const pick = async (): Promise<void> => {
    const [path] = await window.kit.files.open({ title: 'Choisir une image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'] }] })
    if (!path) return
    const ext = path.split('.').pop()!.toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext === 'ico' ? 'x-icon' : ext
    const b64 = await window.kit.files.readBase64(path)
    setData(`data:image/${mime};base64,${b64}`)
    setInfo(`${path.split(/[\\/]/).pop()} · ${(b64.length * 0.75 / 1024).toFixed(1)} Ko → ${(b64.length / 1024).toFixed(1)} Ko en Base64`)
  }
  const saveDecoded = async (): Promise<void> => {
    const m = input.trim().match(/^data:image\/([\w+.-]+);base64,(.+)$/s)
    const b64 = m ? m[2] : input.trim()
    const ext = m ? m[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg') : 'png'
    const path = await window.kit.files.save({ title: 'Enregistrer l’image', defaultPath: `image.${ext}` })
    if (!path) return
    await window.kit.files.writeBase64(path, b64.replace(/\s/g, ''))
    toast('Image enregistrée', 'success')
  }
  const preview = input.trim().startsWith('data:image') ? input.trim() : input.trim() ? `data:image/png;base64,${input.trim()}` : ''
  return (
    <div className="two">
      <div className="ui-col">
        <b>Image → Base64</b>
        <button className="btn btn-secondary" onClick={() => void pick()}>
          <ImageUp size={14} /> Choisir une image
        </button>
        {info && <span className="faint">{info}</span>}
        {data && <img src={data} alt="" className="b64-preview" />}
        <CopyBox value={data} rows={8} />
        {data && (
          <div className="ui-row wrap-row">
            <button className="btn btn-ghost btn-sm" onClick={() => copy(`<img src="${data}" alt="">`)}>
              Copier en balise &lt;img&gt;
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(`background-image: url("${data}");`)}>
              Copier en CSS
            </button>
          </div>
        )}
      </div>
      <div className="ui-col">
        <b>Base64 → image</b>
        <textarea className="textarea mono" rows={8} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Colle un data:image/…;base64,… ou du Base64 brut" />
        {preview && <img src={preview} alt="Aperçu" className="b64-preview" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} onLoad={(e) => ((e.target as HTMLImageElement).style.display = '')} />}
        {input.trim() && (
          <button className="btn btn-secondary btn-sm" onClick={() => void saveDecoded()}>
            <Download size={13} /> Enregistrer l’image
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Entités HTML ──────────────────────────────────────────────────────────────────────────

export function HtmlEntitiesTool(): JSX.Element {
  const [mode, setMode] = useState<'enc' | 'dec'>('enc')
  const [all, setAll] = useState(false)
  const [input, setInput] = useState('<p>Café « crème » & croissant — 5 €</p>')
  const out = useMemo(() => {
    if (mode === 'dec') {
      const t = document.createElement('textarea')
      t.innerHTML = input
      return t.value
    }
    return input.replace(all ? /[^\w\s]/gu : /[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? `&#${c.codePointAt(0)};`)
  }, [input, mode, all])
  return (
    <div className="ui-col">
      <div className="ui-row">
        <Segmented value={mode} onChange={setMode} options={[{ id: 'enc', label: 'Encoder' }, { id: 'dec', label: 'Décoder' }]} />
        {mode === 'enc' && (
          <label className="ui-row faint">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Encoder aussi les accents et symboles
          </label>
        )}
      </div>
      <textarea className="textarea mono" rows={6} value={input} onChange={(e) => setInput(e.target.value)} />
      <CopyBox value={out} />
    </div>
  )
}

// ─── Cron ──────────────────────────────────────────────────────────────────────────────────

const CRON_PRESETS: [string, string][] = [
  ['*/5 * * * *', 'Toutes les 5 minutes'],
  ['0 * * * *', 'Toutes les heures'],
  ['0 9 * * 1-5', 'En semaine à 9 h'],
  ['30 2 * * *', 'Chaque nuit à 2 h 30'],
  ['0 0 1 * *', 'Le 1er de chaque mois'],
  ['0 18 * * 5', 'Le vendredi à 18 h']
]
function cronField(f: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of f.split(',')) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!m) return null
    const lo = m[1] === '*' ? min : Number(m[1])
    const hi = m[2] ? Number(m[2]) : m[1] === '*' || m[3] ? max : lo
    const step = m[3] ? Number(m[3]) : 1
    if (lo < min || hi > max || lo > hi || step < 1) return null
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}
const DOW = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export function CronTool(): JSX.Element {
  const [expr, setExpr] = usePersisted('cron', '0 9 * * 1-5')
  const parts = expr.trim().split(/\s+/)
  let error = ''
  let next: Date[] = []
  let text = ''
  if (parts.length !== 5) error = 'Il faut 5 champs : minute heure jour-du-mois mois jour-de-la-semaine.'
  else {
    const [mi, h, dom, mo, dw] = [cronField(parts[0], 0, 59), cronField(parts[1], 0, 23), cronField(parts[2], 1, 31), cronField(parts[3], 1, 12), cronField(parts[4].replace(/\b7\b/, '0'), 0, 6)]
    if (!mi || !h || !dom || !mo || !dw) error = 'Un des champs est invalide.'
    else {
      const t = new Date()
      t.setSeconds(0, 0)
      t.setMinutes(t.getMinutes() + 1)
      const domAny = parts[2] === '*'
      const dwAny = parts[4] === '*'
      for (let i = 0; i < 600_000 && next.length < 8; i++) {
        const dayOk = domAny && dwAny ? true : domAny ? dw.has(t.getDay()) : dwAny ? dom.has(t.getDate()) : dom.has(t.getDate()) || dw.has(t.getDay())
        if (mo.has(t.getMonth() + 1) && dayOk && h.has(t.getHours()) && mi.has(t.getMinutes())) next.push(new Date(t))
        t.setMinutes(t.getMinutes() + 1)
      }
      const list = (s: Set<number>, f: (n: number) => string = String): string => [...s].map(f).join(', ')
      text = [
        parts[0] === '*' ? 'chaque minute' : parts[0].startsWith('*/') ? `toutes les ${parts[0].slice(2)} minutes` : `à la minute ${list(mi)}`,
        parts[1] === '*' ? '' : parts[1].startsWith('*/') ? `toutes les ${parts[1].slice(2)} heures` : `à ${list(h, (x) => `${x} h`)}`,
        domAny ? '' : `le ${list(dom)} du mois`,
        parts[3] === '*' ? '' : `en ${list(mo, (x) => new Date(2000, x - 1).toLocaleDateString('fr-FR', { month: 'long' }))}`,
        dwAny ? '' : `le ${list(dw, (x) => DOW[x])}`
      ]
        .filter(Boolean)
        .join(', ')
    }
  }
  return (
    <div className="ui-col">
      <input className="input mono big-in" value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} />
      <div className="cron-legend faint mono">minute · heure · jour du mois · mois · jour de la semaine (0 = dimanche)</div>
      <div className="ui-row wrap-row">
        {CRON_PRESETS.map(([c, l]) => (
          <button key={c} className="btn btn-ghost btn-sm" onClick={() => setExpr(c)}>
            {l}
          </button>
        ))}
      </div>
      {error ? (
        <div className="out-error">{error}</div>
      ) : (
        <>
          <p className="cron-text">
            <b>En clair :</b> {text}.
          </p>
          <b className="faint">Prochaines exécutions</b>
          <div className="next-list">
            {next.map((d, i) => (
              <span key={i} className="chip">
                {d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            ))}
            {!next.length && <span className="faint">Jamais dans l’année qui vient.</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Permissions Unix (chmod) ──────────────────────────────────────────────────────────────

export function ChmodTool(): JSX.Element {
  const [bits, setBits] = useState([7, 5, 5])
  const who = ['Propriétaire', 'Groupe', 'Autres']
  const what: [number, string][] = [
    [4, 'Lecture'],
    [2, 'Écriture'],
    [1, 'Exécution']
  ]
  const octal = bits.join('')
  const sym = bits.map((b) => `${b & 4 ? 'r' : '-'}${b & 2 ? 'w' : '-'}${b & 1 ? 'x' : '-'}`).join('')
  return (
    <div className="ui-col">
      <table className="table chmod">
        <thead>
          <tr>
            <th />
            {what.map(([, l]) => (
              <th key={l}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {who.map((w, i) => (
            <tr key={w}>
              <td>{w}</td>
              {what.map(([v]) => (
                <td key={v}>
                  <input type="checkbox" checked={!!(bits[i] & v)} onChange={() => setBits(bits.map((b, j) => (j === i ? b ^ v : b)))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ui-row wrap-row">
        <input
          className="input mono big-in"
          style={{ width: 120 }}
          value={octal}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-7]/g, '').slice(-3).padStart(3, '0')
            setBits(v.split('').map(Number))
          }}
        />
        <span className="chip mono">{sym}</span>
      </div>
      <CopyBox value={`chmod ${octal} fichier`} />
    </div>
  )
}

// ─── Codes HTTP ────────────────────────────────────────────────────────────────────────────

const HTTP: [number, string, string][] = [
  [100, 'Continue', 'Le serveur a reçu les en-têtes, le client peut envoyer le corps.'],
  [101, 'Switching Protocols', 'Changement de protocole (WebSocket…).'],
  [200, 'OK', 'Tout s’est bien passé.'],
  [201, 'Created', 'Ressource créée (souvent après un POST).'],
  [202, 'Accepted', 'Demande acceptée, traitement plus tard.'],
  [204, 'No Content', 'Succès, sans contenu à renvoyer.'],
  [206, 'Partial Content', 'Une partie du fichier (téléchargement par morceaux).'],
  [301, 'Moved Permanently', 'Redirection définitive vers une autre adresse.'],
  [302, 'Found', 'Redirection temporaire.'],
  [304, 'Not Modified', 'Rien n’a changé : utilise ta version en cache.'],
  [307, 'Temporary Redirect', 'Redirection temporaire, même méthode HTTP.'],
  [308, 'Permanent Redirect', 'Redirection définitive, même méthode HTTP.'],
  [400, 'Bad Request', 'Requête mal formée (paramètres, JSON…).'],
  [401, 'Unauthorized', 'Pas authentifié : il manque un jeton ou un identifiant.'],
  [403, 'Forbidden', 'Authentifié, mais pas le droit.'],
  [404, 'Not Found', 'Cette adresse n’existe pas.'],
  [405, 'Method Not Allowed', 'Méthode non acceptée (GET au lieu de POST…).'],
  [408, 'Request Timeout', 'Le client a mis trop de temps.'],
  [409, 'Conflict', 'Conflit avec l’état actuel (doublon…).'],
  [410, 'Gone', 'Supprimé définitivement.'],
  [413, 'Payload Too Large', 'Corps de requête trop gros.'],
  [415, 'Unsupported Media Type', 'Content-Type non pris en charge.'],
  [418, 'I’m a teapot', 'Blague du 1er avril 1998, devenue culte.'],
  [422, 'Unprocessable Entity', 'Format correct mais données invalides.'],
  [429, 'Too Many Requests', 'Trop de requêtes : ralentis (limite de débit).'],
  [500, 'Internal Server Error', 'Le serveur a planté.'],
  [501, 'Not Implemented', 'Fonction non prise en charge par le serveur.'],
  [502, 'Bad Gateway', 'Le serveur intermédiaire a reçu une mauvaise réponse.'],
  [503, 'Service Unavailable', 'Serveur surchargé ou en maintenance.'],
  [504, 'Gateway Timeout', 'Le serveur intermédiaire n’a pas eu de réponse à temps.']
]

export function HttpCodesTool(): JSX.Element {
  const [q, setQ] = useState('')
  const list = HTTP.filter(([c, n, d]) => !q || `${c} ${n} ${d}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="ui-col">
      <label className="search">
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code ou mot-clé (404, redirection, cache…)" autoFocus />
      </label>
      <div className="http-list">
        {list.map(([c, n, d]) => (
          <div key={c} className={`http-row c${String(c)[0]}`}>
            <b className="mono">{c}</b>
            <span>
              <b>{n}</b>
              <span className="faint"> — {d}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Faux texte ────────────────────────────────────────────────────────────────────────────

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ')

export function LoremTool(): JSX.Element {
  const [n, setN] = useState(3)
  const [unit, setUnit] = useState<'p' | 's' | 'w'>('p')
  const [seed, setSeed] = useState(0)
  const out = useMemo(() => {
    const word = (): string => LOREM[Math.floor(Math.random() * LOREM.length)]
    const sentence = (): string => {
      const w = Array.from({ length: 8 + Math.floor(Math.random() * 10) }, word).join(' ')
      return w[0].toUpperCase() + w.slice(1) + '.'
    }
    const para = (): string => Array.from({ length: 4 + Math.floor(Math.random() * 4) }, sentence).join(' ')
    if (unit === 'w') return Array.from({ length: n }, word).join(' ')
    if (unit === 's') return Array.from({ length: n }, sentence).join(' ')
    return Array.from({ length: n }, (_, i) => (i === 0 ? 'Lorem ipsum dolor sit amet, ' + para().toLowerCase() : para())).join('\n\n')
  }, [n, unit, seed])
  return (
    <div className="ui-col">
      <div className="ui-row wrap-row">
        <input className="input" type="number" min={1} max={500} value={n} onChange={(e) => setN(Math.max(1, Math.min(500, Number(e.target.value))))} style={{ width: 90 }} />
        <Segmented value={unit} onChange={setUnit} options={[{ id: 'p', label: 'Paragraphes' }, { id: 's', label: 'Phrases' }, { id: 'w', label: 'Mots' }]} />
        <button className="btn btn-ghost btn-sm" onClick={() => setSeed(seed + 1)}>
          <RefreshCw size={13} /> Autre
        </button>
      </div>
      <CopyBox value={out} />
    </div>
  )
}
