import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Flag, LayoutDashboard, ListTodo, Plus, Target, Trash2 } from 'lucide-react'
import { Empty, Layout, Modal, NavItem, Page, Segmented, SideTitle, Toasts, errorText, toast } from '@ui'
import type { PlanEvent, PlanGoal, PlanTask, Priority } from '../../shared/types'
import './plan.css'

type View = 'today' | 'agenda' | 'tasks' | 'goals'
interface Data {
  events: PlanEvent[]
  tasks: PlanTask[]
  goals: PlanGoal[]
}

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const today = (): string => ymd(new Date())
const long = (s: string): string => parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const short = (s: string): string => parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const addDays = (s: string, n: number): string => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const byTime = (a: PlanEvent, b: PlanEvent): number => (a.start_time ?? '').localeCompare(b.start_time ?? '')

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: 'Urgent', cls: 'danger' },
  medium: { label: 'Normal', cls: 'warning' },
  low: { label: 'Plus tard', cls: 'info' }
}

export default function App(): JSX.Element {
  const [data, setData] = useState<Data>({ events: [], tasks: [], goals: [] })
  const [view, setView] = useState<View>('today')
  const [editEvent, setEditEvent] = useState<Partial<PlanEvent> | null>(null)
  const [editTask, setEditTask] = useState<Partial<PlanTask> | null>(null)
  const [editGoal, setEditGoal] = useState<Partial<PlanGoal> | null>(null)

  const load = (): void => void window.kit.invoke<Data>('plan:all').then(setData)
  useEffect(load, [])

  const save = async (table: 'events' | 'tasks' | 'goals', item: object): Promise<void> => {
    try {
      await window.kit.invoke('plan:save', table, item)
      load()
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }
  const remove = async (table: 'events' | 'tasks' | 'goals', id: string): Promise<void> => {
    await window.kit.invoke('plan:delete', table, id)
    load()
  }

  const openTasks = data.tasks.filter((t) => !t.done)
  const late = openTasks.filter((t) => t.due_date && t.due_date < today())

  return (
    <Layout
      side={
        <>
          <SideTitle>Plan Studio</SideTitle>
          <NavItem icon={<LayoutDashboard size={15} />} label="Aujourd’hui" active={view === 'today'} onClick={() => setView('today')} />
          <NavItem icon={<CalendarDays size={15} />} label="Agenda" active={view === 'agenda'} onClick={() => setView('agenda')} />
          <NavItem icon={<ListTodo size={15} />} label="Tâches" count={openTasks.length || undefined} active={view === 'tasks'} onClick={() => setView('tasks')} />
          <NavItem icon={<Target size={15} />} label="Objectifs" count={data.goals.filter((g) => !g.done).length || undefined} active={view === 'goals'} onClick={() => setView('goals')} />
          <div className="ui-side-foot">
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setEditEvent({ date: today(), emoji: '📅', start_time: '09:00', end_time: '10:00' })}>
              <Plus size={14} /> Événement
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 6 }} onClick={() => setEditTask({ priority: 'medium', due_date: today() })}>
              <Plus size={14} /> Tâche
            </button>
          </div>
        </>
      }
    >
      {view === 'today' && (
        <TodayView
          data={data}
          late={late}
          onEvent={setEditEvent}
          onTask={setEditTask}
          onToggle={(t) => void save('tasks', { ...t, done: t.done ? 0 : 1 })}
        />
      )}
      {view === 'agenda' && <AgendaView events={data.events} tasks={data.tasks} onEvent={setEditEvent} />}
      {view === 'tasks' && <TasksView tasks={data.tasks} onTask={setEditTask} onToggle={(t) => void save('tasks', { ...t, done: t.done ? 0 : 1 })} />}
      {view === 'goals' && <GoalsView goals={data.goals} onGoal={setEditGoal} onProgress={(g, p) => void save('goals', { ...g, progress: p, done: p >= 100 ? 1 : 0 })} />}

      {editEvent && (
        <EventModal
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSave={(e) => void save('events', e).then(() => setEditEvent(null))}
          onDelete={editEvent.id ? () => void remove('events', editEvent.id!).then(() => setEditEvent(null)) : undefined}
        />
      )}
      {editTask && (
        <TaskModal
          task={editTask}
          onClose={() => setEditTask(null)}
          onSave={(t) => void save('tasks', t).then(() => setEditTask(null))}
          onDelete={editTask.id ? () => void remove('tasks', editTask.id!).then(() => setEditTask(null)) : undefined}
        />
      )}
      {editGoal && (
        <GoalModal
          goal={editGoal}
          onClose={() => setEditGoal(null)}
          onSave={(g) => void save('goals', g).then(() => setEditGoal(null))}
          onDelete={editGoal.id ? () => void remove('goals', editGoal.id!).then(() => setEditGoal(null)) : undefined}
        />
      )}
      <Toasts />
    </Layout>
  )
}

