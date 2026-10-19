import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Flame,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Pause,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { Empty, Layout, Modal, NavItem, Page, Segmented, SideTitle, Toasts, errorText, toast, uid, usePersisted } from '@ui'
import type { FocusSession, Habit, PlanEvent, PlanGoal, PlanTask, Priority, Repeat, SubTask } from '../../shared/types'
import { REPEATS, addDays, byTime, eventsOn, fromIcs, long, mondayOf, parse, parseQuick, short, toIcs, today, ymd } from './util'
import './plan.css'

type View = 'today' | 'agenda' | 'tasks' | 'goals' | 'habits' | 'focus'
interface Data {
  events: PlanEvent[]
  tasks: PlanTask[]
  goals: PlanGoal[]
}

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: 'Urgent', cls: 'danger' },
  medium: { label: 'Normal', cls: 'warning' },
  low: { label: 'Plus tard', cls: 'info' }
}
const subsOf = (t: PlanTask | Partial<PlanTask>): SubTask[] => {
  try {
    return t.subtasks ? (JSON.parse(t.subtasks) as SubTask[]) : []
  } catch {
    return []
  }
}
/** Progression d'un objectif : d'après ses tâches s'il en a, sinon la valeur réglée à la main. */
const goalProgress = (g: PlanGoal, tasks: PlanTask[]): number => {
  const linked = tasks.filter((t) => t.goal_id === g.id)
  return linked.length ? Math.round((linked.filter((t) => t.done).length / linked.length) * 100) : g.progress
}

