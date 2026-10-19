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
  /** Groupe (ex. « Mon site » : front + API lancés ensemble). */
  group?: string
  /** Port attendu : vérifié avant le lancement. */
  port?: number | null
  /** Adresse vérifiée régulièrement ; s'il ne répond plus, le projet peut être relancé. */
  health?: string
  healthRestart?: boolean
  /** Commandes ponctuelles (installer, construire, mettre à jour…). */
  tasks?: { label: string; command: string }[]
}

export interface Usage {
  cpu: number
  mem: number
  procs: number
}

/** `restarting` : planté, relance automatique programmée (on peut encore l'annuler). */
export type Status = 'stopped' | 'starting' | 'running' | 'crashed' | 'restarting'

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
  usage?: Usage | null
  /** Dernier contrôle de santé : vrai = répond, faux = ne répond pas. */
  healthy?: boolean | null
  lastCrash?: number | null
  /** Commande ponctuelle en cours. */
  task?: string | null
}

export interface Detected {
  name: string
  suggestions: { label: string; command: string }[]
}
