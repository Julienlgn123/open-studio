import { CheckCircle, XCircle, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'

export default function ToastStack(): JSX.Element {
  const { toasts, dismissToast } = useStore()
  const icons = {
    success: <CheckCircle size={15} style={{ color: 'var(--success)' }} />,
    error: <XCircle size={15} style={{ color: 'var(--danger)' }} />,
    info: <Info size={15} style={{ color: 'var(--accent-light)' }} />
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            style={{ position: 'static' }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={() => dismissToast(t.id)}
          >
            {icons[t.type]}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
