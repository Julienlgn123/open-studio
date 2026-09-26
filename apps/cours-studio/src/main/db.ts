import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import type { Subject, Course, CourseVersion, Tag, Attachment, QuizResult, Flashcard } from '../shared/types'

let db: Database.Database
let currentDbPath = ''

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/** Accès direct à la base (synchro entre PC : lecture/écriture de cours complets). */
export function getDb(): Database.Database {
  return db
}

export function getDbPath(): string {
  return currentDbPath
}

// Flush the WAL into the main .db file so a file-copy backup is complete
export function checkpointDb(): void {
  try { db.pragma('wal_checkpoint(TRUNCATE)') } catch { /* ok */ }
}

export function closeDb(): void {
  try { db.close() } catch { /* ok */ }
}

export function initDb(): void {
  // Must be called after app.whenReady() so app.getPath works correctly
  const dbPath = join(app.getPath('userData'), 'cours-studio.db')
  currentDbPath = dbPath
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📚',
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Sans titre',
      emoji TEXT NOT NULL DEFAULT '📝',
      content TEXT NOT NULL DEFAULT '',
      audio_path TEXT,
      video_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS course_versions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      label TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      ai_action TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🏷️',
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS course_tags (
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (course_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_results (
      id TEXT PRIMARY KEY,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      topic TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      interval_days REAL NOT NULL DEFAULT 0,
      ease REAL NOT NULL DEFAULT 2.5,
      due_at INTEGER NOT NULL,
      reps INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      seconds INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  // Migration: add emoji column to courses if it doesn't exist yet
  const courseCols = db.prepare("PRAGMA table_info(courses)").all() as Array<{ name: string }>
  if (!courseCols.find((c) => c.name === 'emoji')) {
    db.exec("ALTER TABLE courses ADD COLUMN emoji TEXT NOT NULL DEFAULT '📝'")
  }
  if (!courseCols.find((c) => c.name === 'deleted_at')) {
    db.exec('ALTER TABLE courses ADD COLUMN deleted_at INTEGER')
  }

  // Migration: reorderable sidebar + trash, for databases created before either existed
  const subjectCols = db.prepare("PRAGMA table_info(subjects)").all() as Array<{ name: string }>
  if (!subjectCols.find((c) => c.name === 'sort_order')) {
    db.exec('ALTER TABLE subjects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
  }
  if (!subjectCols.find((c) => c.name === 'deleted_at')) {
    db.exec('ALTER TABLE subjects ADD COLUMN deleted_at INTEGER')
  }
}

// How long a soft-deleted subject/course stays recoverable before purgeOldTrash() removes
// it for good.
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// ─── Subjects ──────────────────────────────────────────────────────────────

export function getSubjects(): Subject[] {
  return (db.prepare('SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at DESC').all() as DbSubject[])
    .map(rowToSubject)
}

export function createSubject(data: Omit<Subject, 'id' | 'createdAt' | 'sortOrder'>): Subject {
  const id = generateId()
  const now = Date.now()
  // New subjects should surface at the top of the (sort_order ASC) list, same spot
  // "most recent first" put them before drag-to-reorder existed.
  const { min } = db.prepare('SELECT MIN(sort_order) AS min FROM subjects').get() as { min: number | null }
  const sortOrder = (min ?? 0) - 1
  db.prepare('INSERT INTO subjects (id, name, emoji, color, created_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, data.name, data.emoji, data.color, now, sortOrder)
  return { id, ...data, createdAt: now, sortOrder }
}

export function updateSubject(id: string, data: Partial<Omit<Subject, 'id' | 'createdAt'>>): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (data.name !== undefined)  { fields.push('name = ?');  values.push(data.name) }
  if (data.emoji !== undefined) { fields.push('emoji = ?'); values.push(data.emoji) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

// Re-indexes every subject's sort_order to match this exact order (drag-and-drop in the
// sidebar hands back the full list every time, so a full re-index is simplest and can't
// drift). Spaced by 10 rather than 1 — harmless, just leaves room if we ever want to
// insert a computed position between two rows without renumbering everything again.
export function reorderSubjects(orderedIds: string[]): void {
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => {
      db.prepare('UPDATE subjects SET sort_order = ? WHERE id = ?').run(i * 10, id)
    })
  })
  tx()
}

// Moves a subject (and, cascading, the courses it had at that moment) to the trash instead
// of deleting rows outright — recoverable for TRASH_RETENTION_MS via restoreSubject().
export function softDeleteSubject(id: string): void {
  const now = Date.now()
  const tx = db.transaction(() => {
    db.prepare('UPDATE subjects SET deleted_at = ? WHERE id = ?').run(now, id)
    db.prepare('UPDATE courses SET deleted_at = ? WHERE subject_id = ? AND deleted_at IS NULL').run(now, id)
  })
  tx()
}

// Only restores the courses that were trashed AT THE SAME TIME as the subject (same
// deleted_at) — a course the user had already individually trashed earlier stays trashed
// on its own, rather than resurfacing as a side effect of restoring its subject.
export function restoreSubject(id: string): void {
  const row = db.prepare('SELECT deleted_at FROM subjects WHERE id = ?').get(id) as { deleted_at: number | null } | undefined
  if (!row || row.deleted_at == null) return
  const deletedAt = row.deleted_at
  const tx = db.transaction(() => {
    db.prepare('UPDATE subjects SET deleted_at = NULL WHERE id = ?').run(id)
    db.prepare('UPDATE courses SET deleted_at = NULL WHERE subject_id = ? AND deleted_at = ?').run(id, deletedAt)
  })
  tx()
}

export interface TrashedSubject extends Subject { courseCount: number }

export function getTrashedSubjects(): TrashedSubject[] {
  const rows = db.prepare('SELECT * FROM subjects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all() as DbSubject[]
  return rows.map((r) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM courses WHERE subject_id = ?').get(r.id) as { n: number }
    return { ...rowToSubject(r), courseCount: n }
  })
}

// Deletes the courses (and their versions/tags/attachments/flashcards rows) by hand rather
// than relying on the schema's ON DELETE CASCADE: a db file created before that clause existed
// keeps its original table definition forever (SQLite doesn't retrofit constraints), so this
// stays correct regardless of when the user's local database was first created.
// Returns the deleted courses so the caller can clean up their files on disk.
export function permanentlyDeleteSubject(id: string): Course[] {
  const courses = (db.prepare('SELECT * FROM courses WHERE subject_id = ?').all(id) as DbCourse[]).map(rowToCourse)
  const tx = db.transaction(() => {
    for (const c of courses) {
      db.prepare('DELETE FROM course_versions WHERE course_id = ?').run(c.id)
      db.prepare('DELETE FROM course_tags WHERE course_id = ?').run(c.id)
      db.prepare('DELETE FROM attachments WHERE course_id = ?').run(c.id)
      db.prepare('DELETE FROM flashcards WHERE course_id = ?').run(c.id)
      db.prepare('UPDATE quiz_results SET course_id = NULL WHERE course_id = ?').run(c.id)
    }
    db.prepare('DELETE FROM courses WHERE subject_id = ?').run(id)
    db.prepare('DELETE FROM subjects WHERE id = ?').run(id)
  })
  tx()
  return courses
}

// ─── Courses ───────────────────────────────────────────────────────────────

export function getCoursesBySubject(subjectId: string): Course[] {
  return (db.prepare('SELECT * FROM courses WHERE subject_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(subjectId) as DbCourse[])
    .map(rowToCourse)
}

export function getCourse(id: string): Course | null {
  const row = db.prepare('SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL').get(id) as DbCourse | undefined
  return row ? rowToCourse(row) : null
}

export function createCourse(data: {
  subjectId: string; title?: string; emoji?: string; content?: string; audioPath?: string; videoPath?: string
}): Course {
  const id = generateId()
  const now = Date.now()
  db.prepare(
    'INSERT INTO courses (id, subject_id, title, emoji, content, audio_path, video_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.subjectId, data.title ?? 'Sans titre', data.emoji ?? '📝', data.content ?? '', data.audioPath ?? null, data.videoPath ?? null, now, now)
  return { id, subjectId: data.subjectId, title: data.title ?? 'Sans titre', emoji: data.emoji ?? '📝', content: data.content ?? '', audioPath: data.audioPath, videoPath: data.videoPath, tagIds: [], versions: [], createdAt: now, updatedAt: now }
}

export function updateCourse(id: string, data: Partial<{ title: string; emoji: string; content: string; subjectId: string; audioPath: string; videoPath: string }>): void {
  const fields: string[] = ['updated_at = ?']
  const values: unknown[] = [Date.now()]
  if (data.title !== undefined)     { fields.push('title = ?');      values.push(data.title) }
  if (data.emoji !== undefined)     { fields.push('emoji = ?');      values.push(data.emoji) }
  if (data.content !== undefined)   { fields.push('content = ?');    values.push(data.content) }
  if (data.subjectId !== undefined) { fields.push('subject_id = ?'); values.push(data.subjectId) }
  if (data.audioPath !== undefined) { fields.push('audio_path = ?'); values.push(data.audioPath) }
  if (data.videoPath !== undefined) { fields.push('video_path = ?'); values.push(data.videoPath) }
  values.push(id)
  db.prepare(`UPDATE courses SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function softDeleteCourse(id: string): void {
  db.prepare('UPDATE courses SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
}

export function restoreCourse(id: string): void {
  db.prepare('UPDATE courses SET deleted_at = NULL WHERE id = ?').run(id)
}

// Individually-trashed courses whose subject is still active — a course trashed as part of
// a whole subject going to the trash is shown (and restored) under that subject instead.
export function getTrashedCourses(): Course[] {
  const rows = db.prepare(`
    SELECT c.* FROM courses c
    JOIN subjects s ON s.id = c.subject_id
    WHERE c.deleted_at IS NOT NULL AND s.deleted_at IS NULL
    ORDER BY c.deleted_at DESC
  `).all() as DbCourse[]
  return rows.map(rowToCourse)
}

export function permanentlyDeleteCourse(id: string): Course | null {
  const row = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as DbCourse | undefined
  if (!row) return null
  const course = rowToCourse(row)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM course_versions WHERE course_id = ?').run(id)
    db.prepare('DELETE FROM course_tags WHERE course_id = ?').run(id)
    db.prepare('DELETE FROM attachments WHERE course_id = ?').run(id)
    db.prepare('DELETE FROM flashcards WHERE course_id = ?').run(id)
    db.prepare('UPDATE quiz_results SET course_id = NULL WHERE course_id = ?').run(id)
    db.prepare('DELETE FROM courses WHERE id = ?').run(id)
  })
  tx()
  return course
}

// Everything currently in the trash, regardless of age ("Vider la corbeille").
export function emptyTrash(): Course[] {
  const purged: Course[] = []
  const subjectIds = (db.prepare('SELECT id FROM subjects WHERE deleted_at IS NOT NULL').all() as Array<{ id: string }>).map((r) => r.id)
  for (const id of subjectIds) purged.push(...permanentlyDeleteSubject(id))
  const courseIds = (db.prepare('SELECT id FROM courses WHERE deleted_at IS NOT NULL').all() as Array<{ id: string }>).map((r) => r.id)
  for (const id of courseIds) { const c = permanentlyDeleteCourse(id); if (c) purged.push(c) }
  return purged
}

// Only what's past TRASH_RETENTION_MS ("app startup housekeeping", not user-initiated).
export function purgeOldTrash(): Course[] {
  const cutoff = Date.now() - TRASH_RETENTION_MS
  const purged: Course[] = []
  const subjectIds = (db.prepare('SELECT id FROM subjects WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff) as Array<{ id: string }>).map((r) => r.id)
  for (const id of subjectIds) purged.push(...permanentlyDeleteSubject(id))
  const courseIds = (db.prepare('SELECT id FROM courses WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff) as Array<{ id: string }>).map((r) => r.id)
  for (const id of courseIds) { const c = permanentlyDeleteCourse(id); if (c) purged.push(c) }
  return purged
}

export function getAllCourses(): Course[] {
  return (db.prepare('SELECT * FROM courses WHERE deleted_at IS NULL ORDER BY created_at DESC').all() as DbCourse[]).map(rowToCourse)
}

// ─── Versions ──────────────────────────────────────────────────────────────

export function getVersions(courseId: string): CourseVersion[] {
  return (db.prepare('SELECT * FROM course_versions WHERE course_id = ? ORDER BY created_at DESC').all(courseId) as DbVersion[])
    .map(rowToVersion)
}

export function createVersion(data: Omit<CourseVersion, 'id' | 'createdAt'>): CourseVersion {
  const id = generateId()
  const now = Date.now()
  db.prepare('INSERT INTO course_versions (id, course_id, content, label, source, ai_action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, data.courseId, data.content, data.label, data.source, data.aiAction ?? null, now)
  return { id, ...data, createdAt: now }
}

// ─── Tags ──────────────────────────────────────────────────────────────────

export function getTags(): Tag[] {
  return (db.prepare('SELECT * FROM tags ORDER BY name ASC').all() as DbTag[]).map(rowToTag)
}

export function createTag(data: Omit<Tag, 'id' | 'createdAt'>): Tag {
  const id = generateId()
  const now = Date.now()
  db.prepare('INSERT INTO tags (id, name, emoji, color, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, data.name, data.emoji, data.color, now)
  return { id, ...data, createdAt: now }
}

export function updateTag(id: string, data: Partial<Omit<Tag, 'id' | 'createdAt'>>): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (data.name !== undefined)  { fields.push('name = ?');  values.push(data.name) }
  if (data.emoji !== undefined) { fields.push('emoji = ?'); values.push(data.emoji) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteTag(id: string): void {
  db.prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function setCourseTags(courseId: string, tagIds: string[]): void {
  db.prepare('DELETE FROM course_tags WHERE course_id = ?').run(courseId)
  const insert = db.prepare('INSERT OR IGNORE INTO course_tags (course_id, tag_id) VALUES (?, ?)')
  for (const tagId of tagIds) insert.run(courseId, tagId)
}

function getTagIdsForCourse(courseId: string): string[] {
  return (db.prepare('SELECT tag_id FROM course_tags WHERE course_id = ?').all(courseId) as Array<{ tag_id: string }>)
    .map((r) => r.tag_id)
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export function getAttachments(courseId: string): Attachment[] {
  return (db.prepare('SELECT * FROM attachments WHERE course_id = ? ORDER BY created_at DESC').all(courseId) as DbAttachment[])
    .map(rowToAttachment)
}

export function createAttachment(data: Omit<Attachment, 'id' | 'createdAt'>): Attachment {
  const id = generateId()
  const now = Date.now()
  db.prepare('INSERT INTO attachments (id, course_id, file_name, file_path, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, data.courseId, data.fileName, data.filePath, data.size, now)
  return { id, ...data, createdAt: now }
}

export function deleteAttachment(id: string): Attachment | null {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as DbAttachment | undefined
  if (!row) return null
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  return rowToAttachment(row)
}

// ─── Quiz results ────────────────────────────────────────────────────────────

export function getQuizResults(): QuizResult[] {
  return (db.prepare('SELECT * FROM quiz_results ORDER BY created_at DESC LIMIT 200').all() as DbQuizResult[]).map(rowToQuizResult)
}

export function createQuizResult(data: Omit<QuizResult, 'id' | 'createdAt'>): QuizResult {
  const id = generateId()
  const now = Date.now()
  db.prepare('INSERT INTO quiz_results (id, course_id, topic, score, total, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, data.courseId ?? null, data.topic, data.score, data.total, now)
  return { id, ...data, createdAt: now }
}

// ─── Flashcards ──────────────────────────────────────────────────────────────

export function getFlashcards(courseId: string): Flashcard[] {
  return (db.prepare('SELECT * FROM flashcards WHERE course_id = ? ORDER BY due_at ASC').all(courseId) as DbFlashcard[]).map(rowToFlashcard)
}

export function getDueFlashcards(courseId: string): Flashcard[] {
  return (db.prepare('SELECT * FROM flashcards WHERE course_id = ? AND due_at <= ? ORDER BY due_at ASC').all(courseId, Date.now()) as DbFlashcard[]).map(rowToFlashcard)
}

// All flashcards due right now, across every course (global review session)
export function getAllDueFlashcards(): Flashcard[] {
  return (db.prepare('SELECT * FROM flashcards WHERE due_at <= ? ORDER BY due_at ASC').all(Date.now()) as DbFlashcard[]).map(rowToFlashcard)
}

export function countAllDueFlashcards(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM flashcards WHERE due_at <= ?').get(Date.now()) as { n: number }
  return row.n
}

// Every flashcard, optionally scoped to one course — used by the Anki export
export function getFlashcardsForExport(courseId?: string): Array<Flashcard & { courseTitle: string; subjectName: string }> {
  const sql = `
    SELECT f.*, c.title AS course_title, s.name AS subject_name
    FROM flashcards f
    JOIN courses c ON c.id = f.course_id
    JOIN subjects s ON s.id = c.subject_id
    ${courseId ? 'WHERE f.course_id = ?' : ''}
    ORDER BY s.name, c.title, f.created_at`
  const rows = (courseId ? db.prepare(sql).all(courseId) : db.prepare(sql).all()) as Array<DbFlashcard & { course_title: string; subject_name: string }>
  return rows.map((r) => ({ ...rowToFlashcard(r), courseTitle: r.course_title, subjectName: r.subject_name }))
}

export function createFlashcards(courseId: string, cards: { front: string; back: string }[]): Flashcard[] {
  const now = Date.now()
  const insert = db.prepare('INSERT INTO flashcards (id, course_id, front, back, interval_days, ease, due_at, reps, created_at) VALUES (?, ?, ?, ?, 0, 2.5, ?, 0, ?)')
  return cards.map((c) => {
    const id = generateId()
    insert.run(id, courseId, c.front, c.back, now, now)
    return { id, courseId, front: c.front, back: c.back, intervalDays: 0, ease: 2.5, dueAt: now, reps: 0, createdAt: now }
  })
}

// Simplified SM-2: grade 0 (again) resets, 1 (hard)/2 (good)/3 (easy) grow the interval
export function reviewFlashcard(id: string, grade: 0 | 1 | 2 | 3): void {
  const row = db.prepare('SELECT * FROM flashcards WHERE id = ?').get(id) as DbFlashcard | undefined
  if (!row) return
  let interval = row.interval_days
  let ease = row.ease
  if (grade === 0) {
    interval = 0.02 // ~30 min
    ease = Math.max(1.3, ease - 0.2)
  } else {
    if (row.reps === 0) interval = 1
    else if (row.reps === 1) interval = 3
    else interval = interval * ease
    ease = Math.max(1.3, ease + (grade === 3 ? 0.15 : grade === 1 ? -0.15 : 0))
  }
  const dueAt = Date.now() + interval * 24 * 60 * 60 * 1000
  db.prepare('UPDATE flashcards SET interval_days = ?, ease = ?, due_at = ?, reps = reps + 1 WHERE id = ?')
    .run(interval, ease, dueAt, id)
}

export function deleteFlashcard(id: string): void {
  db.prepare('DELETE FROM flashcards WHERE id = ?').run(id)
}

// ─── Study sessions (Pomodoro) ───────────────────────────────────────────────

export function logStudySession(subjectId: string | null, seconds: number): void {
  if (!seconds || seconds < 1) return
  db.prepare('INSERT INTO study_sessions (id, subject_id, seconds, created_at) VALUES (?, ?, ?, ?)')
    .run(generateId(), subjectId ?? null, Math.round(seconds), Date.now())
}

export interface StudyStreak { current: number; longest: number }

// A "day counts" if the user ran a Pomodoro, edited a course, or took a quiz that day —
// not just Pomodoro, since most study time in this app is just writing notes.
export function getStudyStreak(): StudyStreak {
  const days = new Set<string>()
  const toDayKey = (t: number): string => new Date(t).toISOString().slice(0, 10)
  for (const r of db.prepare('SELECT created_at AS t FROM study_sessions').all() as Array<{ t: number }>) days.add(toDayKey(r.t))
  for (const r of db.prepare('SELECT updated_at AS t FROM courses WHERE deleted_at IS NULL').all() as Array<{ t: number }>) days.add(toDayKey(r.t))
  for (const r of db.prepare('SELECT created_at AS t FROM quiz_results').all() as Array<{ t: number }>) days.add(toDayKey(r.t))

  if (days.size === 0) return { current: 0, longest: 0 }

  // ISO 'YYYY-MM-DD' keys sort correctly as plain strings.
  const sorted = Array.from(days).sort()
  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = Math.round((Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / 86_400_000)
    run = diffDays === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }

  // A streak stays "alive" through today even if nothing's logged yet today, as long as
  // yesterday had activity — it only breaks once a full day passes with nothing at all.
  const today = toDayKey(Date.now())
  const yesterday = toDayKey(Date.now() - 86_400_000)
  let current = 0
  if (days.has(today) || days.has(yesterday)) {
    let cursor = days.has(today) ? Date.now() : Date.now() - 86_400_000
    while (days.has(toDayKey(cursor))) {
      current++
      cursor -= 86_400_000
    }
  }
  return { current, longest }
}

export interface StudyStats {
  total: number
  week: number
  today: number
  bySubject: Array<{ subjectId: string | null; seconds: number }>
  byDay: Array<{ day: string; seconds: number }>
}

export function getStudyStats(): StudyStats {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  const total = (db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM study_sessions').get() as { s: number }).s
  const week = (db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM study_sessions WHERE created_at >= ?').get(weekAgo) as { s: number }).s
  const today = (db.prepare('SELECT COALESCE(SUM(seconds), 0) AS s FROM study_sessions WHERE created_at >= ?').get(startOfToday) as { s: number }).s

  const bySubject = (db.prepare(
    'SELECT subject_id AS subjectId, SUM(seconds) AS seconds FROM study_sessions WHERE created_at >= ? GROUP BY subject_id ORDER BY seconds DESC'
  ).all(Date.now() - 30 * 24 * 60 * 60 * 1000) as Array<{ subjectId: string | null; seconds: number }>)

  const rows = db.prepare('SELECT seconds, created_at FROM study_sessions WHERE created_at >= ?')
    .all(Date.now() - 14 * 24 * 60 * 60 * 1000) as Array<{ seconds: number; created_at: number }>
  const dayMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    dayMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const r of rows) {
    const key = new Date(r.created_at).toISOString().slice(0, 10)
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + r.seconds)
  }
  const byDay = Array.from(dayMap.entries()).map(([day, seconds]) => ({ day, seconds }))

  return { total, week, today, bySubject, byDay }
}

// ─── Row types & mappers ────────────────────────────────────────────────────

interface DbSubject { id: string; name: string; emoji: string; color: string; created_at: number; sort_order: number; deleted_at: number | null }
interface DbCourse  { id: string; subject_id: string; title: string; emoji: string; content: string; audio_path: string | null; video_path: string | null; created_at: number; updated_at: number; deleted_at: number | null }
interface DbVersion { id: string; course_id: string; content: string; label: string; source: string; ai_action: string | null; created_at: number }
interface DbTag { id: string; name: string; emoji: string; color: string; created_at: number }
interface DbAttachment { id: string; course_id: string; file_name: string; file_path: string; size: number; created_at: number }
interface DbQuizResult { id: string; course_id: string | null; topic: string; score: number; total: number; created_at: number }
interface DbFlashcard { id: string; course_id: string; front: string; back: string; interval_days: number; ease: number; due_at: number; reps: number; created_at: number }

function rowToQuizResult(row: DbQuizResult): QuizResult {
  return { id: row.id, courseId: row.course_id ?? undefined, topic: row.topic, score: row.score, total: row.total, createdAt: row.created_at }
}

function rowToFlashcard(row: DbFlashcard): Flashcard {
  return { id: row.id, courseId: row.course_id, front: row.front, back: row.back, intervalDays: row.interval_days, ease: row.ease, dueAt: row.due_at, reps: row.reps, createdAt: row.created_at }
}

function rowToTag(row: DbTag): Tag {
  return { id: row.id, name: row.name, emoji: row.emoji, color: row.color, createdAt: row.created_at }
}

function rowToAttachment(row: DbAttachment): Attachment {
  return { id: row.id, courseId: row.course_id, fileName: row.file_name, filePath: row.file_path, size: row.size, createdAt: row.created_at }
}

function rowToSubject(row: DbSubject): Subject {
  return { id: row.id, name: row.name, emoji: row.emoji, color: row.color, createdAt: row.created_at, sortOrder: row.sort_order, deletedAt: row.deleted_at ?? undefined }
}

function rowToCourse(row: DbCourse): Course {
  const versions = (db.prepare('SELECT * FROM course_versions WHERE course_id = ? ORDER BY created_at DESC').all(row.id) as DbVersion[]).map(rowToVersion)
  const tagIds = getTagIdsForCourse(row.id)
  return { id: row.id, subjectId: row.subject_id, title: row.title, emoji: row.emoji ?? '📝', content: row.content, audioPath: row.audio_path ?? undefined, videoPath: row.video_path ?? undefined, tagIds, versions, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? undefined }
}

function rowToVersion(row: DbVersion): CourseVersion {
  return { id: row.id, courseId: row.course_id, content: row.content, label: row.label, source: row.source as 'manual' | 'ai', aiAction: row.ai_action ?? undefined, createdAt: row.created_at }
}
