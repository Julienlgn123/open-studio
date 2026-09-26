import type { Attachment } from '@shared/types'
import { MAX_TEXT_ATTACHMENT_CHARS } from '@shared/attachments'

/** Au-delà, l'image est réduite : les modèles vision n'en tirent rien de plus et la base grossirait. */
const MAX_IMAGE_SIDE = 1536
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image illisible.'))
    img.src = src
  })
}

async function readImage(file: File): Promise<Attachment> {
  let dataUrl = await readAsDataUrl(file)
  let mime = file.type
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height))
  if (scale < 1 || file.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg'].includes(mime)) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Impossible de traiter l’image.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    mime = 'image/jpeg'
    dataUrl = canvas.toDataURL(mime, 0.88)
  }
  return { kind: 'image', name: file.name || 'image', mime, data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

async function readText(file: File): Promise<Attachment> {
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer())
  if (head.includes(0)) {
    throw new Error(`« ${file.name} » n’est pas un fichier texte (PDF, Word… ne sont pas encore pris en charge).`)
  }
  const content = await file.text()
  if (content.length > MAX_TEXT_ATTACHMENT_CHARS) {
    throw new Error(`« ${file.name} » est trop long (${Math.round(content.length / 1000)} k caractères, max 200 k).`)
  }
  return { kind: 'text', name: file.name, content }
}

export function readAttachment(file: File): Promise<Attachment> {
  return file.type.startsWith('image/') ? readImage(file) : readText(file)
}

export function imageSrc(a: Extract<Attachment, { kind: 'image' }>): string {
  return `data:${a.mime};base64,${a.data}`
}
