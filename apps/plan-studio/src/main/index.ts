import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { host } from '@open-studio/module'
import { notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import type { PlanEvent, PlanGoal, PlanTask, Repeat } from '../shared/types'

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
  // Colonnes ajoutées par les versions récentes : ajoutées sans toucher aux données existantes.
  const add = (table: string, col: string, def: string): void => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
  }
  add('events', 'repeat', 'TEXT')
  add('events', 'repeat_until', 'TEXT')
  add('events', 'location', 'TEXT')
  add('events', 'color', 'TEXT')
  add('events', 'remind', 'INTEGER')
  add('tasks', 'repeat', 'TEXT')
  add('tasks', 'subtasks', 'TEXT')
  add('tasks', 'list', 'TEXT')
  add('tasks', 'goal_id', 'TEXT')
  add('tasks', 'done_at', 'INTEGER')
}

type Table = 'events' | 'tasks' | 'goals'
const COLUMNS: Record<Table, string[]> = {
  events: ['title', 'date', 'start_time', 'end_time', 'emoji', 'notes', 'repeat', 'repeat_until', 'location', 'color', 'remind'],
  tasks: ['title', 'done', 'due_date', 'priority', 'notes', 'repeat', 'subtasks', 'list', 'goal_id', 'done_at'],
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
const parseDay = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Prochaine date d'une répétition. */
export function nextDate(date: string, repeat: Repeat): string {
  const d = parseDay(date)
  if (repeat === 'daily') d.setDate(d.getDate() + 1)
  else if (repeat === 'weekdays') {
    do d.setDate(d.getDate() + 1)
    while (d.getDay() === 0 || d.getDay() === 6)
  } else if (repeat === 'weekly') d.setDate(d.getDate() + 7)
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1)
  else d.setFullYear(d.getFullYear() + 1)
  return ymd(d)
}

/** L'événement (éventuellement répété) a-t-il lieu ce jour-là ? */
function occursOn(e: PlanEvent, day: string): boolean {
  if (e.date === day) return true
  if (!e.repeat || day < e.date || (e.repeat_until && day > e.repeat_until)) return false
  const a = parseDay(e.date)
  const b = parseDay(day)
  switch (e.repeat) {
    case 'daily':
      return true
    case 'weekdays':
      return b.getDay() !== 0 && b.getDay() !== 6
    case 'weekly':
      return a.getDay() === b.getDay()
    case 'monthly':
      return a.getDate() === b.getDate()
    case 'yearly':
      return a.getDate() === b.getDate() && a.getMonth() === b.getMonth()
  }
}

/** Rappels : 15 min avant un événement, et le matin (8 h) pour les tâches à rendre aujourd'hui. */
function checkReminders(): void {
  const sent = new Set(storeGet<string[]>('sentReminders', []))
  const now = new Date()
  const today = ymd(now)
  for (const e of (db.prepare('SELECT * FROM events WHERE start_time IS NOT NULL').all() as PlanEvent[]).filter((x) => occursOn(x, today))) {
    const before = e.remind ?? 15
    if (before <= 0) continue
    const [h, m] = e.start_time!.split(':').map(Number)
    const start = new Date(now)
    start.setHours(h, m, 0, 0)
    const mins = (start.getTime() - now.getTime()) / 60_000
    const key = `e:${e.id}:${today}:${e.start_time}`
    if (mins <= before && mins > -1 && !sent.has(key)) {
      sent.add(key)
      notify(`${e.emoji} ${e.title}`, `À ${e.start_time}${mins > 1 ? ` (dans ${Math.round(mins)} min)` : ''}${e.location ? ` · ${e.location}` : ''}`)
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
    // Tâche répétée cochée : la suivante est créée automatiquement.
    if (table === 'tasks' && item.id && item.done) {
      const before = db.prepare('SELECT * FROM tasks WHERE id = ?').get(item.id) as PlanTask | undefined
      if (before && !before.done && before.repeat) {
        const base = before.due_date ?? ymd(new Date())
        let next = nextDate(base, before.repeat)
        while (next < ymd(new Date())) next = nextDate(next, before.repeat)
        const sub = before.subtasks ? JSON.stringify((JSON.parse(before.subtasks) as { text: string }[]).map((x) => ({ text: x.text, done: false }))) : null
        save('tasks', { title: before.title, done: 0, due_date: next, priority: before.priority, notes: before.notes, repeat: before.repeat, subtasks: sub, list: before.list, goal_id: before.goal_id })
      }
      item.done_at = Date.now()
    }
    if (table === 'tasks' && item.id && item.done === 0) item.done_at = null
    return save(table, item)
  })
  ipc.handle('plan:import', (_e, table: Table, items: Record<string, unknown>[]) => {
    if (!(table in COLUMNS)) throw new Error('Table inconnue')
    const tx = db.transaction((rows: Record<string, unknown>[]) => rows.forEach((r) => save(table, r)))
    tx(items)
    return items.length
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
