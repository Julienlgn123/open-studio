import { useMemo, useRef } from 'react'
import { X, Download } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Node { text: string; level: number; children: Node[]; x: number; y: number; w: number }

const clip = (s: string, n = 34): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Titres h1–h3 du cours → arbre. */
export function parseOutline(html: string, root: string): Node {
  const tree: Node = { text: root, level: 0, children: [], x: 0, y: 0, w: 0 }
  const stack: Node[] = [tree]
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
    if (!text) continue
    const n: Node = { text, level: Number(m[1]), children: [], x: 0, y: 0, w: 0 }
    while (stack.length > 1 && stack[stack.length - 1].level >= n.level) stack.pop()
    stack[stack.length - 1].children.push(n)
    stack.push(n)
  }
  return tree
}

/** Mise en page horizontale : racine à gauche, feuilles empilées. */
function layout(root: Node): { nodes: Node[]; edges: Array<[Node, Node]>; width: number; height: number } {
  const nodes: Node[] = []; const edges: Array<[Node, Node]> = []
  let row = 0
  const ROW = 38, COL = 230
  const walk = (n: Node, depth: number): void => {
    nodes.push(n)
    n.w = Math.min(210, 24 + clip(n.text).length * 7)
    n.x = 20 + depth * COL
    if (!n.children.length) { n.y = 20 + row * ROW; row++; return }
    n.children.forEach((c) => { walk(c, depth + 1); edges.push([n, c]) })
    n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2
  }
  walk(root, 0)
  const maxDepth = Math.max(...nodes.map((n) => (n.x - 20) / COL))
  return { nodes, edges, width: 20 + (maxDepth + 1) * COL, height: 40 + Math.max(1, row) * ROW }
}

const COLORS = ['#7c6cf0', '#3b9cf5', '#2ecc9a', '#f2a93b']

export default function MindMapModal({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { nodes, edges, width, height } = useMemo(() => layout(parseOutline(html, title || 'Cours')), [html, title])
  const empty = nodes.length <= 1

  async function exportSvg() {
    const el = svgRef.current; if (!el) return
    const xml = new XMLSerializer().serializeToString(el)
    const blob = new Blob([xml], { type: 'image/svg+xml' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title || 'carte'}.svg`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  void api

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(1000px, 94vw)', maxWidth: 'none', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="modal-title" style={{ flex: 1 }}>Carte mentale — {title}</span>
          {!empty && <button className="btn btn-secondary btn-sm" onClick={exportSvg}><Download size={13} /> SVG</button>}
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body" style={{ overflow: 'auto', flex: 1 }}>
          {empty ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Cette carte se construit à partir des titres (H1, H2, H3) de ton cours. Ajoutes-en pour voir la structure apparaître.</p>
          ) : (
            <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={width} height={height} style={{ display: 'block' }} fontFamily="system-ui, sans-serif">
              {edges.map(([a, b], i) => {
                const x1 = a.x + a.w, y1 = a.y + 14, x2 = b.x, y2 = b.y + 14, mx = (x1 + x2) / 2
                return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#8884" strokeWidth="1.6" />
              })}
              {nodes.map((n, i) => {
                const c = COLORS[Math.min(n.level, 3)]
                return (
                  <g key={i}>
                    <rect x={n.x} y={n.y} width={n.w} height={28} rx={n.level === 0 ? 14 : 8} fill={n.level === 0 ? c : c + '22'} stroke={c} strokeWidth="1.4" />
                    <text x={n.x + 12} y={n.y + 18} fontSize={n.level === 0 ? 13 : 12} fontWeight={n.level <= 1 ? 600 : 400} fill={n.level === 0 ? '#fff' : 'currentColor'}>{clip(n.text)}</text>
                  </g>
                )
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