export default function App(): JSX.Element {
  const [data, setData] = useState<Data>({ events: [], tasks: [], goals: [] })
  const [view, setView] = usePersisted<View>('view', 'today')
  const [habits, setHabits] = usePersisted<Habit[]>('habits', [])
  const [sessions, setSessions] = usePersisted<FocusSession[]>('focusSessions', [])
  const [editEvent, setEditEvent] = useState<Partial<PlanEvent> | null>(null)
  const [editTask, setEditTask] = useState<Partial<PlanTask> | null>(null)
  const [editGoal, setEditGoal] = useState<Partial<PlanGoal> | null>(null)
  const [quick, setQuick] = useState('')

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
  const toggle = (t: PlanTask): void => {
    void save('tasks', { ...t, done: t.done ? 0 : 1 })
    if (!t.done && t.repeat) toast('Fait ! La prochaine occurrence est déjà prévue.', 'success')
  }

  // Saisie rapide : avec une heure → événement ; sinon → tâche.
  const qp = quick.trim() ? parseQuick(quick) : null
  const addQuick = async (): Promise<void> => {
    if (!qp || !qp.title) return
    if (qp.start) {
      await save('events', { title: qp.title, date: qp.date ?? today(), start_time: qp.start, end_time: qp.end ?? addHour(qp.start), emoji: '📅', notes: null, repeat: qp.repeat })
      toast(`Événement ajouté : ${long(qp.date ?? today())} à ${qp.start}`, 'success')
    } else {
      await save('tasks', { title: qp.title, done: 0, due_date: qp.date, priority: qp.priority ?? 'medium', notes: null, repeat: qp.repeat })
      toast(`Tâche ajoutée${qp.date ? ` pour ${long(qp.date)}` : ''}`, 'success')
    }
    setQuick('')
  }

  const exportIcs = async (): Promise<void> => {
    const path = await window.kit.files.save({ title: 'Exporter l’agenda', defaultPath: 'agenda.ics', filters: [{ name: 'Calendrier', extensions: ['ics'] }] })
    if (!path) return
    await window.kit.files.writeText(path, toIcs(data.events))
    toast(`${data.events.length} événements exportés (importables dans Google Agenda, Outlook, Apple…)`, 'success')
  }
  const importIcs = async (): Promise<void> => {
    const [path] = await window.kit.files.open({ title: 'Importer un calendrier', filters: [{ name: 'Calendrier', extensions: ['ics'] }] })
    if (!path) return
    const items = fromIcs(await window.kit.files.readText(path))
    // Les événements déjà présents (même titre, même date, même heure) ne sont pas dupliqués.
    const fresh = items.filter((i) => !data.events.some((e) => e.title === i.title && e.date === i.date && e.start_time === i.start_time))
    if (!fresh.length) return void toast('Rien de nouveau dans ce calendrier.', 'info')
    await window.kit.invoke('plan:import', 'events', fresh)
    load()
    toast(`${fresh.length} événement${fresh.length > 1 ? 's' : ''} importé${fresh.length > 1 ? 's' : ''}`, 'success')
  }

  const openTasks = data.tasks.filter((t) => !t.done)
  const late = openTasks.filter((t) => t.due_date && t.due_date < today())

  return (
    <Layout
      side={
        <>
          <SideTitle>Plan Studio</SideTitle>
          <div className="quick">
            <input
              className="input"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addQuick()}
              placeholder="Ajouter… « dentiste mardi 10h »"
            />
            {qp?.title && (
              <div className="quick-preview faint">
                {qp.start ? <CalendarDays size={11} /> : <ListTodo size={11} />} {qp.title}
                {qp.date && ` · ${short(qp.date)}`}
                {qp.start && ` · ${qp.start}${qp.end ? `–${qp.end}` : ''}`}
                {qp.repeat && <Repeat2 size={11} />}
                {qp.priority && ' · urgent'}
                <span className="enter">Entrée</span>
              </div>
            )}
          </div>
          <NavItem icon={<LayoutDashboard size={15} />} label="Aujourd’hui" active={view === 'today'} onClick={() => setView('today')} />
          <NavItem icon={<CalendarDays size={15} />} label="Agenda" active={view === 'agenda'} onClick={() => setView('agenda')} />
          <NavItem icon={<ListTodo size={15} />} label="Tâches" count={openTasks.length || undefined} active={view === 'tasks'} onClick={() => setView('tasks')} />
          <NavItem icon={<Target size={15} />} label="Objectifs" count={data.goals.filter((g) => !g.done).length || undefined} active={view === 'goals'} onClick={() => setView('goals')} />
          <NavItem icon={<Flame size={15} />} label="Habitudes" active={view === 'habits'} onClick={() => setView('habits')} />
          <NavItem icon={<Timer size={15} />} label="Concentration" active={view === 'focus'} onClick={() => setView('focus')} />
          <div className="ui-side-foot">
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setEditEvent({ date: today(), emoji: '📅', start_time: '09:00', end_time: '10:00', remind: 15 })}>
              <Plus size={14} /> Événement
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 6 }} onClick={() => setEditTask({ priority: 'medium', due_date: today() })}>
              <Plus size={14} /> Tâche
            </button>
            <div className="ui-row ics-row">
              <button className="btn btn-ghost btn-sm" onClick={() => void importIcs()} title="Importer un .ics (Google Agenda, Outlook, ENT…)">
                <Upload size={12} /> Importer
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void exportIcs()} title="Exporter en .ics">
                <Download size={12} /> Exporter
              </button>
            </div>
          </div>
        </>
      }
    >
      {view === 'today' && (
        <TodayView
          data={data}
          late={late}
          habits={habits}
          sessions={sessions}
          onHabit={(h) => setHabits(habits.map((x) => (x.id === h.id ? toggleDay(x, today()) : x)))}
          onEvent={setEditEvent}
          onTask={setEditTask}
          onToggle={toggle}
        />
      )}
      {view === 'agenda' && <AgendaView events={data.events} tasks={data.tasks} onEvent={setEditEvent} />}
      {view === 'tasks' && <TasksView tasks={data.tasks} goals={data.goals} onTask={setEditTask} onToggle={toggle} onSave={(t) => void save('tasks', t)} />}
      {view === 'goals' && (
        <GoalsView goals={data.goals} tasks={data.tasks} onGoal={setEditGoal} onTask={setEditTask} onToggle={toggle} onProgress={(g, p) => void save('goals', { ...g, progress: p, done: p >= 100 ? 1 : 0 })} />
      )}
      {view === 'habits' && <HabitsView habits={habits} setHabits={setHabits} />}
      {view === 'focus' && <FocusView tasks={openTasks} sessions={sessions} onSession={(s) => setSessions([...sessions, s].slice(-2000))} />}

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
          goals={data.goals}
          lists={[...new Set(data.tasks.map((t) => t.list).filter(Boolean) as string[])]}
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

