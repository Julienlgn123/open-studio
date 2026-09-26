import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Attachment, HfDownloadProgress, HfModel, LmStudioModel, ModelMessage } from '@shared/types'
import { contentWithTextAttachments } from '@shared/attachments'

// LM Studio : fait tourner les modèles MLX (optimisés Apple Silicon) et GGUF, et expose un
// serveur local compatible OpenAI (Developer → Start Server, ou `lms server start`). Local IA
// Studio s'y branche comme sur Ollama : liste des modèles, discussion, outils (fichiers).

const BASE = 'http://127.0.0.1:1234'
const HF = 'https://huggingface.co'

type ImageAttachment = Extract<Attachment, { kind: 'image' }>

export const LMSTUDIO_CHAT_URL = `${BASE}/v1/chat/completions`

export async function checkLmStudio(): Promise<{ available: boolean }> {
  try {
    const res = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(1500) })
    return { available: res.ok }
  } catch {
    return { available: false }
  }
}

/** Modèles téléchargés dans LM Studio (MLX et GGUF), hors modèles d'embeddings. */
export async function listLmStudioModels(): Promise<LmStudioModel[]> {
  // L'API REST de LM Studio donne le format (mlx / gguf), la vision et le contexte max.
  try {
    const res = await fetch(`${BASE}/api/v0/models`, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = (await res.json()) as {
        data: {
          id: string
          type?: string
          compatibility_type?: string
          quantization?: string
          arch?: string
          state?: string
          max_context_length?: number
        }[]
      }
      return data.data
        .filter((m) => m.type !== 'embeddings')
        .map((m) => ({
          id: m.id,
          name: m.id.split('/').pop() ?? m.id,
          format: (m.compatibility_type ?? '').toLowerCase() || null,
          vision: m.type === 'vlm',
          loaded: m.state === 'loaded',
          maxContext: m.max_context_length ?? null,
          quant: m.quantization ?? null
        }))
    }
  } catch {
    /* ancienne version de LM Studio : liste OpenAI simple ci-dessous */
  }
  const res = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) throw new Error(`LM Studio a répondu ${res.status}`)
  const data = (await res.json()) as { data: { id: string }[] }
  return data.data
    .filter((m) => !/embed/i.test(m.id))
    .map((m) => ({
      id: m.id,
      name: m.id.split('/').pop() ?? m.id,
      format: /mlx/i.test(m.id) ? 'mlx' : null,
      vision: false,
      loaded: false,
      maxContext: null,
      quant: null
    }))
}

export async function getLmStudioContextLength(model: string): Promise<number | null> {
  const list = await listLmStudioModels().catch(() => [])
  return list.find((m) => m.id === model)?.maxContext ?? null
}

