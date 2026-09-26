import type { EngineKind } from '@shared/types'
import { getPreferences, listLlamaCppModels } from './db'
import { checkOllama, listOllamaModels } from './providers/ollama'
import { listLmStudioModels } from './providers/lmstudio'
import { FALLBACK_MISTRAL_MODELS, MistralHttpError } from './providers/mistral'

export interface Target {
  engine: EngineKind
  model: string
}

// Ordre de repli entre modèles Mistral : les petits modèles ont souvent des quotas séparés et plus larges.
const MISTRAL_ORDER = ['mistral-small-latest', 'ministral-8b-latest', 'open-mistral-nemo', 'ministral-3b-latest', 'mistral-medium-latest']

let knownMistralModels: string[] = FALLBACK_MISTRAL_MODELS.map((m) => m.id)
export function rememberMistralModels(ids: string[]): void {
  if (ids.length) knownMistralModels = ids
}

export function isRetryableCloudError(err: unknown): boolean {
  return err instanceof MistralHttpError ? err.retryable : err instanceof TypeError // TypeError = réseau (fetch failed)
}

// Avec les outils (agent), un petit modèle écrit mal les fichiers : on reste sur des modèles solides.
const AGENT_MISTRAL_ORDER = ['mistral-medium-latest', 'codestral-latest', 'mistral-small-latest', 'magistral-medium-latest']

/** Autres modèles Mistral à essayer après `primary` (au plus 2). */
export function otherMistralModels(primary: string, agent = false): string[] {
  const available = new Set(knownMistralModels)
  return (agent ? AGENT_MISTRAL_ORDER : MISTRAL_ORDER).filter((m) => m !== primary && available.has(m)).slice(0, 2)
}

/** Modèle local de secours : celui des préférences s'il est local, sinon le premier Ollama, sinon le premier GGUF. */
export async function localFallback(): Promise<Target | null> {
  const prefs = getPreferences()
  const gguf = listLlamaCppModels()
  const ollama = (await checkOllama()).available ? await listOllamaModels().catch(() => []) : []
  if (prefs.defaultEngine === 'ollama' && ollama.some((m) => m.id === prefs.defaultModel)) return { engine: 'ollama', model: prefs.defaultModel! }
  if (prefs.defaultEngine === 'llamacpp' && gguf.some((m) => m.path === prefs.defaultModel)) return { engine: 'llamacpp', model: prefs.defaultModel! }
  if (prefs.defaultEngine === 'lmstudio' && prefs.defaultModel) return { engine: 'lmstudio', model: prefs.defaultModel }
  // Mac Apple Silicon : un modèle MLX de LM Studio est le plus rapide des modèles locaux.
  const lms = await listLmStudioModels().catch(() => [])
  const mlx = lms.find((m) => m.format === 'mlx')
  if (mlx) return { engine: 'lmstudio', model: mlx.id }
  if (ollama.length) return { engine: 'ollama', model: ollama[0].id }
  if (gguf.length) return { engine: 'llamacpp', model: gguf[0].path }
  return null
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Appelle Mistral ; sur limite de débit, attend (Retry-After ou 1,5 s) et réessaie une fois. */
export async function withMistralRetry<T>(fn: () => Promise<T>, canRetry: () => boolean = () => true): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!(err instanceof MistralHttpError) || !err.retryable || !canRetry()) throw err
    await sleep(Math.min(err.retryAfterMs ?? 1500, 5000))
    return fn()
  }
}

export function describeTarget(t: Target): string {
  return t.engine === 'llamacpp' ? (t.model.split(/[\\/]/).pop() ?? t.model).replace(/\.gguf$/i, '') : t.model
}
