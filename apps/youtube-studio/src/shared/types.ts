export interface Track {
  lang: string
  name: string
  auto: boolean
  url: string
}

export interface Line {
  /** Début, en secondes. */
  t: number
  text: string
}

export interface Chapter {
  t: number
  title: string
}

export interface VideoInfo {
  id: string
  title: string
  author: string
  seconds: number
  thumbnail: string
  tracks: Track[]
  chapters?: Chapter[]
}

export interface QuizQuestion {
  q: string
  choices: string[]
  answer: number
  why?: string
}

export interface QA {
  q: string
  a: string
  at: number
}

export interface Note {
  id: string
  t: number
  text: string
}

export type SummaryStyle = 'summary' | 'revision' | 'outline' | 'tweet'
export interface AnalyzeOptions {
  length: 'short' | 'normal' | 'long'
  style: SummaryStyle
  lang: 'fr' | 'en'
}

export interface Card {
  q: string
  a: string
}

export interface Analysis {
  summary: string
  points: string[]
  cards: Card[]
  model: string
}

export interface HistoryItem {
  id: string
  title: string
  author: string
  thumbnail: string
  seconds: number
  lang: string
  lines: Line[]
  analysis: Analysis | null
  at: number
  chapters?: Chapter[]
  quiz?: QuizQuestion[]
  qa?: QA[]
  notes?: Note[]
  fav?: boolean
  /** Résultats du mode révision : index de carte → su ou non. */
  known?: number[]
}

export type Provider = 'ollama' | 'mistral'

export interface AiSettings {
  provider: Provider
  ollamaModel: string
  mistralModel: string
  hasMistralKey: boolean
}
