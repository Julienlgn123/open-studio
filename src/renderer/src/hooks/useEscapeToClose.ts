import { useEffect } from 'react'

// Most modals in the app only close via a backdrop click or an explicit
// button — Escape does nothing unless a specific input happens to have its
// own onKeyDown handler. This fills that gap consistently for modals that
// don't manage their own focused-input Escape handling.
export function useEscapeToClose(onClose: (() => void) | undefined): void {
  useEffect(() => {
    if (!onClose) return
    function handler(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose!()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}
