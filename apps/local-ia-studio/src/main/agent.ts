import type { ApprovalDecision, ConversationSettings, EngineKind, ModelMessage, ToolApproval, WriteMode } from '@shared/types'
import { FILE_ACCESS_MIN_CONTEXT } from '@shared/types'
import { contentWithTextAttachments, imagesOf } from '@shared/attachments'
import { readableOllamaError, streamOllamaChat } from './providers/ollama'
import { headers, mistralError, MISTRAL_BASE_URL, streamMistralChat, toMistralMessages } from './providers/mistral'
import { streamLlamaCppChat } from './providers/llamacpp'
import { fileAccessSystemPrompt, runTool, toolDefs, toolLabel, type ToolDef } from './tools'

const OLLAMA_URL = 'http://127.0.0.1:11434'
/** Garde-fou : nombre maximal d'allers-retours outils par réponse. */
const MAX_TOOL_ROUNDS = 40
/** Avec les outils, un fichier complet passe dans un seul appel : il faut de la marge. */
const TOOLS_MIN_MAX_TOKENS = 8192
const WRITE_MIN_CONTEXT = 32768

export interface AttemptCallbacks {
  onToken: (chunk: string) => void
  onTool: (label: string) => void
  /** Accord de l'utilisateur pour une modification de fichier (mode « ask »). */
  onApproval: (req: Omit<ToolApproval, 'id'>) => Promise<ApprovalDecision>
}

type RunTool = (name: string, args: Record<string, unknown>) => Promise<string>

export interface AttemptResult {
  tools: string[]
  /** Remarque pour l'utilisateur (ex. le modèle ne sait pas utiliser les outils). */
  notice: string | null
}

export class ToolsUnsupportedError extends Error {}

/** Un essai de génération avec un moteur/modèle donné (outils si l'accès aux fichiers est actif). */
export async function runAttempt(
  engine: EngineKind,
  model: string,
  messages: ModelMessage[],
  settings: ConversationSettings,
  cb: AttemptCallbacks,
  signal: AbortSignal,
  mistralKey: string | null,
  writeMode: WriteMode
): Promise<AttemptResult> {
  const withTools = settings.fileAccess
  const options = {
    ...settings,
    contextLength: withTools
      ? Math.max(settings.contextLength, writeMode === 'read' ? FILE_ACCESS_MIN_CONTEXT : WRITE_MIN_CONTEXT)
      : settings.contextLength,
    maxTokens: withTools ? Math.max(settings.maxTokens, TOOLS_MIN_MAX_TOKENS) : settings.maxTokens
  }
  const tools: string[] = []
  // « Tout autoriser » vaut pour le reste de cette réponse.
  let allowAll = false
  const approve = async (req: Omit<ToolApproval, 'id'>): Promise<ApprovalDecision> => {
    if (allowAll) return 'allow'
    const decision = await cb.onApproval(req)
    if (decision === 'allow-all') allowAll = true
    return decision
  }
  const run: RunTool = async (name, args) => {
    const label = toolLabel(name, args)
    tools.push(label)
    cb.onTool(label)
    const result = await runTool(name, args, { writeMode, approve })
    if (result.startsWith("L'utilisateur a refusé")) {
      tools[tools.length - 1] = `${label} — refusé`
      cb.onTool(`${label} — refusé`)
    }
    return result
  }
  const defs = toolDefs(writeMode)

  if (!withTools) {
    // Sans outils, le modèle croit souvent « ne pas pouvoir » toucher aux fichiers : on lui dit comment les obtenir.
    const plain = withSystemNote(messages, NO_FILE_ACCESS_NOTE)
    if (engine === 'ollama') await streamOllamaChat(model, plain, options, cb.onToken, signal)
    else if (engine === 'mistral') await streamMistralChat(requireKey(mistralKey), model, plain, options, cb.onToken, signal)
    else await streamLlamaCppChat(model, plain, options, cb.onToken, signal)
    return { tools, notice: null }
  }

  const msgs = withFileAccessPrompt(messages, writeMode)
  if (engine === 'llamacpp') {
    await streamLlamaCppChat(model, msgs, options, cb.onToken, signal, { defs, run })
    return { tools, notice: null }
  }
  if (engine === 'mistral') {
    await mistralAgent(requireKey(mistralKey), model, msgs, options, cb, signal, run, defs)
    return { tools, notice: null }
  }
  try {
    await ollamaAgent(model, msgs, options, cb, signal, run, defs)
    return { tools, notice: null }
  } catch (err) {
    if (!(err instanceof ToolsUnsupportedError)) throw err
    // Modèle sans prise en charge des outils (ex. gemma) : on répond quand même, sans accès aux fichiers.
    await streamOllamaChat(model, messages, options, cb.onToken, signal)
    return {
      tools,
      notice: `${model} ne sait pas utiliser les outils : réponse sans accès aux fichiers. Pour explorer tes projets, prends qwen2.5, qwen3, llama3.1+ ou mistral.`
    }
  }
}

