export interface BarRow {
  label: string
  used: number
  total: number
  color: string
}

interface Props {
  rows: BarRow[]
  format: (n: number) => string
}

/** Barres horizontales "utilisé / total" par compte. SVG/CSS pur. */
export default function BarChart({ rows, format }: Props): JSX.Element {
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <div className="col" style={{ gap: 12 }}>
      {rows.map((r) => {
        const usedPct = (r.used / max) * 100
        const totalPct = (r.total / max) * 100
        return (
          <div key={r.label} className="col" style={{ gap: 4 }}>
            <div className="spread" style={{ fontSize: 12 }}>
              <span className="row" style={{ gap: 6 }}>
                <span className="legend-dot" style={{ background: r.color }} />
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
              </span>
              <span className="muted">
                {format(r.used)} / {format(r.total)}
              </span>
            </div>
            <div
              style={{
                position: 'relative',
                height: 8,
                background: 'var(--bg-overlay)',
                borderRadius: 'var(--radius-full)',
                width: `${totalPct}%`,
                minWidth: 40
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${(usedPct / totalPct) * 100}%`,
                  background: r.color,
                  borderRadius: 'var(--radius-full)'
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
