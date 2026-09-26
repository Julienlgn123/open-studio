import AdmZip from 'adm-zip'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, extname, join } from 'path'
import type { Attachment, ChatMessage, ConversationSource, EngineKind, ImportResult } from '@shared/types'
import { MAX_TEXT_ATTACHMENT_CHARS } from '@shared/attachments'
import { addMessage, createConversation, hasImportedConversation, transaction } from './db'

interface ImportedMessage {
  role: ChatMessage['role']
  content: string
  attachments?: Attachment[]
  at: number
}

interface ImportedConversation {
  sourceId: string
  title: string
  messages: ImportedMessage[]
}

const titleFrom = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 60 ? `${flat.slice(0, 59).trimEnd()}…` : flat || 'Conversation importée'
}

function save(
  source: ConversationSource,
  convs: ImportedConversation[],
  target: { engine: EngineKind; model: string }
): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, messages: 0 }
  transaction(() => {
    for (const c of convs) {
      if (!c.messages.some((m) => m.role === 'user') || hasImportedConversation(source, c.sourceId)) {
        result.skipped++
        continue
      }
      const first = c.messages[0].at
      const last = c.messages[c.messages.length - 1].at
      const conv = createConversation(target.engine, target.model, {
        title: c.title,
        source,
        sourceId: c.sourceId,
        createdAt: first,
        updatedAt: last
      })
      for (const m of c.messages) addMessage(conv.id, m.role, m.content, m.attachments, undefined, m.at)
      result.imported++
      result.messages += c.messages.length
    }
  })
  return result
}

// ---------- Claude Code (~/.claude/projects/*/<session>.jsonl) ----------

export function claudeCodeDir(): string {
  return join(homedir(), '.claude', 'projects')
}

export function countClaudeCodeSessions(): number {
  const dir = claudeCodeDir()
  if (!existsSync(dir)) return 0
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .reduce((n, d) => n + readdirSync(join(dir, d.name)).filter((f) => f.endsWith('.jsonl')).length, 0)
}

type Block = { type: string; text?: string }
interface CodeLine {
  type?: string
  isSidechain?: boolean
  isMeta?: boolean
  timestamp?: string
  customTitle?: string
  cwd?: string
  origin?: { kind?: string }
  message?: { role?: string; content?: string | Block[] }
}

/** Nettoie un message utilisateur de Claude Code (rappels système, sorties de commandes…). */
function cleanUserText(content: string | Block[]): string | null {
  let text: string
  let images = 0
  if (typeof content === 'string') text = content
  else {
    if (content.some((b) => b.type === 'tool_result')) return null
    text = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
    images = content.filter((b) => b.type === 'image').length
  }
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  if (/^<(command-|local-command|task-notification|bash-)/.test(text) || text.startsWith('[Request interrupted')) return null
  if (images) text = `${text}${text ? '\n\n' : ''}[${images} image${images > 1 ? 's' : ''} jointe${images > 1 ? 's' : ''}]`
  return text || null
}

function parseClaudeCodeSession(file: string): ImportedConversation {
  const lines = readFileSync(file, 'utf-8').split('\n')
  const messages: ImportedMessage[] = []
  let title = ''
  let project = ''
  let pending: { text: string; at: number } | null = null
  const flush = (): void => {
    if (pending?.text.trim()) messages.push({ role: 'assistant', content: pending.text.trim(), at: pending.at })
    pending = null
  }

  for (const raw of lines) {
    if (!raw.trim()) continue
    let l: CodeLine
    try {
      l = JSON.parse(raw)
    } catch {
      continue
    }
    if (l.type === 'custom-title' && l.customTitle) title = l.customTitle
    if (!project && l.cwd) project = basename(l.cwd)
    if (l.isSidechain || l.isMeta || !l.message?.content) continue
    const at = l.timestamp ? Date.parse(l.timestamp) : Date.now()

    if (l.type === 'user' && (l.origin?.kind === 'human' || (!l.origin && typeof l.message.content === 'string'))) {
      const text = cleanUserText(l.message.content)
      if (!text) continue
      flush()
      messages.push({ role: 'user', content: text, at })
    } else if (l.type === 'assistant' && Array.isArray(l.message.content)) {
      // Une réponse est découpée en plusieurs lignes (texte, outils…) : on ne garde que le texte, regroupé.
      const text = l.message.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
      if (!text) continue
      pending = pending ? { text: `${pending.text}\n\n${text}`, at: pending.at } : { text, at }
    }
  }
  flush()
  const firstUser = messages.find((m) => m.role === 'user')?.content ?? ''
  const base = title || titleFrom(firstUser)
  return { sourceId: basename(file, '.jsonl'), title: project ? `${base} · ${project}` : base, messages }
}

