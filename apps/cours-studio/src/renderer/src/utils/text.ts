export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inline markdown → HTML (bold, italic, code, links, highlight). Run on already-escaped text.
function inlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
}

// Cours Studio's own exporter (src/main/markdown.ts) embeds colored text,
// underline and tables as verbatim raw HTML (no lossless CommonMark
// equivalent exists for them). Pull those blocks out before line-by-line
// parsing/escaping so they survive untouched, then splice the exact same
// HTML back in — this is what makes "export then re-import" reconstruct an
// identical course instead of silently dropping colors/tables.
function extractRawHtml(md: string, blocks: string[]): string {
  return md
    .replace(/<table[\s\S]*?<\/table>/gi, (m) => {
      blocks.push(m)
      return `\n\n\0RAWHTML${blocks.length - 1}\0\n\n`
    })
    .replace(/<span[^>]*\sstyle="[^"]*color[^"]*"[^>]*>[\s\S]*?<\/span>/gi, (m) => {
      blocks.push(m)
      return `\0RAWHTML${blocks.length - 1}\0`
    })
    .replace(/<u>[\s\S]*?<\/u>/gi, (m) => {
      blocks.push(m)
      return `\0RAWHTML${blocks.length - 1}\0`
    })
}

function restoreRawHtml(html: string, blocks: string[]): string {
  return html.replace(/\0RAWHTML(\d+)\0/g, (_m, i) => blocks[Number(i)])
}

// Small block-level Markdown → HTML converter for imported text.
export function markdownToHtml(rawMd: string): string {
  const rawBlocks: string[] = []
  const md = extractRawHtml(rawMd, rawBlocks)
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inList: 'ul' | 'ol' | null = null
  let inCode = false
  const codeBuf: string[] = []

  const closeList = (): void => { if (inList) { out.push(`</${inList}>`); inList = null } }

  for (const raw of lines) {
    const line = raw

    if (line.trim().startsWith('```')) {
      if (inCode) { out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`); codeBuf.length = 0; inCode = false }
      else { closeList(); inCode = true }
      continue
    }
    if (inCode) { codeBuf.push(line); continue }

    // A raw HTML block (table) protected by extractRawHtml sits alone on its
    // own line — emit it as-is, not wrapped in a <p>.
    if (/^\0RAWHTML\d+\0$/.test(line.trim())) {
      closeList()
      out.push(line.trim())
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeList()
      const level = Math.min(h[1].length, 3)
      out.push(`<h${level}>${inlineMd(esc(h[2].trim()))}</h${level}>`)
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul' }
      out.push(`<li>${inlineMd(esc(line.replace(/^\s*[-*+]\s+/, '')))}</li>`)
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol' }
      out.push(`<li>${inlineMd(esc(line.replace(/^\s*\d+\.\s+/, '')))}</li>`)
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      closeList()
      out.push(`<blockquote><p>${inlineMd(esc(line.replace(/^\s*>\s?/, '')))}</p></blockquote>`)
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeList(); out.push('<hr>'); continue }

    if (line.trim() === '') { closeList(); continue }

    closeList()
    out.push(`<p>${inlineMd(esc(line.trim()))}</p>`)
  }
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`)
  closeList()
  return restoreRawHtml(out.join('\n'), rawBlocks)
}

// Heuristic: does this text look like Markdown?
export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s|\n#{1,6}\s|\*\*[^*]+\*\*|^\s*[-*]\s+.+\n\s*[-*]\s+|\[[^\]]+\]\(https?:/m.test(text)
}
