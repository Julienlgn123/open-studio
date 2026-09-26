import { statSync } from 'fs'
import { basename } from 'path'
import type { LocalModelFile, ModelMessage } from '@shared/types'
import type { ToolDef } from '../tools'
import { contentWithTextAttachments, imagesOf } from '@shared/attachments'

// node-llama-cpp is ESM-only and loads native bindings lazily, so it's imported
// dynamically the first time a local .gguf model is actually used.
type Llama = import('node-llama-cpp').Llama
type LlamaModel = import('node-llama-cpp').LlamaModel
type LlamaContext = import('node-llama-cpp').LlamaContext
type LlamaChatSession = import('node-llama-cpp').LlamaChatSession
type ChatHistoryItem = import('node-llama-cpp').ChatHistoryItem
type ChatSessionModelFunctions = import('node-llama-cpp').ChatSessionModelFunctions

interface LoadedContext {
  contextSize: number
  context: LlamaContext
  // Session et séquence restent vivantes entre les messages : node-llama-cpp compare
  // les tokens déjà évalués avec le nouvel historique et ne recalcule que la différence.
  session: LlamaChatSession
}

let llamaInstance: Llama | null = null
let llamaLoadError: string | null = null
let loadedModel: { path: string; model: LlamaModel } | null = null
let loadedContext: LoadedContext | null = null

// Le contexte n'a qu'une séquence : les générations sont sérialisées pour que deux
// conversations lancées en même temps attendent leur tour au lieu de planter.
let queue: Promise<unknown> = Promise.resolve()
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

async function getLlamaInstance(): Promise<Llama> {
  if (!llamaInstance) {
    try {
      const { getLlama } = await import('node-llama-cpp')
      llamaInstance = await getLlama()
      llamaLoadError = null
    } catch (err) {
      llamaLoadError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }
  return llamaInstance
}

/** GPU vu par llama.cpp (type d'accélération, noms, VRAM) — charge le backend natif. */
export async function getLlamaGpuInfo(): Promise<{
  backend: string | null
  names: string[]
  vram: { total: number; free: number; unifiedSize: number } | null
}> {
  const llama = await getLlamaInstance()
  const backend = llama.gpu === false ? null : String(llama.gpu)
  if (!backend) return { backend: null, names: [], vram: null }
  const [names, vram] = await Promise.all([llama.getGpuDeviceNames().catch(() => []), llama.getVramState().catch(() => null)])
  return { backend, names, vram }
}

/** Ne charge pas le backend natif (lent) : il ne l'est qu'au premier usage réel. */
export function isLlamaCppAvailable(): boolean {
  return llamaLoadError === null
}

export function fileToModelInfo(path: string): LocalModelFile {
  const size = statSync(path).size
  return { path, name: basename(path), sizeBytes: size }
}

/** Contexte d'entraînement lu dans l'en-tête GGUF, sans charger le modèle. */
export async function getGgufContextLength(modelPath: string): Promise<number | null> {
  if (loadedModel?.path === modelPath) return loadedModel.model.trainContextSize
  try {
    const { readGgufFileInfo } = await import('node-llama-cpp')
    const info = await readGgufFileInfo(modelPath, { readTensorInfo: false })
    const metadata = info.metadata as unknown as Record<string, { context_length?: number } | undefined> & {
      general: { architecture: string }
    }
    const value = metadata[metadata.general.architecture]?.context_length
    return typeof value === 'number' && value > 0 ? value : null
  } catch {
    return null
  }
}

async function disposeContext(): Promise<void> {
  if (!loadedContext) return
  const { session, context } = loadedContext
  loadedContext = null
  session.dispose({ disposeSequence: true })
  await context.dispose()
}

async function disposeAll(): Promise<void> {
  await disposeContext()
  if (!loadedModel) return
  const { model } = loadedModel
  loadedModel = null
  await model.dispose()
}

async function ensureLoaded(modelPath: string, requestedContext: number): Promise<LoadedContext> {
  const { LlamaChatSession } = await import('node-llama-cpp')

  if (loadedModel && loadedModel.path !== modelPath) await disposeAll()
  if (!loadedModel) {
    const llama = await getLlamaInstance()
    loadedModel = { path: modelPath, model: await llama.loadModel({ modelPath }) }
  }
  const { model } = loadedModel
  const contextSize = Math.min(requestedContext, model.trainContextSize || requestedContext)

  if (loadedContext?.contextSize === contextSize) return loadedContext
  // Même modèle mais longueur de contexte modifiée : on recrée seulement le contexte.
  await disposeContext()

  const context = await model.createContext({ contextSize })
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), autoDisposeSequence: false })
  loadedContext = { contextSize, context, session }
  return loadedContext
}

