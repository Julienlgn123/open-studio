import type { ReactNode } from 'react'

// Rendu Markdown minimal pour les notes de version (titres, listes, gras, italique, code,
// liens) : construit des éléments React, jamais du HTML brut injecté.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t) ?? []
      out.push(
        <a key={k} href="#" onClick={(e) => (e.preventDefault(), /^https?:\/\//.test(url) && window.api.shell.openExternal(url))}>
          {label}
        </a>
      )
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ source }: { source: string }): JSX.Element {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushList = (): void => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={blocks.length}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    )
    list = null
  }
  const flushPara = (): void => {
    if (!para.length) return
    blocks.push(<p key={blocks.length}>{inline(para.join(' '), `p${blocks.length}`)}</p>)
    para = []
  }

  for (const raw of source.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flushPara()
      flushList()
    } else if (heading) {
      flushPara()
      flushList()
      blocks.push(<h4 key={blocks.length}>{inline(heading[2], `h${blocks.length}`)}</h4>)
    } else if (bullet || numbered) {
      flushPara()
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flushList()
      list = list ?? { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else if (/^---+$/.test(line)) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.replace(/^>\s?/, ''))
    }
  }
  flushPara()
  flushList()
  return <div className="md">{blocks}</div>
}
