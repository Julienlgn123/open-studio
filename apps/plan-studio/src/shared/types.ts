// Mêmes tables que l'ancienne app Plan Studio (plan-studio.db) : ses données sont reprises telles quelles.

export interface PlanEvent {
  id: string
  title: string
  /** AAAA-MM-JJ */
  date: string
  /** HH:MM, null = toute la journée */
  start_time: string | null
  end_time: string | null
  emoji: string
  notes: string | null
  created_at: number
}

export type Priority = 'low' | 'medium' | 'high'

export interface PlanTask {
  id: string
  title: string
  done: number
  /** AAAA-MM-JJ */
  due_date: string | null
  priority: Priority
  notes: string | null
  created_at: number
}

export interface PlanGoal {
  id: string
  title: string
  description: string | null
  target_date: string | null
  /** 0 – 100 */
  progress: number
  done: number
  created_at: number
}
