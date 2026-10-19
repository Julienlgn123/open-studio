import { useEffect, useMemo, useState } from 'react'
import { all, create } from 'mathjs'
import { ArrowLeftRight, Copy, Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import { Page, Segmented, toast, uid, usePersisted } from '@ui'

// Espaces supplémentaires de la calculatrice : programmeur, devises, dates, finances,
// statistiques (et moyennes de notes), algèbre.

const math = create(all, { number: 'number', precision: 14 })

/** « 1 234,5 » ou « 1234.5 » → nombre. */
export const num = (s: string): number => {
  const t = s.replace(/\s| | /g, '').replace(',', '.')
  return t === '' ? NaN : Number(t)
}
export const fr = (n: number, digits = 2): string =>
  Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : '—'
const eur = (n: number): string => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—')
const copy = (text: string): void => void window.kit.clipboard.write(text).then(() => toast('Copié', 'success'))

function Field({ label, value, onChange, suffix, wide }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; wide?: boolean }): JSX.Element {
  return (
    <label className={`field calc-field${wide ? ' wide' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="input-suffix">
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
        {suffix && <span className="faint">{suffix}</span>}
      </span>
    </label>
  )
}
function Out({ label, value, big, copyText }: { label: string; value: string; big?: boolean; copyText?: string }): JSX.Element {
  return (
    <button className={`ui-card out${big ? ' big' : ''}`} onClick={() => copy(copyText ?? value.replace(/\s| /g, '').replace('€', ''))} title="Copier">
      <span className="faint">{label}</span>
      <b>{value}</b>
    </button>
  )
}

// ─── Programmeur ───────────────────────────────────────────────────────────────────────────

type Base = 2 | 8 | 10 | 16
const BASES: { id: Base; label: string }[] = [
  { id: 16, label: 'HEX' },
  { id: 10, label: 'DEC' },
  { id: 8, label: 'OCT' },
  { id: 2, label: 'BIN' }
]
const OPS = ['AND', 'OR', 'XOR', 'NAND', 'NOR', '<<', '>>', '+', '−', '×', '÷', 'mod'] as const

function parseBig(s: string, base: Base): bigint | null {
  const t = s.trim().replace(/[\s_]/g, '').toLowerCase()
  if (!t) return 0n
  const neg = t.startsWith('-')
  const body = neg ? t.slice(1) : t
  const valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/ }[base]
  if (!valid.test(body)) return null
  const v = BigInt((base === 10 ? '' : base === 16 ? '0x' : base === 8 ? '0o' : '0b') + body)
  return neg ? -v : v
}

export function ProgrammerView(): JSX.Element {
  const [bits, setBits] = usePersisted<8 | 16 | 32 | 64>('progBits', 32)
  const [signed, setSigned] = usePersisted('progSigned', true)
  const [base, setBase] = useState<Base>(10)
  const [a, setA] = useState('255')
  const [b, setB] = useState('')
  const [op, setOp] = useState<(typeof OPS)[number]>('AND')

  const mask = (1n << BigInt(bits)) - 1n
  /** Valeur ramenée à la taille de mot (complément à deux si signé). */
  const wrap = (v: bigint): bigint => {
    const u = v & mask
    return signed && u >> BigInt(bits - 1) ? u - (1n << BigInt(bits)) : u
  }
  const va = parseBig(a, base)
  const vb = parseBig(b, base)
  let result: bigint | null = va === null ? null : wrap(va)
  let opError = ''
  if (va !== null && b.trim() && vb !== null) {
    const x = va
    const y = vb
    try {
      const r: Record<(typeof OPS)[number], () => bigint> = {
        AND: () => x & y,
        OR: () => x | y,
        XOR: () => x ^ y,
        NAND: () => ~(x & y),
        NOR: () => ~(x | y),
        '<<': () => x << y,
        '>>': () => x >> y,
        '+': () => x + y,
        '−': () => x - y,
        '×': () => x * y,
        '÷': () => {
          if (y === 0n) throw new Error('Division par zéro')
          return x / y
        },
        mod: () => {
          if (y === 0n) throw new Error('Division par zéro')
          return x % y
        }
      }
      result = wrap(r[op]())
    } catch (e) {
      opError = (e as Error).message
      result = null
    }
  }
  const unsigned = result === null ? null : result & mask
  const show = (v: bigint | null, bs: Base): string => {
    if (v === null) return '—'
    if (bs === 10) return v.toString(10)
    const s = (v & mask).toString(bs).toUpperCase()
    if (bs === 2) return s.padStart(bits, '0').replace(/(.{4})(?=.)/g, '$1 ')
    if (bs === 16) return s.replace(/(.{4})(?=(.{4})+$)/g, '$1 ')
    return s
  }
  const toggleBit = (i: number): void => {
    if (va === null) return
    const next = wrap((va & mask) ^ (1n << BigInt(i)))
    setA((base === 10 ? next : next & mask).toString(base).toUpperCase())
    setB('')
  }
  const char = unsigned !== null && unsigned >= 32n && unsigned < 0x110000n ? String.fromCodePoint(Number(unsigned)) : null

  return (
    <Page
      title="Programmeur"
      sub="Conversions entre bases, opérations bit à bit, complément à deux. Clique sur un bit pour l’inverser."
      tools={
        <div className="ui-row">
          <Segmented value={String(bits) as '8'} onChange={(v) => setBits(Number(v) as 8)} options={['8', '16', '32', '64'].map((x) => ({ id: x as '8', label: `${x} bits` }))} />
          <Segmented value={signed ? 's' : 'u'} onChange={(v) => setSigned(v === 's')} options={[{ id: 's', label: 'Signé' }, { id: 'u', label: 'Non signé' }]} />
        </div>
      }
    >
      <div className="ui-card prog-input">
        <Segmented value={String(base) as '10'} onChange={(v) => {
          const nb = Number(v) as Base
          if (va !== null) setA((nb === 10 ? wrap(va) : wrap(va) & mask).toString(nb).toUpperCase())
          if (vb !== null && b.trim()) setB((nb === 10 ? vb : vb & mask).toString(nb).toUpperCase())
          setBase(nb)
        }} options={BASES.map((x) => ({ id: String(x.id) as '10', label: x.label }))} />
        <input className={`input big mono${va === null ? ' bad' : ''}`} value={a} onChange={(e) => setA(e.target.value)} placeholder="Nombre A" autoFocus />
        <select className="select" value={op} onChange={(e) => setOp(e.target.value as (typeof OPS)[number])}>
          {OPS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <input className={`input big mono${b.trim() && vb === null ? ' bad' : ''}`} value={b} onChange={(e) => setB(e.target.value)} placeholder="Nombre B (facultatif)" />
        <button className="btn btn-secondary" onClick={() => va !== null && setA(wrap(~va).toString(base === 10 ? 10 : base).toUpperCase())} title="NON bit à bit (inverse tous les bits)">
          NOT A
        </button>
      </div>
      {opError && <p className="err-text">{opError}</p>}
      <div className="base-grid">
        {BASES.map((x) => (
          <Out key={x.id} label={x.label} value={show(result, x.id)} copyText={show(result, x.id).replace(/\s/g, '')} />
        ))}
        {char && <Out label="Caractère" value={char} />}
        {unsigned !== null && signed && result !== null && result < 0n && <Out label="Non signé" value={unsigned.toString()} />}
      </div>
      <div className="bit-grid" style={{ gridTemplateColumns: `repeat(${Math.min(bits, 32)}, 1fr)` }}>
        {Array.from({ length: bits }, (_, k) => bits - 1 - k).map((i) => (
          <button key={i} className={`bit${unsigned !== null && (unsigned >> BigInt(i)) & 1n ? ' on' : ''}`} onClick={() => toggleBit(i)} title={`Bit ${i}`}>
            {unsigned !== null ? Number((unsigned >> BigInt(i)) & 1n) : 0}
            {i % 4 === 0 && <span className="bit-idx">{i}</span>}
          </button>
        ))}
      </div>
    </Page>
  )
}

// ─── Devises ───────────────────────────────────────────────────────────────────────────────

interface Fx {
  date: string
  fetchedAt: number
  rates: Record<string, number>
}
const currencyName = (() => {
  try {
    const d = new Intl.DisplayNames(['fr'], { type: 'currency' })
    return (c: string): string => d.of(c) ?? c
  } catch {
    return (c: string): string => c
  }
})()

export function CurrencyView(): JSX.Element {
  const [fx, setFx] = usePersisted<Fx | null>('fx', null)
  const [favs, setFavs] = usePersisted<string[]>('fxFavs', ['USD', 'GBP', 'CHF', 'JPY', 'CAD'])
  const [amount, setAmount] = useState('100')
  const [from, setFrom] = usePersisted('fxFrom', 'EUR')
  const [to, setTo] = usePersisted('fxTo', 'USD')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = async (): Promise<void> => {
    setLoading(true)
    setError('')
    for (const url of ['https://api.frankfurter.dev/v1/latest?base=EUR', 'https://api.frankfurter.app/latest?from=EUR']) {
      try {
        const r = await window.kit.net.fetch(url, { timeoutMs: 12_000 })
        if (!r.ok) continue
        const d = JSON.parse(r.body) as { date: string; rates: Record<string, number> }
        setFx({ date: d.date, fetchedAt: Date.now(), rates: { EUR: 1, ...d.rates } })
        setLoading(false)
        return
      } catch (e) {
        setError((e as Error).message)
      }
    }
    setLoading(false)
    setError((e) => e || 'Taux indisponibles pour le moment.')
  }
  // Taux mis à jour au plus une fois toutes les 6 heures.
  useEffect(() => {
    if (!fx || Date.now() - fx.fetchedAt > 6 * 3_600_000) void refresh()
  }, [])

  const codes = fx ? Object.keys(fx.rates).sort() : ['EUR']
  const conv = (v: number, a: string, b: string): number => (fx && fx.rates[a] && fx.rates[b] ? (v / fx.rates[a]) * fx.rates[b] : NaN)
  const n = num(amount)
  const res = conv(n, from, to)
  const fmt = (v: number, c: string): string => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { style: 'currency', currency: c, maximumFractionDigits: v < 1 ? 4 : 2 }) : '—')

  return (
    <Page
      title="Devises"
      sub={fx ? `Taux de la Banque centrale européenne du ${new Date(fx.date).toLocaleDateString('fr-FR')}.` : 'Taux de change officiels (BCE), mis à jour chaque jour ouvré.'}
      tools={
        <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      }
    >
      {error && !fx && <p className="err-text">{error}</p>}
      <div className="ui-card fx-row">
        <input className="input big" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c} — {currencyName(c)}
            </option>
          ))}
        </select>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => {
            setFrom(to)
            setTo(from)
          }}
          title="Inverser"
        >
          <ArrowLeftRight size={16} />
        </button>
        <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c} — {currencyName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="fx-result">
        <span className="faint">{fmt(n, from)} =</span>
        <b>{fmt(res, to)}</b>
        {fx && <span className="faint">1 {from} = {fr(conv(1, from, to), 4)} {to}</span>}
      </div>
      <h3 className="ui-section-title">Tes devises favorites</h3>
      <div className="unit-grid">
        {favs
          .filter((c) => c !== from && fx?.rates[c])
          .map((c) => (
            <div key={c} className="ui-card unit-out fx-fav">
              <span className="faint">
                {c} — {currencyName(c)}
              </span>
              <b>{fmt(conv(n, from, c), c)}</b>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFavs(favs.filter((x) => x !== c))} title="Retirer des favoris">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        {!favs.includes(to) && to !== from && (
          <button className="ui-card unit-out add-fav" onClick={() => setFavs([...favs, to])}>
            <Star size={14} /> Ajouter {to} aux favoris
          </button>
        )}
      </div>
    </Page>
  )
}

// ─── Dates ─────────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000
const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDate = (s: string): Date | null => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
const longDate = (d: Date): string => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Jours fériés en France (dont ceux qui dépendent de Pâques). */
function holidays(year: number): Set<string> {
  // Pâques : algorithme de Meeus/Jones/Butcher.
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  const easter = new Date(year, month - 1, day)
  const plus = (n: number): string => iso(new Date(easter.getTime() + n * DAY + 3_600_000))
  return new Set([`${year}-01-01`, plus(1), `${year}-05-01`, `${year}-05-08`, plus(39), plus(50), `${year}-07-14`, `${year}-08-15`, `${year}-11-01`, `${year}-11-11`, `${year}-12-25`])
}
const isWorkday = (d: Date, skipHolidays: boolean): boolean => d.getDay() !== 0 && d.getDay() !== 6 && !(skipHolidays && holidays(d.getFullYear()).has(iso(d)))

function calendarDiff(a: Date, b: Date): { y: number; m: number; d: number } {
  const [from, to] = a <= b ? [a, b] : [b, a]
  let y = to.getFullYear() - from.getFullYear()
  let m = to.getMonth() - from.getMonth()
  let d = to.getDate() - from.getDate()
  if (d < 0) {
    m--
    d += new Date(to.getFullYear(), to.getMonth(), 0).getDate()
  }
  if (m < 0) {
    y--
    m += 12
  }
  return { y, m, d }
}
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7)
}
const plural = (n: number, w: string): string => `${fr(n, 0)} ${w}${Math.abs(n) > 1 ? 's' : ''}`

export function DatesView(): JSX.Element {
  const [mode, setMode] = useState<'diff' | 'add' | 'age'>('diff')
  const today = iso(new Date())
  const [d1, setD1] = useState(today)
  const [d2, setD2] = useState(iso(new Date(Date.now() + 30 * DAY)))
  const [n, setN] = useState('10')
  const [unit, setUnit] = useState<'days' | 'workdays' | 'weeks' | 'months' | 'years'>('days')
  const [sign, setSign] = useState<1 | -1>(1)
  const [birth, setBirth] = usePersisted('birthDate', '2000-01-01')
  const [skipHol, setSkipHol] = usePersisted('skipHolidays', true)

  const A = parseDate(d1)
  const B = parseDate(d2)

  let content: JSX.Element | null = null
  if (mode === 'diff' && A && B) {
    const days = Math.round((B.getTime() - A.getTime()) / DAY)
    const cd = calendarDiff(A, B)
    let work = 0
    const [s, e] = A <= B ? [A, B] : [B, A]
    for (let t = new Date(s); t < e; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) if (isWorkday(t, skipHol)) work++
    content = (
      <div className="unit-grid">
        <Out big label="Écart" value={plural(Math.abs(days), 'jour')} />
        <Out label="En semaines" value={`${plural(Math.floor(Math.abs(days) / 7), 'semaine')} et ${plural(Math.abs(days) % 7, 'jour')}`} />
        <Out label="Au calendrier" value={[cd.y && plural(cd.y, 'an'), cd.m && `${cd.m} mois`, (cd.d || (!cd.y && !cd.m)) && plural(cd.d, 'jour')].filter(Boolean).join(', ')} />
        <Out label={`Jours ouvrés${skipHol ? ' (hors fériés)' : ''}`} value={fr(work, 0)} />
        <Out label="En heures" value={fr(Math.abs(days) * 24, 0)} />
        <Out label={days >= 0 ? 'Sens' : 'Sens'} value={days >= 0 ? 'La 2ᵉ date est après' : 'La 2ᵉ date est avant'} />
      </div>
    )
  }
  if (mode === 'add' && A) {
    const k = Math.round(num(n)) * sign
    let r = new Date(A)
    if (Number.isFinite(k)) {
      if (unit === 'days') r = new Date(A.getFullYear(), A.getMonth(), A.getDate() + k)
      if (unit === 'weeks') r = new Date(A.getFullYear(), A.getMonth(), A.getDate() + 7 * k)
      if (unit === 'months') r = new Date(A.getFullYear(), A.getMonth() + k, A.getDate())
      if (unit === 'years') r = new Date(A.getFullYear() + k, A.getMonth(), A.getDate())
      if (unit === 'workdays') {
        let left = Math.abs(k)
        while (left > 0) {
          r = new Date(r.getFullYear(), r.getMonth(), r.getDate() + Math.sign(k))
          if (isWorkday(r, skipHol)) left--
        }
      }
    }
    content = (
      <div className="unit-grid">
        <Out big label="Résultat" value={longDate(r)} copyText={r.toLocaleDateString('fr-FR')} />
        <Out label="Semaine" value={`n° ${isoWeek(r)}`} />
        <Out label="Jour de l’année" value={`${Math.round((r.getTime() - new Date(r.getFullYear(), 0, 1).getTime()) / DAY) + 1}ᵉ`} />
      </div>
    )
  }
  const Bd = parseDate(birth)
  if (mode === 'age' && Bd) {
    const now = new Date()
    const cd = calendarDiff(Bd, now)
    let next = new Date(now.getFullYear(), Bd.getMonth(), Bd.getDate())
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next = new Date(now.getFullYear() + 1, Bd.getMonth(), Bd.getDate())
    const inDays = Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY)
    const lived = Math.floor((now.getTime() - Bd.getTime()) / DAY)
    content = (
      <div className="unit-grid">
        <Out big label="Âge" value={`${plural(cd.y, 'an')}, ${cd.m} mois et ${plural(cd.d, 'jour')}`} />
        <Out label="Prochain anniversaire" value={inDays === 0 ? 'Aujourd’hui ! 🎉' : `dans ${plural(inDays, 'jour')}`} />
        <Out label="Né(e) un" value={Bd.toLocaleDateString('fr-FR', { weekday: 'long' })} />
        <Out label="Jours vécus" value={fr(lived, 0)} />
        <Out label="Semaines vécues" value={fr(Math.floor(lived / 7), 0)} />
        <Out label="Heures vécues (environ)" value={fr(lived * 24, 0)} />
      </div>
    )
  }

  return (
    <Page
      title="Dates"
      sub="Écart entre deux dates, date + durée, jours ouvrés (fériés français inclus), âge."
      tools={<Segmented value={mode} onChange={setMode} options={[{ id: 'diff', label: 'Écart' }, { id: 'add', label: 'Ajouter / retirer' }, { id: 'age', label: 'Âge' }]} />}
    >
      <div className="ui-card form-row">
        {mode === 'age' ? (
          <label className="field">
            <span className="field-label">Date de naissance</span>
            <input className="input" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="field">
              <span className="field-label">{mode === 'diff' ? 'Du' : 'À partir du'}</span>
              <input className="input" type="date" value={d1} onChange={(e) => setD1(e.target.value)} />
            </label>
            {mode === 'diff' ? (
              <label className="field">
                <span className="field-label">Au</span>
                <input className="input" type="date" value={d2} onChange={(e) => setD2(e.target.value)} />
              </label>
            ) : (
              <>
                <Segmented value={sign === 1 ? 'p' : 'm'} onChange={(v) => setSign(v === 'p' ? 1 : -1)} options={[{ id: 'p', label: '+' }, { id: 'm', label: '−' }]} />
                <Field label="Durée" value={n} onChange={setN} />
                <select className="select" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                  <option value="days">jours</option>
                  <option value="workdays">jours ouvrés</option>
                  <option value="weeks">semaines</option>
                  <option value="months">mois</option>
                  <option value="years">années</option>
                </select>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setD1(today)}>
              Aujourd’hui
            </button>
          </>
        )}
        {mode !== 'age' && (
          <label className="ui-row faint">
            <input type="checkbox" checked={skipHol} onChange={(e) => setSkipHol(e.target.checked)} /> Exclure les jours fériés
          </label>
        )}
      </div>
      {content ?? <p className="faint">Choisis une date valide.</p>}
    </Page>
  )
}

// ─── Pourcentages et finances ──────────────────────────────────────────────────────────────

type FinTool = 'percent' | 'vat' | 'discount' | 'loan' | 'savings' | 'split'

export function FinanceView(): JSX.Element {
  const [tool, setTool] = usePersisted<FinTool>('finTool', 'percent')
  return (
    <Page title="Pourcentages et argent" sub="Les calculs du quotidien, sans formule à retenir.">
      <div className="cats">
        {(
          [
            ['percent', 'Pourcentages'],
            ['vat', 'TVA'],
            ['discount', 'Soldes et remises'],
            ['loan', 'Prêt'],
            ['savings', 'Épargne'],
            ['split', 'Partager l’addition']
          ] as [FinTool, string][]
        ).map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tool === id ? 'on' : 'btn-ghost'}`} onClick={() => setTool(id)}>
            {label}
          </button>
        ))}
      </div>
      {tool === 'percent' && <Percent />}
      {tool === 'vat' && <Vat />}
      {tool === 'discount' && <Discount />}
      {tool === 'loan' && <Loan />}
      {tool === 'savings' && <Savings />}
      {tool === 'split' && <Split />}
    </Page>
  )
}

