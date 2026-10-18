import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Brush,
  Circle,
  Droplet,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2
} from 'lucide-react'
import { Modal, toast, uid, usePrompt } from '@ui'

type Tool = 'brush' | 'pencil' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'fill' | 'picker' | 'text'

interface Layer {
  id: string
  name: string
  canvas: HTMLCanvasElement
  visible: boolean
  opacity: number
}

const TOOLS: { id: Tool; label: string; key: string; icon: JSX.Element }[] = [
  { id: 'brush', label: 'Pinceau', key: 'B', icon: <Brush size={17} /> },
  { id: 'pencil', label: 'Crayon', key: 'P', icon: <Pencil size={17} /> },
  { id: 'eraser', label: 'Gomme', key: 'E', icon: <Eraser size={17} /> },
  { id: 'line', label: 'Ligne', key: 'L', icon: <Minus size={17} /> },
  { id: 'arrow', label: 'Flèche', key: 'A', icon: <ArrowUpRight size={17} /> },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: <Square size={17} /> },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle size={17} /> },
  { id: 'fill', label: 'Remplissage', key: 'G', icon: <PaintBucket size={17} /> },
  { id: 'picker', label: 'Pipette', key: 'I', icon: <Pipette size={17} /> },
  { id: 'text', label: 'Texte', key: 'T', icon: <Type size={17} /> }
]
const PALETTE = ['#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#92400e', '#065f46', '#1e3a8a']
const SIZES = [
  { label: 'Écran (1280 × 720)', w: 1280, h: 720 },
  { label: 'Full HD (1920 × 1080)', w: 1920, h: 1080 },
  { label: 'Carré (1080 × 1080)', w: 1080, h: 1080 },
  { label: 'A4 portrait (1240 × 1754)', w: 1240, h: 1754 },
  { label: 'Icône (512 × 512)', w: 512, h: 512 }
]

function makeCanvas(w: number, h: number, fill?: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  if (fill) {
    const ctx = c.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, w, h)
  }
  return c
}

