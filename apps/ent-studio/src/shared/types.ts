import type { ChangeSet, Course } from './ics'

export interface EntSettings {
  url: string
  notify: boolean
  /** Intervalle de vérification, en minutes. */
  refreshMin: number
}

export interface EntState {
  settings: EntSettings
  courses: Course[]
  lastSync: number | null
  lastError: string | null
  history: ChangeSet[]
  syncing: boolean
}
