import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Calculator, Delete, LineChart, Plus, Trash2, X } from 'lucide-react'
import { all, create, type MathJsInstance } from 'mathjs'
import { Layout, NavItem, Page, Segmented, SideTitle, Toasts, uid, usePersisted, useTheme } from '@ui'
import './calc.css'

type View = 'calc' | 'graph' | 'units'
type Angle = 'deg' | 'rad'

/** Instance mathjs dont sin/cos/tan suivent l'unité d'angle choisie. */
function makeMath(angle: Angle): MathJsInstance {
  const math = create(all, { number: 'number', precision: 14 })
  if (angle === 'deg') {
    const k = Math.PI / 180
    const wrap = (f: (x: number) => number) => (x: number) => f(x * k)
    const inv = (f: (x: number) => number) => (x: number) => f(x) / k
    math.import(
      { sin: wrap(Math.sin), cos: wrap(Math.cos), tan: wrap(Math.tan), asin: inv(Math.asin), acos: inv(Math.acos), atan: inv(Math.atan) },
      { override: true }
    )
  }
  return math
}

/** Écriture naturelle → mathjs : « 2π », « 3×4 », « √9 », virgule décimale. */
function normalize(expr: string): string {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\(/g, 'sqrt(')
    .replace(/√(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/(\d),(\d)/g, '$1.$2')
}

function format(v: unknown, math: MathJsInstance): string {
  if (typeof v === 'number') {
    if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : 'Indéfini'
    return math.format(v, { precision: 12, lowerExp: -9, upperExp: 15 }).replace('.', ',')
  }
  if (typeof v === 'function') return 'fonction définie'
  return math.format(v as never, { precision: 12 })
}

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('calc')
  return (
    <Layout
      side={
        <>
          <SideTitle>Calculatrice</SideTitle>
          <NavItem icon={<Calculator size={15} />} label="Scientifique" active={view === 'calc'} onClick={() => setView('calc')} />
          <NavItem icon={<LineChart size={15} />} label="Courbes" active={view === 'graph'} onClick={() => setView('graph')} />
          <NavItem icon={<ArrowLeftRight size={15} />} label="Conversions" active={view === 'units'} onClick={() => setView('units')} />
        </>
      }
    >
      {view === 'calc' && <CalcView />}
      {view === 'graph' && <GraphView />}
      {view === 'units' && <UnitsView />}
      <Toasts />
    </Layout>
  )
}

// ─── Scientifique ──────────────────────────────────────────────────────────────────────────

interface Entry {
  expr: string
  result: string
}

const KEYS: { label: string; insert?: string; cls?: string }[][] = [
  [{ label: 'sin', insert: 'sin(' }, { label: 'cos', insert: 'cos(' }, { label: 'tan', insert: 'tan(' }, { label: '(' }, { label: ')' }, { label: 'C', cls: 'danger' }],
  [{ label: 'ln', insert: 'log(' }, { label: 'log', insert: 'log10(' }, { label: '√', insert: 'sqrt(' }, { label: 'x²', insert: '^2' }, { label: 'xʸ', insert: '^' }, { label: '÷', cls: 'op' }],
  [{ label: 'π' }, { label: '7' }, { label: '8' }, { label: '9' }, { label: '%', insert: '%' }, { label: '×', cls: 'op' }],
  [{ label: 'e' }, { label: '4' }, { label: '5' }, { label: '6' }, { label: 'n!', insert: '!' }, { label: '−', cls: 'op' }],
  [{ label: 'ans' }, { label: '1' }, { label: '2' }, { label: '3' }, { label: '⌫', cls: 'muted' }, { label: '+', cls: 'op' }],
  [{ label: 'x', insert: 'x' }, { label: '0' }, { label: ',', insert: '.' }, { label: 'E', insert: 'e' }, { label: '=', cls: 'eq wide' }]
]

