import { useEffect, useMemo, useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

const key = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Carte de chaleur façon GitHub : 26 semaines d'activité (cours modifiés, Pomodoro, quiz, cartes). */
export default function ActivityHeatmap() {
  const [data, setData] = useState<Record<string, number>>({})
  useEffect(() => {
    api.planner.activity(190).then((rows: Array<{ day: string; count: number }>) => {
      // le main groupe par jour UTC ; l'écart d'un jour est sans conséquence ici
      setData(Object.fromEntries(rows.map((r) => [r.day, r.count])))
    }).catch(() => {})
  }, [])

  const { weeks, max, total, active } = useMemo(() => {
    const end = new Date(); end.setHours(12, 0, 0, 0)
    const start = new Date(end); start.setDate(start.getDate() - 26 * 7 + 1)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // lundi
    const cols: Array<Array<{ k: string; n: number; future: boolean }>> = []
    let m = 0, t = 0, a = 0
    for (const d = new Date(start); d <= end; ) {
      const col: Array<{ k: string; n: number; future: boolean }> = []
      for (let i = 0; i < 7; i++) {
        const k = key(d); const n = data[k] ?? 0
        col.push({ k, n, future: d > end })
        if (n) { t += n; a++; m = Math.max(m, n) }
        d.setDate(d.getDate() + 1)
      }
      cols.push(col)
    }
    return { weeks: cols, max: m, total: t, active: a }
  }, [data])

  const shade = (n: number, future: boolean): string => {
    if (future) return 'transparent'
    if (!n) return 'var(--bg-overlay)'
    const r = n / Math.max(1, max)
    const o = r > 0.75 ? 1 : r > 0.5 ? 0.75 : r > 0.25 ? 0.5 : 0.3
    return `color-mix(in srgb, var(--accent) ${o * 100}%, transparent)`
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        Activité — 6 derniers mois
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {active} jour{active !== 1 ? 's' : ''} actif{active !== 1 ? 's' : ''} · {total} action{total !== 1 ? 's' : ''}
      </p>
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
        {weeks.map((col, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: 3 }}>
            {col.map((c) => (
              <div key={c.k} title={`${c.k} — ${c.n} action${c.n !== 1 ? 's' : ''}`}
                style={{ width: 12, height: 12, borderRadius: 3, background: shade(c.n, c.future) }} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
