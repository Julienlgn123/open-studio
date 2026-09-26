import { useEffect, useState } from 'react'
import { Flame, Target } from 'lucide-react'
import { useStore } from '../store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export interface ReviewStats {
  today: number
  streak: number
  total: number
  last30: { day: string; count: number; good: number }[]
  bySubject: { id: string; name: string; emoji: string; color: string; total: number; mastered: number; learning: number; fresh: number; due: number }[]
}

export const DEFAULT_REVIEW_GOAL = 20

/** Objectif du jour (cartes révisées) + série de jours : affiché dans le studio de flashcards. */
export default function ReviewGoal({ refreshKey = 0 }: { refreshKey?: number }) {
  const goal = useStore((s) => s.settings.dailyReviewGoal) || DEFAULT_REVIEW_GOAL
  const [stats, setStats] = useState<ReviewStats | null>(null)

  useEffect(() => {
    api.review.stats().then(setStats).catch(() => setStats(null))
  }, [refreshKey])

  if (!stats) return null
  const pct = Math.min(100, (stats.today / goal) * 100)
  const done = stats.today >= goal
  return (
    <div className="review-goal" data-tooltip="Objectif réglable dans Paramètres → Révisions" data-tooltip-dir="down">
      <Target size={13} style={{ color: done ? 'var(--success)' : 'var(--accent)' }} />
      <span>
        {stats.today}/{goal}
      </span>
      <div className="review-goal-bar">
        <div style={{ width: `${pct}%`, background: done ? 'var(--success)' : 'var(--accent)' }} />
      </div>
      {stats.streak > 0 && (
        <span className="review-goal-streak">
          <Flame size={12} /> {stats.streak} j
        </span>
      )}
    </div>
  )
}
