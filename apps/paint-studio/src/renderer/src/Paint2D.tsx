import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Blend,
  Brush,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Combine,
  Copy,
  Crop,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Grid3x3,
  Highlighter,
  ImagePlus,
  Layers,
  Lock,
  LockOpen,
  Minus,
  Move,
  PaintBucket,
  Palette,
  Pencil,
  PenTool,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Shapes,
  SlidersHorizontal,
  SprayCan,
  SquareDashed,
  SwatchBook,
  Trash2,
  Type,
  Undo2,
  Wand2,
  Waves
} from 'lucide-react'
import { Modal, toast, uid, usePrompt, useFileDrop } from '@ui'
import { EFFECTS, NO_ADJUST, applyCssFilter, applyEffect, contentBounds, cssFilter, floodFill, replaceColor, type Adjust, type Region } from './filters'
import { IMAGE_EXT, bridge, loadDataUrl, loadImageFile, makeCanvas } from './shared'

/** Suivre le pointeur hors de la zone (refusé parfois : le tracé continue quand même). */
const capture = (e: React.PointerEvent): void => {
  try {
    ;(e.target as Element).setPointerCapture(e.pointerId)
  } catch {
    /* pas de capture possible */
  }
}

/** Une frappe dans un champ de texte n'est pas un raccourci (un curseur ou une case à cocher, si). */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  return t.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button', 'radio'].includes((t as HTMLInputElement).type)
}

type Tool =
  | 'select'
  | 'move'
  | 'brush'
  | 'pencil'
  | 'marker'
  | 'spray'
  | 'calligraphy'
  | 'blur'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'shape'
  | 'fill'
  | 'recolor'
  | 'gradient'
  | 'picker'
  | 'text'
type ShapeKind = 'rect' | 'roundrect' | 'ellipse' | 'triangle' | 'rtriangle' | 'polygon' | 'star' | 'heart' | 'bubble'
type FillMode = 'stroke' | 'fill' | 'both'
type Symmetry = 'off' | 'v' | 'h' | 'both'

interface Layer {
  id: string
  name: string
  canvas: HTMLCanvasElement
  visible: boolean
  opacity: number
  blend: GlobalCompositeOperation
  locked: boolean
}
type LayerSnap = Omit<Layer, 'canvas'> & { data: ImageData }
interface DocSnap {
  w: number
  h: number
  active: number
  layers: LayerSnap[]
}
type Hist = { kind: 'layer'; layer: string; data: ImageData } | { kind: 'doc'; doc: DocSnap }
interface Floating {
  canvas: HTMLCanvasElement
  x: number
  y: number
}
interface Live {
  canvas: HTMLCanvasElement
  alpha: number
  comp: GlobalCompositeOperation
  filter: string
  mirror: boolean
}
type Drag =
  | { kind: 'free'; last: [number, number]; smooth: [number, number] }
  | { kind: 'shape'; x: number; y: number; col: string; col2: string }
  | { kind: 'select'; x: number; y: number }
  | { kind: 'float'; dx: number; dy: number; commitOnUp: boolean }
  | { kind: 'blur'; last: [number, number] }
  | { kind: 'pan'; sx: number; sy: number; left: number; top: number }

const TOOLS: { id: Tool; label: string; key: string; icon: JSX.Element }[] = [
  { id: 'select', label: 'Sélection', key: 'M', icon: <SquareDashed size={17} /> },
  { id: 'move', label: 'Déplacer le calque', key: 'V', icon: <Move size={17} /> },
  { id: 'brush', label: 'Pinceau', key: 'B', icon: <Brush size={17} /> },
  { id: 'pencil', label: 'Crayon', key: 'P', icon: <Pencil size={17} /> },
  { id: 'marker', label: 'Surligneur', key: 'H', icon: <Highlighter size={17} /> },
  { id: 'spray', label: 'Aérographe', key: 'Y', icon: <SprayCan size={17} /> },
  { id: 'calligraphy', label: 'Plume calligraphie', key: 'C', icon: <PenTool size={17} /> },
  { id: 'blur', label: 'Flou au pinceau', key: 'J', icon: <Droplets size={17} /> },
  { id: 'eraser', label: 'Gomme', key: 'E', icon: <Eraser size={17} /> },
  { id: 'line', label: 'Ligne', key: 'L', icon: <Minus size={17} /> },
  { id: 'arrow', label: 'Flèche', key: 'A', icon: <ArrowUpRight size={17} /> },
  { id: 'shape', label: 'Formes', key: 'U', icon: <Shapes size={17} /> },
  { id: 'fill', label: 'Remplissage', key: 'G', icon: <PaintBucket size={17} /> },
  { id: 'recolor', label: 'Remplacer une couleur', key: 'R', icon: <Wand2 size={17} /> },
  { id: 'gradient', label: 'Dégradé', key: 'D', icon: <Blend size={17} /> },
  { id: 'picker', label: 'Pipette', key: 'I', icon: <Pipette size={17} /> },
  { id: 'text', label: 'Texte', key: 'T', icon: <Type size={17} /> }
]
const FREEHAND: Tool[] = ['brush', 'pencil', 'marker', 'spray', 'calligraphy', 'eraser']
const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'roundrect', label: 'Rectangle arrondi' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'rtriangle', label: 'Triangle rectangle' },
  { id: 'polygon', label: 'Polygone' },
  { id: 'star', label: 'Étoile' },
  { id: 'heart', label: 'Cœur' },
  { id: 'bubble', label: 'Bulle de BD' }
]
const BLENDS: { id: GlobalCompositeOperation; label: string }[] = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Produit' },
  { id: 'screen', label: 'Écran' },
  { id: 'overlay', label: 'Incrustation' },
  { id: 'darken', label: 'Obscurcir' },
  { id: 'lighten', label: 'Éclaircir' },
  { id: 'color-dodge', label: 'Densité −' },
  { id: 'color-burn', label: 'Densité +' },
  { id: 'hard-light', label: 'Lumière crue' },
  { id: 'soft-light', label: 'Lumière tamisée' },
  { id: 'difference', label: 'Différence' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Teinte' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Couleur' },
  { id: 'luminosity', label: 'Luminosité' }
]
const FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Comic Sans MS', 'Impact']
const PALETTE = [
  '#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#ef4444', '#f97316', '#facc15', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#92400e', '#065f46', '#1e3a8a',
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8'
]
const SIZES = [
  { label: 'Écran (1280 × 720)', w: 1280, h: 720 },
  { label: 'Full HD (1920 × 1080)', w: 1920, h: 1080 },
  { label: 'Carré (1080 × 1080)', w: 1080, h: 1080 },
  { label: 'Story (1080 × 1920)', w: 1080, h: 1920 },
  { label: 'A4 portrait (1240 × 1754)', w: 1240, h: 1754 },
  { label: 'A4 paysage (1754 × 1240)', w: 1754, h: 1240 },
  { label: 'Icône (512 × 512)', w: 512, h: 512 },
  { label: 'Pixel art (64 × 64)', w: 64, h: 64 }
]
const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'
const PROJECT_EXT = 'ospaint'

const norm = (x0: number, y0: number, x1: number, y1: number): Region => ({
  x: Math.round(Math.min(x0, x1)),
  y: Math.round(Math.min(y0, y1)),
  w: Math.round(Math.abs(x1 - x0)),
  h: Math.round(Math.abs(y1 - y0))
})
const inside = (r: Region, x: number, y: number): boolean => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h
const hex2 = (n: number): string => n.toString(16).padStart(2, '0')

/** Petit menu déroulant de la barre d'outils. */
function Menu({ label, icon, children }: { label: string; icon: JSX.Element; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`btn btn-sm ${open ? 'on' : 'btn-ghost'}`} onClick={() => setOpen(!open)}>
        {icon} {label} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

function LayerThumb({ canvas, tick }: { canvas: HTMLCanvasElement; tick: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    const s = Math.min(c.width / canvas.width, c.height / canvas.height)
    const w = canvas.width * s
    const h = canvas.height * s
    ctx.drawImage(canvas, (c.width - w) / 2, (c.height - h) / 2, w, h)
  }, [canvas, tick])
  return <canvas ref={ref} width={48} height={32} className="layer-thumb" />
}

