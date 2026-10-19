// Effets d'image : appliqués à un calque entier ou à une zone (la sélection).

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export type QuickEffect = 'grayscale' | 'sepia' | 'invert' | 'sharpen' | 'pixelate' | 'posterize' | 'noise' | 'vignette' | 'emboss' | 'edges' | 'blur' | 'threshold'

export const EFFECTS: { id: QuickEffect; label: string }[] = [
  { id: 'grayscale', label: 'Noir et blanc' },
  { id: 'sepia', label: 'Sépia' },
  { id: 'invert', label: 'Négatif' },
  { id: 'threshold', label: 'Noir pur / blanc pur' },
  { id: 'blur', label: 'Flou' },
  { id: 'sharpen', label: 'Netteté' },
  { id: 'pixelate', label: 'Pixeliser' },
  { id: 'posterize', label: 'Postériser' },
  { id: 'noise', label: 'Grain' },
  { id: 'vignette', label: 'Vignette' },
  { id: 'emboss', label: 'Relief' },
  { id: 'edges', label: 'Contours' }
]

/** Réglages continus, faits avec les filtres CSS du canvas (rapides, prévisualisables). */
export interface Adjust {
  brightness: number // %
  contrast: number // %
  saturate: number // %
  hue: number // degrés
  blur: number // px
  opacity: number // %
}
export const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, opacity: 100 }