// ─── Vues ──────────────────────────────────────────────────────────────────────────────────

function EventRow({ e, onClick }: { e: PlanEvent; onClick: () => void }): JSX.Element {
  return (
    <button className="event-row" onClick={onClick}>
      <span className="event-emoji">{e.emoji}</span>
      <span className="event-main">
        <b>{e.title}</b>
        <span className="faint">{e.start_time ? `${e.start_time}${e.end_time ? ` – ${e.end_time}` : ''}` : 'Toute la journée'}</span>
      </span>
    </button>
  )
}

function TaskRow({ t, onClick, onToggle }: { t: PlanTask; onClick: () => void; onToggle: () => void }): JSX.Element {
  const isLate = !t.done && t.due_date && t.due_date < today()
  return (
    <div className={`task-row${t.done ? ' done' : ''}`}>
      <button className={`check${t.done ? ' on' : ''}`} onClick={onToggle} title={t.done ? 'Marquer à faire' : 'Marquer comme fait'}>
        {t.done ? <Check size={13} /> : null}
      </button>
      <button className="task-main" onClick={onClick}>
        <span className="task-title">{t.title}</span>
        <span className="task-meta">
          <span className={`chip ${PRIORITY[t.priority].cls}`}>
            <Flag size={10} /> {PRIORITY[t.priority].label}
          </span>
          {t.due_date && <span className={isLate ? 'late' : 'faint'}>{isLate ? 'En retard · ' : ''}{t.due_date === today() ? 'aujourd’hui' : short(t.due_date)}</span>}
        </span>
      </button>
    </div>
  )
}

function TodayView({ data, late, onEvent, onTask, onToggle }: { data: Data; late: PlanTask[]; onEvent: (e: PlanEvent) => void; onTask: (t: PlanTask) => void; onToggle: (t: PlanTask) => void }): JSX.Element {
  const t = today()
  const events = data.events.filter((e) => e.date === t).sort(byTime)
  const tasks = data.tasks.filter((x) => !x.done && (x.due_date === t || (x.due_date && x.due_date < t)))
  const week = data.events.filter((e) => e.date > t && e.date <= addDays(t, 7)).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))
  const h = new Date().getHours()
  return (
    <Page title={`${h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'} 👋`} sub={long(t).replace(/^./, (c) => c.toUpperCase())}>
      {late.length > 0 && (
        <div className="callout warn" style={{ marginBottom: 16 }}>
          <Flag size={15} />
          <span>
            <b>{late.length} tâche{late.length > 1 ? 's' : ''} en retard.</b> Elles sont listées ci-dessous.
          </span>
        </div>
      )}
      <div className="today-grid">
        <section className="ui-card">
          <div className="ui-card-title">
            <CalendarDays size={15} /> Aujourd’hui
          </div>
          {events.length ? events.map((e) => <EventRow key={e.id} e={e} onClick={() => onEvent(e)} />) : <div className="faint">Rien de prévu.</div>}
        </section>
        <section className="ui-card">
          <div className="ui-card-title">
            <ListTodo size={15} /> À faire
          </div>
          {tasks.length ? tasks.map((x) => <TaskRow key={x.id} t={x} onClick={() => onTask(x)} onToggle={() => onToggle(x)} />) : <div className="faint">Tout est fait ✨</div>}
        </section>
      </div>
      <h2 className="ui-section-title">Les 7 prochains jours</h2>
      <div className="ui-card">
        {week.length ? (
          week.map((e) => (
            <div key={e.id} className="week-line">
              <span className="faint week-day">{short(e.date)}</span>
              <EventRow e={e} onClick={() => onEvent(e)} />
            </div>
          ))
        ) : (
          <div className="faint">Aucun événement.</div>
        )}
      </div>
    </Page>
  )
}

