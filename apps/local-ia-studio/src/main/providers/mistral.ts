import type { Attachment, MistralModel, ModelMessage } from '@shared/types'
import { contentWithTextAttachments } from '@shared/attachments'

type ImageAttachment = Extract<Attachment, { kind: 'image' }>

const BASE_URL = 'https://api.mistral.ai/v1'

/** Modèles proposés si la liste de l'API n'est pas disponible. */
export const FALLBACK_MISTRAL_MODELS: MistralModel[] = [
  { id: 'mistral-small-latest', vision: true },
  { id: 'mistral-medium-latest', vision: true },
  { id: 'mistral-large-latest', vision: false },
  { id: 'ministral-8b-latest', vision: false },
  { id: 'open-mistral-nemo', vision: false }
]
export const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest'

/** Erreur HTTP Mistral : `retryable` = limite de débit / surcharge, un autre modèle peut prendre le relais. */
export class MistralHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null
  ) {
    super(message)
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

export async function mistralError(res: Response): Promise<MistralHttpError> {
  const retryAfter = Number(res.headers.get('retry-after'))
  return new MistralHttpError(await readError(res), res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null)
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (res.status === 401) return 'Clé API Mistral invalide ou révoquée.'
  if (res.status === 429) return 'Limite de requêtes Mistral atteinte, réessaie dans un instant.'
  try {
    const parsed = JSON.parse(text) as { message?: string | { detail?: string }; detail?: unknown }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    /* texte brut */
  }
  return text || `Mistral a répondu ${res.status}`
}

export function headers(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
}

/** Liste les modèles de chat disponibles pour cette clé (sert aussi à vérifier la clé). */
export async function listMistralModels(apiKey: string): Promise<MistralModel[]> {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers(apiKey), signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw await mistralError(res)
  const data = (await res.json()) as {
    data: { id: string; deprecation?: string | null; capabilities?: { completion_chat?: boolean; vision?: boolean } }[]
  }
  const chat = data.data.filter(
    (m) => m.capabilities?.completion_chat && !m.deprecation && !/embed|moderation|ocr|transcri/i.test(m.id)
  )
  // Les alias « -latest » suffisent : les versions datées font doublon dans un menu.
  const latest = chat.filter((m) => m.id.endsWith('-latest'))
  const list = (latest.length ? latest : chat).map((m) => ({ id: m.id, vision: !!m.capabilities?.vision }))
  return list.sort((a, b) => (a.id === DEFAULT_MISTRAL_MODEL ? -1 : b.id === DEFAULT_MISTRAL_MODEL ? 1 : a.id.localeCompare(b.id)))
}

export const MISTRAL_BASE_URL = BASE_URL

export function toMistralMessages(messages: ModelMessage[]): unknown[] {
  return messages.map((m) => {
    const text = contentWithTextAttachments(m.content, m.attachments)
    const images = m.role === 'user' ? (m.attachments ?? []).filter((a): a is ImageAttachment => a.kind === 'image') : []
    if (!images.length) return { role: m.role, content: text }
    return {
      role: m.role,
      content: [
        { type: 'text', text },
        ...images.map((a) => ({ type: 'image_url', image_url: `data:${a.mime};base64,${a.data}` }))
      ]
    }
  })
}

export async function streamMistralChat(
  apiKey: string,
  model: string,
  messages: ModelMessage[],
  options: { temperature: number; topP: number; maxTokens: number },
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model,
      messages: toMistralMessages(messages),
      temperature: options.temperature,
      top_p: options.topP,
      max_tokens: options.maxTokens,
      stream: true
    }),
    signal
  })
  if (!res.ok || !res.body) throw await mistralError(res)

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
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) onToken(delta)
      } catch {
        /* ligne incomplète */
      }
    }
  }
}

/** Réponse unique au format JSON (utilisée par le conseiller de modèle). */
export async function completeMistralJson<T>(apiKey: string, model: string, messages: { role: string; content: string }[]): Promise<T> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1200, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(60000)
  })
  if (!res.ok) throw await mistralError(res)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return JSON.parse(data.choices[0]?.message?.content ?? '{}') as T
}
