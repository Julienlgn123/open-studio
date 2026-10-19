import { randomUUID } from 'crypto'
import { readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { getDb } from './db'
import type { KbCollection, KbDoc, KbHit } from '@shared/types'

// Bibliothèque de documents : tes fichiers (PDF, Word, notes, code…) découpés en extraits et
// indexés en plein texte (SQLite FTS5). Quand une bibliothèque est branchée sur une conversation,
// les extraits les plus proches de la question sont donnés au modèle, avec leur source.
// Fonctionne avec tous les moteurs, sans modèle d'embeddings ; tout reste sur le PC.

/* eslint-disable @typescript-eslint/no-var-requires */
const TEXT_EXT = new Set(
  '.txt .md .markdown .csv .tsv .json .yaml .yml .xml .html .htm .css .js .jsx .ts .tsx .mjs .cjs .py .java .c .h .cpp .hpp .cs .go .rs .rb .php .swift .kt .sql .sh .ps1 .bat .ini .toml .tex .rtf .log .vue .svelte .lua .r .m .scala .dart'.split(
    ' '
  )
)
const DOC_EXT = new Set(['.pdf', '.docx', '.odt'])
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'build', 'out', '.next', '__pycache__', '.venv', 'venv', 'target', '.cache'])
const MAX_FILE = 20 * 1024 * 1024
const MAX_FILES = 3000
const CHUNK = 1100
const OVERLAP = 160