function AgendaView({ events, tasks, onEvent }: { events: PlanEvent[]; tasks: PlanTask[]; onEvent: (e: Partial<PlanEvent>) => void }): JSX.Element {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState(today())
  const cells = useMemo(() => {
    const first = new Date(month)
    first.setDate(1 - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first)
      d.setDate(first.getDate() + i)
      return ymd(d)
    })
  }, [month])
  const dayEvents = events.filter((e) => e.date === selected).sort(byTime)
  const dayTasks = tasks.filter((t) => t.due_date === selected)
  return (
    <div className="agenda">
      <div className="agenda-month">
        <div className="ui-row agenda-head">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={16} />
          </button>
          <h2>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={16} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const d = new Date()
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
              setSelected(today())
            }}
          >
            Aujourd’hui
          </button>
        </div>
        <div className="month-grid">
          {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
            <div key={d} className="month-dow">
              {d}
            </div>
          ))}
          {cells.map((c) => {
            const evs = events.filter((e) => e.date === c).sort(byTime)
            const nTasks = tasks.filter((t) => t.due_date === c && !t.done).length
            const inMonth = parse(c).getMonth() === month.getMonth()
            return (
              <button
                key={c}
                className={`month-cell${inMonth ? '' : ' out'}${c === today() ? ' today' : ''}${c === selected ? ' sel' : ''}`}
                onClick={() => setSelected(c)}
                onDoubleClick={() => onEvent({ date: c, emoji: '📅', start_time: '09:00', end_time: '10:00' })}
              >
                <span className="month-num">{parse(c).getDate()}</span>
                {evs.slice(0, 3).map((e) => (
                  <span key={e.id} className="month-ev">
                    {e.emoji} {e.start_time && <b>{e.start_time}</b>} {e.title}
                  </span>
                ))}
                {evs.length > 3 && <span className="faint month-more">+{evs.length - 3}</span>}
                {nTasks > 0 && <span className="month-tasks">{nTasks} tâche{nTasks > 1 ? 's' : ''}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <aside className="agenda-day">
        <div className="ui-row" style={{ justifyContent: 'space-between' }}>
          <h3>{long(selected)}</h3>
          <button className="btn btn-primary btn-sm btn-icon" onClick={() => onEvent({ date: selected, emoji: '📅', start_time: '09:00', end_time: '10:00' })} title="Ajouter un événement">
            <Plus size={14} />
          </button>
        </div>
        {dayEvents.map((e) => (
          <EventRow key={e.id} e={e} onClick={() => onEvent(e)} />
        ))}
        {dayTasks.map((t) => (
          <div key={t.id} className={`faint day-task${t.done ? ' done' : ''}`}>
            <ListTodo size={13} /> {t.title}
          </div>
        ))}
        {!dayEvents.length && !dayTasks.length && <div className="faint">Rien ce jour-là. Double-clique sur une case pour ajouter.</div>}
      </aside>
    </div>
  )
}

function TasksView({ tasks, onTask, onToggle }: { tasks: PlanTask[]; onTask: (t: Partial<PlanTask>) => void; onToggle: (t: PlanTask) => void }): JSX.Element {
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open')
  const order = { high: 0, medium: 1, low: 2 }
  const list = tasks
    .filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done))
    .sort((a, b) => a.done - b.done || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || order[a.priority] - order[b.priority])
  return (
    <Page
      title="Tâches"
      tools={
        <>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'open', label: 'À faire' },
              { id: 'done', label: 'Faites' },
              { id: 'all', label: 'Toutes' }
            ]}
          />
          <button className="btn btn-primary" onClick={() => onTask({ priority: 'medium' })}>
            <Plus size={14} /> Nouvelle tâche
          </button>
        </>
      }
    >
      {list.length ? (
        <div className="ui-card task-list">
          {list.map((t) => (
            <TaskRow key={t.id} t={t} onClick={() => onTask(t)} onToggle={() => onToggle(t)} />
          ))}
        </div>
      ) : (
        <Empty icon={<CalendarCheck size={24} />} title={filter === 'done' ? 'Aucune tâche faite' : 'Rien à faire'}>
          Ajoute tes devoirs, examens et choses à ne pas oublier : tu seras prévenu le jour J.
        </Empty>
      )}
    </Page>
  )
}

