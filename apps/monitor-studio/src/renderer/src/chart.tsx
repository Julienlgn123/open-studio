import { useEffect, useRef } from 'react'
import { useTheme } from '@ui'

export const HISTORY = 120 // 2 minutes à 1 mesure par seconde

// ─── Graphique ─────────────────────────────────────────────────────────────────────────────

/**
 * Courbe en direct. Une mesure manquante (null) laisse un trou : on ne trace jamais une ligne
 * à travers des données qu'on n'a pas.
 */
export function Chart({ series, max, height = 120, colors, length = HISTORY }: { series: (number | null)[][]; max?: number; height?: number; colors: string[]; length?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useTheme()
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    const W = c.clientWidth
    const H = height
    c.width = W * ratio
    c.height = H * ratio
    const ctx = c.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const css = getComputedStyle(document.documentElement)
    ctx.strokeStyle = css.getPropertyValue('--border').trim()
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(0, (H / 4) * i)
      ctx.lineTo(W, (H / 4) * i)
      ctx.stroke()
    }
    const top = max ?? Math.max(1, ...series.flat().filter((v): v is number => v != null)) * 1.15
    const dx = W / Math.max(1, length - 1)
    series.forEach((s, si) => {
      const off = Math.max(0, length - s.length)
      const col = colors[si]
      const segment = (fill: boolean): void => {
        ctx.beginPath()
        let pen = false
        let startX = 0
        let lastX = 0
        const close = (): void => {
          if (fill && pen) {
            ctx.lineTo(lastX, H)
            ctx.lineTo(startX, H)
            ctx.closePath()
            ctx.fill()
            ctx.beginPath()
          }
        }
        s.forEach((v, i) => {
          const x = (off + i) * dx
          if (v == null) {
            close()
            pen = false
            return
          }
          const y = H - (Math.min(v, top) / top) * (H - 2) - 1
          if (!pen) {
            ctx.moveTo(x, fill ? H : y)
            if (fill) ctx.lineTo(x, y)
            startX = x
          } else ctx.lineTo(x, y)
          pen = true
          lastX = x
        })
        if (fill) close()
        else ctx.stroke()
      }
      ctx.fillStyle = `${col}22`
      segment(true)
      ctx.strokeStyle = col
      ctx.lineWidth = 1.8
      segment(false)
    })
  }, [series, max, height, colors, theme, length])
  return <canvas ref={ref} className="chart" style={{ height }} />
}

export function Meter({ value, color }: { value: number | null; color: string }): JSX.Element {
  return (
    <div className="meter">
      <div style={{ width: `${Math.min(100, value ?? 0)}%`, background: color, opacity: value == null ? 0 : 1 }} />
    </div>
  )
}

export const C = { cpu: '#22d3ee', mem: '#a78bfa', disk: '#fbbf24', net: '#34d399', netTx: '#f472b6', gpu: '#fb7185' }

