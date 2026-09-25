export type EngineKind = 'ollama' | 'llamacpp'

export interface ModelInfo {
  engine: EngineKind
  id: string
  name: string
  sizeBytes: number | null
  paramsLabel: string | null
  quant: string | null
  modifiedAt: string | null
}

export interface LocalModelFile {
  path: string
  name: string
  sizeBytes: number
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface ConversationSettings {
  systemPrompt: string
  temperature: number
  topP: number
  contextLength: number
  maxTokens: number
}

export const DEFAULT_SETTINGS: ConversationSettings = {
  systemPrompt: '',
  temperature: 0.7,
  topP: 0.9,
  contextLength: 4096,
  maxTokens: 2048
}

export interface Conversation {
  id: string
  title: string
  engine: EngineKind
  model: string
  settings: ConversationSettings
  createdAt: number
  updatedAt: number
}

export interface EngineStatus {
  ollama: { available: boolean; version: string | null; error: string | null }
  llamacpp: { available: boolean }
}

export interface PullProgress {
  model: string
  status: string
  completed: number | null
  total: number | null
  done: boolean
  error: string | null
}

export interface InstallProgress {
  phase: 'downloading' | 'installing' | 'waiting' | 'done' | 'error'
  percent: number | null
  message: string
}

export interface ChatStreamRequest {
  conversationId: string
  engine: EngineKind
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  settings: ConversationSettings
}