/** Messages au format OpenAI (images en data URL), compris par LM Studio pour les modèles vision. */
export function toOpenAiMessages(messages: ModelMessage[]): unknown[] {
  return messages.map((m) => {
    const text = contentWithTextAttachments(m.content, m.attachments)
    const images = m.role === 'user' ? (m.attachments ?? []).filter((a): a is ImageAttachment => a.kind === 'image') : []
    if (!images.length) return { role: m.role, content: text }
    return {
      role: m.role,
      content: [{ type: 'text', text }, ...images.map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.data}` } }))]
    }
  })
}

export async function lmStudioError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(text) as { error?: string | { message?: string } }
    const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message
    if (msg) return new Error(`LM Studio : ${msg}`)
  } catch {
    /* texte brut */
  }
  return new Error(text ? `LM Studio : ${text}` : `LM Studio a répondu ${res.status}`)
}

export async function streamLmStudioChat(
  model: string,
  messages: ModelMessage[],
  options: { temperature: number; topP: number; maxTokens: number },
  onToken: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  let res: Response
  try {
    res = await fetch(LMSTUDIO_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: toOpenAiMessages(messages),
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxTokens,
        stream: true
      }),
      signal
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error('LM Studio ne répond pas : ouvre-le et démarre le serveur local (onglet Developer → Start Server).')
  }
  if (!res.ok || !res.body) throw await lmStudioError(res)

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

// ─── Modèles MLX depuis Hugging Face ────────────────────────────────────────

/** Dossier de modèles de LM Studio (récent : ~/.lmstudio/models, ancien : ~/.cache/lm-studio/models). */
export function lmStudioModelsDir(): string {
  const candidates = [join(homedir(), '.lmstudio', 'models'), join(homedir(), '.cache', 'lm-studio', 'models')]
  return candidates.find((d) => existsSync(d)) ?? candidates[0]
}

/** Recherche de modèles MLX (communauté mlx-community en priorité). */
export async function searchMlxModels(query: string): Promise<HfModel[]> {
  const params = new URLSearchParams({ filter: 'mlx', sort: 'downloads', direction: '-1', limit: '30' })
  if (query.trim()) params.set('search', query.trim())
  const res = await fetch(`${HF}/api/models?${params}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Hugging Face a répondu ${res.status}`)
  const data = (await res.json()) as { id: string; downloads?: number; likes?: number; pipeline_tag?: string }[]
  return data
    .filter((m) => !m.pipeline_tag || /text-generation|image-text-to-text/.test(m.pipeline_tag))
    .sort((a, b) => Number(b.id.startsWith('mlx-community/')) - Number(a.id.startsWith('mlx-community/')))
    .slice(0, 20)
    .map((m) => ({ id: m.id, downloads: m.downloads ?? 0, likes: m.likes ?? 0 }))
}

interface HfTreeEntry {
  type: string
  path: string
  size?: number
  lfs?: { size?: number }
}

async function repoFiles(repo: string): Promise<{ path: string; size: number }[]> {
  const res = await fetch(`${HF}/api/models/${repo}/tree/main?recursive=true`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`Hugging Face a répondu ${res.status}`)
  const tree = (await res.json()) as HfTreeEntry[]
  return tree
    .filter((f) => f.type === 'file' && !/^\.|\/\./.test(f.path) && !/\.(md|png|jpg|gif)$/i.test(f.path))
    .map((f) => ({ path: f.path, size: f.lfs?.size ?? f.size ?? 0 }))
}

/** Taille totale d'un modèle MLX (tous ses fichiers), en octets. */
export async function mlxRepoSize(repo: string): Promise<number> {
  return (await repoFiles(repo)).reduce((n, f) => n + f.size, 0)
}

/**
 * Télécharge un modèle MLX complet (dossier : poids .safetensors, config, tokenizer) dans le
 * dossier de LM Studio, qui le détecte tout seul. Chaque fichier est écrit en `.part` puis
 * renommé : un téléchargement interrompu reprend où il s'était arrêté.
 */
export async function downloadMlxRepo(
  repo: string,
  onProgress: (p: HfDownloadProgress) => void,
  signal: AbortSignal
): Promise<string | null> {
  const key = `mlx:${repo}`
  const base = { key, repo, file: repo.split('/').pop() ?? repo, done: false, error: null, cancelled: false }
  const destDir = join(lmStudioModelsDir(), ...repo.split('/'))
  try {
    const files = await repoFiles(repo)
    if (!files.some((f) => f.path.endsWith('.safetensors'))) throw new Error('Ce dépôt ne contient pas de poids MLX (.safetensors).')
    const total = files.reduce((n, f) => n + f.size, 0) || null
    let received = 0
    let lastEmit = 0
    onProgress({ ...base, received, total })

    for (const f of files) {
      const dest = join(destDir, ...f.path.split('/'))
      if (existsSync(dest) && (!f.size || statSync(dest).size === f.size)) {
        received += f.size
        continue
      }
      mkdirSync(dirname(dest), { recursive: true })
      const part = `${dest}.part`
      const already = existsSync(part) ? statSync(part).size : 0
      const res = await fetch(`${HF}/${repo}/resolve/main/${f.path.split('/').map(encodeURIComponent).join('/')}`, {
        headers: already ? { Range: `bytes=${already}-` } : {},
        signal
      })
      if (!res.ok || !res.body) throw new Error(`Téléchargement échoué (HTTP ${res.status}) : ${f.path}`)
      const resumed = res.status === 206
      received += resumed ? already : 0
      const stream = Readable.fromWeb(res.body as never)
      stream.on('data', (chunk: Buffer) => {
        received += chunk.length
        const now = Date.now()
        if (now - lastEmit > 250) {
          lastEmit = now
          onProgress({ ...base, received, total })
        }
      })
      await pipeline(stream, createWriteStream(part, { flags: resumed ? 'a' : 'w' }), { signal })
      renameSync(part, dest)
    }
    onProgress({ ...base, received: total ?? received, total, done: true })
    return destDir
  } catch (err) {
    if (signal.aborted) {
      onProgress({ ...base, received: 0, total: null, done: true, cancelled: true })
      return null
    }
    onProgress({ ...base, received: 0, total: null, done: true, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Réponse JSON d'un modèle LM Studio (repli du conseiller quand Mistral est indisponible). */
export async function completeJsonLmStudio(model: string, system: string, user: string): Promise<string> {
  const res = await fetch(LMSTUDIO_CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `${system}\nRéponds uniquement avec le JSON, sans texte autour.` },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      max_tokens: 1200,
      stream: false
    }),
    signal: AbortSignal.timeout(120_000)
  })
  if (!res.ok) throw await lmStudioError(res)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  const text = data.choices[0]?.message?.content ?? ''
  // Retire un éventuel bloc de réflexion ou des balises ```json autour de l'objet.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}