function Percent(): JSX.Element {
  const [p, setP] = useState('15')
  const [x, setX] = useState('80')
  const [a, setA] = useState('30')
  const [b, setB] = useState('120')
  const [v1, setV1] = useState('50')
  const [v2, setV2] = useState('65')
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Field label="Combien font" value={p} onChange={setP} suffix="%" />
        <Field label="de" value={x} onChange={setX} />
        <Out big label="Résultat" value={fr((num(p) / 100) * num(x), 4)} />
      </div>
      <div className="ui-card form-row">
        <Field label="Quel % représente" value={a} onChange={setA} />
        <Field label="sur" value={b} onChange={setB} />
        <Out big label="Résultat" value={`${fr((num(a) / num(b)) * 100, 4)} %`} />
      </div>
      <div className="ui-card form-row">
        <Field label="Évolution de" value={v1} onChange={setV1} />
        <Field label="à" value={v2} onChange={setV2} />
        <Out big label="Variation" value={`${num(v2) >= num(v1) ? '+' : ''}${fr(((num(v2) - num(v1)) / num(v1)) * 100, 2)} %`} />
        <Out label="Coefficient" value={`× ${fr(num(v2) / num(v1), 4)}`} />
      </div>
    </div>
  )
}

function Vat(): JSX.Element {
  const [amount, setAmount] = useState('100')
  const [rate, setRate] = useState('20')
  const [mode, setMode] = useState<'ht' | 'ttc'>('ht')
  const r = num(rate) / 100
  const ht = mode === 'ht' ? num(amount) : num(amount) / (1 + r)
  const ttc = ht * (1 + r)
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Segmented value={mode} onChange={setMode} options={[{ id: 'ht', label: 'Je connais le HT' }, { id: 'ttc', label: 'Je connais le TTC' }]} />
        <Field label={`Montant ${mode.toUpperCase()}`} value={amount} onChange={setAmount} suffix="€" />
        <Field label="Taux" value={rate} onChange={setRate} suffix="%" />
        <div className="ui-row">
          {['20', '10', '5,5', '2,1'].map((t) => (
            <button key={t} className={`btn btn-sm ${rate === t ? 'on' : 'btn-ghost'}`} onClick={() => setRate(t)}>
              {t} %
            </button>
          ))}
        </div>
      </div>
      <div className="unit-grid">
        <Out big label="Hors taxes (HT)" value={eur(ht)} />
        <Out big label="TVA" value={eur(ttc - ht)} />
        <Out big label="Toutes taxes comprises (TTC)" value={eur(ttc)} />
      </div>
    </div>
  )
}

