import type { ModelInfo, PullProgress } from '@shared/types'

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

export async function pullOllamaModel(
  name: string,
  onProgress: (p: PullProgress) => void,
  signal?: AbortSignal
): Promise<void> {
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

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function streamOllamaChat(
  model: string,
  messages: OllamaChatMessage[],
  options: { temperature: number; topP: number; contextLength: number; maxTokens: number },
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
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
    throw new Error(text || `Ollama a répondu ${res.status}`)
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
        const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string }
        if (parsed.error) throw new Error(parsed.error)
        const content = parsed.message?.content
        if (content) onToken(content)
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e
      }
    }
  }
}
