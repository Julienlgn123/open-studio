import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { ChatMessage, Conversation, ConversationSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

let db: Database.Database

export function initDb(): void {
  db = new Database(join(app.getPath('userData'), 'local-ia-studio.db'))
  db.pragma('journal_mode = WAL')

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
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId);
  `)
}

interface ConversationRow {
  id: string
  title: string
  engine: string
  model: string
  settings: string
  createdAt: number
  updatedAt: number
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    engine: row.engine as Conversation['engine'],
    model: row.model,
    settings: JSON.parse(row.settings) as ConversationSettings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listConversations(): Conversation[] {
  const rows = db.prepare('SELECT * FROM conversations ORDER BY updatedAt DESC').all() as ConversationRow[]
  return rows.map(rowToConversation)
}

export function createConversation(engine: 'ollama' | 'llamacpp', model: string): Conversation {
  const now = Date.now()
  const conv: Conversation = {
    id: randomUUID(),
    title: 'Nouvelle conversation',
    engine,
    model,
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now
  }
  db.prepare(
    'INSERT INTO conversations (id, title, engine, model, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(conv.id, conv.title, conv.engine, conv.model, JSON.stringify(conv.settings), conv.createdAt, conv.updatedAt)
  return conv
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
  db.prepare('DELETE FROM messages WHERE conversationId = ?').run(id)
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function getMessages(conversationId: string): ChatMessage[] {
  return db
    .prepare('SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC')
    .all(conversationId) as ChatMessage[]
}

export function addMessage(conversationId: string, role: ChatMessage['role'], content: string): ChatMessage {
  const msg: ChatMessage = { id: randomUUID(), role, content, createdAt: Date.now() }
  db.prepare('INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)').run(
    msg.id,
    conversationId,
    msg.role,
    msg.content,
    msg.createdAt
  )
  touchConversation(conversationId)
  return msg
}

export function deleteMessagesFrom(conversationId: string, fromMessageId: string): void {
  const row = db.prepare('SELECT createdAt FROM messages WHERE id = ?').get(fromMessageId) as
    | { createdAt: number }
    | undefined
  if (!row) return
  db.prepare('DELETE FROM messages WHERE conversationId = ? AND createdAt >= ?').run(conversationId, row.createdAt)
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
