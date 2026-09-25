import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Pen, Eraser, Trash2, Check } from 'lucide-react'

const COLORS = ['#e5e7eb', '#f87171', '#fbbf24', '#4ade80', '#38bdf8', '#818cf8']

export default function SketchNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const width: number = node.attrs.width
  const height: number = node.attrs.height
  const [editing, setEditing] = useState(!node.attrs.src)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(3)
  const [erasing, setErasing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Load the existing drawing onto the canvas when entering edit mode
  useEffect(() => {
    if (!editing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (node.attrs.src) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, width, height)
      img.src = node.attrs.src
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height
    }
  }

  function down(e: React.PointerEvent) {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pos(e)
    ctx.strokeStyle = color
    ctx.lineWidth = erasing ? 24 : size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  function up() {
    drawing.current = false
    last.current = null
  }

  function clear() {
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, width, height)
  }

  function done() {
    const data = canvasRef.current?.toDataURL('image/png')
    if (data) updateAttributes({ src: data })
    setEditing(false)
  }

  if (!editing) {
    return (
      <NodeViewWrapper as="div" className={selected ? 'sketch-node-selected' : ''} style={{ margin: '10px 0' }}>
        {node.attrs.src
          ? <img src={node.attrs.src} width={width} height={height} className="sketch-image" style={{ cursor: 'pointer', maxWidth: '100%' }} onClick={() => setEditing(true)} />
          : <div style={{ padding: 12, border: '1px dashed var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => setEditing(true)}>Schéma vide — cliquer pour dessiner</div>}
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper as="div" style={{ margin: '10px 0' }}>
      <div style={{ display: 'inline-flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface)', maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button className={`icon-btn ${!erasing ? 'active' : ''}`} onClick={() => setErasing(false)} data-tooltip="Crayon"><Pen size={13} /></button>
          <button className={`icon-btn ${erasing ? 'active' : ''}`} onClick={() => setErasing(true)} data-tooltip="Gomme"><Eraser size={13} /></button>
          <div style={{ display: 'flex', gap: 4 }}>
            {COLORS.map((c) => (
              <div key={c} onClick={() => { setColor(c); setErasing(false) }}
                style={{ width: 15, height: 15, borderRadius: '50%', background: c, cursor: 'pointer', outline: color === c ? '2px solid var(--accent)' : 'none', outlineOffset: 1 }} />
            ))}
          </div>
          <input type="range" min={1} max={10} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 70 }} />
          <div style={{ flex: 1 }} />
          <button className="icon-btn" onClick={clear} data-tooltip="Tout effacer"><Trash2 size={13} /></button>
          <button className="btn btn-primary btn-sm" onClick={done}><Check size={13} /> Terminé</button>
        </div>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          style={{ touchAction: 'none', cursor: 'crosshair', background: '#1c1c22', display: 'block', maxWidth: '100%' }}
        />
      </div>
    </NodeViewWrapper>
  )
}