export default function Paint2D({ active: shown }: { active: boolean }): JSX.Element {
  const [size, setSize] = useState({ w: 1280, h: 720 })
  const [layers, setLayers] = useState<Layer[]>(() => [newLayer('Fond', 1280, 720, '#ffffff')])
  const [active, setActive] = useState(0)
  const [tool, setToolRaw] = useState<Tool>('brush')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const [color, setColor] = useState('#111111')
  const [color2, setColor2] = useState('#ffffff')
  const [recent, setRecent] = useState<string[]>([])
  const [width, setWidth] = useState(8)
  const [alpha, setAlpha] = useState(1)
  const [softness, setSoftness] = useState(0)
  const [smoothing, setSmoothing] = useState(0.3)
  const [fillMode, setFillMode] = useState<FillMode>('stroke')
  const [sides, setSides] = useState(6)
  const [tolerance, setTolerance] = useState(32)
  const [gradKind, setGradKind] = useState<'linear' | 'radial'>('linear')
  const [gradFade, setGradFade] = useState(false)
  const [font, setFont] = useState({ family: 'Inter', size: 48, bold: true, italic: false, outline: false })
  const [symmetry, setSymmetry] = useState<Symmetry>('off')
  const [grid, setGrid] = useState(false)
  const [gridSize, setGridSize] = useState(32)
  const [zoom, setZoom] = useState(0)
  const [tick, redraw] = useState(0)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [dialog, setDialog] = useState<null | 'new' | 'resize' | 'canvas' | 'adjust'>(null)
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST)
  const [docPath, setDocPath] = useState<string | null>(null)
  const [promptNode, ask] = usePrompt()

  const view = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const scratch = useRef<HTMLCanvasElement>(makeCanvas(1, 1))
  const history = useRef<{ undo: Hist[]; redo: Hist[] }>({ undo: [], redo: [] })
  const drag = useRef<Drag | null>(null)
  const live = useRef<Live | null>(null)
  const floating = useRef<Floating | null>(null)
  const sel = useRef<Region | null>(null)
  const clip = useRef<HTMLCanvasElement | null>(null)
  const space = useRef(false)
  const pointer = useRef<[number, number] | null>(null)

  const layer = layers[active]

  function newLayer(name: string, w: number, h: number, fill?: string): Layer {
    return { id: uid(), name, canvas: makeCanvas(w, h, fill), visible: true, opacity: 1, blend: 'source-over', locked: false }
  }

  // Zoom « ajusté » : l'image tient dans la zone visible.
  const fit = (): number => {
    const el = wrap.current
    if (!el || !el.clientWidth) return 1
    return Math.min(1, (el.clientWidth - 48) / size.w, (el.clientHeight - 48) / size.h)
  }
  const scale = zoom || fit()

  const setTool = (t: Tool): void => {
    if (t !== 'select') commitFloating()
    setToolRaw(t)
  }

  // ───────────── Rendu ─────────────

  const drawLive = (ctx: CanvasRenderingContext2D, l: Live): void => {
    ctx.save()
    const s = sel.current
    if (s) {
      ctx.beginPath()
      ctx.rect(s.x, s.y, s.w, s.h)
      ctx.clip()
    }
    ctx.globalAlpha = l.alpha
    ctx.globalCompositeOperation = l.comp
    ctx.filter = l.filter
    ctx.drawImage(l.canvas, 0, 0)
    if (l.mirror && symmetry !== 'off') {
      const { w, h } = size
      const flips: [number, number][] = symmetry === 'v' ? [[-1, 1]] : symmetry === 'h' ? [[1, -1]] : [[-1, 1], [1, -1], [-1, -1]]
      for (const [fx, fy] of flips) {
        ctx.save()
        ctx.translate(fx < 0 ? w : 0, fy < 0 ? h : 0)
        ctx.scale(fx, fy)
        ctx.drawImage(l.canvas, 0, 0)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  /** Compose les calques visibles dans le canvas affiché. */
  const compose = (): void => {
    const c = view.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    const preview = dialog === 'adjust' ? cssFilter(adjust) : null
    layers.forEach((l, i) => {
      if (!l.visible) return
      let src = l.canvas
      if (i === active && (live.current || floating.current || preview)) {
        const t = scratch.current
        if (t.width !== size.w || t.height !== size.h) {
          t.width = size.w
          t.height = size.h
        }
        const tctx = t.getContext('2d')!
        tctx.clearRect(0, 0, size.w, size.h)
        tctx.drawImage(l.canvas, 0, 0)
        if (preview) {
          const r = sel.current ?? { x: 0, y: 0, w: size.w, h: size.h }
          tctx.save()
          tctx.clearRect(r.x, r.y, r.w, r.h)
          tctx.beginPath()
          tctx.rect(r.x, r.y, r.w, r.h)
          tctx.clip()
          tctx.filter = preview
          tctx.drawImage(l.canvas, 0, 0)
          tctx.restore()
        }
        if (live.current) drawLive(tctx, live.current)
        if (floating.current) tctx.drawImage(floating.current.canvas, floating.current.x, floating.current.y)
        src = t
      }
      ctx.globalAlpha = l.opacity
      ctx.globalCompositeOperation = l.blend
      ctx.drawImage(src, 0, 0)
    })
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    drawOverlay()
  }

  /** Grille, axes de symétrie, sélection et curseur du pinceau (en pixels écran). */
  const drawOverlay = (): void => {
    const o = overlay.current
    if (!o) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(size.w * scale * dpr)
    const H = Math.round(size.h * scale * dpr)
    if (o.width !== W || o.height !== H) {
      o.width = W
      o.height = H
    }
    const ctx = o.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const k = scale * dpr
    if (grid) {
      ctx.strokeStyle = 'rgba(120,120,140,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = gridSize; x < size.w; x += gridSize) {
        ctx.moveTo(Math.round(x * k) + 0.5, 0)
        ctx.lineTo(Math.round(x * k) + 0.5, H)
      }
      for (let y = gridSize; y < size.h; y += gridSize) {
        ctx.moveTo(0, Math.round(y * k) + 0.5)
        ctx.lineTo(W, Math.round(y * k) + 0.5)
      }
      ctx.stroke()
    }
    if (symmetry !== 'off') {
      ctx.save()
      ctx.strokeStyle = 'rgba(244,63,94,0.7)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      if (symmetry !== 'h') {
        ctx.moveTo(W / 2, 0)
        ctx.lineTo(W / 2, H)
      }
      if (symmetry !== 'v') {
        ctx.moveTo(0, H / 2)
        ctx.lineTo(W, H / 2)
      }
      ctx.stroke()
      ctx.restore()
    }
    const s = sel.current
    if (s) {
      const r = [s.x * k + 0.5, s.y * k + 0.5, s.w * k, s.h * k] as const
      ctx.save()
      ctx.lineWidth = 1
      ctx.strokeStyle = '#000'
      ctx.setLineDash([5, 4])
      ctx.strokeRect(...r)
      ctx.strokeStyle = '#fff'
      ctx.lineDashOffset = 5
      ctx.strokeRect(...r)
      ctx.restore()
    }
    const p = pointer.current
    const brushLike = FREEHAND.includes(tool) || tool === 'blur'
    if (p && brushLike && width * scale > 4) {
      ctx.save()
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      ctx.arc(p[0] * k, p[1] * k, (width / 2) * k, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath()
      ctx.arc(p[0] * k, p[1] * k, (width / 2) * k + 1, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  useEffect(compose)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => redraw((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ───────────── Historique ─────────────

  const pushHist = (h: Hist): void => {
    history.current.undo.push(h)
    if (history.current.undo.length > 40) history.current.undo.shift()
    history.current.redo = []
    window.studio?.setBusy(true) // dessin non enregistré : on garde l'interface chargée
  }
  const remember = (l: Layer = layer): void => {
    pushHist({ kind: 'layer', layer: l.id, data: l.canvas.getContext('2d')!.getImageData(0, 0, size.w, size.h) })
  }
  const snapDoc = (): DocSnap => ({
    w: size.w,
    h: size.h,
    active,
    layers: layers.map(({ canvas, ...meta }) => ({ ...meta, data: canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height) }))
  })
  const rememberDoc = (): void => pushHist({ kind: 'doc', doc: snapDoc() })
  const restoreDoc = (d: DocSnap): void => {
    setSize({ w: d.w, h: d.h })
    setLayers(
      d.layers.map(({ data, ...meta }) => {
        const c = makeCanvas(d.w, d.h)
        c.getContext('2d')!.putImageData(data, 0, 0)
        return { ...meta, canvas: c }
      })
    )
    setActive(Math.min(d.active, d.layers.length - 1))
  }
  const step = (from: 'undo' | 'redo'): void => {
    floating.current = null
    live.current = null
    const to = from === 'undo' ? 'redo' : 'undo'
    const entry = history.current[from].pop()
    if (!entry) return
    if (entry.kind === 'doc') {
      history.current[to].push({ kind: 'doc', doc: snapDoc() })
      sel.current = null
      restoreDoc(entry.doc)
    } else {
      const l = layers.find((x) => x.id === entry.layer)
      if (!l) return
      const ctx = l.canvas.getContext('2d')!
      history.current[to].push({ kind: 'layer', layer: l.id, data: ctx.getImageData(0, 0, l.canvas.width, l.canvas.height) })
      ctx.putImageData(entry.data, 0, 0)
    }
    redraw((n) => n + 1)
  }

  // ───────────── Sélection flottante ─────────────

  const commitFloating = (): void => {
    const f = floating.current
    if (!f) return
    const l = layers[active]
    l?.canvas.getContext('2d')!.drawImage(f.canvas, f.x, f.y)
    floating.current = null
    redraw((n) => n + 1)
  }
  /** Décolle le contenu d'une zone du calque pour pouvoir le déplacer. */
  const lift = (r: Region): void => {
    remember()
    const c = makeCanvas(r.w, r.h)
    c.getContext('2d')!.drawImage(layer.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    layer.canvas.getContext('2d')!.clearRect(r.x, r.y, r.w, r.h)
    floating.current = { canvas: c, x: r.x, y: r.y }
  }
  const placeFloating = (c: HTMLCanvasElement): void => {
    commitFloating()
    if (layer.locked) return void toast('Ce calque est verrouillé.', 'info')
    remember()
    const x = Math.round((size.w - c.width) / 2)
    const y = Math.round((size.h - c.height) / 2)
    floating.current = { canvas: c, x, y }
    sel.current = { x, y, w: c.width, h: c.height }
    setToolRaw('select')
    redraw((n) => n + 1)
  }
  const selection = (): Region => sel.current ?? { x: 0, y: 0, w: size.w, h: size.h }
  const selectAll = (): void => {
    commitFloating()
    sel.current = { x: 0, y: 0, w: size.w, h: size.h }
    setToolRaw('select')
    redraw((n) => n + 1)
  }
  const deselect = (): void => {
    commitFloating()
    sel.current = null
    redraw((n) => n + 1)
  }
  const deleteSelection = (): void => {
    if (floating.current) {
      floating.current = null
    } else if (sel.current) {
      if (layer.locked) return
      remember()
      const s = sel.current
      layer.canvas.getContext('2d')!.clearRect(s.x, s.y, s.w, s.h)
    } else return
    redraw((n) => n + 1)
  }

  // ───────────── Presse-papiers ─────────────

  const copySelection = async (): Promise<void> => {
    let c: HTMLCanvasElement
    if (floating.current) c = floating.current.canvas
    else if (sel.current) {
      const s = sel.current
      c = makeCanvas(s.w, s.h)
      c.getContext('2d')!.drawImage(layer.canvas, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h)
    } else c = flat()
    const copy = makeCanvas(c.width, c.height)
    copy.getContext('2d')!.drawImage(c, 0, 0)
    clip.current = copy
    try {
      const blob = await new Promise<Blob>((res, rej) => copy.toBlob((b) => (b ? res(b) : rej(new Error('vide'))), 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast('Copié (aussi utilisable dans d’autres apps)', 'success')
    } catch {
      toast('Copié', 'success')
    }
  }
  const cutSelection = async (): Promise<void> => {
    await copySelection()
    deleteSelection()
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (!shown || dialog || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) {
        e.preventDefault()
        const reader = new FileReader()
        reader.onload = () => void loadDataUrl(String(reader.result)).then(placeFloating)
        reader.readAsDataURL(file)
      } else if (clip.current) {
        e.preventDefault()
        const c = makeCanvas(clip.current.width, clip.current.height)
        c.getContext('2d')!.drawImage(clip.current, 0, 0)
        placeFloating(c)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  // ───────────── Dessin ─────────────

  const point = (e: React.PointerEvent | PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h]
  }

  const strokeCtx = (c: HTMLCanvasElement, col: string): CanvasRenderingContext2D => {
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = col
    ctx.fillStyle = col
    ctx.lineWidth = tool === 'pencil' ? Math.max(1, width / 3) : width
    ctx.lineCap = tool === 'pencil' || tool === 'marker' ? 'square' : 'round'
    ctx.lineJoin = 'round'
    return ctx
  }

  /** Un bout de trait à main levée, selon l'outil. */
  const segment = (ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]): void => {
    if (tool === 'spray') {
      const r = width
      const dots = Math.max(8, Math.round(r * 0.9))
      const dist = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))
      const steps = Math.max(1, Math.round(dist / (r / 2)))
      const dot = Math.max(1, width / 18)
      for (let s = 0; s <= steps; s++) {
        const cx = a[0] + ((b[0] - a[0]) * s) / steps
        const cy = a[1] + ((b[1] - a[1]) * s) / steps
        for (let i = 0; i < dots; i++) {
          const ang = Math.random() * Math.PI * 2
          const rad = Math.sqrt(Math.random()) * r
          ctx.fillRect(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, dot, dot)
        }
      }
      return
    }
    if (tool === 'calligraphy') {
      const nx = Math.cos(Math.PI / 4) * (width / 2)
      const ny = -Math.sin(Math.PI / 4) * (width / 2)
      ctx.beginPath()
      ctx.moveTo(a[0] + nx, a[1] + ny)
      ctx.lineTo(b[0] + nx, b[1] + ny)
      ctx.lineTo(b[0] - nx, b[1] - ny)
      ctx.lineTo(a[0] - nx, a[1] - ny)
      ctx.closePath()
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(...a)
    ctx.lineTo(b[0] + (a[0] === b[0] && a[1] === b[1] ? 0.01 : 0), b[1])
    ctx.stroke()
  }

  const shapePath = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void => {
    const x = Math.min(x0, x1)
    const y = Math.min(y0, y1)
    const w = Math.abs(x1 - x0)
    const h = Math.abs(y1 - y0)
    const cx = x + w / 2
    const cy = y + h / 2
    ctx.beginPath()
    switch (shapeKind) {
      case 'rect':
        ctx.rect(x, y, w, h)
        break
      case 'roundrect':
        ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.18)
        break
      case 'ellipse':
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
        break
      case 'triangle':
        ctx.moveTo(cx, y)
        ctx.lineTo(x + w, y + h)
        ctx.lineTo(x, y + h)
        ctx.closePath()
        break
      case 'rtriangle':
        ctx.moveTo(x, y)
        ctx.lineTo(x + w, y + h)
        ctx.lineTo(x, y + h)
        ctx.closePath()
        break
      case 'polygon':
      case 'star': {
        const n = shapeKind === 'star' ? sides * 2 : sides
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / n
          const k = shapeKind === 'star' && i % 2 ? 0.45 : 1
          const px = cx + Math.cos(a) * (w / 2) * k
          const py = cy + Math.sin(a) * (h / 2) * k
          if (i) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
        }
        ctx.closePath()
        break
      }
      case 'heart':
        ctx.moveTo(cx, y + h * 0.3)
        ctx.bezierCurveTo(cx, y, x, y, x, y + h * 0.32)
        ctx.bezierCurveTo(x, y + h * 0.62, cx, y + h * 0.78, cx, y + h)
        ctx.bezierCurveTo(cx, y + h * 0.78, x + w, y + h * 0.62, x + w, y + h * 0.32)
        ctx.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3)
        ctx.closePath()
        break
      case 'bubble': {
        const bh = h * 0.78
        ctx.roundRect(x, y, w, bh, Math.min(w, bh) * 0.25)
        ctx.moveTo(x + w * 0.22, y + bh - 1)
        ctx.lineTo(x + w * 0.12, y + h)
        ctx.lineTo(x + w * 0.4, y + bh - 1)
        break
      }
    }
  }

  const drawShape = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, col2: string): void => {
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = col
    ctx.fillStyle = col
    if (tool === 'line' || tool === 'arrow') {
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      if (tool === 'arrow') {
        const a = Math.atan2(y1 - y0, x1 - x0)
        const head = Math.max(14, width * 3.2)
        ctx.beginPath()
        ctx.moveTo(x1 + Math.cos(a) * width * 0.5, y1 + Math.sin(a) * width * 0.5)
        ctx.lineTo(x1 - head * Math.cos(a - 0.42), y1 - head * Math.sin(a - 0.42))
        ctx.lineTo(x1 - head * Math.cos(a + 0.42), y1 - head * Math.sin(a + 0.42))
        ctx.closePath()
        ctx.fill()
      }
      return
    }
    if (tool === 'gradient') {
      const g =
        gradKind === 'linear'
          ? ctx.createLinearGradient(x0, y0, x1, y1)
          : ctx.createRadialGradient(x0, y0, 0, x0, y0, Math.max(1, Math.hypot(x1 - x0, y1 - y0)))
      g.addColorStop(0, col)
      g.addColorStop(1, gradFade ? `${col}00` : col2)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, size.w, size.h)
      return
    }
    shapePath(ctx, x0, y0, x1, y1)
    if (fillMode !== 'stroke') {
      ctx.fillStyle = fillMode === 'both' ? col2 : col
      ctx.fill()
    }
    if (fillMode !== 'fill') ctx.stroke()
  }

  const blurAt = (p: [number, number]): void => {
    const r = Math.max(4, Math.round(width / 2))
    const ctx = layer.canvas.getContext('2d')!
    const x = Math.round(p[0] - r)
    const y = Math.round(p[1] - r)
    const t = makeCanvas(r * 2, r * 2)
    t.getContext('2d')!.drawImage(layer.canvas, x, y, r * 2, r * 2, 0, 0, r * 2, r * 2)
    ctx.save()
    ctx.beginPath()
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
    ctx.clip()
    if (sel.current) {
      const s = sel.current
      ctx.beginPath()
      ctx.rect(s.x, s.y, s.w, s.h)
      ctx.clip()
    }
    ctx.filter = `blur(${Math.max(1, r / 6)}px)`
    ctx.drawImage(t, x, y)
    ctx.restore()
  }

  const pickColor = (x: number, y: number): string => {
    const v = view.current!.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    return `#${hex2(v[0])}${hex2(v[1])}${hex2(v[2])}`
  }

  const useColor = (c: string): void => setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 12))

  const down = async (e: React.PointerEvent): Promise<void> => {
    const [x, y] = point(e)
    // Clic molette ou Espace : on fait glisser la vue.
    if (e.button === 1 || space.current) {
      e.preventDefault()
      capture(e)
      const el = wrap.current!
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop }
      return
    }
    const right = e.button === 2
    const col = right ? color2 : color
    const col2 = right ? color : color2
    if (tool === 'picker') {
      const c = pickColor(x, y)
      if (right) setColor2(c)
      else setColor(c)
      if (!e.altKey) setToolRaw('brush')
      return
    }
    if (tool === 'select') {
      capture(e)
      const f = floating.current
      if (f && inside({ x: f.x, y: f.y, w: f.canvas.width, h: f.canvas.height }, x, y)) {
        drag.current = { kind: 'float', dx: x - f.x, dy: y - f.y, commitOnUp: false }
        return
      }
      const s = sel.current
      if (s && !f && inside(s, x, y) && !layer.locked && layer.visible) {
        lift(s)
        drag.current = { kind: 'float', dx: x - s.x, dy: y - s.y, commitOnUp: false }
        return
      }
      commitFloating()
      sel.current = null
      drag.current = { kind: 'select', x, y }
      return
    }
    if (!layer.visible) return toast('Ce calque est masqué : affiche-le pour dessiner dessus.', 'info')
    if (layer.locked) return toast('Ce calque est verrouillé (cadenas dans la liste des calques).', 'info')
    if (tool === 'move') {
      capture(e)
      commitFloating()
      sel.current = null
      lift({ x: 0, y: 0, w: size.w, h: size.h })
      drag.current = { kind: 'float', dx: x, dy: y, commitOnUp: true }
      return
    }
    const ctx = layer.canvas.getContext('2d')!
    if (tool === 'fill') {
      remember()
      floodFill(ctx, Math.floor(x), Math.floor(y), col, tolerance, sel.current ?? undefined)
      useColor(col)
      return void redraw((n) => n + 1)
    }
    if (tool === 'recolor') {
      remember()
      replaceColor(ctx, Math.floor(x), Math.floor(y), col, tolerance)
      useColor(col)
      return void redraw((n) => n + 1)
    }
    if (tool === 'text') {
      const text = await ask('Texte à ajouter', '', true)
      if (!text) return
      remember()
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `${font.italic ? 'italic ' : ''}${font.bold ? '700' : '400'} ${font.size}px "${font.family}", sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillStyle = col
      ctx.strokeStyle = col2
      ctx.lineWidth = Math.max(2, font.size / 10)
      ctx.lineJoin = 'round'
      text.split('\n').forEach((l, i) => {
        const ly = y + i * font.size * 1.2
        if (font.outline) ctx.strokeText(l, x, ly)
        ctx.fillText(l, x, ly)
      })
      ctx.restore()
      useColor(col)
      return void redraw((n) => n + 1)
    }
    capture(e)
    remember()
    if (tool === 'blur') {
      drag.current = { kind: 'blur', last: [x, y] }
      blurAt([x, y])
      return void redraw((n) => n + 1)
    }
    const stroke = makeCanvas(size.w, size.h)
    const isFree = FREEHAND.includes(tool)
    live.current = {
      canvas: stroke,
      alpha: tool === 'marker' ? alpha * 0.45 : alpha,
      comp: tool === 'eraser' ? 'destination-out' : tool === 'marker' ? 'multiply' : 'source-over',
      filter: softness > 0 && isFree && tool !== 'spray' && tool !== 'pencil' ? `blur(${(softness / 100) * width * 0.35}px)` : 'none',
      mirror: tool !== 'gradient'
    }
    if (isFree) {
      segment(strokeCtx(stroke, col), [x, y], [x, y])
      drag.current = { kind: 'free', last: [x, y], smooth: [x, y] }
    } else {
      drag.current = { kind: 'shape', x, y, col, col2 }
    }
    useColor(col)
    compose()
  }

  const move = (e: React.PointerEvent): void => {
    let [x, y] = point(e)
    pointer.current = [x, y]
    if (grid && e.altKey === false && (tool === 'select' || drag.current?.kind === 'shape') && gridSize >= 8 && e.ctrlKey) {
      x = Math.round(x / gridSize) * gridSize
      y = Math.round(y / gridSize) * gridSize
    }
    setCursor([Math.round(x), Math.round(y)])
    const d = drag.current
    if (!d) return drawOverlay()
    switch (d.kind) {
      case 'pan': {
        const el = wrap.current!
        el.scrollLeft = d.left - (e.clientX - d.sx)
        el.scrollTop = d.top - (e.clientY - d.sy)
        return
      }
      case 'free': {
        const k = 1 - smoothing * 0.9
        const sm: [number, number] = [d.smooth[0] + (x - d.smooth[0]) * k, d.smooth[1] + (y - d.smooth[1]) * k]
        const right = (e.buttons & 2) === 2
        segment(strokeCtx(live.current!.canvas, right ? color2 : color), d.last, sm)
        d.last = sm
        d.smooth = sm
        break
      }
      case 'blur':
        blurAt([x, y])
        d.last = [x, y]
        break
      case 'shape': {
        let [x1, y1] = [x, y]
        // Maj : carré, cercle, ou ligne à 45°.
        if (e.shiftKey) {
          if (tool === 'line' || tool === 'arrow' || tool === 'gradient') {
            const a = Math.round(Math.atan2(y - d.y, x - d.x) / (Math.PI / 4)) * (Math.PI / 4)
            const len = Math.hypot(x - d.x, y - d.y)
            x1 = d.x + Math.cos(a) * len
            y1 = d.y + Math.sin(a) * len
          } else {
            const s = Math.max(Math.abs(x - d.x), Math.abs(y - d.y))
            x1 = d.x + Math.sign(x - d.x || 1) * s
            y1 = d.y + Math.sign(y - d.y || 1) * s
          }
        }
        // Alt : la forme part du centre.
        let x0 = d.x
        let y0 = d.y
        if (e.altKey && tool === 'shape') {
          x0 = d.x - (x1 - d.x)
          y0 = d.y - (y1 - d.y)
        }
        drawShape(live.current!.canvas.getContext('2d')!, x0, y0, x1, y1, d.col, d.col2)
        break
      }
      case 'select':
        sel.current = norm(d.x, d.y, Math.max(0, Math.min(size.w, x)), Math.max(0, Math.min(size.h, y)))
        break
      case 'float': {
        const f = floating.current
        if (!f) break
        f.x = Math.round(x - d.dx)
        f.y = Math.round(y - d.dy)
        if (sel.current) sel.current = { ...sel.current, x: f.x, y: f.y }
        break
      }
    }
    compose()
  }

  const up = (): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (live.current) {
      drawLive(layer.canvas.getContext('2d')!, live.current)
      live.current = null
    }
    if (d.kind === 'select' && sel.current && (sel.current.w < 2 || sel.current.h < 2)) sel.current = null
    if (d.kind === 'float' && d.commitOnUp) commitFloating()
    redraw((n) => n + 1)
  }

  // ───────────── Calques ─────────────

  const flat = (bg?: string): HTMLCanvasElement => {
    const c = makeCanvas(size.w, size.h, bg)
    const ctx = c.getContext('2d')!
    for (const l of layers) {
      if (!l.visible) continue
      ctx.globalAlpha = l.opacity
      ctx.globalCompositeOperation = l.blend
      ctx.drawImage(l.canvas, 0, 0)
    }
    if (floating.current) {
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(floating.current.canvas, floating.current.x, floating.current.y)
    }
    return c
  }

  const addLayer = (from?: HTMLCanvasElement, name?: string): void => {
    commitFloating()
    rememberDoc()
    const l = newLayer(name ?? `Calque ${layers.length}`, size.w, size.h)
    if (from) {
      const s = Math.min(1, size.w / from.width, size.h / from.height)
      const w = from.width * s
      const h = from.height * s
      l.canvas.getContext('2d')!.drawImage(from, (size.w - w) / 2, (size.h - h) / 2, w, h)
    }
    setLayers((all) => [...all.slice(0, active + 1), l, ...all.slice(active + 1)])
    setActive(active + 1)
  }
  const duplicateLayer = (): void => {
    commitFloating()
    rememberDoc()
    const c = makeCanvas(size.w, size.h)
    c.getContext('2d')!.drawImage(layer.canvas, 0, 0)
    const l: Layer = { ...layer, id: uid(), name: `${layer.name} (copie)`, canvas: c, locked: false }
    setLayers((all) => [...all.slice(0, active + 1), l, ...all.slice(active + 1)])
    setActive(active + 1)
  }
  const deleteLayer = (): void => {
    if (layers.length < 2) return
    commitFloating()
    rememberDoc()
    setLayers((all) => all.filter((_, j) => j !== active))
    setActive(Math.max(0, active - 1))
  }
  const mergeDown = (): void => {
    if (active === 0) return
    commitFloating()
    rememberDoc()
    const below = layers[active - 1]
    const ctx = below.canvas.getContext('2d')!
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = layer.blend
    ctx.drawImage(layer.canvas, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    setLayers((all) => all.filter((_, j) => j !== active))
    setActive(active - 1)
  }
  const flatten = (): void => {
    commitFloating()
    rememberDoc()
    const c = flat()
    setLayers([{ ...newLayer('Image', size.w, size.h), canvas: c }])
    setActive(0)
  }
  const clearLayer = (): void => {
    if (layer.locked) return
    remember()
    const s = selection()
    layer.canvas.getContext('2d')!.clearRect(s.x, s.y, s.w, s.h)
    redraw((n) => n + 1)
  }
  const patchLayer = (i: number, p: Partial<Layer>): void => setLayers((all) => all.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const moveLayer = (i: number, d: number): void => {
    const j = i + d
    if (j < 0 || j >= layers.length) return
    commitFloating()
    setLayers((all) => {
      const n = [...all]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
    setActive(j)
  }

  // ───────────── Image entière ─────────────

  /** Applique une transformation de canvas à tous les calques (ou au seul calque actif). */
  const transformAll = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) => void, only?: number): void => {
    commitFloating()
    rememberDoc()
    sel.current = null
    setLayers((all) =>
      all.map((l, i) => {
        if (only !== undefined && i !== only) return l
        const c = makeCanvas(w, h)
        draw(c.getContext('2d')!, l.canvas)
        return { ...l, canvas: c }
      })
    )
    setSize({ w, h })
    setZoom(0)
  }
  const rotate = (dir: 1 | -1): void =>
    transformAll(size.h, size.w, (ctx, src) => {
      ctx.translate(dir > 0 ? size.h : 0, dir > 0 ? 0 : size.w)
      ctx.rotate((dir * Math.PI) / 2)
      ctx.drawImage(src, 0, 0)
    })
  const flip = (axis: 'h' | 'v', onlyLayer = false): void => {
    if (sel.current && !onlyLayer) return flipSelection(axis)
    transformAll(
      size.w,
      size.h,
      (ctx, src) => {
        ctx.translate(axis === 'h' ? size.w : 0, axis === 'v' ? size.h : 0)
        ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1)
        ctx.drawImage(src, 0, 0)
      },
      onlyLayer ? active : undefined
    )
  }
  const flipSelection = (axis: 'h' | 'v'): void => {
    if (!floating.current && sel.current) lift(sel.current)
    const f = floating.current
    if (!f) return
    const c = makeCanvas(f.canvas.width, f.canvas.height)
    const ctx = c.getContext('2d')!
    ctx.translate(axis === 'h' ? c.width : 0, axis === 'v' ? c.height : 0)
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1)
    ctx.drawImage(f.canvas, 0, 0)
    f.canvas = c
    redraw((n) => n + 1)
  }
  const crop = (r: Region | null): void => {
    if (!r || r.w < 1 || r.h < 1) return
    transformAll(r.w, r.h, (ctx, src) => ctx.drawImage(src, -r.x, -r.y))
  }
  const trim = (): void => {
    const b = contentBounds(flat())
    if (!b) return toast('L’image est vide.', 'info')
    crop(b)
  }
  const resizeImage = (w: number, h: number): void =>
    transformAll(w, h, (ctx, src) => {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(src, 0, 0, w, h)
    })
  const resizeCanvas = (w: number, h: number, anchor: [number, number]): void =>
    transformAll(w, h, (ctx, src) => ctx.drawImage(src, Math.round((w - size.w) * anchor[0]), Math.round((h - size.h) * anchor[1])))

  const effect = (id: (typeof EFFECTS)[number]['id']): void => {
    if (layer.locked) return void toast('Ce calque est verrouillé.', 'info')
    commitFloating()
    remember()
    applyEffect(layer.canvas, id, selection())
    redraw((n) => n + 1)
  }
  const applyAdjust = (): void => {
    if (!layer.locked) {
      commitFloating()
      remember()
      applyCssFilter(layer.canvas, cssFilter(adjust), selection())
    }
    setAdjust(NO_ADJUST)
    setDialog(null)
  }

  // ───────────── Fichiers ─────────────

  useEffect(() => () => window.studio?.setBusy(false), [])

  const reset = (w: number, h: number, ls: Layer[], act: number, path: string | null): void => {
    history.current = { undo: [], redo: [] }
    floating.current = null
    sel.current = null
    window.studio?.setBusy(false)
    setSize({ w, h })
    setLayers(ls)
    setActive(act)
    setZoom(0)
    setDocPath(path)
  }

  const saveProject = async (path: string): Promise<void> => {
    commitFloating()
    const data = {
      app: 'paint-studio',
      version: 1,
      w: size.w,
      h: size.h,
      active,
      layers: layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, png: l.canvas.toDataURL('image/png') }))
    }
    await window.kit.files.writeText(path, JSON.stringify(data))
  }

  const save = async (as = false): Promise<void> => {
    let path = as ? null : docPath
    if (!path) {
      path = await window.kit.files.save({
        title: 'Enregistrer',
        defaultPath: 'dessin.png',
        filters: [
          { name: 'Image PNG', extensions: ['png'] },
          { name: 'Image JPG', extensions: ['jpg'] },
          { name: 'Image WebP', extensions: ['webp'] },
          { name: 'Projet Paint (calques modifiables)', extensions: [PROJECT_EXT] }
        ]
      })
    }
    if (!path) return
    if (path.toLowerCase().endsWith(`.${PROJECT_EXT}`)) {
      await saveProject(path)
      toast('Projet enregistré (calques conservés)', 'success')
    } else {
      const jpg = /\.jpe?g$/i.test(path)
      const webp = /\.webp$/i.test(path)
      const data = flat(jpg ? '#ffffff' : undefined).toDataURL(jpg ? 'image/jpeg' : webp ? 'image/webp' : 'image/png', 0.92)
      await window.kit.files.writeBase64(path, data.split(',')[1])
      toast(layers.length > 1 ? 'Image enregistrée (enregistre en .ospaint pour garder les calques)' : 'Image enregistrée', 'success')
    }
    setDocPath(path)
    window.studio?.setBusy(false)
  }

  const openPath = async (path: string, asLayer = false): Promise<void> => {
    try {
      if (path.toLowerCase().endsWith(`.${PROJECT_EXT}`)) {
        const p = JSON.parse(await window.kit.files.readText(path)) as {
          w: number
          h: number
          active?: number
          layers: { name: string; visible: boolean; opacity: number; blend?: GlobalCompositeOperation; locked?: boolean; png: string }[]
        }
        const ls: Layer[] = []
        for (const l of p.layers) {
          const c = makeCanvas(p.w, p.h)
          c.getContext('2d')!.drawImage(await loadDataUrl(l.png), 0, 0)
          ls.push({ id: uid(), name: l.name, canvas: c, visible: l.visible, opacity: l.opacity, blend: l.blend ?? 'source-over', locked: !!l.locked })
        }
        reset(p.w, p.h, ls, Math.min(p.active ?? 0, ls.length - 1), path)
        return
      }
      const c = await loadImageFile(path)
      const name = path.split(/[\\/]/).pop()!
      if (asLayer) return addLayer(c, name)
      reset(c.width, c.height, [{ ...newLayer(name, c.width, c.height), canvas: c }, newLayer('Calque 1', c.width, c.height)], 1, path)
    } catch {
      toast('Impossible d’ouvrir ce fichier.', 'error')
    }
  }

  const open = async (asLayer = false): Promise<void> => {
    const [path] = await window.kit.files.open({
      title: asLayer ? 'Importer une image comme calque' : 'Ouvrir',
      filters: [{ name: 'Images et projets', extensions: [...IMAGE_EXT, ...(asLayer ? [] : [PROJECT_EXT])] }]
    })
    if (path) await openPath(path, asLayer)
  }

  const drop = useFileDrop((paths) => {
    const p = paths[0]
    if (!p) return
    // Une image glissée devient un calque ; un projet s'ouvre.
    void openPath(p, !p.toLowerCase().endsWith(`.${PROJECT_EXT}`))
  })

  const create = (w: number, h: number, bg: string | null): void => {
    reset(w, h, [newLayer('Fond', w, h, bg ?? undefined)], 0, null)
    setDialog(null)
  }

  // La 3D peut prendre le dessin comme texture, ou y renvoyer son rendu.
  const api = useRef({ flat, addLayer })
  api.current = { flat, addLayer }
  useEffect(() => {
    bridge.drawing = () => api.current.flat()
    bridge.addLayer = (c, name) => api.current.addLayer(c, name)
    return () => {
      bridge.drawing = null
      bridge.addLayer = null
    }
  }, [])

  // ───────────── Clavier et molette ─────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!shown || typing(e) || dialog) return
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      if (e.key === ' ') {
        space.current = true
        return
      }
      if (ctrl) {
        const map: Record<string, () => void> = {
          z: () => step(e.shiftKey ? 'redo' : 'undo'),
          y: () => step('redo'),
          s: () => void save(e.shiftKey),
          o: () => void open(e.shiftKey),
          a: selectAll,
          d: deselect,
          c: () => void copySelection(),
          x: () => void cutSelection(),
          j: duplicateLayer,
          e: mergeDown,
          '0': () => setZoom(0),
          '1': () => setZoom(1),
          '=': () => setZoom(Math.min(8, scale * 1.25)),
          '+': () => setZoom(Math.min(8, scale * 1.25)),
          '-': () => setZoom(Math.max(0.05, scale / 1.25)),
          "'": () => setGrid((g) => !g)
        }
        if (map[k]) {
          e.preventDefault()
          map[k]()
        }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return deleteSelection()
      if (e.key === 'Enter') return commitFloating()
      if (e.key === 'Escape') return deselect()
      if (k === 'x') {
        setColor(color2)
        setColor2(color)
        return
      }
      if (e.key === '[') return setWidth((w) => Math.max(1, Math.round(w / 1.2)))
      if (e.key === ']') return setWidth((w) => Math.min(400, Math.round(w * 1.2) + 1))
      const t = TOOLS.find((x) => x.key.toLowerCase() === k)
      if (t) setTool(t.id)
    }
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') space.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  })

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => {
        const cur = z || fit()
        return Math.max(0.05, Math.min(8, e.deltaY < 0 ? cur * 1.15 : cur / 1.15))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // ───────────── Interface ─────────────

  const isFree = FREEHAND.includes(tool)
  const s = sel.current
  const range = (label: string, value: number, min: number, max: number, set: (n: number) => void, unit = '', stepN = 1): JSX.Element => (
    <label className="ui-row faint opt">
      {label}
      <input type="range" min={min} max={max} step={stepN} value={value} onChange={(e) => set(Number(e.target.value))} />
      <b className="num">
        {stepN < 1 ? Math.round(value * 100) : value}
        {unit}
      </b>
    </label>
  )

  return (
    <div className="paint">
      <div className="ui-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setDialog('new')} title="Nouvelle image">
          <FilePlus2 size={14} /> Nouveau
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void open()} title={`Ouvrir une image ou un projet (${MOD}+O)`}>
          <FolderOpen size={14} /> Ouvrir
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void save()} title={`Enregistrer (${MOD}+S, ${MOD}+Maj+S pour « sous »)`}>
          <Save size={14} /> Enregistrer
        </button>
        <span className="sep" />
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => step('undo')} title={`Annuler (${MOD}+Z)`}>
          <Undo2 size={15} />
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => step('redo')} title={`Rétablir (${MOD}+Y)`}>
          <Redo2 size={15} />
        </button>
        <span className="sep" />
        <Menu label="Édition" icon={<Scissors size={14} />}>
          <button onClick={() => void copySelection()}>Copier<kbd>{MOD}+C</kbd></button>
          <button onClick={() => void cutSelection()}>Couper<kbd>{MOD}+X</kbd></button>
          <button onClick={() => clip.current && placeFloating(clip.current)}>Coller<kbd>{MOD}+V</kbd></button>
          <hr />
          <button onClick={selectAll}>Tout sélectionner<kbd>{MOD}+A</kbd></button>
          <button onClick={deselect}>Désélectionner<kbd>{MOD}+D</kbd></button>
          <button onClick={deleteSelection}>Effacer la sélection<kbd>Suppr</kbd></button>
          <hr />
          <button onClick={() => void open(true)}>Importer une image comme calque…</button>
          <button onClick={() => void save(true)}>Enregistrer sous…</button>
        </Menu>
        <Menu label="Image" icon={<Crop size={14} />}>
          <button onClick={() => crop(s)} disabled={!s}>Recadrer sur la sélection</button>
          <button onClick={trim}>Rogner le vide autour</button>
          <button onClick={() => setDialog('resize')}>Redimensionner l’image…</button>
          <button onClick={() => setDialog('canvas')}>Taille de la zone de dessin…</button>
          <hr />
          <button onClick={() => rotate(1)}>
            <RotateCw size={13} /> Pivoter à droite
          </button>
          <button onClick={() => rotate(-1)}>
            <RotateCcw size={13} /> Pivoter à gauche
          </button>
          <button onClick={() => flip('h')}>
            <FlipHorizontal2 size={13} /> Miroir horizontal{s ? ' (sélection)' : ''}
          </button>
          <button onClick={() => flip('v')}>
            <FlipVertical2 size={13} /> Miroir vertical{s ? ' (sélection)' : ''}
          </button>
          <button onClick={() => flip('h', true)}>Miroir du calque seul</button>
        </Menu>
        <Menu label="Effets" icon={<Wand2 size={14} />}>
          <button onClick={() => setDialog('adjust')}>
            <SlidersHorizontal size={13} /> Luminosité, contraste, couleurs…
          </button>
          <hr />
          {EFFECTS.map((f) => (
            <button key={f.id} onClick={() => effect(f.id)}>
              {f.label}
            </button>
          ))}
          <p className="menu-note">{s ? 'S’applique à la sélection.' : 'S’applique au calque actif.'}</p>
        </Menu>
        <span className="sep" />
        <button className={`btn btn-sm btn-icon ${grid ? 'on' : 'btn-ghost'}`} onClick={() => setGrid(!grid)} title={`Grille (${MOD}+') — ${MOD} pendant le tracé pour s’y aimanter`}>
          <Grid3x3 size={15} />
        </button>
        <select className="select select-sm" value={symmetry} onChange={(e) => setSymmetry(e.target.value as Symmetry)} title="Dessin en miroir">
          <option value="off">Sans symétrie</option>
          <option value="v">Symétrie gauche/droite</option>
          <option value="h">Symétrie haut/bas</option>
          <option value="both">Symétrie 4 côtés</option>
        </select>
        <div className="spacer" />
        {cursor && (
          <span className="faint num coords">
            {cursor[0]}, {cursor[1]}
          </span>
        )}
        {s && (
          <span className="faint num coords">
            ▭ {s.w} × {s.h}
          </span>
        )}
        <span className="faint num">
          {size.w} × {size.h}
        </span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom(Math.max(0.05, scale / 1.25))} title={`Zoom arrière (${MOD}+molette)`}>
          <Minus size={14} />
        </button>
        <button className="btn btn-ghost btn-sm num" onClick={() => setZoom(zoom ? 0 : 1)} title={`Ajuster / 100 % (${MOD}+0, ${MOD}+1)`}>
          {Math.round(scale * 100)} %
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom(Math.min(8, scale * 1.25))} title="Zoom avant">
          <Plus size={14} />
        </button>
      </div>

      {/* Options de l'outil en cours */}
      <div className="ui-toolbar options-bar">
        <b className="opt-title">{TOOLS.find((t) => t.id === tool)?.label}</b>
        {(isFree || tool === 'blur' || tool === 'line' || tool === 'arrow' || tool === 'shape') && range('Taille', width, 1, 400, setWidth)}
        {(isFree || tool === 'line' || tool === 'arrow' || tool === 'shape' || tool === 'gradient' || tool === 'text') &&
          range('Opacité', alpha, 0.05, 1, setAlpha, ' %', 0.05)}
        {(tool === 'brush' || tool === 'eraser' || tool === 'marker' || tool === 'calligraphy') && range('Douceur', softness, 0, 100, setSoftness, ' %')}
        {isFree && range('Lissage', smoothing, 0, 0.95, setSmoothing, ' %', 0.05)}
        {tool === 'shape' && (
          <>
            <select className="select select-sm" value={shapeKind} onChange={(e) => setShapeKind(e.target.value as ShapeKind)}>
              {SHAPES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <div className="segmented">
              {(['stroke', 'fill', 'both'] as FillMode[]).map((m) => (
                <button key={m} className={fillMode === m ? 'on' : ''} onClick={() => setFillMode(m)}>
                  {m === 'stroke' ? 'Contour' : m === 'fill' ? 'Plein' : 'Plein + contour'}
                </button>
              ))}
            </div>
            {(shapeKind === 'polygon' || shapeKind === 'star') && range(shapeKind === 'star' ? 'Branches' : 'Côtés', sides, 3, 16, setSides)}
          </>
        )}
        {(tool === 'fill' || tool === 'recolor') && range('Tolérance', tolerance, 0, 255, setTolerance)}
        {tool === 'gradient' && (
          <>
            <div className="segmented">
              <button className={gradKind === 'linear' ? 'on' : ''} onClick={() => setGradKind('linear')}>
                Linéaire
              </button>
              <button className={gradKind === 'radial' ? 'on' : ''} onClick={() => setGradKind('radial')}>
                Circulaire
              </button>
            </div>
            <label className="ui-row faint opt">
              <input type="checkbox" checked={gradFade} onChange={(e) => setGradFade(e.target.checked)} />
              Vers transparent
            </label>
          </>
        )}
        {tool === 'text' && (
          <>
            <select className="select select-sm" value={font.family} onChange={(e) => setFont({ ...font, family: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>
            {range('Taille', font.size, 8, 400, (n) => setFont({ ...font, size: n }), ' px')}
            <button className={`btn btn-sm ${font.bold ? 'on' : 'btn-ghost'}`} onClick={() => setFont({ ...font, bold: !font.bold })}>
              <b>G</b>
            </button>
            <button className={`btn btn-sm ${font.italic ? 'on' : 'btn-ghost'}`} onClick={() => setFont({ ...font, italic: !font.italic })}>
              <i>I</i>
            </button>
            <button className={`btn btn-sm ${font.outline ? 'on' : 'btn-ghost'}`} onClick={() => setFont({ ...font, outline: !font.outline })} title="Contour avec la 2ᵉ couleur">
              Contour
            </button>
          </>
        )}
        {tool === 'select' && (
          <span className="faint">
            Glisse pour sélectionner, puis glisse dedans pour déplacer. {MOD}+C / {MOD}+V, Suppr, Entrée pour poser.
          </span>
        )}
        {tool === 'move' && <span className="faint">Glisse pour déplacer tout le calque actif.</span>}
        {tool === 'picker' && <span className="faint">Clic gauche : couleur 1 · clic droit : couleur 2 · Alt : rester sur la pipette.</span>}
        {grid && range('Grille', gridSize, 4, 256, setGridSize, ' px')}
        <div className="spacer" />
        <span className="faint hint-right">Clic droit = 2ᵉ couleur · Espace + glisser = se déplacer</span>
      </div>

      <div className="paint-body">
        <aside className="toolbox">
          <div className="tools-grid">
            {TOOLS.map((t) => (
              <button key={t.id} className={`tool${tool === t.id ? ' on' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
                {t.icon}
              </button>
            ))}
          </div>
          <div className="colors-pair" title="Couleur 1 (clic gauche) et couleur 2 (clic droit) — X pour inverser">
            <div className="swatch back" style={{ background: color2 }}>
              <input type="color" value={color2} onChange={(e) => setColor2(e.target.value)} />
            </div>
            <div className="swatch front" style={{ background: color }}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <button
              className="swap"
              title="Inverser (X)"
              onClick={() => {
                setColor(color2)
                setColor2(color)
              }}
            >
              ⇄
            </button>
          </div>
          <input
            className="input hex-input mono"
            key={color}
            defaultValue={color}
            onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setColor(e.target.value.toLowerCase())}
            title="Code couleur"
          />
          <div className="palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={c === color ? 'on' : ''}
                style={{ background: c }}
                onClick={() => setColor(c)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setColor2(c)
                }}
              />
            ))}
          </div>
          {recent.length > 0 && (
            <>
              <div className="faint tiny">
                <SwatchBook size={11} /> Récentes
              </div>
              <div className="palette">
                {recent.map((c) => (
                  <button key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </>
          )}
        </aside>

        <div className={`stage${drop.over ? ' drop' : ''}`} ref={wrap} {...drop.bind}>
          <div className="board-wrap" style={{ width: size.w * scale, height: size.h * scale }}>
            <canvas
              ref={view}
              width={size.w}
              height={size.h}
              className={`board tool-${tool}${space.current ? ' panning' : ''}`}
              style={{ width: size.w * scale, height: size.h * scale, imageRendering: scale > 2 ? 'pixelated' : 'auto' }}
              onPointerDown={(e) => void down(e)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={() => {
                pointer.current = null
                setCursor(null)
                drawOverlay()
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
            <canvas ref={overlay} className="board-overlay" style={{ width: size.w * scale, height: size.h * scale }} />
          </div>
          {floating.current && (
            <div className="float-bar">
              <button className="btn btn-primary btn-sm" onClick={commitFloating}>
                Poser (Entrée)
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => flipSelection('h')}>
                <FlipHorizontal2 size={13} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => flipSelection('v')}>
                <FlipVertical2 size={13} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={deleteSelection}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        <aside className="layers">
          <div className="layers-head">
            <b>
              <Layers size={13} /> Calques
            </b>
            <div className="ui-row">
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => addLayer()} title="Nouveau calque">
                <Plus size={14} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void open(true)} title="Importer une image comme calque">
                <ImagePlus size={14} />
              </button>
            </div>
          </div>
          <div className="layers-list">
            {[...layers.keys()].reverse().map((i) => {
              const l = layers[i]
              return (
                <div key={l.id} className={`layer${i === active ? ' on' : ''}`} onClick={() => (commitFloating(), setActive(i))}>
                  <LayerThumb canvas={l.canvas} tick={tick} />
                  <span className="layer-name" onDoubleClick={() => void ask('Nom du calque', l.name).then((n) => n && patchLayer(i, { name: n }))} title="Double-clic pour renommer">
                    {l.name}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title={l.locked ? 'Déverrouiller' : 'Verrouiller'}
                    onClick={(e) => {
                      e.stopPropagation()
                      patchLayer(i, { locked: !l.locked })
                    }}
                  >
                    {l.locked ? <Lock size={12} /> : <LockOpen size={12} className="faint-icon" />}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title={l.visible ? 'Masquer' : 'Afficher'}
                    onClick={(e) => {
                      e.stopPropagation()
                      patchLayer(i, { visible: !l.visible })
                    }}
                  >
                    {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
              )
            })}
          </div>
          {layer && (
            <div className="layer-tools">
              {range('Opacité', layer.opacity, 0, 1, (n) => patchLayer(active, { opacity: n }), ' %', 0.05)}
              <label className="faint">
                Mode de fusion
                <select className="select select-sm" value={layer.blend} onChange={(e) => patchLayer(active, { blend: e.target.value as GlobalCompositeOperation })}>
                  {BLENDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="layer-btns">
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveLayer(active, 1)} disabled={active === layers.length - 1} title="Monter">
                  <ChevronUp size={14} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveLayer(active, -1)} disabled={active === 0} title="Descendre">
                  <ChevronDown size={14} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={duplicateLayer} title={`Dupliquer (${MOD}+J)`}>
                  <Copy size={13} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={mergeDown} disabled={active === 0} title={`Fusionner avec le calque du dessous (${MOD}+E)`}>
                  <Combine size={13} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={clearLayer} title="Vider (ou vider la sélection)">
                  <Eraser size={13} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" disabled={layers.length < 2} title="Supprimer le calque" onClick={deleteLayer}>
                  <Trash2 size={13} />
                </button>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={flatten} disabled={layers.length < 2}>
                <Waves size={13} /> Tout aplatir en un calque
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void copySelection()}>
                <Clipboard size={13} /> Copier l’image
              </button>
            </div>
          )}
        </aside>
      </div>

      {promptNode}
      {dialog === 'new' && <NewDialog onClose={() => setDialog(null)} onCreate={create} bg={color2} />}
      {(dialog === 'resize' || dialog === 'canvas') && (
        <SizeDialog
          mode={dialog}
          w={size.w}
          h={size.h}
          onClose={() => setDialog(null)}
          onApply={(w, h, anchor) => {
            if (dialog === 'resize') resizeImage(w, h)
            else resizeCanvas(w, h, anchor)
            setDialog(null)
          }}
        />
      )}
      {dialog === 'adjust' && (
        <Modal
          title={
            <>
              <Palette size={15} /> Réglages des couleurs
            </>
          }
          onClose={() => {
            setAdjust(NO_ADJUST)
            setDialog(null)
          }}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setAdjust(NO_ADJUST)}>
                Réinitialiser
              </button>
              <button className="btn btn-primary" onClick={applyAdjust}>
                Appliquer
              </button>
            </>
          }
        >
          <p className="muted">Aperçu en direct sur {s ? 'la sélection' : `« ${layer.name} »`}.</p>
          <div className="ui-col adjust">
            {range('Luminosité', adjust.brightness, 0, 200, (n) => setAdjust({ ...adjust, brightness: n }), ' %')}
            {range('Contraste', adjust.contrast, 0, 200, (n) => setAdjust({ ...adjust, contrast: n }), ' %')}
            {range('Saturation', adjust.saturate, 0, 300, (n) => setAdjust({ ...adjust, saturate: n }), ' %')}
            {range('Teinte', adjust.hue, -180, 180, (n) => setAdjust({ ...adjust, hue: n }), '°')}
            {range('Flou', adjust.blur, 0, 40, (n) => setAdjust({ ...adjust, blur: n }), ' px')}
            {range('Opacité', adjust.opacity, 0, 100, (n) => setAdjust({ ...adjust, opacity: n }), ' %')}
          </div>
        </Modal>
      )}
    </div>
  )
}

function NewDialog({ onClose, onCreate, bg }: { onClose: () => void; onCreate: (w: number, h: number, bg: string | null) => void; bg: string }): JSX.Element {
  const [w, setW] = useState(1600)
  const [h, setH] = useState(900)
  return (
    <Modal title="Nouvelle image" onClose={onClose} width={520}>
      <p className="muted">L’image actuelle sera remplacée (pense à l’enregistrer).</p>
      <div className="ui-col">
        {SIZES.map((s) => (
          <div key={s.label} className="ui-row size-row">
            <span style={{ flex: 1 }}>{s.label}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => onCreate(s.w, s.h, '#ffffff')}>
              Blanc
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onCreate(s.w, s.h, null)}>
              Transparent
            </button>
          </div>
        ))}
        <div className="ui-row size-row custom-size">
          <span>Sur mesure</span>
          <input className="input" type="number" min={1} max={8000} value={w} onChange={(e) => setW(Number(e.target.value))} />
          ×
          <input className="input" type="number" min={1} max={8000} value={h} onChange={(e) => setH(Number(e.target.value))} />
          <button className="btn btn-primary btn-sm" disabled={w < 1 || h < 1 || w > 8000 || h > 8000} onClick={() => onCreate(w, h, '#ffffff')}>
            Créer
          </button>
          <button className="btn btn-ghost btn-sm" title="Fond de la 2ᵉ couleur" onClick={() => onCreate(w, h, bg)}>
            <span className="mini-swatch" style={{ background: bg }} />
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SizeDialog({
  mode,
  w: w0,
  h: h0,
  onClose,
  onApply
}: {
  mode: 'resize' | 'canvas'
  w: number
  h: number
  onClose: () => void
  onApply: (w: number, h: number, anchor: [number, number]) => void
}): JSX.Element {
  const [w, setW] = useState(w0)
  const [h, setH] = useState(h0)
  const [keep, setKeep] = useState(mode === 'resize')
  const [anchor, setAnchor] = useState<[number, number]>([0.5, 0.5])
  const ok = w >= 1 && h >= 1 && w <= 8000 && h <= 8000
  return (
    <Modal
      title={mode === 'resize' ? 'Redimensionner l’image' : 'Taille de la zone de dessin'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!ok} onClick={() => onApply(w, h, anchor)}>
            Appliquer
          </button>
        </>
      }
    >
      <p className="muted">{mode === 'resize' ? 'Tout le dessin est étiré à la nouvelle taille.' : 'Le dessin garde sa taille ; on ajoute ou retire de la place autour.'}</p>
      <div className="ui-row custom-size">
        <input
          className="input"
          type="number"
          value={w}
          onChange={(e) => {
            const v = Number(e.target.value)
            setW(v)
            if (keep) setH(Math.max(1, Math.round((v * h0) / w0)))
          }}
        />
        ×
        <input
          className="input"
          type="number"
          value={h}
          onChange={(e) => {
            const v = Number(e.target.value)
            setH(v)
            if (keep) setW(Math.max(1, Math.round((v * w0) / h0)))
          }}
        />
        px
        <label className="ui-row faint">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Garder les proportions
        </label>
      </div>
      <div className="ui-row" style={{ marginTop: 10 }}>
        {[50, 75, 150, 200].map((p) => (
          <button
            key={p}
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setW(Math.round((w0 * p) / 100))
              setH(Math.round((h0 * p) / 100))
            }}
          >
            {p} %
          </button>
        ))}
      </div>
      {mode === 'canvas' && (
        <div className="anchor-grid" title="Où placer le dessin actuel">
          {[0, 0.5, 1].map((ay) =>
            [0, 0.5, 1].map((ax) => (
              <button key={`${ax}-${ay}`} className={anchor[0] === ax && anchor[1] === ay ? 'on' : ''} onClick={() => setAnchor([ax, ay])} />
            ))
          )}
        </div>
      )}
    </Modal>
  )
}
