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
  /** Ajouts (colonnes facultatives, absentes des anciennes bases) */
  repeat?: Repeat | null
  repeat_until?: string | null
  location?: string | null
  color?: string | null
  /** Minutes avant l'événement pour la notification (0 = aucune). */
  remind?: number | null
}

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export interface SubTask {
  text: string
  done: boolean
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
  repeat?: Repeat | null
  /** JSON de SubTask[] */
  subtasks?: string | null
  list?: string | null
  goal_id?: string | null
  done_at?: number | null
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

export interface Habit {
  id: string
  name: string
  emoji: string
  /** Jours cochés, AAAA-MM-JJ */
  days: string[]
  createdAt: number
}

export interface FocusSession {
  at: number
  minutes: number
  taskId?: string
  label?: string
}
