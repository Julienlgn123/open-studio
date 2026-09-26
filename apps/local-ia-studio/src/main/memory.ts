import { randomUUID } from 'crypto'
import { getDb, getPreferences } from './db'
import type { MemoryItem } from '@shared/types'

// Mémoire longue : faits retenus sur l'utilisateur (préférences, projets, contexte), donnés au
// modèle au début de chaque conversation. Ajout : « retiens que … » dans un message, outil
// `remember` (mode Fichiers), ou Préférences → Mémoire. Tout reste dans la base locale.

const MAX_MEMORIES_IN_PROMPT = 60

function ensureTable(): void {
  getDb().exec('CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, createdAt INTEGER NOT NULL)')
}

export function listMemories(): MemoryItem[] {
  ensureTable()
  return getDb().prepare('SELECT id, content, createdAt FROM memories ORDER BY createdAt DESC').all() as MemoryItem[]
}

export function addMemory(content: string): MemoryItem {
  ensureTable()
  const text = content.trim().replace(/\s+/g, ' ').slice(0, 500)
  if (!text) throw new Error('Rien à retenir.')
  const existing = listMemories().find((m) => m.content.toLowerCase() === text.toLowerCase())
  if (existing) return existing
  const item = { id: randomUUID(), content: text, createdAt: Date.now() }
  getDb().prepare('INSERT INTO memories (id, content, createdAt) VALUES (?, ?, ?)').run(item.id, item.content, item.createdAt)
  return item
}

export function updateMemory(id: string, content: string): void {
  ensureTable()
  getDb().prepare('UPDATE memories SET content = ? WHERE id = ?').run(content.trim().slice(0, 500), id)
}

export function deleteMemory(id: string): void {
  ensureTable()
  getDb().prepare('DELETE FROM memories WHERE id = ?').run(id)
}

/** Oublie le souvenir qui correspond le mieux au texte donné (outil `forget`). */
export function forgetMatching(text: string): MemoryItem | null {
  const q = text.trim().toLowerCase()
  if (!q) return null
  const hit = listMemories().find((m) => m.content.toLowerCase().includes(q) || q.includes(m.content.toLowerCase()))
  if (hit) deleteMemory(hit.id)
  return hit ?? null
}

/**
 * « Retiens que je travaille en TypeScript », « souviens-toi : … », « n'oublie pas que … » :
 * le fait à retenir, ou null si le message n'en demande pas.
 */
export function memoryRequest(message: string): string | null {
  const m = /^\s*(?:(?:peux-tu |tu peux )?(?:retiens|retenir|souviens[- ]toi|rappelle[- ]toi|n['’]oublie pas|mémorise|garde en mémoire)\s*(?:bien\s*)?(?:que|qu['’]|de|:|,)?\s*)(.+)$/i.exec(message)
  if (!m) return null
  const fact = m[1].trim().replace(/[.!?\s]+$/, '')
  return fact.length >= 3 ? fact : null
}

/** Consignes ajoutées au prompt système : ce que le modèle sait déjà de l'utilisateur. */
export function memoryPrompt(): string | null {
  if (!getPreferences().memoryEnabled) return null
  const items = listMemories().slice(0, MAX_MEMORIES_IN_PROMPT)
  if (!items.length) return null
  return `Ce que tu sais déjà de l'utilisateur (mémoire longue, à utiliser naturellement, sans la réciter) :
${items.map((m) => `- ${m.content}`).join('\n')}`
}
