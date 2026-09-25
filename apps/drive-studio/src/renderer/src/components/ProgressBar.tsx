interface Props {
  ratio: number // 0..1
  variant?: 'auto' | 'accent'
  height?: number
}

/** Barre de progression : verte < 70 %, orange 70–90 %, rouge > 90 % (mode auto). */
export default function ProgressBar({ ratio, variant = 'auto', height = 6 }: Props): JSX.Element {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  let cls = 'accent'
  if (variant === 'auto') {
    cls = ratio >= 0.9 ? 'crit' : ratio >= 0.7 ? 'warn' : ''
  }
  return (
    <div className="progress" style={{ height }}>
      <div className={`progress-bar ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