export const cssFilter = (a: Adjust): string =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg) blur(${a.blur}px) opacity(${a.opacity}%)`

/** Redessine une zone du canvas à travers un filtre CSS. */
export function applyCssFilter(canvas: HTMLCanvasElement, filter: string, r: Region): void {
  const tmp = document.createElement('canvas')
  tmp.width = r.w
  tmp.height = r.h
  tmp.getContext('2d')!.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.clearRect(r.x, r.y, r.w, r.h)
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  ctx.filter = filter
  ctx.drawImage(tmp, r.x, r.y)
  ctx.restore()
}

function convolve(src: ImageData, kernel: number[], bias = 0): ImageData {
  const { width: W, height: H, data: d } = src
  const out = new ImageData(W, H)
  const o = out.data
  const k = Math.round(Math.sqrt(kernel.length))
  const half = Math.floor(k / 2)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let ky = 0; ky < k; ky++) {
        const yy = Math.min(H - 1, Math.max(0, y + ky - half))
        for (let kx = 0; kx < k; kx++) {
          const xx = Math.min(W - 1, Math.max(0, x + kx - half))
          const i = (yy * W + xx) * 4
          const w = kernel[ky * k + kx]
          r += d[i] * w
          g += d[i + 1] * w
          b += d[i + 2] * w
        }
      }
      const i = (y * W + x) * 4
      o[i] = r + bias
      o[i + 1] = g + bias
      o[i + 2] = b + bias
      o[i + 3] = d[i + 3]
    }
  }
  return out
}

export function applyEffect(canvas: HTMLCanvasElement, effect: QuickEffect, r: Region, amount = 1): void {
  const css: Partial<Record<QuickEffect, string>> = {
    grayscale: 'grayscale(100%)',
    sepia: 'sepia(100%)',
    invert: 'invert(100%)',
    blur: `blur(${Math.max(1, Math.round(Math.min(r.w, r.h) / 400)) * 2 * amount}px)`
  }
  if (css[effect]) return applyCssFilter(canvas, css[effect]!, r)

  const ctx = canvas.getContext('2d')!
  let img = ctx.getImageData(r.x, r.y, r.w, r.h)
  const d = img.data
  switch (effect) {
    case 'sharpen':
      img = convolve(img, [0, -1, 0, -1, 5, -1, 0, -1, 0])
      break
    case 'emboss':
      img = convolve(img, [-2, -1, 0, -1, 1, 1, 0, 1, 2])
      break
    case 'edges': {
      img = convolve(img, [-1, -1, -1, -1, 8, -1, -1, -1, -1])
      const o = img.data
      for (let i = 0; i < o.length; i += 4) {
        const v = 255 - Math.min(255, (o[i] + o[i + 1] + o[i + 2]) / 1.5)
        o[i] = o[i + 1] = o[i + 2] = v
      }
      break
    }
    case 'threshold':
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > 128 ? 255 : 0
        d[i] = d[i + 1] = d[i + 2] = v
      }
      break
    case 'posterize': {
      const levels = 5
      const step = 255 / (levels - 1)
      for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / step) * step
      break
    }
    case 'noise':
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 50 * amount
        d[i] += n
        d[i + 1] += n
        d[i + 2] += n
      }
      break
    case 'vignette': {
      const cx = r.w / 2
      const cy = r.h / 2
      const max = Math.hypot(cx, cy)
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) {
          const f = 1 - Math.pow(Math.hypot(x - cx, y - cy) / max, 2.2) * 0.75 * amount
          const i = (y * r.w + x) * 4
          d[i] *= f
          d[i + 1] *= f
          d[i + 2] *= f
        }
      break
    }
    case 'pixelate': {
      const s = Math.max(4, Math.round(Math.min(r.w, r.h) / 60))
      for (let by = 0; by < r.h; by += s)
        for (let bx = 0; bx < r.w; bx += s) {
          const i0 = (Math.min(r.h - 1, by + (s >> 1)) * r.w + Math.min(r.w - 1, bx + (s >> 1))) * 4
          for (let y = by; y < Math.min(r.h, by + s); y++)
            for (let x = bx; x < Math.min(r.w, bx + s); x++) {
              const i = (y * r.w + x) * 4
              d[i] = d[i0]
              d[i + 1] = d[i0 + 1]
              d[i + 2] = d[i0 + 2]
              d[i + 3] = d[i0 + 3]
            }
        }
      break
    }
  }
  ctx.putImageData(img, r.x, r.y)
}

/** Remplissage par diffusion (pot de peinture), tolérance réglable, limité à une zone. */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, tolerance: number, clip?: Region): void {
  const { width: W, height: H } = ctx.canvas
  const minX = clip ? Math.max(0, clip.x) : 0
  const minY = clip ? Math.max(0, clip.y) : 0
  const maxX = clip ? Math.min(W, clip.x + clip.w) : W
  const maxY = clip ? Math.min(H, clip.y + clip.h) : H
  if (x < minX || y < minY || x >= maxX || y >= maxY) return
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const i0 = (y * W + x) * 4
  const [r0, g0, b0, a0] = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]]
  const n = parseInt(hex.slice(1), 16)
  const [r1, g1, b1] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) < 3 && a0 === 255) return
  const tol = tolerance * 4
  const match = (i: number): boolean => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(d[i + 3] - a0) <= tol
  const stack = [x, y]
  const seen = new Uint8Array(W * H)
  while (stack.length) {
    const py = stack.pop()!
    const px = stack.pop()!
    let lx = px
    while (lx >= minX && !seen[py * W + lx] && match((py * W + lx) * 4)) lx--
    lx++
    let up = false
    let down = false
    for (let cx = lx; cx < maxX && !seen[py * W + cx] && match((py * W + cx) * 4); cx++) {
      const i = (py * W + cx) * 4
      seen[py * W + cx] = 1
      d[i] = r1
      d[i + 1] = g1
      d[i + 2] = b1
      d[i + 3] = 255
      if (py > minY) {
        const m = !seen[(py - 1) * W + cx] && match(((py - 1) * W + cx) * 4)
        if (m && !up) stack.push(cx, py - 1)
        up = m
      }
      if (py < maxY - 1) {
        const m = !seen[(py + 1) * W + cx] && match(((py + 1) * W + cx) * 4)
        if (m && !down) stack.push(cx, py + 1)
        down = m
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Remplace la couleur sous le pixel cliqué par une autre, dans tout le calque. */
export function replaceColor(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, tolerance: number): void {
  const { width: W, height: H } = ctx.canvas
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const i0 = (y * W + x) * 4
  const [r0, g0, b0] = [d[i0], d[i0 + 1], d[i0 + 2]]
  const n = parseInt(hex.slice(1), 16)
  const [r1, g1, b1] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const tol = tolerance * 3
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] && Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) <= tol) {
      d[i] = r1
      d[i + 1] = g1
      d[i + 2] = b1
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Rectangle englobant des pixels non transparents (null si tout est vide). */
export function contentBounds(canvas: HTMLCanvasElement): Region | null {
  const { width: W, height: H } = canvas
  const d = canvas.getContext('2d')!.getImageData(0, 0, W, H).data
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}
