import Database from 'better-sqlite3'
import { join, resolve } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { userInfo } from 'os'
import type { AppPreferences, Attachment, ChatMessage, Conversation, ConversationSettings, SearchHit } from '@shared/types'
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS, DEFAULT_TITLE } from '@shared/types'

let db: Database.Database

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'local-ia-studio.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      engine TEXT NOT NULL,
      model TEXT NOT NULL,
      settings TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS llamacpp_models (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      addedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId);
  `)

  // Migration : pièces jointes (JSON) ajoutées après la première version.
  const columns = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'attachments')) {
    db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT')
  }
  // Migration : outils utilisés / remarque de bascule (JSON), et origine des conversations importées.
  if (!columns.some((c) => c.name === 'meta')) {
    db.exec('ALTER TABLE messages ADD COLUMN meta TEXT')
  }
  const convColumns = db.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]
  if (!convColumns.some((c) => c.name === 'source')) {
    db.exec('ALTER TABLE conversations ADD COLUMN source TEXT')
    db.exec('ALTER TABLE conversations ADD COLUMN sourceId TEXT')
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source, sourceId)')
  }
  if (!convColumns.some((c) => c.name === 'pinned')) {
    db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
  }
  // Conversations importées puis retirées par l'utilisateur : un nouvel import ne doit pas les faire revenir.
  db.exec('CREATE TABLE IF NOT EXISTS removed_imports (source TEXT NOT NULL, sourceId TEXT NOT NULL, PRIMARY KEY (source, sourceId))')
}

interface ConversationRow {
  id: string
  title: string
  engine: string
  model: string
  settings: string
  source: string | null
  pinned: number
  createdAt: number
  updatedAt: number
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    engine: row.engine as Conversation['engine'],
    model: row.model,
    settings: { ...DEFAULT_SETTINGS, ...(JSON.parse(row.settings) as Partial<ConversationSettings>) },
    source: (row.source as Conversation['source']) ?? null,
    pinned: !!row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listConversations(): Conversation[] {
  const rows = db.prepare('SELECT * FROM conversations ORDER BY updatedAt DESC').all() as ConversationRow[]
  return rows.map(rowToConversation)
}

export function getConversation(id: string): Conversation | null {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
  return row ? rowToConversation(row) : null
}

export function createConversation(
  engine: Conversation['engine'],
  model: string,
  imported?: { title: string; source: NonNullable<Conversation['source']>; sourceId: string; createdAt: number; updatedAt: number }
): Conversation {
  const now = Date.now()
  const conv: Conversation = {
    id: randomUUID(),
    title: imported?.title ?? DEFAULT_TITLE,
    engine,
    model,
    settings: { ...getPreferences().defaultSettings },
    source: imported?.source ?? null,
    pinned: false,
    createdAt: imported?.createdAt ?? now,
    updatedAt: imported?.updatedAt ?? now
  }
  db.prepare(
    'INSERT INTO conversations (id, title, engine, model, settings, source, sourceId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    conv.id,
    conv.title,
    conv.engine,
    conv.model,
    JSON.stringify(conv.settings),
    conv.source,
    imported?.sourceId ?? null,
    conv.createdAt,
    conv.updatedAt
  )
  return conv
}

/** Déjà importée, ou importée puis retirée volontairement. */
export function hasImportedConversation(source: string, sourceId: string): boolean {
  return (
    !!db.prepare('SELECT 1 FROM conversations WHERE source = ? AND sourceId = ?').get(source, sourceId) ||
    !!db.prepare('SELECT 1 FROM removed_imports WHERE source = ? AND sourceId = ?').get(source, sourceId)
  )
}

export function setConversationPinned(id: string, pinned: boolean): void {
  db.prepare('UPDATE conversations SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
}

/** Exécute un lot d'écritures dans une seule transaction (import de centaines de messages). */
export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)()
}

export function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, 'title' | 'engine' | 'model' | 'settings'>>
): void {
  const current = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
  if (!current) return
  const merged = { ...rowToConversation(current), ...patch }
  db.prepare('UPDATE conversations SET title = ?, engine = ?, model = ?, settings = ?, updatedAt = ? WHERE id = ?').run(
    merged.title,
    merged.engine,
    merged.model,
    JSON.stringify(merged.settings),
    Date.now(),
    id
  )
}

export function touchConversation(id: string): void {
  db.prepare('UPDATE conversations SET updatedAt = ? WHERE id = ?').run(Date.now(), id)
}

export function deleteConversation(id: string): void {
  // Conversation importée : seule la copie dans Local IA Studio est retirée (les fichiers de Claude,
  // ChatGPT ou Codex ne sont jamais touchés), et on s'en souvient pour ne pas la réimporter.
  const row = db.prepare('SELECT source, sourceId FROM conversations WHERE id = ?').get(id) as
    | { source: string | null; sourceId: string | null }
    | undefined
  if (row?.source && row.sourceId) {
    db.prepare('INSERT OR IGNORE INTO removed_imports (source, sourceId) VALUES (?, ?)').run(row.source, row.sourceId)
  }
  // Les messages suivent via ON DELETE CASCADE (foreign_keys activé).
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

interface MessageRow {
  id: string
  role: ChatMessage['role']
  content: string
  attachments: string | null
  meta: string | null
  createdAt: number
}

export interface MessageMeta {
  tools?: string[]
  notice?: string
}

export function getMessages(conversationId: string): ChatMessage[] {
  const rows = db
    .prepare('SELECT id, role, content, attachments, meta, createdAt FROM messages WHERE conversationId = ? ORDER BY rowid ASC')
    .all(conversationId) as MessageRow[]
  return rows.map(({ attachments, meta, ...m }) => ({
    ...m,
    ...(attachments ? { attachments: JSON.parse(attachments) as Attachment[] } : {}),
    ...(meta ? (JSON.parse(meta) as MessageMeta) : {})
  }))
}

export function addMessage(
  conversationId: string,
  role: ChatMessage['role'],
  content: string,
  attachments?: Attachment[],
  meta?: MessageMeta,
  /** Import : date d'origine, sans toucher à la date de mise à jour de la conversation. */
  importedAt?: number
): ChatMessage {
  const msg: ChatMessage = { id: randomUUID(), role, content, createdAt: importedAt ?? Date.now() }
  if (attachments?.length) msg.attachments = attachments
  const cleanMeta: MessageMeta = {}
  if (meta?.tools?.length) cleanMeta.tools = meta.tools
  if (meta?.notice) cleanMeta.notice = meta.notice
  Object.assign(msg, cleanMeta)
  db.prepare(
    'INSERT INTO messages (id, conversationId, role, content, attachments, meta, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    msg.id,
    conversationId,
    msg.role,
    msg.content,
    msg.attachments ? JSON.stringify(msg.attachments) : null,
    Object.keys(cleanMeta).length ? JSON.stringify(cleanMeta) : null,
    msg.createdAt
  )
  if (importedAt === undefined) touchConversation(conversationId)
  return msg
}

export function deleteMessagesFrom(conversationId: string, fromMessageId: string): void {
  // rowid suit l'ordre d'insertion, plus fiable que createdAt (deux messages peuvent partager la même milliseconde).
  const row = db.prepare('SELECT rowid FROM messages WHERE id = ? AND conversationId = ?').get(fromMessageId, conversationId) as
    | { rowid: number }
    | undefined
  if (!row) return
  db.prepare('DELETE FROM messages WHERE conversationId = ? AND rowid >= ?').run(conversationId, row.rowid)
}

export function deleteMessage(messageId: string): void {
  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId)
}

/** Recherche plein texte simple (titres + contenu des messages), insensible à la casse. */
export function searchConversations(query: string): SearchHit[] {
  const q = query.trim()
  if (!q) return []
  const like = `%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`
  const hits = new Map<string, SearchHit>()
  const titleRows = db
    .prepare("SELECT id FROM conversations WHERE title LIKE ? ESCAPE '!' ORDER BY updatedAt DESC")
    .all(like) as { id: string }[]
  for (const r of titleRows) hits.set(r.id, { conversationId: r.id, snippet: null })

  const msgRows = db
    .prepare(
      `SELECT m.conversationId, m.content FROM messages m
       JOIN conversations c ON c.id = m.conversationId
       WHERE m.content LIKE ? ESCAPE '!' ORDER BY c.updatedAt DESC, m.rowid ASC`
    )
    .all(like) as { conversationId: string; content: string }[]
  for (const r of msgRows) {
    const existing = hits.get(r.conversationId)
    if (existing?.snippet) continue
    hits.set(r.conversationId, { conversationId: r.conversationId, snippet: makeSnippet(r.content, q) })
  }
  return [...hits.values()]
}

function makeSnippet(content: string, query: string): string {
  const flat = content.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ')
  const idx = flat.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return flat.slice(0, 80)
  const start = Math.max(0, idx - 30)
  const end = Math.min(flat.length, idx + query.length + 50)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

export function getPreferences(): AppPreferences {
  const row = db.prepare("SELECT value FROM preferences WHERE key = 'app'").get() as { value: string } | undefined
  const parsed = row ? (JSON.parse(row.value) as Partial<AppPreferences>) : {}
  return {
    ...DEFAULT_PREFERENCES,
    ...parsed,
    userName: parsed.userName || systemFirstName(),
    // « C:/a » et « C:\a » désignent le même dossier : normalisés et dédoublonnés.
    workspaceRoots: [...new Set((parsed.workspaceRoots ?? []).map((r) => resolve(r)))],
    defaultSettings: { ...DEFAULT_SETTINGS, ...(parsed.defaultSettings ?? {}) }
  }
}

export function setPreferences(prefs: AppPreferences): void {
  setRawPreference('app', JSON.stringify(prefs))
}

/** Valeur brute de la table preferences (ex. clé API chiffrée), hors de l'objet AppPreferences. */
export function getRawPreference(key: string): string | null {
  const row = db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setRawPreference(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)').run(key, value)
}

export function deleteRawPreference(key: string): void {
  db.prepare('DELETE FROM preferences WHERE key = ?').run(key)
}

export function listLlamaCppModels(): { path: string; name: string; addedAt: number }[] {
  return db.prepare('SELECT * FROM llamacpp_models ORDER BY addedAt DESC').all() as {
    path: string
    name: string
    addedAt: number
  }[]
}

export function addLlamaCppModel(path: string, name: string): void {
  db.prepare('INSERT OR REPLACE INTO llamacpp_models (path, name, addedAt) VALUES (?, ?, ?)').run(
    path,
    name,
    Date.now()
  )
}

export function removeLlamaCppModel(path: string): void {
  db.prepare('DELETE FROM llamacpp_models WHERE path = ?').run(path)
}

/** Nom de session du système, comme valeur par défaut pour « Bonjour, … ». */
function systemFirstName(): string {
  try {
    const raw = userInfo().username.replace(/[^\p{L}]+.*$/u, '')
    return raw ? raw[0].toUpperCase() + raw.slice(1) : ''
  } catch {
    return ''
  }
}
