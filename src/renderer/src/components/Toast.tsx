import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { useStore } from '../store'

export default function ToastStack(): JSX.Element | null {
  const { toasts } = useStore()
  if (toasts.length === 0) return null
  const t = toasts[toasts.length - 1]
  const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info
  const color =
    t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--accent-light)'

  return (
    <div className="toast fade-in">
      <Icon size={16} style={{ color, flexShrink: 0 }} />
      <span>{t.message}</span>
    </div>
  )
}
