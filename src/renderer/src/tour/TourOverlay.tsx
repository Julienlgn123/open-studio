import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { mainTourSteps, editorTourSteps } from './tourSteps'

const PADDING = 8
const POPOVER_WIDTH = 320
const GAP = 14

function unionRect(rects: DOMRect[]): DOMRect {
  const top = Math.min(...rects.map((r) => r.top))
  const left = Math.min(...rects.map((r) => r.left))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

// Polls for the step's target element(s) — the view/panel they live in may still be
// animating in (AnimatePresence, a just-opened editor) when the step becomes active.
// `null` means "still looking", an empty array means "gave up, skip this step".
function useTargetRect(selectors: string[]): DOMRect | null | 'not-found' {
  const [rect, setRect] = useState<DOMRect | null | 'not-found'>(null)
  const key = selectors.join('|')

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    function locate() {
      if (cancelled) return
      const els = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)))
      if (els.length > 0) {
        setRect(unionRect(els.map((e) => e.getBoundingClientRect())))
      } else if (attempts < 15) {
        attempts++
        timer = setTimeout(locate, 100)
      } else {
        setRect('not-found')
      }
    }

    setRect(null)
    locate()
    window.addEventListener('resize', locate)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', locate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return rect
}

export default function TourOverlay() {
  const { activeTour, tourStep, nextTourStep, prevTourStep, closeTour } = useStore()
  const steps = activeTour === 'editor' ? editorTourSteps : activeTour === 'main' ? mainTourSteps : null
  const step = steps?.[tourStep]

  const rect = useTargetRect(step?.selectors ?? [])

  // Skip a step whose target isn't on screen (e.g. a course-only button while none
  // exists) instead of showing a spotlight pointing at nothing.
  useEffect(() => {
    if (rect === 'not-found') nextTourStep()
  }, [rect, nextTourStep])

  if (!activeTour || !steps || !step || !rect || rect === 'not-found') return null

  const isLast = tourStep === steps.length - 1
  const spaceBelow = window.innerHeight - rect.bottom
  const placeAbove = spaceBelow < 200 && rect.top > 200
  const popoverTop = placeAbove ? Math.max(16, rect.top - GAP) : rect.bottom + GAP
  const popoverLeft = Math.min(Math.max(16, rect.left), window.innerWidth - POPOVER_WIDTH - 16)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }}>
      {/* Spotlight: a transparent "hole" whose giant box-shadow dims everything else */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - PADDING,
          left: rect.left - PADDING,
          width: rect.width + PADDING * 2,
          height: rect.height + PADDING * 2,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
          border: '2px solid var(--accent)',
          transition: 'top 0.2s, left 0.2s, width 0.2s, height 0.2s',
          pointerEvents: 'none'
        }}
      />
      {/* Blocks interaction with the app underneath while the tour is active */}
      <div style={{ position: 'fixed', inset: 0 }} onClick={() => closeTour()} />

      <div
        className="fade-in"
        style={{
          position: 'fixed',
          top: placeAbove ? undefined : popoverTop,
          bottom: placeAbove ? window.innerHeight - popoverTop : undefined,
          left: popoverLeft,
          width: POPOVER_WIDTH,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          padding: 16,
          zIndex: 5001
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{step.title}</span>
          <button className="icon-btn" style={{ width: 22, height: 22, flexShrink: 0 }} onClick={() => closeTour()}>
            <X size={13} />
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px' }}>
          {step.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{tourStep + 1} / {steps.length}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => closeTour()}>Passer</button>
            {tourStep > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={prevTourStep}>Précédent</button>
            )}
            <button className="btn btn-primary btn-sm" onClick={nextTourStep}>{isLast ? 'Terminer' : 'Suivant'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
