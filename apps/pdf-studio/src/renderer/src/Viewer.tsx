import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Eraser, Hand, Highlighter, Minus, PenLine, Plus, Save, Signature, Square, Type, Undo2 } from 'lucide-react'
import { Modal, errorText, toast, uid, usePersisted, usePrompt } from '@ui'
import { baseName, flatten, writePdf, type Annotation, type PdfJsDoc } from './pdf'

type Tool = 'hand' | 'highlight' | 'pen' | 'rect' | 'text' | 'sign' | 'erase'

interface Mark {
  page: number
  label: string
}

const TOOLS: { id: Tool; label: string; icon: JSX.Element }[] = [
  { id: 'hand', label: 'Lire', icon: <Hand size={15} /> },
  { id: 'highlight', label: 'Surligner', icon: <Highlighter size={15} /> },
  { id: 'pen', label: 'Dessiner', icon: <PenLine size={15} /> },
  { id: 'rect', label: 'Encadrer', icon: <Square size={15} /> },
  { id: 'text', label: 'Texte', icon: <Type size={15} /> },
  { id: 'sign', label: 'Signer', icon: <Signature size={15} /> },
  { id: 'erase', label: 'Effacer', icon: <Eraser size={15} /> }
]
const COLORS = ['#facc15', '#22c55e', '#38bdf8', '#f472b6', '#ef4444', '#111111']

export default function Viewer({ path, doc, bytes, docKey, onClose }: { path: string; doc: PdfJsDoc; bytes: Uint8Array; docKey: string; onClose: () => void }): JSX.Element {
  const [annotations, setAnnotations] = usePersisted<Annotation[]>(`annotations-${docKey}`, [])
  const [marks, setMarks] = usePersisted<Mark[]>(`bookmarks-${docKey}`, [])
  const [tool, setTool] = useState<Tool>('hand')
  const [color, setColor] = useState(COLORS[0])
  const [zoom, setZoom] = useState(1.2)
  const [page, setPage] = useState(1)
  const [signature, setSignature] = usePersisted<string | null>('signature', null)
  const [signOpen, setSignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const [promptNode, ask] = usePrompt()

  useEffect(() => {
    if (tool === 'sign' && !signature) setSignOpen(true)
  }, [tool])

  // Page affichée = celle au milieu de l'écran.
  const onScroll = (): void => {
    const el = scroller.current
    if (!el) return
    const mid = el.scrollTop + el.clientHeight / 2
    const pages = [...el.querySelectorAll<HTMLElement>('.page')]
    const hit = pages.findIndex((p) => p.offsetTop <= mid && p.offsetTop + p.offsetHeight >= mid)
    if (hit >= 0) setPage(hit + 1)
  }
  const goTo = (n: number): void => {
    const el = scroller.current?.querySelectorAll<HTMLElement>('.page')[n - 1]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const add = (a: Annotation): void => setAnnotations((all) => [...all, a])
  const undo = (): void => setAnnotations((all) => all.slice(0, -1))

  const saveCopy = async (): Promise<void> => {
    const target = await window.kit.files.save({ title: 'Enregistrer une copie annotée', defaultPath: path.replace(/\.pdf$/i, ' (annoté).pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!target) return
    setSaving(true)
    try {
      await writePdf(target, await flatten(bytes, annotations))
      toast('Copie annotée enregistrée', 'success')
      void window.kit.files.reveal(target)
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="viewer">
      <div className="ui-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <ArrowLeft size={15} /> Bibliothèque
        </button>
        <b className="viewer-title" title={path}>
          {baseName(path)}
        </b>
        <div className="spacer" />
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={`btn btn-sm${tool === t.id ? ' on' : ' btn-ghost'}`} onClick={() => setTool(t.id)} title={t.label}>
              {t.icon}
              <span className="tool-label">{t.label}</span>
            </button>
          ))}
        </div>
        {['highlight', 'pen', 'rect', 'text'].includes(tool) && (
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        )}
        {tool === 'sign' && signature && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSignOpen(true)}>
            Changer la signature
          </button>
        )}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={undo} disabled={!annotations.length} title="Annuler">
          <Undo2 size={15} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => void saveCopy()} disabled={saving || !annotations.length} title="Enregistrer une copie avec les annotations">
          {saving ? <span className="spinner" /> : <Save size={14} />} Enregistrer
        </button>
      </div>

      <div className="viewer-body">
        <aside className="thumbs">
          <div className="thumbs-head">
            <span>
              Page {page} / {doc.numPages}
            </span>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              title="Ajouter un signet sur cette page"
              onClick={() =>
                void ask('Nom du signet', `Page ${page}`).then((label) => {
                  if (label) setMarks((m) => [...m.filter((x) => x.page !== page), { page, label }].sort((a, b) => a.page - b.page))
                })
              }
            >
              <Bookmark size={14} />
            </button>
          </div>
          {marks.length > 0 && (
            <div className="marks">
              {marks.map((m) => (
                <div key={m.page} className="mark">
                  <button onClick={() => goTo(m.page)}>
                    <Bookmark size={12} /> {m.label}
                  </button>
                  <button className="faint" onClick={() => setMarks((all) => all.filter((x) => x.page !== m.page))} title="Retirer">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {Array.from({ length: doc.numPages }, (_, i) => (
            <button key={i} className={`thumb${page === i + 1 ? ' on' : ''}`} onClick={() => goTo(i + 1)}>
              <PageCanvas doc={doc} n={i + 1} scale={0.2} />
              <span>{i + 1}</span>
            </button>
          ))}
        </aside>

        <div className="pages" ref={scroller} onScroll={onScroll}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PageView
              key={i}
              doc={doc}
              n={i + 1}
              zoom={zoom}
              tool={tool}
              color={color}
              signature={signature}
              annotations={annotations.filter((a) => a.page === i)}
              onAdd={add}
              ask={ask}
              onErase={(id) => setAnnotations((all) => all.filter((a) => a.id !== id))}
            />
          ))}
        </div>

        <div className="zoom">
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(1)))}>
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)} %</span>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}>
            <Plus size={14} />
          </button>
        </div>
      </div>

      {promptNode}
      {signOpen && (
        <SignaturePad
          onClose={() => {
            setSignOpen(false)
            if (!signature) setTool('hand')
          }}
          onSave={(d) => {
            setSignature(d)
            setSignOpen(false)
            toast('Clique sur la page pour placer ta signature', 'info')
          }}
        />
      )}
    </div>
  )
}

