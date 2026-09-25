import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Info } from 'lucide-react'
import { useStore } from '../store'

export default function Toast() {
  const { toast } = useStore()
  if (!toast) return null

  const icons = {
    success: <CheckCircle size={15} style={{ color: 'var(--success)' }} />,
    error: <XCircle size={15} style={{ color: 'var(--danger)' }} />,
    info: <Info size={15} style={{ color: 'var(--accent-light)' }} />
  }

  return (
    <motion.div
      className="toast"
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      {icons[toast.type]}
      {toast.message}
    </motion.div>
  )
}
