import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SlashItem } from '../editor/slashCommand'
import type { Editor, Range } from '@tiptap/core'

export interface SlashMenuListRef {
  onKeyDown: (opts: { event: KeyboardEvent }) => boolean
}

interface Props {
  items: SlashItem[]
  command: (item: SlashItem) => void
  editor: Editor
  range: Range
}

const SlashMenuList = forwardRef<SlashMenuListRef, Props>((props, ref) => {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [props.items])

  function select(index: number) {
    const item = props.items[index]
    if (item) props.command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') { setSelected((i) => (i + 1) % props.items.length); return true }
      if (event.key === 'ArrowUp') { setSelected((i) => (i - 1 + props.items.length) % props.items.length); return true }
      if (event.key === 'Enter') { select(selected); return true }
      return false
    }
  }), [selected, props.items])

  if (props.items.length === 0) {
    return <div className="slash-menu-empty">Aucun résultat</div>
  }

  return (
    <div className="slash-menu">
      {props.items.map((item, i) => (
        <div
          key={item.title}
          className={`slash-menu-item ${i === selected ? 'active' : ''}`}
          onMouseEnter={() => setSelected(i)}
          onClick={() => select(i)}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <div>
            <div className="slash-menu-title">{item.title}</div>
            <div className="slash-menu-desc">{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
})

SlashMenuList.displayName = 'SlashMenuList'
export default SlashMenuList
