interface Props {
  ratio: number // 0..1
  height?: number
}

export default function ProgressBar({ ratio, height = 6 }: Props): JSX.Element {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return (
    <div className="progress" style={{ height }}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}
