import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

export interface WikiItem {
  id: string
  title: string
  emoji: string
}

export interface WikiMenuListRef {
  onKeyDown: (opts: { event: KeyboardEvent }) => boolean
}

interface Props {
  items: WikiItem[]
  command: (item: WikiItem) => void
}

const WikiMenuList = forwardRef<WikiMenuListRef, Props>((props, ref) => {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [props.items])

  function select(index: number) {
    const item = props.items[index]
    if (item) props.command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (props.items.length === 0) return false
      if (event.key === 'ArrowDown') { setSelected((i) => (i + 1) % props.items.length); return true }
      if (event.key === 'ArrowUp') { setSelected((i) => (i - 1 + props.items.length) % props.items.length); return true }
      if (event.key === 'Enter') { select(selected); return true }
      return false
    }
  }), [selected, props.items])

  if (props.items.length === 0) {
    return <div className="slash-menu-empty">Aucun cours</div>
  }

  return (
    <div className="slash-menu">
      {props.items.map((item, i) => (
        <div
          key={item.id}
          className={`slash-menu-item ${i === selected ? 'active' : ''}`}
          onMouseEnter={() => setSelected(i)}
          onClick={() => select(i)}
        >
          <span className="slash-menu-icon">{item.emoji || '📝'}</span>
          <div>
            <div className="slash-menu-title">{item.title}</div>
          </div>
        </div>
      ))}
    </div>
  )
})

WikiMenuList.displayName = 'WikiMenuList'
export default WikiMenuList
