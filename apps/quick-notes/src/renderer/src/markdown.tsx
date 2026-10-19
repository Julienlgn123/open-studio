import { Fragment, type ReactNode } from 'react'

// Petit rendu Markdown sans HTML brut (pas de dangerouslySetInnerHTML) :
// titres, listes, cases à cocher cliquables, citations, code, tableaux simples,
// gras/italique/barré/surligné, liens, [[liens entre notes]] et #étiquettes.

export interface MdHandlers {
  /** Clic sur une case à cocher : numéro de ligne dans le texte source. */
  onToggle?: (line: number) => void
  onWikiLink?: (title: string) => void
  onTag?: (tag: string) => void
  onLink?: (url: string) => void
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(==[^=]+==)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)|((?:^|(?<=\s))#[\p{L}\p{N}_-]+)/gu

export function inline(text: string, h: MdHandlers, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    const t = m[0]
    const k = `${key}-${n++}`
    if (m[1]) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (m[2] || m[3]) out.push(<strong key={k}>{inline(t.slice(2, -2), h, k)}</strong>)
    else if (m[4]) out.push(<del key={k}>{inline(t.slice(2, -2), h, k)}</del>)
    else if (m[5]) out.push(<mark key={k}>{inline(t.slice(2, -2), h, k)}</mark>)
    else if (m[6] || m[7]) out.push(<em key={k}>{inline(t.slice(1, -1), h, k)}</em>)
    else if (m[8]) {
      const title = t.slice(2, -2)
      out.push(
        <a key={k} className="md-wiki" onClick={() => h.onWikiLink?.(title)}>
          {title}
        </a>
      )
    } else if (m[9]) {
      const [, label, url] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? []
      out.push(
        <a key={k} className="md-link" onClick={() => h.onLink?.(url)} title={url}>
          {label}
        </a>
      )
    } else if (m[10]) {
      out.push(
        <a key={k} className="md-link" onClick={() => h.onLink?.(t)}>
          {t}
        </a>
      )
    } else if (m[11]) {
      out.push(
        <a key={k} className="md-tag" onClick={() => h.onTag?.(t.slice(1).toLowerCase())}>
          {t}
        </a>
      )
    }
    last = i + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ source, handlers = {} }: { source: string; handlers?: MdHandlers }): JSX.Element {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const k = `b${i}`
    // Bloc de code
    if (line.trim().startsWith('```')) {
      const start = i
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++
      blocks.push(
        <pre key={`c${start}`} className="md-code">
          <code>{body.join('\n')}</code>
        </pre>
      )
      continue
    }
    // Tableau : | a | b | puis | --- | --- |
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const row = (l: string): string[] => l.trim().slice(1, -1).split('|').map((c) => c.trim())
      const head = row(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(row(lines[i++]))
      blocks.push(
        <table key={k} className="md-table">
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inline(c, handlers, `${k}h${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c, handlers, `${k}r${ri}c${j}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const Tag = `h${Math.min(6, h[1].length)}` as 'h1'
      blocks.push(<Tag key={k}>{inline(h[2], handlers, k)}</Tag>)
      i++
      continue
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={k} />)
      i++
      continue
    }
    if (line.startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(
        <blockquote key={k}>
          {body.map((b, j) => (
            <p key={j}>{inline(b, handlers, `${k}q${j}`)}</p>
          ))}
        </blockquote>
      )
      continue
    }
    // Listes (puces, numéros, cases à cocher), avec un niveau d'indentation visuel.
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items: ReactNode[] = []
      const ordered = /^\s*\d+[.)]/.test(line)
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const l = lines[i]
        const depth = Math.floor((l.match(/^\s*/)?.[0].length ?? 0) / 2)
        const task = l.match(/^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/)
        const lineNo = i
        if (task) {
          const done = task[1] !== ' '
          items.push(
            <li key={i} className={`md-task${done ? ' done' : ''}`} style={{ marginLeft: depth * 18 }}>
              <input type="checkbox" checked={done} onChange={() => handlers.onToggle?.(lineNo)} />
              <span>{inline(task[2], handlers, `l${i}`)}</span>
            </li>
          )
        } else {
          items.push(
            <li key={i} style={{ marginLeft: depth * 18 }}>
              {inline(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''), handlers, `l${i}`)}
            </li>
          )
        }
        i++
      }
      blocks.push(ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>)
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    // Paragraphe : lignes consécutives non vides.
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|```|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++])
    if (!para.length) {
      para.push(lines[i++])
    }
    blocks.push(
      <p key={k}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, handlers, `${k}p${j}`)}
          </Fragment>
        ))}
      </p>
    )
  }
  return <div className="md">{blocks}</div>
}

/** Étiquettes #mot présentes dans un texte (en minuscules, sans doublon). */
export function tagsOf(text: string): string[] {
  const set = new Set<string>()
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)) set.add(m[1].toLowerCase())
  return [...set]
}

/** Titres cités en [[lien]] dans un texte. */
export function linksOf(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase())
}

/** Cases cochées / total. */
export function checklistOf(text: string): [number, number] {
  const all = text.match(/^\s*[-*+]\s+\[[ xX]\]/gm) ?? []
  const done = all.filter((l) => /\[[xX]\]/.test(l)).length
  return [done, all.length]
}