export function importClaudeCode(target: { engine: EngineKind; model: string }): ImportResult {
  const dir = claudeCodeDir()
  if (!existsSync(dir)) throw new Error(`Dossier introuvable : ${dir}`)
  const convs: ImportedConversation[] = []
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    for (const f of readdirSync(join(dir, d.name))) {
      if (!f.endsWith('.jsonl')) continue
      try {
        convs.push(parseClaudeCodeSession(join(dir, d.name, f)))
      } catch {
        /* session illisible : ignorée */
      }
    }
  }
  return save('claude-code', convs, target)
}

// ---------- Export claude.ai (Paramètres → Confidentialité → Exporter les données) ----------

interface ClaudeAiConversation {
  uuid: string
  name?: string
  created_at?: string
  chat_messages?: {
    sender?: string
    text?: string
    content?: { type?: string; text?: string }[]
    created_at?: string
    attachments?: { file_name?: string; extracted_content?: string }[]
  }[]
}

export function importClaudeAiExport(file: string, target: { engine: EngineKind; model: string }): ImportResult {
  let json: string
  if (extname(file).toLowerCase() === '.zip') {
    const entry = new AdmZip(file).getEntries().find((e) => basename(e.entryName) === 'conversations.json')
    if (!entry) throw new Error('conversations.json introuvable dans ce .zip : est-ce bien un export claude.ai ?')
    json = entry.getData().toString('utf-8')
  } else {
    json = readFileSync(file, 'utf-8')
  }
  const data = JSON.parse(json) as ClaudeAiConversation[]
  if (!Array.isArray(data)) throw new Error('Format inattendu : conversations.json doit contenir une liste.')

  const convs: ImportedConversation[] = data.map((c) => {
    const messages: ImportedMessage[] = (c.chat_messages ?? []).flatMap((m) => {
      const text = (m.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n') || m.text || '').trim()
      const attachments: Attachment[] = (m.attachments ?? [])
        .filter((a) => a.extracted_content)
        .map((a) => ({
          kind: 'text' as const,
          name: a.file_name || 'fichier',
          content: (a.extracted_content ?? '').slice(0, MAX_TEXT_ATTACHMENT_CHARS)
        }))
      if (!text && !attachments.length) return []
      return [
        {
          role: m.sender === 'human' ? ('user' as const) : ('assistant' as const),
          content: text,
          attachments: attachments.length ? attachments : undefined,
          at: m.created_at ? Date.parse(m.created_at) : Date.parse(c.created_at ?? '') || Date.now()
        }
      ]
    })
    const firstUser = messages.find((m) => m.role === 'user')?.content ?? ''
    return { sourceId: c.uuid, title: c.name?.trim() || titleFrom(firstUser), messages }
  })
  return save('claude-ai', convs, target)
}

/** Lit conversations.json depuis un export (.zip ou fichier .json direct). */
function readExportJson(file: string, what: string): unknown {
  if (extname(file).toLowerCase() === '.zip') {
    const entry = new AdmZip(file).getEntries().find((e) => basename(e.entryName) === 'conversations.json')
    if (!entry) throw new Error(`conversations.json introuvable dans ce .zip : est-ce bien un export ${what} ?`)
    return JSON.parse(entry.getData().toString('utf-8'))
  }
  return JSON.parse(readFileSync(file, 'utf-8'))
}

// ---------- Export ChatGPT (Paramètres → Contrôle des données → Exporter les données) ----------

interface ChatGptNode {
  parent?: string | null
  message?: {
    author?: { role?: string }
    create_time?: number | null
    content?: { content_type?: string; parts?: unknown[] }
    metadata?: { is_visually_hidden_from_conversation?: boolean }
  } | null
}

interface ChatGptConversation {
  id?: string
  conversation_id?: string
  title?: string
  create_time?: number
  current_node?: string
  mapping?: Record<string, ChatGptNode>
}

export function importChatGptExport(file: string, target: { engine: EngineKind; model: string }): ImportResult {
  const data = readExportJson(file, 'ChatGPT') as ChatGptConversation[]
  if (!Array.isArray(data)) throw new Error('Format inattendu : conversations.json doit contenir une liste.')

  const convs: ImportedConversation[] = data.map((c) => {
    // Les messages forment un arbre (régénérations) : on suit la branche affichée, du dernier nœud à la racine.
    const chain: ChatGptNode[] = []
    let nodeId: string | null | undefined = c.current_node
    const seen = new Set<string>()
    while (nodeId && c.mapping?.[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId)
      chain.unshift(c.mapping[nodeId])
      nodeId = c.mapping[nodeId].parent
    }
    const messages: ImportedMessage[] = chain.flatMap((n) => {
      const m = n.message
      const role = m?.author?.role
      if (!m || (role !== 'user' && role !== 'assistant') || m.metadata?.is_visually_hidden_from_conversation) return []
      const text = (m.content?.parts ?? []).filter((p): p is string => typeof p === 'string').join('\n').trim()
      if (!text) return []
      const at = (m.create_time ?? c.create_time ?? Date.now() / 1000) * 1000
      return [{ role: role === 'user' ? ('user' as const) : ('assistant' as const), content: text, at }]
    })
    const firstUser = messages.find((m) => m.role === 'user')?.content ?? ''
    return { sourceId: c.conversation_id ?? c.id ?? `${c.title}-${c.create_time}`, title: c.title?.trim() || titleFrom(firstUser), messages }
  })
  return save('chatgpt', convs, target)
}

// ---------- Codex (~/.codex/sessions/AAAA/MM/JJ/rollout-*.jsonl) ----------

export function codexDir(): string {
  return join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions')
}

function* walkJsonl(dir: string): Generator<string> {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* walkJsonl(full)
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield full
  }
}