function CalcView(): JSX.Element {
  const [expr, setExpr] = useState('')
  const [history, setHistory] = usePersisted<Entry[]>('history', [])
  const [angle, setAngle] = usePersisted<Angle>('angle', 'deg')
  const input = useRef<HTMLInputElement>(null)
  const math = useMemo(() => makeMath(angle), [angle])
  const scope = useRef<Record<string, unknown>>({})

  // Aperçu du résultat pendant la frappe.
  const preview = useMemo(() => {
    if (!expr.trim()) return ''
    try {
      const v = math.evaluate(normalize(expr), { ...scope.current, ans: scope.current.ans ?? 0 })
      return format(v, math)
    } catch {
      return ''
    }
  }, [expr, math])

  const run = (): void => {
    if (!expr.trim()) return
    try {
      const v = math.evaluate(normalize(expr), scope.current)
      if (typeof v === 'number') scope.current.ans = v
      setHistory((h) => [{ expr, result: format(v, math) }, ...h].slice(0, 100))
      setExpr('')
    } catch (err) {
      setHistory((h) => [{ expr, result: `Erreur : ${(err as Error).message}` }, ...h].slice(0, 100))
    }
  }

  const press = (k: { label: string; insert?: string }): void => {
    if (k.label === '=') return run()
    if (k.label === 'C') return setExpr('')
    if (k.label === '⌫') return setExpr((e) => e.slice(0, -1))
    setExpr((e) => e + (k.insert ?? k.label))
    input.current?.focus()
  }

  return (
    <Page
      title="Scientifique"
      sub="Tape une expression : 2π×3, √(16)+5!, sin(30), 15 % de 80 (15% * 80), f(x) = x^2 puis f(3)…"
      tools={<Segmented value={angle} onChange={setAngle} options={[{ id: 'deg', label: 'Degrés' }, { id: 'rad', label: 'Radians' }]} />}
    >
      <div className="calc">
        <div className="calc-main">
          <div className="screen">
            <input
              ref={input}
              className="screen-input"
              value={expr}
              autoFocus
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') run()
                if (e.key === 'Escape') setExpr('')
                if (e.key === 'ArrowUp' && !expr && history[0]) setExpr(history[0].expr)
              }}
              placeholder="0"
              spellCheck={false}
            />
            <div className="screen-preview">{preview && `= ${preview}`}</div>
          </div>
          <div className="keypad">
            {KEYS.flat().map((k) => (
              <button key={k.label} className={`key ${k.cls ?? ''}`} onClick={() => press(k)}>
                {k.label === '⌫' ? <Delete size={17} /> : k.label}
              </button>
            ))}
          </div>
        </div>
        <aside className="history">
          <div className="ui-row" style={{ justifyContent: 'space-between' }}>
            <b>Historique</b>
            {history.length > 0 && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setHistory([])} title="Effacer l’historique">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          {history.map((h, i) => (
            <button key={i} className="hist" onClick={() => setExpr(h.expr)} title="Réutiliser">
              <span className="faint">{h.expr}</span>
              <b className={h.result.startsWith('Erreur') ? 'err' : ''}>{h.result.startsWith('Erreur') ? h.result : `= ${h.result}`}</b>
            </button>
          ))}
          {!history.length && <span className="faint">Tes calculs apparaîtront ici.</span>}
        </aside>
      </div>
    </Page>
  )
}

// ─── Courbes ───────────────────────────────────────────────────────────────────────────────

interface Fn {
  id: string
  expr: string
  color: string
  visible: boolean
}
const FN_COLORS = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4']