function Discount(): JSX.Element {
  const [price, setPrice] = useState('79,90')
  const [d1, setD1] = useState('30')
  const [d2, setD2] = useState('')
  const p = num(price)
  const after1 = p * (1 - num(d1) / 100)
  const final = d2.trim() ? after1 * (1 - num(d2) / 100) : after1
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Field label="Prix de départ" value={price} onChange={setPrice} suffix="€" />
        <Field label="Remise" value={d1} onChange={setD1} suffix="%" />
        <Field label="2ᵉ remise (facultatif)" value={d2} onChange={setD2} suffix="%" />
      </div>
      <div className="unit-grid">
        <Out big label="Prix final" value={eur(final)} />
        <Out big label="Économie" value={eur(p - final)} />
        <Out label="Remise totale réelle" value={`${fr((1 - final / p) * 100, 2)} %`} />
      </div>
      {d2.trim() && <p className="faint">Deux remises successives ne s’additionnent pas : −{d1} % puis −{d2} % font −{fr((1 - final / p) * 100, 2)} %, pas −{fr(num(d1) + num(d2), 2)} %.</p>}
    </div>
  )
}

function Loan(): JSX.Element {
  const [capital, setCapital] = usePersisted('loanCapital', '200000')
  const [rate, setRate] = usePersisted('loanRate', '3,5')
  const [years, setYears] = usePersisted('loanYears', '20')
  const [ins, setIns] = usePersisted('loanIns', '0,3')
  const C = num(capital)
  const n = Math.round(num(years) * 12)
  const t = num(rate) / 100 / 12
  const monthly = t === 0 ? C / n : (C * t) / (1 - Math.pow(1 + t, -n))
  const insMonthly = (C * (num(ins) || 0)) / 100 / 12
  const total = monthly * n
  const rows = useMemo(() => {
    const out: { year: number; interest: number; principal: number; left: number }[] = []
    let left = C
    for (let y = 1; y <= Math.ceil(n / 12) && Number.isFinite(monthly); y++) {
      let interest = 0
      let principal = 0
      for (let m = 0; m < 12 && (y - 1) * 12 + m < n; m++) {
        const i = left * t
        interest += i
        principal += monthly - i
        left -= monthly - i
      }
      out.push({ year: y, interest, principal, left: Math.max(0, left) })
    }
    return out
  }, [C, n, t, monthly])
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Field label="Montant emprunté" value={capital} onChange={setCapital} suffix="€" />
        <Field label="Taux annuel" value={rate} onChange={setRate} suffix="%" />
        <Field label="Durée" value={years} onChange={setYears} suffix="ans" />
        <Field label="Assurance (taux annuel)" value={ins} onChange={setIns} suffix="%" />
      </div>
      <div className="unit-grid">
        <Out big label="Mensualité (hors assurance)" value={eur(monthly)} />
        <Out big label="Mensualité avec assurance" value={eur(monthly + insMonthly)} />
        <Out label="Coût des intérêts" value={eur(total - C)} />
        <Out label="Coût de l’assurance" value={eur(insMonthly * n)} />
        <Out label="Coût total du crédit" value={eur(total - C + insMonthly * n)} />
        <Out label="Total remboursé" value={eur(total + insMonthly * n)} />
      </div>
      {rows.length > 0 && rows.length <= 50 && (
        <table className="table amort">
          <thead>
            <tr>
              <th>Année</th>
              <th>Intérêts payés</th>
              <th>Capital remboursé</th>
              <th>Reste à rembourser</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td>{eur(r.interest)}</td>
                <td>{eur(r.principal)}</td>
                <td>{eur(r.left)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Savings(): JSX.Element {
  const [start, setStart] = useState('1000')
  const [monthly, setMonthly] = useState('100')
  const [rate, setRate] = useState('3')
  const [years, setYears] = useState('10')
  const r = num(rate) / 100 / 12
  const n = Math.round(num(years) * 12)
  const rows: { year: number; total: number; paid: number }[] = []
  let total = num(start) || 0
  let paid = total
  for (let m = 1; m <= n && n <= 1200; m++) {
    total = total * (1 + r) + (num(monthly) || 0)
    paid += num(monthly) || 0
    if (m % 12 === 0 || m === n) rows.push({ year: Math.ceil(m / 12), total, paid })
  }
  const maxT = Math.max(1, ...rows.map((x) => x.total))
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Field label="Capital de départ" value={start} onChange={setStart} suffix="€" />
        <Field label="Versement mensuel" value={monthly} onChange={setMonthly} suffix="€" />
        <Field label="Rendement annuel" value={rate} onChange={setRate} suffix="%" />
        <Field label="Durée" value={years} onChange={setYears} suffix="ans" />
      </div>
      <div className="unit-grid">
        <Out big label="Capital final" value={eur(total)} />
        <Out big label="Tu auras versé" value={eur(paid)} />
        <Out big label="Intérêts gagnés" value={eur(total - paid)} />
      </div>
      <div className="bars">
        {rows.map((x) => (
          <div key={x.year} className="bar-col" title={`Année ${x.year} : ${eur(x.total)}`}>
            <div className="bar-fill" style={{ height: `${(x.total / maxT) * 100}%` }}>
              <div className="bar-paid" style={{ height: `${(x.paid / x.total) * 100}%` }} />
            </div>
            <span className="faint">{x.year}</span>
          </div>
        ))}
      </div>
      <p className="faint legend">
        <span className="dot paid" /> versé · <span className="dot gain" /> intérêts (intérêts composés, capitalisation mensuelle)
      </p>
    </div>
  )
}

function Split(): JSX.Element {
  const [total, setTotal] = useState('86,40')
  const [tip, setTip] = useState('10')
  const [people, setPeople] = useState('4')
  const t = num(total) * (1 + (num(tip) || 0) / 100)
  const each = t / Math.max(1, Math.round(num(people)))
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Field label="Addition" value={total} onChange={setTotal} suffix="€" />
        <Field label="Pourboire" value={tip} onChange={setTip} suffix="%" />
        <Field label="Personnes" value={people} onChange={setPeople} />
      </div>
      <div className="unit-grid">
        <Out big label="Par personne" value={eur(each)} />
        <Out label="Total avec pourboire" value={eur(t)} />
        <Out label="Pourboire" value={eur(t - num(total))} />
        <Out label="Par personne, arrondi" value={eur(Math.ceil(each))} />
      </div>
    </div>
  )
}

// ─── Statistiques et moyennes ──────────────────────────────────────────────────────────────

function parseList(text: string): number[] {
  const tokens = /[\s;\n\t]/.test(text.trim()) ? text.split(/[\s;\t\n]+/) : text.split(/,(?=\s*-?\d)/).length > 2 ? text.split(',') : [text]
  return tokens.map((t) => num(t)).filter((n) => Number.isFinite(n))
}
const quantile = (s: number[], q: number): number => {
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (pos - lo)
}

interface Grade {
  id: string
  label: string
  grade: string
  outOf: string
  coef: string
}

export function StatsView(): JSX.Element {
  const [tab, setTab] = usePersisted<'stats' | 'grades'>('statsTab', 'grades')
  return (
    <Page
      title={tab === 'grades' ? 'Moyenne de notes' : 'Statistiques'}
      sub={tab === 'grades' ? 'Notes sur n’importe quel barème, avec coefficients. Et la note qu’il te faut pour atteindre ton objectif.' : 'Colle une liste de nombres (séparés par des espaces, des retours à la ligne ou des points-virgules).'}
      tools={<Segmented value={tab} onChange={setTab} options={[{ id: 'grades', label: 'Moyenne de notes' }, { id: 'stats', label: 'Statistiques' }]} />}
    >
      {tab === 'grades' ? <Grades /> : <Stats />}
    </Page>
  )
}

function Grades(): JSX.Element {
  const [rows, setRows] = usePersisted<Grade[]>('grades', [
    { id: uid(), label: 'Partiel', grade: '14', outOf: '20', coef: '2' },
    { id: uid(), label: 'TP', grade: '16,5', outOf: '20', coef: '1' },
    { id: uid(), label: 'Oral', grade: '', outOf: '20', coef: '1' }
  ])
  const [target, setTarget] = usePersisted('gradeTarget', '12')
  const filled = rows.filter((r) => Number.isFinite(num(r.grade)) && num(r.outOf) > 0)
  const totalCoef = filled.reduce((s, r) => s + (num(r.coef) || 1), 0)
  const avg = totalCoef ? filled.reduce((s, r) => s + (num(r.grade) / num(r.outOf)) * 20 * (num(r.coef) || 1), 0) / totalCoef : NaN
  const empty = rows.filter((r) => !Number.isFinite(num(r.grade)))
  const emptyCoef = empty.reduce((s, r) => s + (num(r.coef) || 1), 0)
  // Note moyenne nécessaire (sur 20) sur les épreuves restantes pour atteindre l'objectif.
  const needed = emptyCoef ? ((num(target) * (totalCoef + emptyCoef) - (Number.isFinite(avg) ? avg * totalCoef : 0)) / emptyCoef) : NaN
  const patch = (id: string, p: Partial<Grade>): void => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))
  return (
    <div className="ui-col fin">
      <table className="table grades">
        <thead>
          <tr>
            <th>Épreuve</th>
            <th>Note</th>
            <th>Sur</th>
            <th>Coef.</th>
            <th>Sur 20</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on20 = (num(r.grade) / num(r.outOf)) * 20
            return (
              <tr key={r.id}>
                <td>
                  <input className="input" value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} placeholder="Matière ou épreuve" />
                </td>
                <td>
                  <input className="input num-in" value={r.grade} onChange={(e) => patch(r.id, { grade: e.target.value })} placeholder="à venir" inputMode="decimal" />
                </td>
                <td>
                  <input className="input num-in" value={r.outOf} onChange={(e) => patch(r.id, { outOf: e.target.value })} inputMode="decimal" />
                </td>
                <td>
                  <input className="input num-in" value={r.coef} onChange={(e) => patch(r.id, { coef: e.target.value })} inputMode="decimal" />
                </td>
                <td className={Number.isFinite(on20) ? (on20 >= 10 ? 'ok' : 'ko') : 'faint'}>{Number.isFinite(on20) ? fr(on20, 2) : '—'}</td>
                <td>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setRows(rows.filter((x) => x.id !== r.id))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="ui-row">
        <button className="btn btn-secondary btn-sm" onClick={() => setRows([...rows, { id: uid(), label: '', grade: '', outOf: '20', coef: '1' }])}>
          <Plus size={13} /> Ajouter une note
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setRows([])}>
          Tout effacer
        </button>
      </div>
      <div className="unit-grid">
        <Out big label="Moyenne actuelle (sur 20)" value={Number.isFinite(avg) ? fr(avg, 2) : '—'} />
        <div className="ui-card out">
          <span className="faint">Objectif</span>
          <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
        </div>
        {empty.length > 0 && (
          <Out
            big
            label={`Il te faut en moyenne, sur ${empty.length > 1 ? `les ${empty.length} épreuves restantes` : 'l’épreuve restante'}`}
            value={!Number.isFinite(needed) ? '—' : needed <= 0 ? 'C’est déjà gagné 🎉' : needed > 20 ? `${fr(needed, 2)} (hors d’atteinte)` : `${fr(needed, 2)} / 20`}
          />
        )}
      </div>
    </div>
  )
}

