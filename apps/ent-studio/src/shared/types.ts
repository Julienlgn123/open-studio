import type { ChangeSet, Course } from './ics'

export interface EntSettings {
  url: string
  notify: boolean
  /** Intervalle de vérification, en minutes. */
  refreshMin: number
  /** Notification N minutes avant chaque cours (0 = jamais). */
  remindBefore: number
  /** Résumé de la journée, le matin. */
  morning: boolean
  /** Matières (code ou nom) et types (« type:TP ») masqués. */
  hidden: string[]
}

export interface EntState {
  settings: EntSettings
  courses: Course[]
  lastSync: number | null
  lastError: string | null
  history: ChangeSet[]
  syncing: boolean
  /** Notes et devoirs : par séance (UID) ou par matière (« matiere:<clé> »). */
  notes: Record<string, string>
}

/** Clé d'une matière (code si présent, sinon nom). */
export const subjectKey = (c: { code: string | null; name: string }): string => c.code ?? c.name
export const isHidden = (c: { code: string | null; name: string; kind: string | null }, hidden: string[]): boolean =>
  hidden.includes(subjectKey(c)) || (!!c.kind && hidden.includes(`type:${c.kind}`))