function GraphView(): JSX.Element {
  const [fns, setFns] = usePersisted<Fn[]>('functions', [
    { id: uid(), expr: 'sin(x)', color: FN_COLORS[0], visible: true },
    { id: uid(), expr: 'x^2 / 4 - 1', color: FN_COLORS[1], visible: true }
  ])
  const [view, setView] = useState({ cx: 0, cy: 0, scale: 50 })
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const theme = useTheme()
  const math = useMemo(() => makeMath('rad'), [])

  const compiled = useMemo(
    () =>
      fns.map((f) => {
        try {
          const node = math.compile(normalize(f.expr.replace(/^\s*[a-z]\s*\(\s*x\s*\)\s*=/i, '').replace(/^\s*y\s*=/i, '')))
          return { ...f, fn: (x: number) => Number(node.evaluate({ x })), error: null as string | null }
        } catch (err) {
          return { ...f, fn: null, error: (err as Error).message }
        }
      }),
    [fns, math]
  )

  useEffect(() => {
    const c = canvas.current
    const el = box.current
    if (!c || !el) return
    const ratio = window.devicePixelRatio || 1
    const W = el.clientWidth
    const H = el.clientHeight
    c.width = W * ratio
    c.height = H * ratio
    c.style.width = `${W}px`
    c.style.height = `${H}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const css = getComputedStyle(document.documentElement)
    const fg = css.getPropertyValue('--text-3').trim()
    const grid = css.getPropertyValue('--border').trim()
    const axis = css.getPropertyValue('--text-2').trim()
    const toPx = (x: number, y: number): [number, number] => [W / 2 + (x - view.cx) * view.scale, H / 2 - (y - view.cy) * view.scale]
    const toX = (px: number): number => view.cx + (px - W / 2) / view.scale
    ctx.clearRect(0, 0, W, H)

    // Pas de la grille adapté au zoom (1, 2, 5, 10…).
    const raw = 80 / view.scale
    const pow = Math.pow(10, Math.floor(Math.log10(raw)))
    const stepV = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10
    ctx.lineWidth = 1
    ctx.font = '11px Inter, sans-serif'
    ctx.fillStyle = fg
    const x0 = Math.floor(toX(0) / stepV) * stepV
    for (let x = x0; toPx(x, 0)[0] <= W; x += stepV) {
      const [px] = toPx(x, 0)
      ctx.strokeStyle = grid
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, H)
      ctx.stroke()
      if (Math.abs(x) > stepV / 2) ctx.fillText(+x.toPrecision(6) + '', px + 3, Math.min(H - 4, Math.max(12, toPx(0, 0)[1] + 13)))
    }
    const yTop = view.cy + H / 2 / view.scale
    for (let y = Math.ceil(yTop / stepV) * stepV; toPx(0, y)[1] <= H; y -= stepV) {
      const [, py] = toPx(0, y)
      ctx.strokeStyle = grid
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(W, py)
      ctx.stroke()
      if (Math.abs(y) > stepV / 2) ctx.fillText(+y.toPrecision(6) + '', Math.min(W - 30, Math.max(3, toPx(0, 0)[0] + 4)), py - 3)
    }
    ctx.strokeStyle = axis
    ctx.lineWidth = 1.5
    const [ox, oy] = toPx(0, 0)
    ctx.beginPath()
    ctx.moveTo(0, oy)
    ctx.lineTo(W, oy)
    ctx.moveTo(ox, 0)
    ctx.lineTo(ox, H)
    ctx.stroke()

    // Courbes : un point par pixel, coupures aux discontinuités (tan, 1/x…).
    for (const f of compiled) {
      if (!f.visible || !f.fn) continue
      ctx.strokeStyle = f.color
      ctx.lineWidth = 2.5
      ctx.beginPath()
      let pen = false
      let lastY = 0
      for (let px = 0; px <= W; px++) {
        const y = f.fn(toX(px))
        const py = toPx(0, y)[1]
        if (!isFinite(y) || (pen && Math.abs(py - lastY) > H * 2)) {
          pen = false
          continue
        }
        if (pen) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
        pen = true
        lastY = py
      }
      ctx.stroke()
    }
    if (cursor) {
      for (const f of compiled) {
        if (!f.visible || !f.fn) continue
        const y = f.fn(cursor.x)
        if (!isFinite(y)) continue
        const [px, py] = toPx(cursor.x, y)
        ctx.fillStyle = f.color
        ctx.beginPath()
        ctx.arc(px, py, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [compiled, view, cursor, theme])

  useEffect(() => {
    const ro = new ResizeObserver(() => setView((v) => ({ ...v })))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const xAt = (e: React.MouseEvent): number => {
    const r = box.current!.getBoundingClientRect()
    return view.cx + (e.clientX - r.left - r.width / 2) / view.scale
  }

  return (
    <div className="graph">
      <div className="graph-side">
        <b>Fonctions</b>
        {compiled.map((f, i) => (
          <div key={f.id} className="fn-row">
            <button className="fn-dot" style={{ background: f.visible ? f.color : 'transparent', borderColor: f.color }} onClick={() => setFns((all) => all.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)))} title="Afficher / masquer" />
            <span className="faint fn-name">y =</span>
            <input className={`input mono${f.error ? ' bad' : ''}`} value={f.expr} onChange={(e) => setFns((all) => all.map((x, j) => (j === i ? { ...x, expr: e.target.value } : x)))} title={f.error ?? undefined} />
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFns((all) => all.filter((_, j) => j !== i))}>
              <X size={13} />
            </button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setFns((all) => [...all, { id: uid(), expr: '', color: FN_COLORS[all.length % FN_COLORS.length], visible: true }])}>
          <Plus size={13} /> Ajouter une fonction
        </button>
        <p className="faint graph-help">Exemples : 2x+1, sqrt(x), 1/x, exp(-x^2), abs(sin(x)). Glisse pour te déplacer, molette pour zoomer.</p>
        <button className="btn btn-ghost btn-sm" onClick={() => setView({ cx: 0, cy: 0, scale: 50 })}>
          Recentrer
        </button>
        {cursor && (
          <div className="cursor-values">
            <div>
              x = <b>{cursor.x.toFixed(3).replace('.', ',')}</b>
            </div>
            {compiled.map((f) => {
              const y = f.visible && f.fn ? f.fn(cursor.x) : NaN
              return isFinite(y) ? (
                <div key={f.id} style={{ color: f.color }}>
                  {f.expr || '—'} = <b>{y.toFixed(4).replace('.', ',')}</b>
                </div>
              ) : null
            })}
          </div>
        )}
      </div>
      <div
        className="graph-canvas"
        ref={box}
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy })}
        onMouseMove={(e) => {
          setCursor({ x: xAt(e), y: 0 })
          const d = drag.current
          if (d) setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) / v.scale, cy: d.cy + (e.clientY - d.y) / v.scale }))
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => {
          drag.current = null
          setCursor(null)
        }}
        onWheel={(e) => setView((v) => ({ ...v, scale: Math.min(5000, Math.max(2, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) }))}
      >
        <canvas ref={canvas} />
      </div>
    </div>
  )
}

// ─── Conversions ───────────────────────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; units: [string, string][] }> = {
  length: { label: 'Longueur', units: [['mm', 'millimètre'], ['cm', 'centimètre'], ['m', 'mètre'], ['km', 'kilomètre'], ['inch', 'pouce'], ['ft', 'pied'], ['yd', 'yard'], ['mi', 'mile']] },
  mass: { label: 'Masse', units: [['mg', 'milligramme'], ['g', 'gramme'], ['kg', 'kilogramme'], ['tonne', 'tonne'], ['oz', 'once'], ['lb', 'livre (lb)']] },
  temp: { label: 'Température', units: [['degC', 'Celsius (°C)'], ['degF', 'Fahrenheit (°F)'], ['K', 'Kelvin']] },
  area: { label: 'Surface', units: [['mm2', 'mm²'], ['cm2', 'cm²'], ['m2', 'm²'], ['hectare', 'hectare'], ['km2', 'km²'], ['acre', 'acre']] },
  volume: { label: 'Volume', units: [['ml', 'millilitre'], ['cl', 'centilitre'], ['l', 'litre'], ['m3', 'm³'], ['gallon', 'gallon US'], ['cup', 'tasse US']] },
  speed: { label: 'Vitesse', units: [['m/s', 'm/s'], ['km/h', 'km/h'], ['mi/h', 'mph'], ['knot', 'nœud']] },
  time: { label: 'Durée', units: [['ms', 'milliseconde'], ['s', 'seconde'], ['min', 'minute'], ['hour', 'heure'], ['day', 'jour'], ['week', 'semaine'], ['year', 'année']] },
  data: { label: 'Données', units: [['b', 'bit'], ['B', 'octet'], ['kB', 'ko (1000)'], ['KiB', 'Kio (1024)'], ['MB', 'Mo'], ['MiB', 'Mio'], ['GB', 'Go'], ['GiB', 'Gio'], ['TB', 'To']] },
  energy: { label: 'Énergie', units: [['J', 'joule'], ['kJ', 'kilojoule'], ['cal', 'calorie'], ['kcal', 'kilocalorie'], ['Wh', 'Wh'], ['kWh', 'kWh']] },
  pressure: { label: 'Pression', units: [['Pa', 'pascal'], ['hPa', 'hectopascal'], ['bar', 'bar'], ['atm', 'atmosphère'], ['psi', 'psi']] }
}

function UnitsView(): JSX.Element {
  const [cat, setCat] = usePersisted('unitCat', 'length')
  const [value, setValue] = useState('1')
  const [from, setFrom] = useState(CATEGORIES.length.units[2][0])
  const math = useMemo(() => {
    const m = create(all, { number: 'number' })
    // Unités absentes de mathjs.
    m.createUnit('knot', '0.514444 m/s')
    m.createUnit('cal', '4.184 J')
    m.createUnit('kcal', '4184 J')
    return m
  }, [])
  const units = CATEGORIES[cat].units
  useEffect(() => setFrom(units[Math.min(2, units.length - 1)][0]), [cat])
  const n = Number(value.replace(',', '.'))

  return (
    <Page title="Conversions" sub="Tape une valeur : toutes les unités se mettent à jour.">
      <div className="cats">
        {Object.entries(CATEGORIES).map(([id, c]) => (
          <button key={id} className={`btn btn-sm ${cat === id ? 'on' : 'btn-ghost'}`} onClick={() => setCat(id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="ui-card unit-input">
        <input className="input big" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus />
        <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
          {units.map(([u, label]) => (
            <option key={u} value={u}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="unit-grid">
        {units
          .filter(([u]) => u !== from)
          .map(([u, label]) => {
            let out = '—'
            if (isFinite(n)) {
              try {
                const v = math.unit(n, from).toNumber(u)
                out = math.format(v, { precision: 10, lowerExp: -7, upperExp: 12 }).replace('.', ',')
              } catch {
                out = '—'
              }
            }
            return (
              <button key={u} className="ui-card unit-out" onClick={() => void window.kit.clipboard.write(out.replace(',', '.'))} title="Copier">
                <span className="faint">{label}</span>
                <b>{out}</b>
              </button>
            )
          })}
      </div>
    </Page>
  )
}
