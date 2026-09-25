import { statSync } from 'fs'
import { basename } from 'path'
import type { LocalModelFile } from '@shared/types'

// node-llama-cpp is ESM-only and loads native bindings lazily, so it's imported
// dynamically the first time a local .gguf model is actually used.
type Llama = import('node-llama-cpp').Llama
type LlamaModel = import('node-llama-cpp').LlamaModel
type LlamaContext = import('node-llama-cpp').LlamaContext
type ChatHistoryItem = import('node-llama-cpp').ChatHistoryItem

let llamaInstance: Llama | null = null
let loaded: { path: string; model: LlamaModel; context: LlamaContext } | null = null

async function getLlamaInstance(): Promise<Llama> {
  if (!llamaInstance) {
    const { getLlama } = await import('node-llama-cpp')
    llamaInstance = await getLlama()
  }
  return llamaInstance
}

export async function isLlamaCppAvailable(): Promise<boolean> {
  try {
    await getLlamaInstance()
    return true
  } catch {
    return false
  }
}

export function fileToModelInfo(path: string): LocalModelFile {
  const size = statSync(path).size
  return { path, name: basename(path), sizeBytes: size }
}

async function ensureModelLoaded(modelPath: string, contextLength: number): Promise<LlamaContext> {
  if (loaded && loaded.path === modelPath) return loaded.context

  if (loaded) {
    await loaded.context.dispose()
    await loaded.model.dispose()
    loaded = null
  }

  const llama = await getLlamaInstance()
  const model = await llama.loadModel({ modelPath })
  const context = await model.createContext({ contextSize: contextLength })
  loaded = { path: modelPath, model, context }
  return context
}

export async function unloadLlamaCppModel(): Promise<void> {
  if (!loaded) return
  await loaded.context.dispose()
  await loaded.model.dispose()
  loaded = null
}

export async function streamLlamaCppChat(
  modelPath: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature: number; topP: number; contextLength: number; maxTokens: number },
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const { LlamaChatSession } = await import('node-llama-cpp')
  const context = await ensureModelLoaded(modelPath, options.contextLength)
  const sequence = context.getSequence()

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) throw new Error('Aucun message utilisateur à envoyer.')
  const priorMessages = messages.slice(0, messages.lastIndexOf(lastUser))

  const history: ChatHistoryItem[] = priorMessages.map((m) =>
    m.role === 'assistant'
      ? { type: 'model', response: [m.content] }
      : { type: m.role, text: m.content }
  )

  const session = new LlamaChatSession({ contextSequence: sequence })
  if (history.length) session.setChatHistory(history)

  try {
    await session.prompt(lastUser.content, {
      temperature: options.temperature,
      topP: options.topP,
      maxTokens: options.maxTokens,
      signal,
      onTextChunk: (text: string) => onToken(text)
    })
  } finally {
    sequence.dispose()
  }
}