const addHour = (t: string): string => {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const toggleDay = (h: Habit, day: string): Habit => ({ ...h, days: h.days.includes(day) ? h.days.filter((d) => d !== day) : [...h.days, day] })
/** Série en cours : jours consécutifs cochés jusqu'à aujourd'hui (ou hier si aujourd'hui n'est pas encore coché). */
const streak = (h: Habit): number => {
  let d = h.days.includes(today()) ? today() : addDays(today(), -1)
  let n = 0
  while (h.days.includes(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

// ─── Vues ──────────────────────────────────────────────────────────────────────────────────

function EventRow({ e, onClick }: { e: PlanEvent; onClick: () => void }): JSX.Element {
  return (
    <button className="event-row" onClick={onClick}>
      <span className="event-emoji">{e.emoji}</span>
      <span className="event-main">
        <b>
          {e.title} {e.repeat && <Repeat2 size={11} className="faint" />}
        </b>
        <span className="faint">
          {e.start_time ? `${e.start_time}${e.end_time ? ` – ${e.end_time}` : ''}` : 'Toute la journée'}
          {e.location && (
            <>
              {' '}
              · <MapPin size={10} /> {e.location}
            </>
          )}
        </span>
      </span>
    </button>
  )
}

function TaskRow({ t, onClick, onToggle, goal }: { t: PlanTask; onClick: () => void; onToggle: () => void; goal?: PlanGoal }): JSX.Element {
  const isLate = !t.done && t.due_date && t.due_date < today()
  const subs = subsOf(t)
  return (
    <div className={`task-row${t.done ? ' done' : ''}`}>
      <button className={`check${t.done ? ' on' : ''}`} onClick={onToggle} title={t.done ? 'Marquer à faire' : 'Marquer comme fait'}>
        {t.done ? <Check size={13} /> : null}
      </button>
      <button className="task-main" onClick={onClick}>
        <span className="task-title">
          {t.title} {t.repeat && <Repeat2 size={11} className="faint" />}
        </span>
        <span className="task-meta">
          <span className={`chip ${PRIORITY[t.priority].cls}`}>
            <Flag size={10} /> {PRIORITY[t.priority].label}
          </span>
          {t.list && <span className="chip">{t.list}</span>}
          {goal && (
            <span className="chip">
              <Target size={10} /> {goal.title}
            </span>
          )}
          {subs.length > 0 && (
            <span className="faint">
              <Check size={10} /> {subs.filter((s) => s.done).length}/{subs.length}
            </span>
          )}
          {t.due_date && (
            <span className={isLate ? 'late' : 'faint'}>
              {isLate ? 'En retard · ' : ''}
              {t.due_date === today() ? 'aujourd’hui' : t.due_date === addDays(today(), 1) ? 'demain' : short(t.due_date)}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

function TodayView({
  data,
  late,
  habits,
  sessions,
  onHabit,
  onEvent,
  onTask,
  onToggle
}: {
  data: Data
  late: PlanTask[]
  habits: Habit[]
  sessions: FocusSession[]
  onHabit: (h: Habit) => void
  onEvent: (e: PlanEvent) => void
  onTask: (t: PlanTask) => void
  onToggle: (t: PlanTask) => void
}): JSX.Element {
  const t = today()
  const events = eventsOn(data.events, t)
  const tasks = data.tasks.filter((x) => !x.done && (x.due_date === t || (x.due_date && x.due_date < t)))
  const doneToday = data.tasks.filter((x) => x.done && x.done_at && ymd(new Date(x.done_at)) === t).length
  const focusToday = sessions.filter((s) => ymd(new Date(s.at)) === t).reduce((n, s) => n + s.minutes, 0)
  const week: { day: string; e: PlanEvent }[] = []
  for (let i = 1; i <= 7; i++) for (const e of eventsOn(data.events, addDays(t, i))) week.push({ day: addDays(t, i), e })
  const h = new Date().getHours()
  // Prochain événement aujourd'hui : compte à rebours.
  const now = `${String(h).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
  const next = events.find((e) => e.start_time && e.start_time > now)
  const nextIn = next ? (() => {
    const [hh, mm] = next.start_time!.split(':').map(Number)
    const mins = hh * 60 + mm - (h * 60 + new Date().getMinutes())
    return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60 ? String(mins % 60).padStart(2, '0') : ''}` : `${mins} min`
  })() : null
  return (
    <Page title={`${h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'} 👋`} sub={long(t).replace(/^./, (c) => c.toUpperCase())}>
      <div className="stats">
        <div className="ui-card stat">
          <span className="faint">Tâches faites aujourd’hui</span>
          <b>
            {doneToday}
            <span className="faint"> / {doneToday + tasks.length}</span>
          </b>
        </div>
        <div className="ui-card stat">
          <span className="faint">Prochain rendez-vous</span>
          <b>{next ? `dans ${nextIn}` : '—'}</b>
          {next && <span className="faint small">{next.title}</span>}
        </div>
        <div className="ui-card stat">
          <span className="faint">Concentration</span>
          <b>{focusToday} min</b>
        </div>
        <div className="ui-card stat">
          <span className="faint">Habitudes</span>
          <b>
            {habits.filter((x) => x.days.includes(t)).length}
            <span className="faint"> / {habits.length}</span>
          </b>
        </div>
      </div>
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
      {habits.length > 0 && (
        <>
          <h2 className="ui-section-title">Habitudes du jour</h2>
          <div className="habit-chips">
            {habits.map((x) => (
              <button key={x.id} className={`habit-chip${x.days.includes(t) ? ' on' : ''}`} onClick={() => onHabit(x)}>
                <span>{x.emoji}</span> {x.name}
                {streak(x) > 1 && (
                  <span className="streak">
                    <Flame size={11} /> {streak(x)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <h2 className="ui-section-title">Les 7 prochains jours</h2>
      <div className="ui-card">
        {week.length ? (
          week.map(({ day, e }) => (
            <div key={`${e.id}-${day}`} className="week-line">
              <span className="faint week-day">{short(day)}</span>
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
  const [mode, setMode] = usePersisted<'month' | 'week'>('agendaMode', 'month')
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [weekStart, setWeekStart] = useState(() => mondayOf(today()))
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
  const dayEvents = eventsOn(events, selected)
  const dayTasks = tasks.filter((t) => t.due_date === selected)
  const newAt = (date: string, start = '09:00'): void => onEvent({ date, emoji: '📅', start_time: start, end_time: addHour(start), remind: 15 })

  return (
    <div className="agenda">
      <div className="agenda-month">
        <div className="ui-row agenda-head">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => (mode === 'month' ? setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)) : setWeekStart(addDays(weekStart, -7)))}>
            <ChevronLeft size={16} />
          </button>
          <h2>
            {mode === 'month'
              ? month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
              : `Semaine du ${parse(weekStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
          </h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => (mode === 'month' ? setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) : setWeekStart(addDays(weekStart, 7)))}>
            <ChevronRight size={16} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const d = new Date()
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
              setWeekStart(mondayOf(today()))
              setSelected(today())
            }}
          >
            Aujourd’hui
          </button>
          <div className="spacer" />
          <Segmented value={mode} onChange={setMode} options={[{ id: 'month', label: 'Mois' }, { id: 'week', label: 'Semaine' }]} />
        </div>
        {mode === 'month' ? (
          <div className="month-grid">
            {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
              <div key={d} className="month-dow">
                {d}
              </div>
            ))}
            {cells.map((c) => {
              const evs = eventsOn(events, c)
              const nTasks = tasks.filter((t) => t.due_date === c && !t.done).length
              const inMonth = parse(c).getMonth() === month.getMonth()
              return (
                <button
                  key={c}
                  className={`month-cell${inMonth ? '' : ' out'}${c === today() ? ' today' : ''}${c === selected ? ' sel' : ''}`}
                  onClick={() => setSelected(c)}
                  onDoubleClick={() => newAt(c)}
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
        ) : (
          <WeekGrid start={weekStart} events={events} tasks={tasks} onEvent={onEvent} onNew={newAt} onSelect={setSelected} selected={selected} />
        )}
      </div>
      <aside className="agenda-day">
        <div className="ui-row" style={{ justifyContent: 'space-between' }}>
          <h3>{long(selected)}</h3>
          <button className="btn btn-primary btn-sm btn-icon" onClick={() => newAt(selected)} title="Ajouter un événement">
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

const HOUR_START = 7
const HOUR_END = 23
const HOUR_PX = 44

function WeekGrid({
  start,
  events,
  tasks,
  onEvent,
  onNew,
  onSelect,
  selected
}: {
  start: string
  events: PlanEvent[]
  tasks: PlanTask[]
  onEvent: (e: PlanEvent) => void
  onNew: (date: string, start: string) => void
  onSelect: (d: string) => void
  selected: string
}): JSX.Element {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = (8 - HOUR_START) * HOUR_PX
  }, [])
  const mins = (t: string): number => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  return (
    <div className="week">
      <div className="week-head">
        <span />
        {days.map((d) => (
          <button key={d} className={`week-dayname${d === today() ? ' today' : ''}${d === selected ? ' sel' : ''}`} onClick={() => onSelect(d)}>
            {parse(d).toLocaleDateString('fr-FR', { weekday: 'short' })} <b>{parse(d).getDate()}</b>
          </button>
        ))}
      </div>
      <div className="week-allday">
        <span className="faint">jour</span>
        {days.map((d) => (
          <div key={d} className="allday-cell">
            {eventsOn(events, d)
              .filter((e) => !e.start_time)
              .map((e) => (
                <button key={e.id} className="wk-ev allday" onClick={() => onEvent(e)}>
                  {e.emoji} {e.title}
                </button>
              ))}
            {tasks
              .filter((t) => t.due_date === d && !t.done)
              .slice(0, 2)
              .map((t) => (
                <span key={t.id} className="wk-task">
                  ☐ {t.title}
                </span>
              ))}
          </div>
        ))}
      </div>
      <div className="week-body" ref={scroll}>
        <div className="week-hours">
          {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
            <span key={i} style={{ height: HOUR_PX }}>
              {HOUR_START + i}h
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="week-col" style={{ height: (HOUR_END - HOUR_START) * HOUR_PX }}>
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
              <button key={i} className="slot" style={{ top: i * HOUR_PX, height: HOUR_PX }} onDoubleClick={() => onNew(d, `${String(HOUR_START + i).padStart(2, '0')}:00`)} />
            ))}
            {d === today() && nowMin / 60 >= HOUR_START && nowMin / 60 < HOUR_END && <div className="now-line" style={{ top: ((nowMin - HOUR_START * 60) / 60) * HOUR_PX }} />}
            {eventsOn(events, d)
              .filter((e) => e.start_time)
              .map((e) => {
                const s = Math.max(HOUR_START * 60, mins(e.start_time!))
                const en = Math.min(HOUR_END * 60, Math.max(s + 30, mins(e.end_time ?? addHour(e.start_time!))))
                const hpx = ((en - s) / 60) * HOUR_PX - 2
                return (
                  <button
                    key={e.id}
                    className={`wk-ev${hpx < 38 ? ' short' : ''}`}
                    style={{ top: ((s - HOUR_START * 60) / 60) * HOUR_PX, height: Math.max(22, ((en - s) / 60) * HOUR_PX - 2) }}
                    onClick={() => onEvent(e)}
                    title={`${e.title} · ${e.start_time}–${e.end_time ?? ''}`}
                  >
                    <b>
                      {e.emoji} {e.title}
                    </b>
                    <span>
                      {e.start_time}
                      {e.end_time ? `–${e.end_time}` : ''}
                    </span>
                  </button>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}

function TasksView({ tasks, goals, onTask, onToggle, onSave }: { tasks: PlanTask[]; goals: PlanGoal[]; onTask: (t: Partial<PlanTask>) => void; onToggle: (t: PlanTask) => void; onSave: (t: PlanTask) => void }): JSX.Element {
  const [filter, setFilter] = usePersisted<'open' | 'done' | 'all'>('taskFilter', 'open')
  const [list, setList] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const lists = [...new Set(tasks.map((t) => t.list).filter(Boolean) as string[])].sort()
  const order = { high: 0, medium: 1, low: 2 }
  const rows = tasks
    .filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done))
    .filter((t) => !list || t.list === list)
    .filter((t) => !q || `${t.title} ${t.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.done - b.done || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || order[a.priority] - order[b.priority])
  const doneCount = tasks.filter((t) => t.done).length
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
          <button className="btn btn-primary" onClick={() => onTask({ priority: 'medium', list: list ?? undefined })}>
            <Plus size={14} /> Nouvelle tâche
          </button>
        </>
      }
    >
      <div className="ui-row task-filters">
        <label className="search" style={{ width: 240 }}>
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher" />
        </label>
        {lists.length > 0 && (
          <>
            <button className={`chip list-chip${!list ? ' on' : ''}`} onClick={() => setList(null)}>
              Toutes les listes
            </button>
            {lists.map((l) => (
              <button key={l} className={`chip list-chip${list === l ? ' on' : ''}`} onClick={() => setList(list === l ? null : l)}>
                {l} <span className="faint">{tasks.filter((t) => t.list === l && !t.done).length}</span>
              </button>
            ))}
          </>
        )}
        {filter === 'done' && doneCount > 0 && <span className="faint">{doneCount} tâche{doneCount > 1 ? 's' : ''} faite{doneCount > 1 ? 's' : ''} au total</span>}
      </div>
      {rows.length ? (
        <div className="ui-card task-list">
          {rows.map((t) => {
            const subs = subsOf(t)
            return (
              <div key={t.id}>
                <TaskRow t={t} goal={goals.find((g) => g.id === t.goal_id)} onClick={() => onTask(t)} onToggle={() => onToggle(t)} />
                {subs.length > 0 && !t.done && (
                  <div className="subs">
                    {subs.map((s, i) => (
                      <label key={i} className={`sub${s.done ? ' done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={() => onSave({ ...t, subtasks: JSON.stringify(subs.map((x, j) => (j === i ? { ...x, done: !x.done } : x))) })}
                        />
                        {s.text}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <Empty icon={<CalendarCheck size={24} />} title={filter === 'done' ? 'Aucune tâche faite' : 'Rien à faire'}>
          Ajoute tes devoirs, examens et choses à ne pas oublier : tu seras prévenu le jour J. Astuce : tape « rendre le TP vendredi ! » dans la barre à gauche.
        </Empty>
      )}
    </Page>
  )
}

function GoalsView({
  goals,
  tasks,
  onGoal,
  onTask,
  onToggle,
  onProgress
}: {
  goals: PlanGoal[]
  tasks: PlanTask[]
  onGoal: (g: Partial<PlanGoal>) => void
  onTask: (t: Partial<PlanTask>) => void
  onToggle: (t: PlanTask) => void
  onProgress: (g: PlanGoal, p: number) => void
}): JSX.Element {
  return (
    <Page
      title="Objectifs"
      sub="Ce que tu veux atteindre, et où tu en es. Relie des tâches à un objectif : sa progression se calcule toute seule."
      tools={
        <button className="btn btn-primary" onClick={() => onGoal({ progress: 0 })}>
          <Plus size={14} /> Nouvel objectif
        </button>
      }
    >
      {goals.length ? (
        <div className="ui-grid">
          {goals.map((g) => {
            const linked = tasks.filter((t) => t.goal_id === g.id)
            const p = goalProgress(g, tasks)
            const days = g.target_date ? Math.round((parse(g.target_date).getTime() - parse(today()).getTime()) / 86_400_000) : null
            return (
              <div key={g.id} className={`ui-card goal${p >= 100 ? ' done' : ''}`}>
                <button className="goal-title" onClick={() => onGoal(g)}>
                  {p >= 100 ? '🏆 ' : ''}
                  {g.title}
                </button>
                {g.description && <p className="muted">{g.description}</p>}
                <div className="goal-bar">
                  <div style={{ width: `${p}%` }} />
                </div>
                <div className="ui-row" style={{ justifyContent: 'space-between' }}>
                  <span className={days !== null && days < 0 && p < 100 ? 'late' : 'faint'}>
                    {g.target_date ? (days === null ? '' : days > 0 ? `Encore ${days} jour${days > 1 ? 's' : ''} (${short(g.target_date)})` : days === 0 ? 'C’est aujourd’hui !' : `Dépassé de ${-days} j`) : 'Sans échéance'}
                  </span>
                  <b>{p} %</b>
                </div>
                {linked.length ? (
                  <div className="goal-tasks">
                    {linked.map((t) => (
                      <TaskRow key={t.id} t={t} onClick={() => onTask(t)} onToggle={() => onToggle(t)} />
                    ))}
                  </div>
                ) : (
                  <input type="range" min={0} max={100} step={5} value={g.progress} onChange={(e) => onProgress(g, Number(e.target.value))} />
                )}
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onTask({ priority: 'medium', goal_id: g.id })}>
                  <Plus size={13} /> Étape (tâche)
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty icon={<Target size={24} />} title="Aucun objectif">
          Un permis, un projet, une note à atteindre… découpe-le en étapes et suis ta progression ici.
        </Empty>
      )}
    </Page>
  )
}

const HABIT_EMOJIS = ['💧', '📖', '🏃', '🧘', '🛏️', '🥗', '💪', '🎸', '🧠', '🚭', '📵', '✍️']

function HabitsView({ habits, setHabits }: { habits: Habit[]; setHabits: (h: Habit[]) => void }): JSX.Element {
  const [adding, setAdding] = useState<{ name: string; emoji: string } | null>(null)
  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13))
  return (
    <Page
      title="Habitudes"
      sub="Coche chaque jour ce que tu as fait : la série s’allonge, la motivation aussi."
      tools={
        <button className="btn btn-primary" onClick={() => setAdding({ name: '', emoji: '💧' })}>
          <Plus size={14} /> Nouvelle habitude
        </button>
      }
    >
      {habits.length ? (
        <div className="ui-card habits">
          <div className="habit-row head">
            <span />
            {days.map((d) => (
              <span key={d} className={`hd${d === today() ? ' today' : ''}`}>
                {parse(d).toLocaleDateString('fr-FR', { weekday: 'narrow' })}
                <b>{parse(d).getDate()}</b>
              </span>
            ))}
            <span className="faint">Série</span>
            <span className="faint">30 j</span>
            <span />
          </div>
          {habits.map((h) => {
            const month = Array.from({ length: 30 }, (_, i) => addDays(today(), -i)).filter((d) => h.days.includes(d)).length
            return (
              <div key={h.id} className="habit-row">
                <span className="habit-name">
                  {h.emoji} {h.name}
                </span>
                {days.map((d) => (
                  <button key={d} className={`hcell${h.days.includes(d) ? ' on' : ''}${d === today() ? ' today' : ''}`} onClick={() => setHabits(habits.map((x) => (x.id === h.id ? toggleDay(x, d) : x)))}>
                    {h.days.includes(d) ? <Check size={13} /> : null}
                  </button>
                ))}
                <span className="streak big">
                  <Flame size={13} /> {streak(h)}
                </span>
                <span className="faint">{Math.round((month / 30) * 100)} %</span>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setHabits(habits.filter((x) => x.id !== h.id))} title="Supprimer">
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty icon={<Flame size={24} />} title="Aucune habitude suivie">
          Boire de l’eau, lire 10 pages, faire du sport, se coucher avant minuit…
        </Empty>
      )}
      {adding && (
        <Modal
          title="Nouvelle habitude"
          onClose={() => setAdding(null)}
          footer={
            <button
              className="btn btn-primary"
              disabled={!adding.name.trim()}
              onClick={() => {
                setHabits([...habits, { id: uid(), name: adding.name.trim(), emoji: adding.emoji, days: [], createdAt: Date.now() }])
                setAdding(null)
              }}
            >
              Ajouter
            </button>
          }
        >
          <div className="emojis">
            {HABIT_EMOJIS.map((x) => (
              <button key={x} className={adding.emoji === x ? 'on' : ''} onClick={() => setAdding({ ...adding, emoji: x })}>
                {x}
              </button>
            ))}
          </div>
          <input className="input" autoFocus placeholder="Ex. Lire 10 pages" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
        </Modal>
      )}
    </Page>
  )
}

function FocusView({ tasks, sessions, onSession }: { tasks: PlanTask[]; sessions: FocusSession[]; onSession: (s: FocusSession) => void }): JSX.Element {
  const [work, setWork] = usePersisted('focusWork', 25)
  const [rest, setRest] = usePersisted('focusRest', 5)
  const [taskId, setTaskId] = useState<string>('')
  const [phase, setPhase] = useState<'work' | 'rest'>('work')
  const [left, setLeft] = useState(work * 60)
  const [running, setRunning] = useState(false)
  const endAt = useRef(0)

  useEffect(() => {
    if (!running) setLeft((phase === 'work' ? work : rest) * 60)
  }, [work, rest, phase])
  useEffect(() => {
    window.studio?.setBusy(running) // minuteur en cours : Open Studio garde le module chargé
    if (!running) return
    endAt.current = Date.now() + left * 1000
    const t = setInterval(() => {
      const l = Math.max(0, Math.round((endAt.current - Date.now()) / 1000))
      setLeft(l)
      if (l === 0) {
        clearInterval(t)
        setRunning(false)
        if (phase === 'work') {
          const task = tasks.find((x) => x.id === taskId)
          onSession({ at: Date.now(), minutes: work, taskId: taskId || undefined, label: task?.title })
          void window.kit.notify('Pause bien méritée ☕', `${work} minutes de concentration${task ? ` sur « ${task.title} »` : ''}. Pause de ${rest} min.`)
          setPhase('rest')
          setLeft(rest * 60)
        } else {
          void window.kit.notify('C’est reparti 💪', `Nouvelle session de ${work} minutes.`)
          setPhase('work')
          setLeft(work * 60)
        }
      }
    }, 500)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => () => window.studio?.setBusy(false), [])

  const total = (phase === 'work' ? work : rest) * 60
  const ratio = 1 - left / total
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6))
  const perDay = days.map((d) => sessions.filter((s) => ymd(new Date(s.at)) === d).reduce((n, s) => n + s.minutes, 0))
  const max = Math.max(30, ...perDay)
  const byTask = new Map<string, number>()
  sessions.filter((s) => s.label && Date.now() - s.at < 7 * 86_400_000).forEach((s) => byTask.set(s.label!, (byTask.get(s.label!) ?? 0) + s.minutes))
  const R = 92
  const C = 2 * Math.PI * R
  return (
    <Page title="Concentration" sub="La méthode Pomodoro : du travail sans distraction, puis une vraie pause.">
      <div className="focus">
        <div className="ui-card focus-timer">
          <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r={R} className="ring-bg" />
            <circle cx="110" cy="110" r={R} className={`ring ${phase}`} strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} transform="rotate(-90 110 110)" />
          </svg>
          <div className="focus-center">
            <span className="faint">{phase === 'work' ? 'Concentration' : 'Pause'}</span>
            <b>
              {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
            </b>
          </div>
          <select className="select" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={running}>
            <option value="">Sans tâche précise</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <div className="ui-row">
            <button className="btn btn-primary" onClick={() => setRunning(!running)}>
              {running ? <Pause size={15} /> : <Play size={15} />} {running ? 'Pause' : left < total ? 'Reprendre' : 'Démarrer'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setRunning(false)
                setPhase('work')
                setLeft(work * 60)
              }}
            >
              <RotateCcw size={14} /> Réinitialiser
            </button>
          </div>
          <div className="ui-row faint focus-settings">
            Travail
            <select className="select select-sm" value={work} onChange={(e) => setWork(Number(e.target.value))} disabled={running}>
              {[15, 20, 25, 30, 45, 50, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            Pause
            <select className="select select-sm" value={rest} onChange={(e) => setRest(Number(e.target.value))} disabled={running}>
              {[3, 5, 10, 15, 20].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ui-col">
          <section className="ui-card">
            <div className="ui-card-title">
              <Sparkles size={15} /> 7 derniers jours · {perDay.reduce((a, b) => a + b, 0)} min
            </div>
            <div className="focus-bars">
              {days.map((d, i) => (
                <div key={d} className="fb">
                  <span className="faint small">{perDay[i] || ''}</span>
                  <div style={{ height: `${(perDay[i] / max) * 100}%` }} className={d === today() ? 'today' : ''} />
                  <span className="faint small">{parse(d).toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </section>
          {byTask.size > 0 && (
            <section className="ui-card">
              <div className="ui-card-title">Par tâche (7 jours)</div>
              {[...byTask]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, m]) => (
                  <div key={label} className="ui-row by-task">
                    <span>{label}</span>
                    <b>{m} min</b>
                  </div>
                ))}
            </section>
          )}
        </div>
      </div>
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

const EMOJIS = ['📅', '📚', '📝', '🎓', '💼', '🏃', '🎉', '🍽️', '🩺', '✈️', '🎮', '❤️', '🎂', '🚗', '🏠', '🎬']

function EventModal({ event, onClose, onSave, onDelete }: { event: Partial<PlanEvent>; onClose: () => void; onSave: (e: Partial<PlanEvent>) => void; onDelete?: () => void }): JSX.Element {
  const [e, setE] = useState<Partial<PlanEvent>>({ remind: 15, ...event })
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
      <div className="ui-row">
        <MapPin size={14} className="faint" />
        <input className="input" placeholder="Lieu (facultatif)" value={e.location ?? ''} onChange={(x) => setE({ ...e, location: x.target.value || null })} />
      </div>
      <div className="ui-row">
        <Repeat2 size={14} className="faint" />
        <select className="select" value={e.repeat ?? ''} onChange={(x) => setE({ ...e, repeat: (x.target.value || null) as Repeat | null })}>
          <option value="">Ne se répète pas</option>
          {REPEATS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {e.repeat && (
          <label className="ui-row faint" style={{ whiteSpace: 'nowrap' }}>
            jusqu’au
            <input className="input" type="date" value={e.repeat_until ?? ''} onChange={(x) => setE({ ...e, repeat_until: x.target.value || null })} />
          </label>
        )}
      </div>
      <textarea className="textarea" rows={3} placeholder="Notes" value={e.notes ?? ''} onChange={(x) => setE({ ...e, notes: x.target.value })} />
      {!allDay && (
        <label className="ui-row faint">
          Me prévenir
          <select className="select select-sm" value={e.remind ?? 15} onChange={(x) => setE({ ...e, remind: Number(x.target.value) })}>
            <option value={0}>jamais</option>
            <option value={5}>5 min avant</option>
            <option value={15}>15 min avant</option>
            <option value={30}>30 min avant</option>
            <option value={60}>1 h avant</option>
            <option value={120}>2 h avant</option>
          </select>
        </label>
      )}
    </Modal>
  )
}

function TaskModal({
  task,
  goals,
  lists,
  onClose,
  onSave,
  onDelete
}: {
  task: Partial<PlanTask>
  goals: PlanGoal[]
  lists: string[]
  onClose: () => void
  onSave: (t: Partial<PlanTask>) => void
  onDelete?: () => void
}): JSX.Element {
  const [t, setT] = useState<Partial<PlanTask>>({ done: 0, ...task })
  const [sub, setSub] = useState('')
  const subs = subsOf(t)
  const setSubs = (s: SubTask[]): void => setT({ ...t, subtasks: s.length ? JSON.stringify(s) : null })
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
      <div className="ui-row">
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Liste</label>
          <input className="input" list="task-lists" placeholder="Cours, Perso, Courses…" value={t.list ?? ''} onChange={(x) => setT({ ...t, list: x.target.value || null })} />
          <datalist id="task-lists">
            {lists.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Répétition</label>
          <select className="select" value={t.repeat ?? ''} onChange={(x) => setT({ ...t, repeat: (x.target.value || null) as Repeat | null })}>
            <option value="">Une seule fois</option>
            {REPEATS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {goals.length > 0 && (
        <div className="field">
          <label className="field-label">Fait avancer l’objectif</label>
          <select className="select" value={t.goal_id ?? ''} onChange={(x) => setT({ ...t, goal_id: x.target.value || null })}>
            <option value="">Aucun</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label className="field-label">Sous-tâches</label>
        {subs.map((s, i) => (
          <div key={i} className="ui-row sub-edit">
            <input type="checkbox" checked={s.done} onChange={() => setSubs(subs.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
            <input className="input" value={s.text} onChange={(x) => setSubs(subs.map((y, j) => (j === i ? { ...y, text: x.target.value } : y)))} />
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSubs(subs.filter((_, j) => j !== i))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <input
          className="input"
          placeholder="+ Ajouter une étape (Entrée)"
          value={sub}
          onChange={(x) => setSub(x.target.value)}
          onKeyDown={(x) => {
            if (x.key === 'Enter' && sub.trim()) {
              setSubs([...subs, { text: sub.trim(), done: false }])
              setSub('')
            }
          }}
        />
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
