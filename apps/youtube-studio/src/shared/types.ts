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

export interface VideoInfo {
  id: string
  title: string
  author: string
  seconds: number
  thumbnail: string
  tracks: Track[]
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
}

export type Provider = 'ollama' | 'mistral'

export interface AiSettings {
  provider: Provider
  ollamaModel: string
  mistralModel: string
  hasMistralKey: boolean
}
