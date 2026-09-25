export interface PieSlice {
  label: string
  value: number
  color: string
}

interface Props {
  data: PieSlice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerSub?: string
}

/** Donut chart en SVG pur (pas de dépendance). */
export default function PieChart({
  data,
  size = 160,
  thickness = 22,
  centerLabel,
  centerSub
}: Props): JSX.Element {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const segments =
    total > 0
      ? data
          .filter((d) => d.value > 0)
          .map((d) => {
            const frac = d.value / total
            const seg = (
              <circle
                key={d.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${frac * circumference} ${circumference}`}
                strokeDashoffset={-offset * circumference}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            )
            offset += frac
            return seg
          })
      : []

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--bg-overlay)"
        strokeWidth={thickness}
      />
      {segments}
      {(centerLabel || centerSub) && (
        <g>
          <text
            x={cx}
            y={centerSub ? cy - 2 : cy + 4}
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="var(--text-primary)"
          >
            {centerLabel}
          </text>
          {centerSub && (
            <text
              x={cx}
              y={cy + 15}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-tertiary)"
            >
              {centerSub}
            </text>
          )}
        </g>
      )}
    </svg>
  )
}
