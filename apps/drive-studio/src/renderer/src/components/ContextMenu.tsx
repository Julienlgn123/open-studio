import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Positionne le menu dans les limites de la fenêtre une fois sa taille connue.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8))
    setPos({ left, top })
  }, [x, y, items.length])

  // Ferme au clic / clic droit / molette / Échap à l'extérieur.
  // Le listener est attaché au tick suivant pour ne pas capter le clic
  // qui vient d'ouvrir le menu.
  useEffect(() => {
    function onPointerDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    function onScroll(): void {
      onClose()
    }
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointerDown, true)
      window.addEventListener('contextmenu', onPointerDown, true)
      window.addEventListener('keydown', onKey)
      window.addEventListener('resize', onScroll)
    }, 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('contextmenu', onPointerDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          disabled={item.disabled}
          style={item.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          onClick={() => {
            if (item.disabled) return
            onClose()
            item.onClick()
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
