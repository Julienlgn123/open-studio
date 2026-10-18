import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { host } from '@open-studio/module'
import { notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import type { PlanEvent, PlanGoal, PlanTask } from '../shared/types'

// Plan Studio : agenda, tâches et objectifs, dans la base de l'ancienne app (même schéma).

let db: Database.Database
let timer: NodeJS.Timeout | null = null

function open(): void {
  db = new Database(join(host.dataDir, 'plan-studio.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT, end_time TEXT,
      emoji TEXT NOT NULL DEFAULT '📅', notes TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium', notes TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, target_date TEXT,
      progress INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
  `)
}

type Table = 'events' | 'tasks' | 'goals'
const COLUMNS: Record<Table, string[]> = {
  events: ['title', 'date', 'start_time', 'end_time', 'emoji', 'notes'],
  tasks: ['title', 'done', 'due_date', 'priority', 'notes'],
  goals: ['title', 'description', 'target_date', 'progress', 'done']
}

function list(table: Table): unknown[] {
  return db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all()
}

function save(table: Table, item: Record<string, unknown>): unknown {
  const cols = COLUMNS[table].filter((c) => c in item)
  if (item.id && db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(item.id)) {
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run(item)
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(item.id)
  }
  const id = randomUUID()
  const row = { ...item, id, created_at: Date.now() }
  const all = ['id', 'created_at', ...cols]
  db.prepare(`INSERT INTO ${table} (${all.join(', ')}) VALUES (${all.map((c) => `@${c}`).join(', ')})`).run(row)
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
}

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Rappels : 15 min avant un événement, et le matin (8 h) pour les tâches à rendre aujourd'hui. */
function checkReminders(): void {
  const sent = new Set(storeGet<string[]>('sentReminders', []))
  const now = new Date()
  const today = ymd(now)
  for (const e of db.prepare('SELECT * FROM events WHERE date = ? AND start_time IS NOT NULL').all(today) as PlanEvent[]) {
    const [h, m] = e.start_time!.split(':').map(Number)
    const start = new Date(now)
    start.setHours(h, m, 0, 0)
    const mins = (start.getTime() - now.getTime()) / 60_000
    const key = `e:${e.id}:${e.date}:${e.start_time}`
    if (mins <= 15 && mins > -1 && !sent.has(key)) {
      sent.add(key)
      notify(`${e.emoji} ${e.title}`, `À ${e.start_time}${mins > 1 ? ` (dans ${Math.round(mins)} min)` : ''}`)
    }
  }
  if (now.getHours() >= 8) {
    const due = db.prepare('SELECT * FROM tasks WHERE done = 0 AND due_date = ?').all(today) as PlanTask[]
    const key = `t:${today}`
    if (due.length && !sent.has(key)) {
      sent.add(key)
      notify(`${due.length} tâche${due.length > 1 ? 's' : ''} pour aujourd’hui`, due.slice(0, 4).map((t) => `• ${t.title}`).join('\n'))
    }
  }
  storeSet('sentReminders', [...sent].slice(-300))
}

export function activate(): void {
  registerKit()
  open()
  const ipc = host.ipcMain
  ipc.handle('plan:all', () => ({ events: list('events') as PlanEvent[], tasks: list('tasks') as PlanTask[], goals: list('goals') as PlanGoal[] }))
  ipc.handle('plan:save', (_e, table: Table, item: Record<string, unknown>) => {
    if (!(table in COLUMNS)) throw new Error('Table inconnue')
    return save(table, item)
  })
  ipc.handle('plan:delete', (_e, table: Table, id: string) => {
    if (!(table in COLUMNS)) throw new Error('Table inconnue')
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    return true
  })
  checkReminders()
  timer = setInterval(checkReminders, 60_000)
}

export function deactivate(): void {
  if (timer) clearInterval(timer)
  db?.close()
}
