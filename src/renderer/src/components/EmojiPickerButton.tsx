import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import EmojiPicker from './EmojiPicker'

const POPOVER_WIDTH = 320
const POPOVER_HEIGHT_ESTIMATE = 360 // search + categories + 220px grid + padding
const MARGIN = 12
const GAP = 6

// The emoji picker used to be positioned with plain relative/absolute CSS, which
// placed it fine visually but meant it lived inside whatever container held the
// button — once a modal's body became scrollable (to stop long modals running off
// the screen), that same overflow clipped the picker's lower rows instead of
// letting it float over the rest of the page. Rendering it into a portal, at a
// position measured from the button's real screen coordinates, keeps it fully
// visible regardless of what scrolls around it.
export default function EmojiPickerButton({
  value,
  onChange,
  size = 22
}: {
  value: string
  onChange: (emoji: string) => void
  size?: number
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return }
    const rect = btnRef.current.getBoundingClientRect()
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN)
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow >= POPOVER_HEIGHT_ESTIMATE + GAP
      ? rect.bottom + GAP
      : Math.max(MARGIN, rect.top - POPOVER_HEIGHT_ESTIMATE - GAP)
    setPos({ top, left })
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: size,
          padding: size >= 20 ? '7px 10px' : '5px 8px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          lineHeight: 1
        }}
      >
        {value}
      </button>
      {open && pos && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000 }}>
          <EmojiPicker value={value} onChange={(e) => { onChange(e); setOpen(false) }} onClose={() => setOpen(false)} />
        </div>,
        document.body
      )}
    </>
  )
}
