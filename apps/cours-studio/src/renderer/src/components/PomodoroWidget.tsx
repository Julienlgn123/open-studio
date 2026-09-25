import { useEffect, useRef, useState } from 'react'
import { X, Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react'
import { useStore } from '../store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

const FOCUS = 25 * 60
const BREAK = 5 * 60

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function PomodoroWidget() {
  const { pomodoroOpen, togglePomodoro, activeSubjectId, activeCourseId, courses, subjects, showToast } = useStore()
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [left, setLeft] = useState(FOCUS)
  const [running, setRunning] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const accumulated = useRef(0)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentSubjectId =
    activeSubjectId ??
    courses.find((c) => c.id === activeCourseId)?.subjectId ??
    null
  const subjectName = subjects.find((s) => s.id === currentSubjectId)?.name

  function flush() {
    if (accumulated.current >= 5) {
      api.study.log(currentSubjectId, accumulated.current).catch(() => {})
    }
    accumulated.current = 0
  }

  useEffect(() => {
    if (!running) {
      if (tick.current) clearInterval(tick.current)
      return
    }
    tick.current = setInterval(() => {
      setLeft((prev) => {
        if (mode === 'focus') accumulated.current += 1
        if (prev <= 1) {
          if (mode === 'focus') {
            flush()
            setDoneCount((n) => n + 1)
            setMode('break')
            showToast('Pause ! 5 minutes.', 'success')
            return BREAK
          } else {
            setMode('focus')
            showToast('Au boulot 💪 25 minutes.', 'info')
            return FOCUS
          }
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (tick.current) clearInterval(tick.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode])

  // Persist focused time if the widget is closed or the app quits mid-session
  useEffect(() => {
    return () => flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function reset() {
    flush()
    setRunning(false)
    setMode('focus')
    setLeft(FOCUS)
  }

  function close() {
    flush()
    setRunning(false)
    togglePomodoro()
  }

  if (!pomodoroOpen) return null

  const total = mode === 'focus' ? FOCUS : BREAK
  const pct = ((total - left) / total) * 100

  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 150, width: 230,
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', padding: 14
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: mode === 'focus' ? 'var(--accent-light)' : 'var(--success)' }}>
          {mode === 'focus' ? <Brain size={13} /> : <Coffee size={13} />}
          {mode === 'focus' ? 'Concentration' : 'Pause'}
        </div>
        <button className="icon-btn" onClick={close}><X size={13} /></button>
      </div>

      <div style={{ fontSize: 38, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
        {fmt(left)}
      </div>

      <div style={{ height: 3, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden', margin: '8px 0 10px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: mode === 'focus' ? 'var(--accent)' : 'var(--success)', transition: 'width 1s linear' }} />
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setRunning((r) => !r)} style={{ flex: 1, justifyContent: 'center' }}>
          {running ? <Pause size={13} /> : <Play size={13} />}
          {running ? 'Pause' : 'Démarrer'}
        </button>
        <button className="icon-btn" onClick={reset} data-tooltip="Réinitialiser"><RotateCcw size={13} /></button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
        {doneCount > 0 && <>{doneCount} session{doneCount > 1 ? 's' : ''} · </>}
        {subjectName ? `Compté pour ${subjectName}` : 'Temps compté au global'}
      </div>
    </div>
  )
}