function GoalsView({ goals, onGoal, onProgress }: { goals: PlanGoal[]; onGoal: (g: Partial<PlanGoal>) => void; onProgress: (g: PlanGoal, p: number) => void }): JSX.Element {
  return (
    <Page
      title="Objectifs"
      sub="Ce que tu veux atteindre, et où tu en es."
      tools={
        <button className="btn btn-primary" onClick={() => onGoal({ progress: 0 })}>
          <Plus size={14} /> Nouvel objectif
        </button>
      }
    >
      {goals.length ? (
        <div className="ui-grid">
          {goals.map((g) => (
            <div key={g.id} className={`ui-card goal${g.done ? ' done' : ''}`}>
              <button className="goal-title" onClick={() => onGoal(g)}>
                {g.done ? '🏆 ' : ''}
                {g.title}
              </button>
              {g.description && <p className="muted">{g.description}</p>}
              <div className="goal-bar">
                <div style={{ width: `${g.progress}%` }} />
              </div>
              <div className="ui-row" style={{ justifyContent: 'space-between' }}>
                <span className="faint">{g.target_date ? `Pour le ${short(g.target_date)}` : 'Sans échéance'}</span>
                <b>{g.progress} %</b>
              </div>
              <input type="range" min={0} max={100} step={5} value={g.progress} onChange={(e) => onProgress(g, Number(e.target.value))} />
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<Target size={24} />} title="Aucun objectif">
          Un permis, un projet, une note à atteindre… suis ta progression ici.
        </Empty>
      )}
    </Page>
  )
}

// ─── Fenêtres d'édition ────────────────────────────────────────────────────────────────────

function Foot({ onClose, onDelete, canSave, onSave }: { onClose: () => void; onDelete?: () => void; canSave: boolean; onSave: () => void }): JSX.Element {
  return (
    <>
      {onDelete && (
        <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
          <Trash2 size={14} /> Supprimer
        </button>
      )}
      <button className="btn btn-ghost" onClick={onClose}>
        Annuler
      </button>
      <button className="btn btn-primary" disabled={!canSave} onClick={onSave}>
        Enregistrer
      </button>
    </>
  )
}

const EMOJIS = ['📅', '📚', '📝', '🎓', '💼', '🏃', '🎉', '🍽️', '🩺', '✈️', '🎮', '❤️']

function EventModal({ event, onClose, onSave, onDelete }: { event: Partial<PlanEvent>; onClose: () => void; onSave: (e: Partial<PlanEvent>) => void; onDelete?: () => void }): JSX.Element {
  const [e, setE] = useState(event)
  const allDay = !e.start_time
  return (
    <Modal title={event.id ? 'Modifier l’événement' : 'Nouvel événement'} onClose={onClose} footer={<Foot onClose={onClose} onDelete={onDelete} canSave={!!e.title?.trim() && !!e.date} onSave={() => onSave(e)} />}>
      <div className="emojis">
        {EMOJIS.map((x) => (
          <button key={x} className={e.emoji === x ? 'on' : ''} onClick={() => setE({ ...e, emoji: x })}>
            {x}
          </button>
        ))}
      </div>
      <input className="input" autoFocus placeholder="Titre" value={e.title ?? ''} onChange={(x) => setE({ ...e, title: x.target.value })} />
      <div className="ui-row">
        <input className="input" type="date" value={e.date ?? ''} onChange={(x) => setE({ ...e, date: x.target.value })} />
        <label className="ui-row faint" style={{ whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={allDay} onChange={(x) => setE({ ...e, start_time: x.target.checked ? null : '09:00', end_time: x.target.checked ? null : '10:00' })} /> Toute la journée
        </label>
      </div>
      {!allDay && (
        <div className="ui-row">
          <input className="input" type="time" value={e.start_time ?? ''} onChange={(x) => setE({ ...e, start_time: x.target.value })} />
          <span className="faint">→</span>
          <input className="input" type="time" value={e.end_time ?? ''} onChange={(x) => setE({ ...e, end_time: x.target.value || null })} />
        </div>
      )}
      <textarea className="textarea" rows={3} placeholder="Notes" value={e.notes ?? ''} onChange={(x) => setE({ ...e, notes: x.target.value })} />
      {!allDay && <div className="field-hint">Une notification te prévient 15 minutes avant.</div>}
    </Modal>
  )
}

function TaskModal({ task, onClose, onSave, onDelete }: { task: Partial<PlanTask>; onClose: () => void; onSave: (t: Partial<PlanTask>) => void; onDelete?: () => void }): JSX.Element {
  const [t, setT] = useState<Partial<PlanTask>>({ done: 0, ...task })
  return (
    <Modal title={task.id ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={onClose} footer={<Foot onClose={onClose} onDelete={onDelete} canSave={!!t.title?.trim()} onSave={() => onSave(t)} />}>
      <input className="input" autoFocus placeholder="Que faut-il faire ?" value={t.title ?? ''} onChange={(x) => setT({ ...t, title: x.target.value })} />
      <div className="ui-row">
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Pour le</label>
          <input className="input" type="date" value={t.due_date ?? ''} onChange={(x) => setT({ ...t, due_date: x.target.value || null })} />
        </div>
        <div className="field">
          <label className="field-label">Priorité</label>
          <Segmented<Priority>
            value={t.priority ?? 'medium'}
            onChange={(p) => setT({ ...t, priority: p })}
            options={(['high', 'medium', 'low'] as Priority[]).map((p) => ({ id: p, label: PRIORITY[p].label }))}
          />
        </div>
      </div>
      <textarea className="textarea" rows={3} placeholder="Notes" value={t.notes ?? ''} onChange={(x) => setT({ ...t, notes: x.target.value })} />
    </Modal>
  )
}

function GoalModal({ goal, onClose, onSave, onDelete }: { goal: Partial<PlanGoal>; onClose: () => void; onSave: (g: Partial<PlanGoal>) => void; onDelete?: () => void }): JSX.Element {
  const [g, setG] = useState<Partial<PlanGoal>>({ progress: 0, done: 0, ...goal })
  return (
    <Modal title={goal.id ? 'Modifier l’objectif' : 'Nouvel objectif'} onClose={onClose} footer={<Foot onClose={onClose} onDelete={onDelete} canSave={!!g.title?.trim()} onSave={() => onSave(g)} />}>
      <input className="input" autoFocus placeholder="Objectif" value={g.title ?? ''} onChange={(x) => setG({ ...g, title: x.target.value })} />
      <textarea className="textarea" rows={3} placeholder="Description (facultatif)" value={g.description ?? ''} onChange={(x) => setG({ ...g, description: x.target.value })} />
      <div className="field">
        <label className="field-label">Échéance</label>
        <input className="input" type="date" value={g.target_date ?? ''} onChange={(x) => setG({ ...g, target_date: x.target.value || null })} />
      </div>
    </Modal>
  )
}