/** Rendu d'une page pdf.js dans un canvas (à la demande, quand elle devient visible). */
function PageCanvas({ doc, n, scale }: { doc: PdfJsDoc; n: number; scale: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    let task: { cancel: () => void } | null = null
    let alive = true
    void doc.getPage(n).then((page) => {
      const vp = page.getViewport({ scale })
      const canvas = ref.current
      if (!canvas || !alive) return
      // Taille réservée tout de suite (même hors écran) pour que le défilement soit stable.
      const ratio = window.devicePixelRatio || 1
      canvas.style.width = `${vp.width}px`
      canvas.style.height = `${vp.height}px`
      if (!visible) return
      canvas.width = Math.floor(vp.width * ratio)
      canvas.height = Math.floor(vp.height * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      const t = page.render({ canvasContext: ctx, viewport: vp })
      task = t
      t.promise.catch(() => {})
    })
    return () => {
      alive = false
      task?.cancel()
    }
  }, [doc, n, scale, visible])
  return <canvas ref={ref} className="page-canvas" />
}

function PageView({
  doc,
  n,
  zoom,
  tool,
  color,
  signature,
  annotations,
  onAdd,
  ask,
  onErase
}: {
  doc: PdfJsDoc
  n: number
  zoom: number
  tool: Tool
  color: string
  signature: string | null
  annotations: Annotation[]
  onAdd: (a: Annotation) => void
  ask: (title: string, initial?: string, multiline?: boolean) => Promise<string | null>
  onErase: (id: string) => void
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const page = n - 1

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }

  const down = (e: React.PointerEvent): void => {
    if (tool === 'hand' || tool === 'erase') return
    const [x, y] = pos(e)
    if (tool === 'text') {
      void ask('Texte à ajouter', '', true).then((text) => {
        if (text) onAdd({ id: uid(), page, kind: 'text', x, y, text, color, size: 12 })
      })
      return
    }
    if (tool === 'sign') {
      if (!signature) return
      const ratio = box.current!.clientWidth / box.current!.clientHeight
      const w = 0.28
      onAdd({ id: uid(), page, kind: 'image', x: Math.min(x, 1 - w), y, w, h: (w * ratio) / 2.6, dataUrl: signature })
      return
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (tool === 'pen') setDraft({ id: uid(), page, kind: 'pen', points: [[x, y]], color, width: 2 })
    else setDraft({ id: uid(), page, kind: tool, x, y, w: 0, h: 0, color })
  }
  const move = (e: React.PointerEvent): void => {
    if (!draft) return
    const [x, y] = pos(e)
    if (draft.kind === 'pen') setDraft({ ...draft, points: [...draft.points, [x, y]] })
    else if (draft.kind === 'highlight' || draft.kind === 'rect') {
      const start = draft as Annotation & { sx?: number; sy?: number }
      const sx = start.sx ?? draft.x
      const sy = start.sy ?? draft.y
      setDraft({ ...draft, x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy), sx, sy } as Annotation)
    }
  }
  const up = (): void => {
    if (!draft) return
    const clean = { ...draft } as Annotation & { sx?: number; sy?: number }
    delete clean.sx
    delete clean.sy
    const big = clean.kind === 'pen' ? clean.points.length > 2 : (clean as { w: number; h: number }).w > 0.005 && (clean as { w: number; h: number }).h > 0.003
    if (big) onAdd(clean)
    setDraft(null)
  }

  const all = draft ? [...annotations, draft] : annotations
  return (
    <div className="page" ref={box} data-tool={tool}>
      <PageCanvas doc={doc} n={n} scale={zoom} />
      <svg className="overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        {all.map((a) => {
          const erase = tool === 'erase' ? { onClick: () => onErase(a.id), className: 'erasable' } : {}
          if (a.kind === 'highlight') return <rect key={a.id} {...erase} x={a.x * 1000} y={a.y * 1000} width={a.w * 1000} height={a.h * 1000} fill={a.color} opacity={0.35} />
          if (a.kind === 'rect') return <rect key={a.id} {...erase} x={a.x * 1000} y={a.y * 1000} width={a.w * 1000} height={a.h * 1000} fill="none" stroke={a.color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          if (a.kind === 'pen')
            return <polyline key={a.id} {...erase} points={a.points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} fill="none" stroke={a.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          if (a.kind === 'image') return <image key={a.id} {...erase} href={a.dataUrl} x={a.x * 1000} y={a.y * 1000} width={a.w * 1000} height={a.h * 1000} preserveAspectRatio="none" />
          return null
        })}
      </svg>
      {annotations
        .filter((a): a is Extract<Annotation, { kind: 'text' }> => a.kind === 'text')
        .map((a) => (
          <div
            key={a.id}
            className={`text-note${tool === 'erase' ? ' erasable' : ''}`}
            style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color, fontSize: a.size * zoom }}
            onClick={() => tool === 'erase' && onErase(a.id)}
          >
            {a.text}
          </div>
        ))}
    </div>
  )
}