let ready = false
function ensure(): void {
  if (ready) return
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kb_docs (
      id TEXT PRIMARY KEY, collectionId TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL,
      size INTEGER NOT NULL, mtime INTEGER NOT NULL, chunks INTEGER NOT NULL, addedAt INTEGER NOT NULL, error TEXT
    );
    CREATE INDEX IF NOT EXISTS kb_docs_col ON kb_docs(collectionId);
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(text, docId UNINDEXED, collectionId UNINDEXED, idx UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
  `)
  ready = true
}

export function isSupported(path: string): boolean {
  const e = extname(path).toLowerCase()
  return TEXT_EXT.has(e) || DOC_EXT.has(e)
}

async function extract(path: string): Promise<string> {
  const ext = extname(path).toLowerCase()
  const buffer = readFileSync(path)
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      return String((await parser.getText()).text ?? '')
    } finally {
      await parser.destroy()
    }
  }
  if (ext === '.docx') return String((await require('mammoth').extractRawText({ buffer })).value ?? '')
  if (ext === '.odt') {
    const JSZip = require('jszip')
    const xml: string = await (await JSZip.loadAsync(buffer)).file('content.xml')?.async('string')
    return (xml ?? '').replace(/<text:(p|h)[^>]*>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  }
  const text = buffer.toString('utf8')
  // Fichier binaire déguisé : on l'ignore.
  if (text.slice(0, 4000).includes('\u0000')) throw new Error('Fichier binaire')
  return ext === '.html' || ext === '.htm' ? text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ') : text
}

/** Découpe en extraits d'environ 1 100 caractères, en coupant de préférence entre deux paragraphes. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  const out: string[] = []
  let i = 0
  while (i < clean.length) {
    let end = Math.min(clean.length, i + CHUNK)
    if (end < clean.length) {
      const para = clean.lastIndexOf('\n\n', end)
      const sentence = clean.lastIndexOf('. ', end)
      if (para > i + CHUNK * 0.5) end = para
      else if (sentence > i + CHUNK * 0.5) end = sentence + 1
    }
    const piece = clean.slice(i, end).trim()
    if (piece) out.push(piece)
    if (end >= clean.length) break
    // Recouvrement : on repart un peu avant, au début d'un mot.
    let next = Math.max(end - OVERLAP, i + 1)
    const sp = clean.indexOf(' ', next)
    if (sp > 0 && sp < end) next = sp + 1
    i = next
  }
  return out
}

function walk(path: string, acc: string[]): void {
  if (acc.length >= MAX_FILES) return
  let st
  try {
    st = statSync(path)
  } catch {
    return
  }
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(basename(path))) return
    let entries: string[] = []
    try {
      entries = readdirSync(path)
    } catch {
      return
    }
    for (const e of entries) if (!e.startsWith('.')) walk(join(path, e), acc)
  } else if (st.isFile() && st.size <= MAX_FILE && isSupported(path)) acc.push(path)
}

// ─── Collections ───────────────────────────────────────────────────────────────────────────

export function listCollections(): KbCollection[] {
  ensure()
  return getDb()
    .prepare(
      `SELECT c.id, c.name, c.createdAt, COUNT(d.id) AS docs, COALESCE(SUM(d.chunks), 0) AS chunks, COALESCE(SUM(d.size), 0) AS bytes
       FROM kb_collections c LEFT JOIN kb_docs d ON d.collectionId = c.id GROUP BY c.id ORDER BY c.createdAt`
    )
    .all() as KbCollection[]
}

export function createCollection(name: string): KbCollection {
  ensure()
  const c = { id: randomUUID(), name: name.trim() || 'Bibliothèque', createdAt: Date.now() }
  getDb().prepare('INSERT INTO kb_collections (id, name, createdAt) VALUES (?, ?, ?)').run(c.id, c.name, c.createdAt)
  return { ...c, docs: 0, chunks: 0, bytes: 0 }
}

export function renameCollection(id: string, name: string): void {
  ensure()
  getDb().prepare('UPDATE kb_collections SET name = ? WHERE id = ?').run(name.trim(), id)
}

export function deleteCollection(id: string): void {
  ensure()
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM kb_fts WHERE collectionId = ?').run(id)
    db.prepare('DELETE FROM kb_docs WHERE collectionId = ?').run(id)
    db.prepare('DELETE FROM kb_collections WHERE id = ?').run(id)
  })()
}

export function listDocs(collectionId: string): KbDoc[] {
  ensure()
  return getDb().prepare('SELECT * FROM kb_docs WHERE collectionId = ? ORDER BY name COLLATE NOCASE').all(collectionId) as KbDoc[]
}

export function removeDoc(id: string): void {
  ensure()
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM kb_fts WHERE docId = ?').run(id)
    db.prepare('DELETE FROM kb_docs WHERE id = ?').run(id)
  })()
}

async function indexFile(collectionId: string, path: string, existing?: KbDoc): Promise<void> {
  const db = getDb()
  const st = statSync(path)
  const id = existing?.id ?? randomUUID()
  let chunks: string[] = []
  let error: string | null = null
  try {
    chunks = chunkText(await extract(path))
    if (!chunks.length) error = 'Aucun texte (PDF scanné ?)'
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 200) : String(err)
  }
  db.transaction(() => {
    db.prepare('DELETE FROM kb_fts WHERE docId = ?').run(id)
    const ins = db.prepare('INSERT INTO kb_fts (text, docId, collectionId, idx) VALUES (?, ?, ?, ?)')
    chunks.forEach((c, i) => ins.run(c, id, collectionId, i))
    db.prepare(
      `INSERT INTO kb_docs (id, collectionId, path, name, size, mtime, chunks, addedAt, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, chunks = excluded.chunks, error = excluded.error`
    ).run(id, collectionId, path, basename(path), st.size, Math.round(st.mtimeMs), chunks.length, existing?.addedAt ?? Date.now(), error)
  })()
}

/** Ajoute des fichiers ou dossiers (parcourus récursivement). Déjà présents et inchangés : ignorés. */
export async function addPaths(collectionId: string, paths: string[], progress: (done: number, total: number, name: string) => void): Promise<{ added: number; skipped: number; failed: number }> {
  ensure()
  const files: string[] = []
  for (const p of paths) walk(p, files)
  const known = new Map(listDocs(collectionId).map((d) => [d.path, d]))
  let added = 0
  let skipped = 0
  let failed = 0
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    progress(i, files.length, basename(f))
    const prev = known.get(f)
    try {
      const st = statSync(f)
      if (prev && prev.mtime === Math.round(st.mtimeMs) && prev.size === st.size) {
        skipped++
        continue
      }
      await indexFile(collectionId, f, prev)
      added++
    } catch {
      failed++
    }
    // Laisse respirer la boucle d'événements sur les gros dossiers.
    if (i % 20 === 19) await new Promise((r) => setImmediate(r))
  }
  progress(files.length, files.length, '')
  return { added, skipped, failed }
}

/** Relit les fichiers modifiés depuis l'indexation et retire ceux qui ont disparu. */
export async function refreshCollection(collectionId: string, progress: (done: number, total: number, name: string) => void): Promise<{ updated: number; removed: number }> {
  ensure()
  const docs = listDocs(collectionId)
  let updated = 0
  let removed = 0
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]
    progress(i, docs.length, d.name)
    let st
    try {
      st = statSync(d.path)
    } catch {
      removeDoc(d.id)
      removed++
      continue
    }
    if (Math.round(st.mtimeMs) !== d.mtime || st.size !== d.size) {
      await indexFile(collectionId, d.path, d)
      updated++
    }
  }
  progress(docs.length, docs.length, '')
  return { updated, removed }
}

// ─── Recherche ─────────────────────────────────────────────────────────────────────────────

const STOP = new Set(
  'les des une un le la de du et ou en au aux est sont passe pour par sur dans avec que qui quoi quel quelle quels quelles comment pourquoi est-ce ce cette ces mon ma mes ton ta tes son sa ses nous vous ils elles leur leurs pas plus moins tres tout tous toute faire fait peux peut dois doit the and for with what how why this that from are you your can explique moi dit dire donne liste resume'.split(
    ' '
  )
)

/** Requête FTS5 à partir d'une question en langage naturel (mots importants, OU, préfixes). */
export function ftsQuery(question: string): string | null {
  const words = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[a-z0-9]{3,}/g)
  if (!words) return null
  const uniq = [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 24)
  if (!uniq.length) return null
  return uniq.map((w) => (w.length >= 5 ? `"${w}"*` : `"${w}"`)).join(' OR ')
}

export function search(collectionIds: string[], question: string, limit = 6): KbHit[] {
  ensure()
  const q = ftsQuery(question)
  if (!q || !collectionIds.length) return []
  const marks = collectionIds.map(() => '?').join(',')
  try {
    const rows = getDb()
      .prepare(
        `SELECT f.text, f.docId, f.idx, d.name, d.path, bm25(kb_fts) AS score
         FROM kb_fts f JOIN kb_docs d ON d.id = f.docId
         WHERE kb_fts MATCH ? AND f.collectionId IN (${marks})
         ORDER BY score LIMIT ?`
      )
      .all(q, ...collectionIds, limit * 3) as (KbHit & { score: number })[]
    // Au plus 3 extraits par document, pour varier les sources.
    const perDoc = new Map<string, number>()
    const out: KbHit[] = []
    for (const r of rows) {
      const n = perDoc.get(r.docId) ?? 0
      if (n >= 3) continue
      perDoc.set(r.docId, n + 1)
      out.push({ text: r.text, docId: r.docId, idx: r.idx, name: r.name, path: r.path })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

/** Message système avec les extraits trouvés, à placer juste avant la question. */
export function contextPrompt(hits: KbHit[], budgetChars: number): string {
  let used = 0
  const parts: string[] = []
  hits.forEach((h, i) => {
    if (used + h.text.length > budgetChars) return
    used += h.text.length
    parts.push(`[${i + 1}] ${h.name} (extrait ${h.idx + 1})\n${h.text}`)
  })
  return (
    "Extraits de la bibliothèque de documents de l'utilisateur, trouvés pour sa question. " +
    'Appuie-toi dessus quand ils sont utiles et cite la source entre crochets, ex. [1]. ' +
    "S'ils ne contiennent pas la réponse, dis-le plutôt que d'inventer.\n\n" +
    parts.join('\n\n---\n\n')
  )
}
