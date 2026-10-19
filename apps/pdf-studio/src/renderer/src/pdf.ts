// Outils PDF : lecture (pdf.js) et transformations (pdf-lib), tout en local.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfJsDoc = pdfjs.PDFDocumentProxy

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}

export async function readPdf(path: string): Promise<Uint8Array> {
  return b64ToBytes(await window.kit.files.readBase64(path))
}

export async function writePdf(path: string, bytes: Uint8Array): Promise<void> {
  await window.kit.files.writeBase64(path, bytesToB64(bytes))
}

/** pdf.js modifie le tampon qu'on lui donne : on lui passe toujours une copie. */
export function openForView(bytes: Uint8Array): Promise<PdfJsDoc> {
  return pdfjs.getDocument({ data: bytes.slice() }).promise
}

export const fileName = (p: string): string => p.split(/[\\/]/).pop() ?? p
export const baseName = (p: string): string => fileName(p).replace(/\.pdf$/i, '')

/** Empreinte courte d'un fichier (pour retrouver ses annotations même s'il est déplacé). */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice(0, 1_000_000))
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Annotations ───────────────────────────────────────────────────────────────────────────

/** Coordonnées en fraction de la page (0–1, origine en haut à gauche) : indépendantes du zoom. */
export type Annotation =
  | { id: string; page: number; kind: 'highlight' | 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; page: number; kind: 'pen'; points: [number, number][]; color: string; width: number }
  | { id: string; page: number; kind: 'text'; x: number; y: number; text: string; color: string; size: number }
  | { id: string; page: number; kind: 'image'; x: number; y: number; w: number; h: number; dataUrl: string }

function hex(color: string): ReturnType<typeof rgb> {
  const n = parseInt(color.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Copie du PDF avec les annotations dessinées dans les pages (lisibles par tous les lecteurs). */
export async function flatten(bytes: Uint8Array, annotations: Annotation[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  for (const a of annotations) {
    const page = pages[a.page]
    if (!page) continue
    const { width: W, height: H } = page.getSize()
    const Y = (y: number): number => H - y * H
    if (a.kind === 'highlight' || a.kind === 'rect') {
      page.drawRectangle({
        x: a.x * W,
        y: Y(a.y + a.h),
        width: a.w * W,
        height: a.h * H,
        ...(a.kind === 'highlight' ? { color: hex(a.color), opacity: 0.35 } : { borderColor: hex(a.color), borderWidth: 2 })
      })
    } else if (a.kind === 'pen') {
      for (let i = 1; i < a.points.length; i++) {
        const [x1, y1] = a.points[i - 1]
        const [x2, y2] = a.points[i]
        page.drawLine({ start: { x: x1 * W, y: Y(y1) }, end: { x: x2 * W, y: Y(y2) }, thickness: a.width, color: hex(a.color), lineCap: 1 })
      }
    } else if (a.kind === 'text') {
      a.text.split('\n').forEach((line, i) => page.drawText(line, { x: a.x * W, y: Y(a.y) - a.size * (i + 1), size: a.size, font, color: hex(a.color) }))
    } else if (a.kind === 'image') {
      const png = await doc.embedPng(b64ToBytes(a.dataUrl.split(',')[1]))
      page.drawImage(png, { x: a.x * W, y: Y(a.y + a.h), width: a.w * W, height: a.h * H })
    }
  }
  return doc.save()
}

// ─── Pages ─────────────────────────────────────────────────────────────────────────────────

export async function merge(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const bytes of files) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p)
  }
  return out.save()
}

/** « 1-3, 5, 8-10 » → indices (0-based), dans l'ordre donné. */
export function parseRanges(text: string, count: number): number[] {
  const out: number[] = []
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) throw new Error(`« ${part} » n’est pas une page ni une plage (ex. 1-3, 5).`)
    const a = Number(m[1])
    const b = Number(m[2] ?? m[1])
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= count) out.push(i - 1)
  }
  if (!out.length) throw new Error('Aucune page valide.')
  return out
}

/** Nouveau PDF avec ces pages (ordre et rotation supplémentaire en degrés). */
export async function rebuild(bytes: Uint8Array, pages: { index: number; rotate: number }[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const real = pages.filter((p) => p.index >= 0)
  const copied = await out.copyPages(src, real.map((p) => p.index))
  let k = 0
  let lastSize: [number, number] = [595.28, 841.89]
  for (const pg of pages) {
    // Index négatif : page blanche, à la taille de la page précédente.
    if (pg.index < 0) {
      const blank = out.addPage(lastSize)
      if (pg.rotate) blank.setRotation(degrees(pg.rotate))
      continue
    }
    const p = copied[k++]
    if (pg.rotate) p.setRotation(degrees((p.getRotation().angle + pg.rotate) % 360))
    const { width, height } = p.getSize()
    lastSize = [width, height]
    out.addPage(p)
  }
  return out.save()
}

/**
 * Compression. « light » : réécriture compacte (sans perte). « strong » : chaque page devient une
 * image JPEG (beaucoup plus léger pour les scans, mais le texte n'est plus sélectionnable).
 */
export async function compress(bytes: Uint8Array, mode: 'light' | 'strong', quality = 0.7, onProgress?: (r: number) => void): Promise<Uint8Array> {
  if (mode === 'light') {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    return doc.save({ useObjectStreams: true })
  }
  const view = await openForView(bytes)
  const out = await PDFDocument.create()
  for (let i = 1; i <= view.numPages; i++) {
    const page = await view.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: 1.6 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const jpg = await out.embedJpg(b64ToBytes(canvas.toDataURL('image/jpeg', quality).split(',')[1]))
    out.addPage([base.width, base.height]).drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height })
    onProgress?.(i / view.numPages)
  }
  return out.save()
}