/** Signature à la souris (ou au stylet), gardée pour les prochains documents. */
function SignaturePad({ onClose, onSave }: { onClose: () => void; onSave: (dataUrl: string) => void }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1e3a8a'
  }, [])
  const at = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * ref.current!.width, ((e.clientY - r.top) / r.height) * ref.current!.height]
  }
  return (
    <Modal
      title="Ta signature"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button
            className="btn btn-ghost"
            style={{ marginRight: 'auto' }}
            onClick={() => {
              ref.current!.getContext('2d')!.clearRect(0, 0, 1040, 400)
              setEmpty(true)
            }}
          >
            Effacer
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={empty} onClick={() => onSave(ref.current!.toDataURL('image/png'))}>
            Utiliser
          </button>
        </>
      }
    >
      <p className="muted">Signe dans le cadre avec la souris ou un stylet. Elle sera gardée pour tes prochains documents.</p>
      <canvas
        ref={ref}
        className="sign-pad"
        width={1040}
        height={400}
        onPointerDown={(e) => {
          drawing.current = true
          ;(e.target as Element).setPointerCapture(e.pointerId)
          const ctx = ref.current!.getContext('2d')!
          ctx.beginPath()
          ctx.moveTo(...at(e))
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = ref.current!.getContext('2d')!
          ctx.lineTo(...at(e))
          ctx.stroke()
          setEmpty(false)
        }}
        onPointerUp={() => (drawing.current = false)}
      />
    </Modal>
  )
}