function Stats(): JSX.Element {
  const [text, setText] = usePersisted('statsText', '12 15 9,5 14 18 11 15 13')
  const values = parseList(text)
  const s = [...values].sort((a, b) => a - b)
  const n = s.length
  const sum = s.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const variance = n ? s.reduce((a, b) => a + (b - mean) ** 2, 0) / n : NaN
  const sampleVar = n > 1 ? s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : NaN
  const counts = new Map<number, number>()
  s.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
  const maxCount = Math.max(0, ...counts.values())
  const modes = maxCount > 1 ? [...counts].filter(([, c]) => c === maxCount).map(([v]) => v) : []
  // Histogramme en 8 classes au plus.
  const bins = useMemo(() => {
    if (n < 2 || s[0] === s[n - 1]) return []
    const k = Math.min(8, Math.max(3, Math.round(Math.sqrt(n))))
    const w = (s[n - 1] - s[0]) / k
    const out = Array.from({ length: k }, (_, i) => ({ from: s[0] + i * w, to: s[0] + (i + 1) * w, c: 0 }))
    s.forEach((v) => out[Math.min(k - 1, Math.floor((v - s[0]) / w))].c++)
    return out
  }, [text])
  const maxBin = Math.max(1, ...bins.map((b) => b.c))
  return (
    <div className="ui-col fin">
      <textarea className="textarea mono" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      {n === 0 ? (
        <p className="faint">Aucun nombre reconnu.</p>
      ) : (
        <>
          <div className="unit-grid stats-grid">
            <Out big label="Moyenne" value={fr(mean, 4)} />
            <Out big label="Médiane" value={fr(quantile(s, 0.5), 4)} />
            <Out label="Effectif" value={fr(n, 0)} />
            <Out label="Somme" value={fr(sum, 4)} />
            <Out label="Minimum" value={fr(s[0], 4)} />
            <Out label="Maximum" value={fr(s[n - 1], 4)} />
            <Out label="Étendue" value={fr(s[n - 1] - s[0], 4)} />
            <Out label="Mode" value={modes.length ? modes.map((m) => fr(m, 4)).join(' ; ') : 'aucun'} />
            <Out label="1er quartile (Q1)" value={fr(quantile(s, 0.25), 4)} />
            <Out label="3e quartile (Q3)" value={fr(quantile(s, 0.75), 4)} />
            <Out label="Écart-type" value={fr(Math.sqrt(variance), 4)} />
            <Out label="Écart-type (échantillon)" value={fr(Math.sqrt(sampleVar), 4)} />
            <Out label="Variance" value={fr(variance, 4)} />
          </div>
          {bins.length > 0 && (
            <div className="bars hist-bars">
              {bins.map((b, i) => (
                <div key={i} className="bar-col" title={`[${fr(b.from)} ; ${fr(b.to)}${i === bins.length - 1 ? ']' : '['} : ${b.c}`}>
                  <span className="bar-count">{b.c || ''}</span>
                  <div className="bar-fill solid" style={{ height: `${(b.c / maxBin) * 100}%` }} />
                  <span className="faint">{fr(b.from, 1)}</span>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => copy(s.map((v) => fr(v, 6)).join(' '))}>
            <Copy size={13} /> Copier la liste triée
          </button>
        </>
      )}
    </div>
  )
}

// ─── Algèbre ───────────────────────────────────────────────────────────────────────────────

export function AlgebraView(): JSX.Element {
  const [tab, setTab] = usePersisted<'quad' | 'system' | 'calculus' | 'roots'>('algTab', 'quad')
  return (
    <Page
      title="Algèbre"
      sub="Équations, systèmes, dérivées et simplifications, avec le détail des étapes clés."
      tools={
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'quad', label: '2nd degré' },
            { id: 'system', label: 'Systèmes' },
            { id: 'calculus', label: 'Dérivées' },
            { id: 'roots', label: 'f(x) = 0' }
          ]}
        />
      }
    >
      {tab === 'quad' && <Quadratic />}
      {tab === 'system' && <LinearSystem />}
      {tab === 'calculus' && <Calculus />}
      {tab === 'roots' && <Roots />}
    </Page>
  )
}

function Quadratic(): JSX.Element {
  const [a, setA] = useState('1')
  const [b, setB] = useState('-3')
  const [c, setC] = useState('2')
  const A = num(a)
  const B = num(b)
  const C = num(c)
  const delta = B * B - 4 * A * C
  const lines: string[] = []
  if (!A) {
    if (B) lines.push(`Équation du 1er degré : x = ${fr(-C / B, 6)}`)
    else lines.push(C ? 'Aucune solution.' : 'Tous les réels sont solutions.')
  } else {
    lines.push(`Δ = b² − 4ac = ${fr(B, 6)}² − 4 × ${fr(A, 6)} × ${fr(C, 6)} = ${fr(delta, 6)}`)
    if (delta > 0) {
      const x1 = (-B - Math.sqrt(delta)) / (2 * A)
      const x2 = (-B + Math.sqrt(delta)) / (2 * A)
      lines.push('Δ > 0 : deux solutions réelles.')
      lines.push(`x₁ = (−b − √Δ) / 2a = ${fr(x1, 6)}`)
      lines.push(`x₂ = (−b + √Δ) / 2a = ${fr(x2, 6)}`)
      lines.push(`Forme factorisée : ${fr(A, 6)}(x − ${fr(x1, 6)})(x − ${fr(x2, 6)})`)
    } else if (delta === 0) {
      lines.push(`Δ = 0 : une solution double x₀ = −b / 2a = ${fr(-B / (2 * A), 6)}`)
    } else {
      const re = -B / (2 * A)
      const im = Math.sqrt(-delta) / (2 * Math.abs(A))
      lines.push('Δ < 0 : pas de solution réelle, deux solutions complexes :')
      lines.push(`z₁ = ${fr(re, 6)} − ${fr(im, 6)}i   ·   z₂ = ${fr(re, 6)} + ${fr(im, 6)}i`)
    }
    const h = -B / (2 * A)
    const k = A * h * h + B * h + C
    lines.push(`Sommet de la parabole : (${fr(h, 6)} ; ${fr(k, 6)}) — ${A > 0 ? 'minimum' : 'maximum'}`)
    lines.push(`Forme canonique : ${fr(A, 6)}(x − ${fr(h, 6)})² + ${fr(k, 6)}`)
  }
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <Field label="a" value={a} onChange={setA} />
        <span className="eq">x² +</span>
        <Field label="b" value={b} onChange={setB} />
        <span className="eq">x +</span>
        <Field label="c" value={c} onChange={setC} />
        <span className="eq">= 0</span>
      </div>
      <div className="ui-card steps">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </div>
  )
}