function requireKey(key: string | null): string {
  if (!key) throw new Error('Aucune clé Mistral enregistrée (Préférences → Mistral).')
  return key
}

const NO_FILE_ACCESS_NOTE =
  "Tu tournes dans Local IA Studio. L'accès aux fichiers est désactivé pour cette conversation. Si l'utilisateur te demande de lire, créer ou modifier des fichiers sur son ordinateur, ne dis pas que c'est impossible : explique-lui d'activer le bouton « Fichiers » sous la zone de saisie (et d'autoriser le dossier dans Préférences → Accès aux fichiers s'il ne l'est pas), puis de renvoyer sa demande ; tu pourras alors le faire toi-même."

function withFileAccessPrompt(messages: ModelMessage[], writeMode: WriteMode): ModelMessage[] {
  return withSystemNote(messages, fileAccessSystemPrompt(writeMode))
}

/** Ajoute des consignes au prompt système (ou le crée). */
function withSystemNote(messages: ModelMessage[], extra: string): ModelMessage[] {
  if (messages[0]?.role === 'system') {
    return [{ ...messages[0], content: `${messages[0].content}\n\n${extra}` }, ...messages.slice(1)]
  }
  return [{ role: 'system', content: extra }, ...messages]
}

function toolSchemas(defs: ToolDef[]): unknown[] {
  return defs.map((t) => ({ type: 'function', function: t }))
}

async function ollamaAgent(
  model: string,
  messages: ModelMessage[],
  options: { temperature: number; topP: number; contextLength: number; maxTokens: number },
  cb: AttemptCallbacks,
  signal: AbortSignal,
  run: RunTool,
  defs: ToolDef[]
): Promise<void> {
  const convo: unknown[] = messages.map((m) => {
    const images = imagesOf(m.attachments)
    return { role: m.role, content: contentWithTextAttachments(m.content, m.attachments), ...(images.length ? { images } : {}) }
  })

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: convo,
        tools: toolSchemas(defs),
        stream: true,
        options: { temperature: options.temperature, top_p: options.topP, num_ctx: options.contextLength, num_predict: options.maxTokens }
      }),
      signal
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      if (/does not support tools/i.test(text)) throw new ToolsUnsupportedError(text)
      throw new Error(readableOllamaError(text) || `Ollama a répondu ${res.status}`)
    }

    let content = ''
    const calls: { function: { name: string; arguments: Record<string, unknown> } }[] = []
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
        let parsed: { message?: { content?: string; tool_calls?: typeof calls }; error?: string }
        try {
          parsed = JSON.parse(line)
        } catch {
          continue
        }
        if (parsed.error) {
          if (/does not support tools/i.test(parsed.error)) throw new ToolsUnsupportedError(parsed.error)
          throw new Error(readableOllamaError(parsed.error))
        }
        if (parsed.message?.content) {
          content += parsed.message.content
          cb.onToken(parsed.message.content)
        }
        if (parsed.message?.tool_calls?.length) calls.push(...parsed.message.tool_calls)
      }
    }

    // Certains modèles écrivent l'appel en JSON dans le texte au lieu d'appeler l'outil : on le rattrape.
    if (!calls.length) calls.push(...toolCallsInText(content, defs))
    if (!calls.length) return
    if (content) cb.onToken('\n\n')
    convo.push({ role: 'assistant', content, tool_calls: calls })
    for (const call of calls) {
      const args = typeof call.function.arguments === 'string' ? safeJson(call.function.arguments) : (call.function.arguments ?? {})
      convo.push({ role: 'tool', tool_name: call.function.name, content: await run(call.function.name, args) })
    }
  }
  cb.onToken('\n\n_(Arrêt : trop d’appels d’outils d’affilée.)_')
}