export function countCodexSessions(): number {
  let n = 0
  for (const _ of walkJsonl(codexDir())) n++
  return n
}

type CodexContent = { type?: string; text?: string }[]
interface CodexItem {
  type?: string
  role?: string
  content?: CodexContent
  id?: string
  cwd?: string
}

function parseCodexSession(file: string): ImportedConversation {
  const messages: ImportedMessage[] = []
  let sessionId = basename(file, '.jsonl')
  let project = ''
  const fallbackAt = statSync(file).mtimeMs

  for (const raw of readFileSync(file, 'utf-8').split('\n')) {
    if (!raw.trim()) continue
    let line: { timestamp?: string; type?: string; payload?: CodexItem } & CodexItem
    try {
      line = JSON.parse(raw)
    } catch {
      continue
    }
    // Deux formats : récent { type, payload } et ancien (éléments directement sur la ligne).
    const item: CodexItem = line.payload ?? line
    if (line.type === 'session_meta') {
      if (item.id) sessionId = item.id
      if (item.cwd) project = basename(item.cwd)
      continue
    }
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue
    const text = (item.content ?? [])
      .filter((c) => c.type === 'input_text' || c.type === 'output_text' || c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n')
      .trim()
    // Contexte injecté automatiquement par Codex (environnement, instructions) : pas un vrai message.
    if (!text || /^<(environment_context|user_instructions|permissions|user_shell_command)/.test(text)) continue
    const at = line.timestamp ? Date.parse(line.timestamp) : fallbackAt
    const last = messages[messages.length - 1]
    if (item.role === 'assistant' && last?.role === 'assistant') last.content += `\n\n${text}`
    else messages.push({ role: item.role, content: text, at })
  }
  const firstUser = messages.find((m) => m.role === 'user')?.content ?? ''
  const base = titleFrom(firstUser)
  return { sourceId: sessionId, title: project ? `${base} · ${project}` : base, messages }
}

export function importCodex(target: { engine: EngineKind; model: string }): ImportResult {
  const dir = codexDir()
  if (!existsSync(dir)) throw new Error(`Aucune session Codex trouvée (${dir}).`)
  const convs: ImportedConversation[] = []
  for (const f of walkJsonl(dir)) {
    try {
      convs.push(parseCodexSession(f))
    } catch {
      /* session illisible : ignorée */
    }
  }
  return save('codex', convs, target)
}
