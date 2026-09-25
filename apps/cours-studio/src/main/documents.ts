import { extname } from 'path'
import { readFileSync } from 'fs'
import { dialog, BrowserWindow } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth = require('mammoth')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip')

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<text:p[^>]*>/g, '\n')
    .replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<text:tab\s*\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractOdt(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath)
  const zip = await JSZip.loadAsync(buffer)
  const contentFile = zip.file('content.xml')
  if (!contentFile) throw new Error('Fichier ODT invalide (content.xml introuvable)')
  const xml = await contentFile.async('string')
  return stripXmlTags(xml)
}

async function extractDocx(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath)
  const result = await mammoth.extractRawText({ buffer })
  return (result.value as string).trim()
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath)
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return (result.text as string).trim()
  } finally {
    await parser.destroy()
  }
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.pdf': return extractPdf(filePath)
    case '.docx': return extractDocx(filePath)
    case '.odt': return extractOdt(filePath)
    case '.txt':
    case '.md':
      return readFileSync(filePath, 'utf-8').trim()
    default:
      throw new Error(`Format non supporté : ${ext || 'inconnu'}`)
  }
}

// ─── Web article import ─────────────────────────────────────────────────────

function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function extractArticleFromUrl(rawUrl: string): Promise<{ fileName: string; text: string }> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new Error('URL invalide.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Seules les adresses http(s) sont acceptées.')
  }

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CoursStudio/1.0)', 'Accept': 'text/html' },
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`La page a répondu ${res.status}.`)
  let html = await res.text()
  if (html.length > 5_000_000) html = html.slice(0, 5_000_000)

  // Drop non-content elements entirely
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '')

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = htmlToPlainText(titleMatch?.[1] || h1Match?.[1] || url.hostname).slice(0, 120) || url.hostname

  // Prefer the main article container, fall back to <main>, then <body>
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || html

  const text = htmlToPlainText(article)
  if (text.length < 40) throw new Error('Impossible d\'extraire le texte de cette page.')
  return { fileName: title, text }
}

export async function pickAndExtractDocument(
  window: BrowserWindow
): Promise<{ fileName: string; text: string } | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Importer un document',
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'docx', 'odt', 'txt', 'md'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  })
  if (canceled || filePaths.length === 0) return null
  const filePath = filePaths[0]
  const text = await extractTextFromFile(filePath)
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  return { fileName, text }
}