async function mistralAgent(
  apiKey: string,
  model: string,
  messages: ModelMessage[],
  options: { temperature: number; topP: number; maxTokens: number },
  cb: AttemptCallbacks,
  signal: AbortSignal,
  run: RunTool,
  defs: ToolDef[]
): Promise<void> {
  const convo = toMistralMessages(messages)

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = JSON.stringify({
      model,
      messages: convo,
      tools: toolSchemas(defs),
      tool_choice: 'auto',
      temperature: options.temperature,
      top_p: options.topP,
      max_tokens: options.maxTokens,
      stream: true
    })
    // Une tâche d'agent enchaîne beaucoup de requêtes : sur limite de débit, on patiente et on réessaie.
    let res: Response
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`${MISTRAL_BASE_URL}/chat/completions`, { method: 'POST', headers: headers(apiKey), body, signal })
      if (res.ok && res.body) break
      const err = await mistralError(res)
      if (!err.retryable || attempt >= 4) throw err
      await abortableSleep(Math.min(err.retryAfterMs ?? 1500 * 2 ** attempt, 15_000), signal)
    }
    if (!res.body) throw new Error('Réponse Mistral vide.')

    let content = ''
    // Les appels d'outils arrivent par morceaux, regroupés par index.
    const calls = new Map<number, { id: string; name: string; arguments: string }>()
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
        if (data === '[DONE]') continue
        let parsed: {
          choices?: {
            delta?: {
              content?: string
              tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string | object } }[]
            }
          }[]
        }
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        const delta = parsed.choices?.[0]?.delta
        if (delta?.content) {
          content += delta.content
          cb.onToken(delta.content)
        }
        for (const [i, tc] of (delta?.tool_calls ?? []).entries()) {
          const index = tc.index ?? i
          const current = calls.get(index) ?? { id: '', name: '', arguments: '' }
          if (tc.id) current.id = tc.id
          if (tc.function?.name) current.name = tc.function.name
          const args = tc.function?.arguments
          if (args) current.arguments += typeof args === 'string' ? args : JSON.stringify(args)
          calls.set(index, current)
        }
      }
    }

    if (!calls.size) return
    if (content) cb.onToken('\n\n')
    const list = [...calls.values()]
    convo.push({
      role: 'assistant',
      content,
      tool_calls: list.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } }))
    })
    for (const c of list) {
      convo.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: await run(c.name, safeJson(c.arguments)) })
    }
  }
  cb.onToken('\n\n_(Arrêt : trop d’appels d’outils d’affilée.)_')
}

/** Appels d'outils écrits en JSON dans le texte ({"name": "...", "arguments": {...}}), noms connus seulement. */
export function toolCallsInText(
  content: string,
  defs: ToolDef[]
): { function: { name: string; arguments: Record<string, unknown> } }[] {
  const names = new Set(defs.map((d) => d.name))
  const blocks = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```|<tool_call>\s*([\s\S]*?)<\/tool_call>/g)].map((m) => m[1] ?? m[2])
  if (!blocks.length && content.trim().startsWith('{')) blocks.push(content.trim())
  const calls: { function: { name: string; arguments: Record<string, unknown> } }[] = []
  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block.trim())
    } catch {
      continue
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      const obj = item as { name?: unknown; arguments?: unknown; parameters?: unknown }
      const args = obj?.arguments ?? obj?.parameters
      if (typeof obj?.name === 'string' && names.has(obj.name)) {
        calls.push({
          function: {
            name: obj.name,
            arguments: typeof args === 'string' ? safeJson(args) : ((args as Record<string, unknown>) ?? {})
          }
        })
      }
    }
  }
  return calls
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveSleep, reject) => {
    const t = setTimeout(resolveSleep, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Génération annulée', 'AbortError'))
    }, { once: true })
  })
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text || '{}')
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