export function unloadLlamaCppModel(): Promise<void> {
  return runExclusive(disposeAll)
}

export function streamLlamaCppChat(
  modelPath: string,
  messages: ModelMessage[],
  options: { temperature: number; topP: number; contextLength: number; maxTokens: number },
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
  /** Outils (lecture de fichiers…) : node-llama-cpp gère lui-même la boucle d'appels. */
  tools?: { defs: ToolDef[]; run: (name: string, args: Record<string, unknown>) => Promise<string> }
): Promise<void> {
  return runExclusive(async () => {
    if (signal?.aborted) throw new DOMException('Génération annulée', 'AbortError')

    const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUserIndex < 0) throw new Error('Aucun message utilisateur à envoyer.')
    const lastUser = messages[lastUserIndex]
    if (imagesOf(lastUser.attachments).length) {
      throw new Error(
        'Le moteur embarqué ne lit pas les images. Choisis un modèle vision via Ollama (ex. gemma3, llava, qwen2.5vl).'
      )
    }
    const text = (m: ModelMessage): string => contentWithTextAttachments(m.content, m.attachments)

    const history: ChatHistoryItem[] = messages.slice(0, lastUserIndex).map((m) =>
      m.role === 'assistant' ? { type: 'model', response: [m.content] } : { type: m.role, text: text(m) }
    )

    const { session } = await ensureLoaded(modelPath, options.contextLength)
    session.setChatHistory(history)
    await session.prompt(text(lastUser), {
      temperature: options.temperature,
      topP: options.topP,
      maxTokens: options.maxTokens,
      signal,
      functions: tools ? await buildFunctions(tools) : undefined,
      onTextChunk: (text: string) => onToken(text)
    })
  })
}

// node-llama-cpp rend obligatoires toutes les propriétés d'un schéma : on ne garde que les paramètres requis.
async function buildFunctions(tools: {
  defs: ToolDef[]
  run: (name: string, args: Record<string, unknown>) => Promise<string>
}): Promise<ChatSessionModelFunctions> {
  const { defineChatSessionFunction } = await import('node-llama-cpp')
  const entries = tools.defs.map((d) => {
    const props = Object.fromEntries(
      d.parameters.required.map((k) => [k, { type: d.parameters.properties[k].type === 'number' ? 'number' : 'string' }])
    )
    const fn = d.parameters.required.length
      ? defineChatSessionFunction({
          description: d.description,
          params: { type: 'object', properties: props } as never,
          handler: (params: unknown) => tools.run(d.name, (params ?? {}) as Record<string, unknown>)
        })
      : defineChatSessionFunction({ description: d.description, handler: () => tools.run(d.name, {}) })
    return [d.name, fn] as const
  })
  return Object.fromEntries(entries) as unknown as ChatSessionModelFunctions
}

/** Réponse JSON d'un modèle GGUF (grammaire JSON imposée) — repli du conseiller quand Mistral est indisponible. */
export function completeJsonLlamaCpp(modelPath: string, system: string, user: string): Promise<string> {
  return runExclusive(async () => {
    const llama = await getLlamaInstance()
    const grammar = await llama.getGrammarFor('json')
    const { session } = await ensureLoaded(modelPath, 8192)
    session.setChatHistory([{ type: 'system', text: system }])
    return session.prompt(user, { grammar, temperature: 0.2, maxTokens: 1200 })
  })
}
