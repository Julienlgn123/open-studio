import { useEffect, useRef } from 'react'

interface MenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: () => void
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Adjust position to avoid overflow
  const adjustedX = Math.min(x, window.innerWidth - 180)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 40 - 20)

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          onClick={() => { item.onClick(); onClose() }}
        >
          {item.icon}
          {item.label}
        </div>
      ))}
    </div>
  )
}
