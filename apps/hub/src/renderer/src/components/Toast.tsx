import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { useStore } from '../store'

export default function ToastStack(): JSX.Element | null {
  const { toasts } = useStore()
  if (toasts.length === 0) return null
  const t = toasts[toasts.length - 1]
  const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info
  const color = t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--accent-text)'

  return (
    <div className="toast" key={t.id}>
      <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <span>{t.message}</span>
    </div>
  )
}