function LinearSystem(): JSX.Element {
  const [size, setSize] = useState<2 | 3>(2)
  const [m, setM] = useState<string[][]>([
    ['2', '1', '', '5'],
    ['1', '-1', '', '1'],
    ['', '', '', '']
  ])
  const vars = ['x', 'y', 'z']
  const A = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => num(m[i][j]) || 0))
  const Bv = Array.from({ length: size }, (_, i) => num(m[i][3]) || 0)
  let result: string
  try {
    const det = math.det(A)
    if (Math.abs(det) < 1e-12) result = 'Le système n’a pas de solution unique (déterminant nul).'
    else {
      const sol = math.lusolve(A, Bv) as number[][]
      result = sol.map((r, i) => `${vars[i]} = ${fr(r[0], 6)}`).join('   ·   ') + `\n(déterminant = ${fr(det, 6)})`
    }
  } catch (e) {
    result = (e as Error).message
  }
  const set = (i: number, j: number, v: string): void => setM(m.map((r, a) => (a === i ? r.map((x, b) => (b === j ? v : x)) : r)))
  return (
    <div className="ui-col fin">
      <Segmented value={String(size) as '2'} onChange={(v) => setSize(Number(v) as 2)} options={[{ id: '2', label: '2 inconnues' }, { id: '3', label: '3 inconnues' }]} />
      <div className="ui-card system">
        {Array.from({ length: size }, (_, i) => (
          <div key={i} className="sys-row">
            {Array.from({ length: size }, (_, j) => (
              <span key={j} className="sys-term">
                <input className="input num-in" value={m[i][j]} onChange={(e) => set(i, j, e.target.value)} />
                <b>{vars[j]}</b>
                {j < size - 1 && ' +'}
              </span>
            ))}
            <span className="eq">=</span>
            <input className="input num-in" value={m[i][3]} onChange={(e) => set(i, 3, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="ui-card steps">
        {result.split('\n').map((l, i) => (
          <p key={i} className={i ? 'faint' : 'big-line'}>
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}

function Calculus(): JSX.Element {
  const [expr, setExpr] = usePersisted('derivExpr', 'x^3 + 2*x*sin(x)')
  const [at, setAt] = useState('1')
  let deriv = ''
  let second = ''
  let simplified = ''
  let valueAt = ''
  let error = ''
  try {
    const node = math.parse(expr.replace(/,/g, '.'))
    simplified = math.simplify(node).toString()
    const d = math.simplify(math.derivative(node, 'x'))
    deriv = d.toString()
    second = math.simplify(math.derivative(d, 'x')).toString()
    const x = num(at)
    if (Number.isFinite(x)) valueAt = `f(${fr(x, 4)}) = ${fr(node.evaluate({ x }), 6)}   ·   f′(${fr(x, 4)}) = ${fr(d.evaluate({ x }), 6)}`
  } catch (e) {
    error = (e as Error).message
  }
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <label className="field wide-field">
          <span className="field-label">f(x) =</span>
          <input className="input mono big-in" value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} />
        </label>
        <Field label="Évaluer en x =" value={at} onChange={setAt} />
      </div>
      {error ? (
        <p className="err-text">{error}</p>
      ) : (
        <div className="ui-col">
          <Out label="Simplifiée" value={simplified} copyText={simplified} />
          <Out big label="Dérivée f′(x)" value={deriv} copyText={deriv} />
          <Out label="Dérivée seconde f″(x)" value={second} copyText={second} />
          {valueAt && <p className="faint">{valueAt}</p>}
        </div>
      )}
    </div>
  )
}

function Roots(): JSX.Element {
  const [expr, setExpr] = usePersisted('rootsExpr', 'x^3 - 2x - 5')
  const [from, setFrom] = useState('-50')
  const [to, setTo] = useState('50')
  let roots: number[] = []
  let error = ''
  try {
    const f = math.compile(expr.replace(/(\d)x/g, '$1*x').replace(/,/g, '.'))
    const g = (x: number): number => Number(f.evaluate({ x }))
    const a = num(from)
    const b = num(to)
    const steps = 4000
    const h = (b - a) / steps
    let prevX = a
    let prev = g(a)
    for (let i = 1; i <= steps; i++) {
      const x = a + i * h
      const y = g(x)
      if (Number.isFinite(prev) && Number.isFinite(y)) {
        if (y === 0) roots.push(x)
        else if (prev * y < 0) {
          // Dichotomie, puis rejet des asymptotes (1/x change de signe sans s'annuler).
          let lo = prevX
          let hi = x
          for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2
            if (g(lo) * g(mid) <= 0) hi = mid
            else lo = mid
          }
          const r = (lo + hi) / 2
          if (Math.abs(g(r)) < 1e-6) roots.push(r)
        }
      }
      prevX = x
      prev = y
    }
    roots = roots.filter((r, i) => i === 0 || Math.abs(r - roots[i - 1]) > 1e-7)
  } catch (e) {
    error = (e as Error).message
  }
  return (
    <div className="ui-col fin">
      <div className="ui-card form-row">
        <label className="field wide-field">
          <span className="field-label">Résoudre f(x) = 0 avec f(x) =</span>
          <input className="input mono big-in" value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} />
        </label>
        <Field label="Chercher entre" value={from} onChange={setFrom} />
        <Field label="et" value={to} onChange={setTo} />
      </div>
      {error ? (
        <p className="err-text">{error}</p>
      ) : roots.length ? (
        <div className="unit-grid">
          {roots.map((r, i) => (
            <Out key={i} big label={`Solution ${i + 1}`} value={`x ≈ ${fr(r, 8)}`} copyText={String(r)} />
          ))}
        </div>
      ) : (
        <p className="faint">Aucune solution trouvée dans cet intervalle.</p>
      )}
    </div>
  )
}