/** Remplissage par diffusion (pot de peinture), avec une petite tolérance. */
function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, tolerance = 32): void {
  const { width: W, height: H } = ctx.canvas
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const i0 = (y * W + x) * 4
  const [r0, g0, b0, a0] = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]]
  const n = parseInt(hex.slice(1), 16)
  const [r1, g1, b1] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) < 3 && a0 === 255) return
  const match = (i: number): boolean => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(d[i + 3] - a0) <= tolerance
  const stack = [x, y]
  const seen = new Uint8Array(W * H)
  while (stack.length) {
    const py = stack.pop()!
    const px = stack.pop()!
    let lx = px
    while (lx >= 0 && !seen[py * W + lx] && match((py * W + lx) * 4)) lx--
    lx++
    let up = false
    let down = false
    for (let cx = lx; cx < W && !seen[py * W + cx] && match((py * W + cx) * 4); cx++) {
      const i = (py * W + cx) * 4
      seen[py * W + cx] = 1
      d[i] = r1
      d[i + 1] = g1
      d[i + 2] = b1
      d[i + 3] = 255
      if (py > 0) {
        const m = !seen[(py - 1) * W + cx] && match(((py - 1) * W + cx) * 4)
        if (m && !up) stack.push(cx, py - 1)
        up = m
      }
      if (py < H - 1) {
        const m = !seen[(py + 1) * W + cx] && match(((py + 1) * W + cx) * 4)
        if (m && !down) stack.push(cx, py + 1)
        down = m
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

export default function Paint2D({ active: shown }: { active: boolean }): JSX.Element {
  const [size, setSize] = useState({ w: 1280, h: 720 })
  const [layers, setLayers] = useState<Layer[]>(() => [{ id: uid(), name: 'Fond', canvas: makeCanvas(1280, 720, '#ffffff'), visible: true, opacity: 1 }])
  const [active, setActive] = useState(0)
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#111111')
  const [width, setWidth] = useState(6)
  const [alpha, setAlpha] = useState(1)
  const [filled, setFilled] = useState(false)
  const [zoom, setZoom] = useState(0)
  const [, redraw] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const [promptNode, ask] = usePrompt()
  const view = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const history = useRef<{ undo: { layer: string; data: ImageData }[]; redo: { layer: string; data: ImageData }[] }>({ undo: [], redo: [] })
  const drag = useRef<{ x: number; y: number; last: [number, number]; snapshot: ImageData } | null>(null)

  const layer = layers[active]

  // Zoom « ajusté » : l'image tient dans la zone visible.
  const fit = (): number => {
    const el = wrap.current
    if (!el || !el.clientWidth) return 1
    return Math.min(1, (el.clientWidth - 48) / size.w, (el.clientHeight - 48) / size.h)
  }
  const scale = zoom || fit()

  /** Compose les calques visibles dans le canvas affiché. */
  const compose = (): void => {
    const c = view.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    for (const l of layers) {
      if (!l.visible) continue
      ctx.globalAlpha = l.opacity
      ctx.drawImage(l.canvas, 0, 0)
    }
    ctx.globalAlpha = 1
  }
  useEffect(compose)
  // Zoom « ajusté » recalculé quand la zone change de taille (et au premier affichage).
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => redraw((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const remember = (): void => {
    const ctx = layer.canvas.getContext('2d')!
    history.current.undo.push({ layer: layer.id, data: ctx.getImageData(0, 0, size.w, size.h) })
    if (history.current.undo.length > 40) history.current.undo.shift()
    history.current.redo = []
  }
  const step = (from: 'undo' | 'redo'): void => {
    const to = from === 'undo' ? 'redo' : 'undo'
    const entry = history.current[from].pop()
    if (!entry) return
    const l = layers.find((x) => x.id === entry.layer)
    if (!l) return
    const ctx = l.canvas.getContext('2d')!
    history.current[to].push({ layer: l.id, data: ctx.getImageData(0, 0, size.w, size.h) })
    ctx.putImageData(entry.data, 0, 0)
    redraw((n) => n + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!shown || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        step(e.shiftKey ? 'redo' : 'undo')
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        step('redo')
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      } else if (!e.ctrlKey && !e.metaKey) {
        const t = TOOLS.find((x) => x.key === e.key.toUpperCase())
        if (t) setTool(t.id)
        if (e.key === '[') setWidth((w) => Math.max(1, w - 2))
        if (e.key === ']') setWidth((w) => Math.min(120, w + 2))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const point = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h]
  }

  const style = (ctx: CanvasRenderingContext2D): void => {
    ctx.globalAlpha = tool === 'eraser' ? 1 : alpha
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = tool === 'pencil' ? Math.max(1, width / 3) : width
    ctx.lineCap = tool === 'pencil' ? 'square' : 'round'
    ctx.lineJoin = 'round'
  }

  const shape = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void => {
    ctx.beginPath()
    if (tool === 'line' || tool === 'arrow') {
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      if (tool === 'arrow') {
        const a = Math.atan2(y1 - y0, x1 - x0)
        const head = Math.max(12, width * 3)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45))
        ctx.moveTo(x1, y1)
        ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45))
        ctx.stroke()
      }
    } else if (tool === 'rect') {
      if (filled) ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      else ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
    } else if (tool === 'ellipse') {
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2)
      if (filled) ctx.fill()
      else ctx.stroke()
    }
  }

  const down = async (e: React.PointerEvent): Promise<void> => {
    if (!layer.visible) return toast('Ce calque est masqué : affiche-le pour dessiner dessus.', 'info')
    const [x, y] = point(e)
    const ctx = layer.canvas.getContext('2d')!
    if (tool === 'picker') {
      const v = view.current!.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
      setColor(`#${[v[0], v[1], v[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`)
      setTool('brush')
      return
    }
    if (tool === 'fill') {
      remember()
      floodFill(ctx, Math.floor(x), Math.floor(y), color)
      redraw((n) => n + 1)
      return
    }
    if (tool === 'text') {
      const text = await ask('Texte', '', true)
      if (!text) return
      remember()
      style(ctx)
      ctx.font = `600 ${Math.max(12, width * 4)}px Inter, Segoe UI, sans-serif`
      ctx.textBaseline = 'top'
      text.split('\n').forEach((l, i) => ctx.fillText(l, x, y + i * Math.max(12, width * 4) * 1.2))
      ctx.globalAlpha = 1
      redraw((n) => n + 1)
      return
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    remember()
    drag.current = { x, y, last: [x, y], snapshot: ctx.getImageData(0, 0, size.w, size.h) }
    if (tool === 'brush' || tool === 'pencil' || tool === 'eraser') {
      style(ctx)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 0.01, y)
      ctx.stroke()
      redraw((n) => n + 1)
    }
  }

  const move = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const [x, y] = point(e)
    const ctx = layer.canvas.getContext('2d')!
    style(ctx)
    if (tool === 'brush' || tool === 'pencil' || tool === 'eraser') {
      ctx.beginPath()
      ctx.moveTo(...d.last)
      ctx.lineTo(x, y)
      ctx.stroke()
      d.last = [x, y]
    } else {
      ctx.putImageData(d.snapshot, 0, 0)
      let [x1, y1] = [x, y]
      // Maj : carré, cercle, ou ligne à 45°.
      if (e.shiftKey) {
        const s = Math.max(Math.abs(x - d.x), Math.abs(y - d.y))
        x1 = d.x + Math.sign(x - d.x) * s
        y1 = d.y + Math.sign(y - d.y) * s
      }
      shape(ctx, d.x, d.y, x1, y1)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    compose()
  }

  const up = (): void => {
    drag.current = null
    redraw((n) => n + 1)
  }

  const flat = (bg?: string): HTMLCanvasElement => {
    const c = makeCanvas(size.w, size.h, bg)
    const ctx = c.getContext('2d')!
    for (const l of layers) {
      if (!l.visible) continue
      ctx.globalAlpha = l.opacity
      ctx.drawImage(l.canvas, 0, 0)
    }
    return c
  }

  const save = async (): Promise<void> => {
    const path = await window.kit.files.save({ title: 'Enregistrer l’image', defaultPath: 'dessin.png', filters: [{ name: 'PNG', extensions: ['png'] }, { name: 'JPG', extensions: ['jpg'] }] })
    if (!path) return
    const jpg = /\.jpe?g$/i.test(path)
    const data = flat(jpg ? '#ffffff' : undefined).toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.92)
    await window.kit.files.writeBase64(path, data.split(',')[1])
    toast('Image enregistrée', 'success')
  }

  const openImage = async (): Promise<void> => {
    const [path] = await window.kit.files.open({ title: 'Ouvrir une image', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] })
    if (!path) return
    const ext = path.split('.').pop()!.toLowerCase()
    const img = new Image()
    img.src = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${await window.kit.files.readBase64(path)}`
    await img.decode()
    const c = makeCanvas(img.naturalWidth, img.naturalHeight)
    c.getContext('2d')!.drawImage(img, 0, 0)
    history.current = { undo: [], redo: [] }
    setSize({ w: img.naturalWidth, h: img.naturalHeight })
    setLayers([
      { id: uid(), name: path.split(/[\\/]/).pop()!, canvas: c, visible: true, opacity: 1 },
      { id: uid(), name: 'Calque 1', canvas: makeCanvas(img.naturalWidth, img.naturalHeight), visible: true, opacity: 1 }
    ])
    setActive(1)
    setZoom(0)
  }

  const create = (w: number, h: number, bg: string | null): void => {
    history.current = { undo: [], redo: [] }
    setSize({ w, h })
    setLayers([{ id: uid(), name: 'Fond', canvas: makeCanvas(w, h, bg ?? undefined), visible: true, opacity: 1 }])
    setActive(0)
    setZoom(0)
    setNewOpen(false)
  }

  const addLayer = (): void => {
    const l: Layer = { id: uid(), name: `Calque ${layers.length}`, canvas: makeCanvas(size.w, size.h), visible: true, opacity: 1 }
    setLayers((all) => [...all.slice(0, active + 1), l, ...all.slice(active + 1)])
    setActive(active + 1)
  }
  const patchLayer = (i: number, p: Partial<Layer>): void => setLayers((all) => all.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const moveLayer = (i: number, d: number): void => {
    const j = i + d
    if (j < 0 || j >= layers.length) return
    setLayers((all) => {
      const n = [...all]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
    setActive(j)
  }

  return (
    <div className="paint">
      <div className="ui-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setNewOpen(true)}>
          <FilePlus2 size={14} /> Nouveau
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void openImage()}>
          <FolderOpen size={14} /> Ouvrir
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void save()}>
          <Save size={14} /> Enregistrer
        </button>
        <span className="sep" />
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => step('undo')} title="Annuler (Ctrl+Z)">
          <Undo2 size={15} />
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => step('redo')} title="Rétablir (Ctrl+Y)">
          <Redo2 size={15} />
        </button>
        <span className="sep" />
        <label className="ui-row faint">
          Taille
          <input type="range" min={1} max={120} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          <b className="num">{width}</b>
        </label>
        <label className="ui-row faint">
          <Droplet size={13} />
          <input type="range" min={0.05} max={1} step={0.05} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
          <b className="num">{Math.round(alpha * 100)} %</b>
        </label>
        {(tool === 'rect' || tool === 'ellipse') && (
          <button className={`btn btn-sm ${filled ? 'on' : 'btn-ghost'}`} onClick={() => setFilled(!filled)}>
            {filled ? 'Plein' : 'Contour'}
          </button>
        )}
        <div className="spacer" />
        <span className="faint num">
          {size.w} × {size.h}
        </span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom(Math.max(0.1, scale - 0.1))}>
          <Minus size={14} />
        </button>
        <button className="btn btn-ghost btn-sm num" onClick={() => setZoom(0)} title="Ajuster à la fenêtre">
          {Math.round(scale * 100)} %
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom(Math.min(4, scale + 0.1))}>
          <Plus size={14} />
        </button>
      </div>

      <div className="paint-body">
        <aside className="toolbox">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool${tool === t.id ? ' on' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
              {t.icon}
            </button>
          ))}
          <div className="current-color" style={{ background: color }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Couleur personnalisée" />
          </div>
          <div className="palette">
            {PALETTE.map((c) => (
              <button key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </aside>

        <div className="stage" ref={wrap}>
          <canvas
            ref={view}
            width={size.w}
            height={size.h}
            className={`board tool-${tool}`}
            style={{ width: size.w * scale, height: size.h * scale }}
            onPointerDown={(e) => void down(e)}
            onPointerMove={move}
            onPointerUp={up}
          />
        </div>

        <aside className="layers">
          <div className="layers-head">
            <b>Calques</b>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={addLayer} title="Nouveau calque">
              <Plus size={14} />
            </button>
          </div>
          {[...layers.keys()].reverse().map((i) => {
            const l = layers[i]
            return (
              <div key={l.id} className={`layer${i === active ? ' on' : ''}`} onClick={() => setActive(i)}>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    patchLayer(i, { visible: !l.visible })
                  }}
                >
                  {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <span
                  className="layer-name"
                  onDoubleClick={() => void ask('Nom du calque', l.name).then((n) => n && patchLayer(i, { name: n }))}
                >
                  {l.name}
                </span>
              </div>
            )
          })}
          {layer && (
            <div className="layer-tools">
              <label className="faint">
                Opacité du calque
                <input type="range" min={0} max={1} step={0.05} value={layer.opacity} onChange={(e) => patchLayer(active, { opacity: Number(e.target.value) })} />
              </label>
              <div className="ui-row">
                <button className="btn btn-ghost btn-sm" onClick={() => moveLayer(active, 1)} disabled={active === layers.length - 1}>
                  Monter
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => moveLayer(active, -1)} disabled={active === 0}>
                  Descendre
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  disabled={layers.length < 2}
                  title="Supprimer le calque"
                  onClick={() => {
                    setLayers((all) => all.filter((_, j) => j !== active))
                    setActive(Math.max(0, active - 1))
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {promptNode}
      {newOpen && (
        <Modal title="Nouvelle image" onClose={() => setNewOpen(false)}>
          <p className="muted">L’image actuelle sera remplacée (pense à l’enregistrer).</p>
          <div className="ui-col">
            {SIZES.map((s) => (
              <div key={s.label} className="ui-row size-row">
                <span style={{ flex: 1 }}>{s.label}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => create(s.w, s.h, '#ffffff')}>
                  Fond blanc
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => create(s.w, s.h, null)}>
                  Transparent
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
