export interface Project {
  id: string
  name: string
  cwd: string
  command: string
  /** Lancé avec Open Studio. */
  autoStart: boolean
  /** Relancé s'il s'arrête tout seul (plantage). */
  autoRestart: boolean
  /** Variables d'environnement « CLE=valeur », une par ligne. */
  env: string
}

export type Status = 'stopped' | 'starting' | 'running' | 'crashed'

export interface LogLine {
  t: number
  text: string
  err: boolean
}

export interface RunState {
  id: string
  status: Status
  pid: number | null
  startedAt: number | null
  exitCode: number | null
  restarts: number
  /** Adresse locale repérée dans les logs (http://localhost:3000…). */
  url: string | null
}

export interface Detected {
  name: string
  suggestions: { label: string; command: string }[]
}
