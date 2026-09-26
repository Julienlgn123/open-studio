export default function ProgressBar({ ratio, indeterminate }: { ratio: number; indeterminate?: boolean }): JSX.Element {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return (
    <div className={`progress${indeterminate ? ' indeterminate' : ''}`}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}
