import type { ModelInfo, ModelMessage, PullProgress } from '@shared/types'
import { contentWithTextAttachments, imagesOf } from '@shared/attachments'

const BASE_URL = 'http://127.0.0.1:11434'

interface OllamaTagsResponse {
  models: Array<{
    name: string
    model: string
    modified_at: string
    size: number
    details?: { parameter_size?: string; quantization_level?: string }
  }>
}

export async function checkOllama(): Promise<{ available: boolean; version: string | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE_URL}/api/version`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return { available: false, version: null, error: `HTTP ${res.status}` }
    const data = (await res.json()) as { version: string }
    return { available: true, version: data.version, error: null }
  } catch (err) {
    return { available: false, version: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function listOllamaModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE_URL}/api/tags`)
  if (!res.ok) throw new Error(`Ollama a répondu ${res.status}`)
  const data = (await res.json()) as OllamaTagsResponse
  return data.models.map((m) => ({
    engine: 'ollama' as const,
    id: m.model,
    name: m.name,
    sizeBytes: m.size ?? null,
    paramsLabel: m.details?.parameter_size ?? null,
    quant: m.details?.quantization_level ?? null,
    modifiedAt: m.modified_at ?? null
  }))
}

export async function deleteOllamaModel(name: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name })
  })
  if (!res.ok) throw new Error(`Suppression échouée (${res.status})`)
}

/** Contexte maximal déclaré par le modèle (`<arch>.context_length` dans /api/show). */
export async function getOllamaContextLength(name: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name }),
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const data = (await res.json()) as { model_info?: Record<string, unknown> }
    const entry = Object.entries(data.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))
    return typeof entry?.[1] === 'number' ? entry[1] : null
  } catch {
    return null
  }
}

export async function pullOllamaModel(
  name: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    await doPull(name, onProgress, signal)
  } catch (err) {
    if (signal?.aborted) {
      onProgress({ model: name, status: 'cancelled', completed: null, total: null, done: true, error: null })
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ model: name, status: 'error', completed: null, total: null, done: true, error: message })
  }
}

async function doPull(name: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, stream: true }),
    signal
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    onProgress({ model: name, status: 'error', completed: null, total: null, done: true, error: text || `HTTP ${res.status}` })
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as {
          status: string
          completed?: number
          total?: number
          error?: string
        }
        if (parsed.error) {
          onProgress({ model: name, status: 'error', completed: null, total: null, done: true, error: parsed.error })
          return
        }
        const done = parsed.status === 'success'
        onProgress({
          model: name,
          status: parsed.status,
          completed: parsed.completed ?? null,
          total: parsed.total ?? null,
          done,
          error: null
        })
      } catch {
        /* ignore partial line */
      }
    }
  }
  onProgress({ model: name, status: 'success', completed: null, total: null, done: true, error: null })
}

export async function streamOllamaChat(
  model: string,
  messages: ModelMessage[],
  options: { temperature: number; topP: number; contextLength: number; maxTokens: number },
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => {
        const images = imagesOf(m.attachments)
        return {
          role: m.role,
          content: contentWithTextAttachments(m.content, m.attachments),
          ...(images.length ? { images } : {})
        }
      }),
      stream: true,
      options: {
        temperature: options.temperature,
        top_p: options.topP,
        num_ctx: options.contextLength,
        num_predict: options.maxTokens
      }
    }),
    signal
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(readableError(text) || `Ollama a répondu ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let parsed: { message?: { content?: string }; error?: string }
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (parsed.error) throw new Error(readableError(parsed.error))
      if (parsed.message?.content) onToken(parsed.message.content)
    }
  }
}

/** Ollama renvoie parfois des erreurs JSON imbriquées : on extrait le message et on traduit les cas courants. */
function readableError(raw: string): string {
  let message = raw.trim()
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse(message) as { error?: string | { message?: string }; message?: string }
      const inner = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? parsed.message)
      if (!inner) break
      message = inner
    } catch {
      break
    }
  }
  if (/multimodal|does not support (images|vision)/i.test(message)) {
    return 'Ce modèle ne lit pas les images. Choisis un modèle vision (gemma3, llava, qwen2.5vl…) ou retire l’image.'
  }
  if (/model .*not found/i.test(message)) {
    return `Modèle introuvable dans Ollama (${message}). Télécharge-le depuis « Gérer les modèles ».`
  }
  return message
}

/** Réponse JSON d'un modèle Ollama (format imposé) — repli du conseiller quand Mistral est indisponible. */
export async function completeJsonOllama(model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0.2, num_ctx: 8192 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    }),
    signal: AbortSignal.timeout(180000)
  })
  if (!res.ok) throw new Error(readableError(await res.text().catch(() => '')) || `Ollama a répondu ${res.status}`)
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content ?? '{}'
}

export { readableError as readableOllamaError }
