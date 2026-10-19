import { ipcMain } from 'electron'
import { getDb } from './db'

// Planning (examens, devoirs), notes et activité. Tables ajoutées sans toucher aux existantes :
// les anciennes bases les créent au premier lancement.

function id(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function initPlanner(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      title TEXT NOT NULL,
      date INTEGER NOT NULL,
      coef REAL NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      course_id TEXT,
      title TEXT NOT NULL,
      due_at INTEGER,
      done INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      subject_id TEXT,
      title TEXT NOT NULL,
      score REAL NOT NULL,
      out_of REAL NOT NULL DEFAULT 20,
      coef REAL NOT NULL DEFAULT 1,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
}

const examOf = (r: any) => ({ id: r.id, subjectId: r.subject_id ?? null, title: r.title, date: r.date, coef: r.coef, notes: r.notes, createdAt: r.created_at })
const taskOf = (r: any) => ({ id: r.id, subjectId: r.subject_id ?? null, courseId: r.course_id ?? null, title: r.title, dueAt: r.due_at ?? null, done: !!r.done, priority: r.priority, createdAt: r.created_at })
const gradeOf = (r: any) => ({ id: r.id, subjectId: r.subject_id ?? null, title: r.title, score: r.score, outOf: r.out_of, coef: r.coef, date: r.date, createdAt: r.created_at })

/** Jours d'activité (cours modifiés, Pomodoro, quiz, cartes) sur N jours, pour la carte de chaleur. */
export function activityByDay(days: number): Array<{ day: string; count: number }> {
  const db = getDb()
  const since = Date.now() - days * 86_400_000
  const map = new Map<string, number>()
  const add = (rows: Array<{ t: number; w?: number }>): void => {
    for (const r of rows) {
      const k = new Date(r.t).toISOString().slice(0, 10)
      map.set(k, (map.get(k) ?? 0) + (r.w ?? 1))
    }
  }
  add(db.prepare('SELECT created_at AS t, MAX(1, seconds / 300) AS w FROM study_sessions WHERE created_at >= ?').all(since) as any)
  add(db.prepare('SELECT updated_at AS t FROM courses WHERE deleted_at IS NULL AND updated_at >= ?').all(since) as any)
  add(db.prepare('SELECT created_at AS t, 3 AS w FROM quiz_results WHERE created_at >= ?').all(since) as any)
  add(db.prepare('SELECT reviewed_at AS t FROM flashcard_reviews WHERE reviewed_at >= ?').all(since) as any)
  return [...map.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day))
}

export function registerPlannerIpc(): void {
  const db = getDb()

  ipcMain.handle('exams:list', () => (db.prepare('SELECT * FROM exams ORDER BY date').all() as any[]).map(examOf))
  ipcMain.handle('exams:save', (_, d: { id?: string; subjectId: string | null; title: string; date: number; coef: number; notes: string }) => {
    if (d.id) {
      db.prepare('UPDATE exams SET subject_id=?, title=?, date=?, coef=?, notes=? WHERE id=?').run(d.subjectId, d.title, d.date, d.coef, d.notes, d.id)
      return d.id
    }
    const nid = id()
    db.prepare('INSERT INTO exams (id, subject_id, title, date, coef, notes, created_at) VALUES (?,?,?,?,?,?,?)').run(nid, d.subjectId, d.title, d.date, d.coef, d.notes, Date.now())
    return nid
  })
  ipcMain.handle('exams:delete', (_, eid: string) => { db.prepare('DELETE FROM exams WHERE id=?').run(eid); return true })

  ipcMain.handle('tasks:list', () => (db.prepare('SELECT * FROM tasks ORDER BY done, COALESCE(due_at, 9e15), created_at').all() as any[]).map(taskOf))
  ipcMain.handle('tasks:save', (_, d: { id?: string; subjectId: string | null; courseId?: string | null; title: string; dueAt: number | null; priority: number }) => {
    if (d.id) {
      db.prepare('UPDATE tasks SET subject_id=?, course_id=?, title=?, due_at=?, priority=? WHERE id=?').run(d.subjectId, d.courseId ?? null, d.title, d.dueAt, d.priority, d.id)
      return d.id
    }
    const nid = id()
    db.prepare('INSERT INTO tasks (id, subject_id, course_id, title, due_at, priority, created_at) VALUES (?,?,?,?,?,?,?)').run(nid, d.subjectId, d.courseId ?? null, d.title, d.dueAt, d.priority, Date.now())
    return nid
  })
  ipcMain.handle('tasks:toggle', (_, tid: string, done: boolean) => { db.prepare('UPDATE tasks SET done=? WHERE id=?').run(done ? 1 : 0, tid); return true })
  ipcMain.handle('tasks:delete', (_, tid: string) => { db.prepare('DELETE FROM tasks WHERE id=?').run(tid); return true })

  ipcMain.handle('grades:list', () => (db.prepare('SELECT * FROM grades ORDER BY date DESC').all() as any[]).map(gradeOf))
  ipcMain.handle('grades:save', (_, d: { id?: string; subjectId: string | null; title: string; score: number; outOf: number; coef: number; date: number }) => {
    if (d.id) {
      db.prepare('UPDATE grades SET subject_id=?, title=?, score=?, out_of=?, coef=?, date=? WHERE id=?').run(d.subjectId, d.title, d.score, d.outOf, d.coef, d.date, d.id)
      return d.id
    }
    const nid = id()
    db.prepare('INSERT INTO grades (id, subject_id, title, score, out_of, coef, date, created_at) VALUES (?,?,?,?,?,?,?,?)').run(nid, d.subjectId, d.title, d.score, d.outOf, d.coef, d.date, Date.now())
    return nid
  })
  ipcMain.handle('grades:delete', (_, gid: string) => { db.prepare('DELETE FROM grades WHERE id=?').run(gid); return true })

  ipcMain.handle('study:activity', (_, days: number) => activityByDay(Math.min(400, Math.max(7, days || 180))))
}
