import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, AlertCircle } from 'lucide-react'
import { useStore } from '../store'

export default function AIBanner() {
  const { aiTask, dismissAITask, setView, setActiveCourse } = useStore()

  if (!aiTask) return null

  const isRunning = aiTask.status === 'running'
  const isDone = aiTask.status === 'done'
  const isError = aiTask.status === 'error'

  function handleViewResult() {
    setActiveCourse(aiTask!.courseId)
    setView('editor')
    dismissAITask()
  }

  const bgColor = isRunning
    ? 'linear-gradient(90deg, rgba(124,111,247,0.15), rgba(124,111,247,0.08))'
    : isDone
    ? 'linear-gradient(90deg, rgba(52,211,153,0.15), rgba(52,211,153,0.08))'
    : 'linear-gradient(90deg, rgba(248,113,113,0.15), rgba(248,113,113,0.08))'

  const borderColor = isRunning ? 'rgba(124,111,247,0.3)' : isDone ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'
  const textColor = isRunning ? 'var(--accent-light)' : isDone ? 'var(--success)' : 'var(--danger)'

  const marqueeText = isRunning
    ? `✨ Amélioration en cours — ${aiTask.courseEmoji} ${aiTask.courseTitle} — ${aiTask.actionLabel}...`
    : isDone
    ? `✅ Amélioration terminée — ${aiTask.courseEmoji} ${aiTask.courseTitle} — Clique pour voir le résultat`
    : `⚠️ Erreur — ${aiTask.courseEmoji} ${aiTask.courseTitle} — ${aiTask.error ?? 'Erreur inconnue'}`

  return (
    <AnimatePresence>
      <motion.div
        key="ai-banner"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 34, opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          background: bgColor,
          borderBottom: `1px solid ${borderColor}`,
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          zIndex: 50
        }}
      >
        <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px' }}>
          {/* Status dot */}
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: textColor,
            flexShrink: 0,
            ...(isRunning ? { animation: 'pulse-dot 1.2s ease infinite' } : {})
          }} />

          {/* Scrolling text */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {isRunning ? (
              <div style={{ display: 'flex', gap: 60 }}>
                <motion.div
                  style={{ display: 'flex', gap: 60, whiteSpace: 'nowrap', color: textColor, fontSize: 12.5, fontWeight: 500 }}
                  animate={{ x: [0, -600] }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
                >
                  <span>{marqueeText}</span>
                  <span>{marqueeText}</span>
                  <span>{marqueeText}</span>
                </motion.div>
              </div>
            ) : (
              <span style={{ color: textColor, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
                {marqueeText}
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {isDone && (
              <button
                onClick={handleViewResult}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px',
                  background: 'rgba(52,211,153,0.2)',
                  border: '1px solid rgba(52,211,153,0.4)',
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--success)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(52,211,153,0.3)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(52,211,153,0.2)')}
              >
                Voir le résultat <ArrowRight size={11} />
              </button>
            )}
            {isError && (
              <AlertCircle size={14} style={{ color: 'var(--danger)' }} />
            )}
            <button
              className="icon-btn"
              onClick={dismissAITask}
              style={{ width: 22, height: 22, color: textColor, opacity: 0.7 }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
