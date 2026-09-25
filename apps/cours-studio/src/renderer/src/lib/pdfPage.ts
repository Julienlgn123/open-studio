import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// The PDF panel's iframe uses Chromium's built-in PDFium viewer, which gives
// no programmatic access to page content — pdf.js is used here purely to
// rasterize one page to a canvas for the "insert as image" action, entirely
// independent from that iframe.
let cached: { url: string; doc: pdfjsLib.PDFDocumentProxy } | null = null

async function getDoc(url: string): Promise<pdfjsLib.PDFDocumentProxy> {
  if (cached && cached.url === url) return cached.doc
  cached?.doc.destroy()
  const doc = await pdfjsLib.getDocument(url).promise
  cached = { url, doc }
  return doc
}

export async function getPdfPageCount(url: string): Promise<number> {
  const doc = await getDoc(url)
  return doc.numPages
}

export async function renderPdfPageToDataUrl(url: string, pageNumber: number): Promise<string> {
  const doc = await getDoc(url)
  const page = await doc.getPage(pageNumber)
  // scale 2 = roughly 144 DPI: sharp enough to read once inserted in a
  // course without producing an unreasonably large embedded PNG.
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Impossible de créer le contexte de rendu du PDF.')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas.toDataURL('image/png')
}
