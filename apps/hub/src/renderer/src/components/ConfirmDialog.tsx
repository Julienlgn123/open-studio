import { useEffect } from 'react'
import { useStore } from '../store'

export default function ConfirmDialog(): JSX.Element | null {
  const { confirm, closeConfirm } = useStore()
  useEffect(() => {
    if (!confirm) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm])
  if (!confirm) return null
  return (
    <div className="overlay" onMouseDown={closeConfirm}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-title">{confirm.title}</div>
        <p className="dialog-body">{confirm.body}</p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={closeConfirm}>
            Annuler
          </button>
          <button
            className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
            autoFocus
            onClick={() => {
              closeConfirm()
              confirm.onConfirm()
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
