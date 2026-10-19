import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  Copy,
  Download,
  Filter,
  GraduationCap,
  NotebookPen,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  List,
  MapPin,
  RefreshCw,
  Settings,
  User,
  Users
} from 'lucide-react'
import { Empty, Layout, Modal, Segmented, Switch, Toasts, errorText, relativeTime, toast } from '@ui'
import type { Change, ChangeSet, Course } from '../../shared/ics'
import { isHidden, subjectKey, type EntSettings, type EntState } from '../../shared/types'
import './ent.css'

const DAY_MS = 86_400_000
const HOUR_PX = 76

// Couleurs des matières : stables (même matière, même couleur) et lisibles dans les deux thèmes.
// Une couleur par matière, attribuée dans l'ordre des codes (R101, R102…) : deux matières
// différentes ont des couleurs différentes tant qu'il y en a assez dans la palette.
const PALETTE = ['#6366f1', '#0ea5e9', '#f97316', '#22c55e', '#ec4899', '#eab308', '#14b8a6', '#a855f7', '#ef4444', '#84cc16', '#06b6d4', '#f43f5e', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#d946ef', '#65a30d', '#0891b2', '#e11d48', '#7c3aed', '#ca8a04', '#059669', '#2563eb']
const colors = new Map<string, string>()
const keyOf = (c: Course): string => c.code ?? c.name
/** Activités sans code de matière (réunions, vie étudiante…) : gris neutre, pour ne pas voler une couleur aux cours. */
const OTHER = '#94a3b8'
function assignColors(courses: Course[]): void {
  const keys = [...new Set(courses.filter((c) => c.code).map(keyOf))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  colors.clear()
  keys.forEach((k, i) => colors.set(k, PALETTE[i % PALETTE.length]))
}
function colorOf(c: Course): string {
  return c.code ? (colors.get(keyOf(c)) ?? PALETTE[0]) : OTHER
}

const KIND_CLASS: Record<string, string> = { CM: 'info', TD: 'success', TP: 'warning', Examen: 'danger', Projet: 'accent', RN: 'accent' }

/** « DUPONT JEAN, MARTIN LÉA +3 » : jamais une ligne interminable. */
const teachersOf = (c: Course, max = 2): string =>
  c.teachers.length > max ? `${c.teachers.slice(0, max).join(', ')} +${c.teachers.length - max}` : c.teachers.join(', ')

/** « 3 h 30 » à partir de millisecondes. */
const fmtHours = (ms: number): string => {
  const m = Math.round(ms / 60_000)
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`
}

const hm = (t: number): string => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const startOfDay = (t: number): number => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const startOfWeek = (t: number): number => {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
const dayLabel = (t: number, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string =>
  new Date(t).toLocaleDateString('fr-FR', opts)

function useEnt(): [EntState | null, (s: EntState) => void] {
  const [state, setState] = useState<EntState | null>(null)
  useEffect(() => {
    window.kit.invoke<EntState>('ent:state').then(setState)
    return window.kit.on('ent:state', setState)
  }, [])
  return [state, setState]
}

export default function App(): JSX.Element {
  const [state, setState] = useEnt()
  const [showChanges, setShowChanges] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => window.kit.on('ent:openChanges', () => setShowChanges(true)), [])

  if (!state) return <Layout>{null}</Layout>
  assignColors(state.courses)
  return (
    <Layout>
      {state.settings.url ? (
        <Timetable state={state} onChanges={() => setShowChanges(true)} onSettings={() => setShowSettings(true)} />
      ) : (
        <Setup onConnected={setState} />
      )}
      {showChanges && (
        <ChangesPanel
          history={state.history}
          onClose={() => {
            setShowChanges(false)
            void window.kit.invoke<EntState>('ent:markSeen').then(setState)
          }}
        />
      )}
      {showSettings && <SettingsModal state={state} onState={setState} onClose={() => setShowSettings(false)} />}
      <Toasts />
    </Layout>
  )
}

// ─── Première connexion : le tutoriel ADE ──────────────────────────────────────────────────

/** Le bouton d'export d'ADE (en bas à gauche de l'emploi du temps), redessiné pour le tutoriel. */
function AdeExportIcon(): JSX.Element {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="ade-icon">
      <rect width="34" height="34" rx="6" fill="#f08c00" />
      <rect x="6" y="9" width="17" height="15" rx="2.5" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M6 13.5h17M10.5 6.5v4M18.5 6.5v4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19 20.5h10m-3.5-3.5 3.5 3.5-3.5 3.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Setup({ onConnected }: { onConnected: (s: EntState) => void }): JSX.Element {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const s = await window.kit.invoke<EntState>('ent:connect', url)
      onConnected(s)
      toast(`Emploi du temps connecté : ${s.courses.length} cours`, 'success')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const steps: { title: string; body: JSX.Element }[] = [
    {
      title: 'Ouvre ton emploi du temps ADE',
      body: (
        <>
          Connecte-toi à ADE comme d’habitude (ENT de la fac → Emploi du temps), sur la page où tu vois tes cours.{' '}
          <button className="link" onClick={() => void window.kit.openExternal('https://ade.univ-tours.fr/direct/myplanning.jsp')}>
            Ouvrir ADE <ExternalLink size={12} />
          </button>
        </>
      )
    },
    {
      title: 'Clique sur le bouton d’export, en bas à gauche',
      body: (
        <span className="step-inline">
          C’est ce petit bouton orange : <AdeExportIcon />
        </span>
      )
    },
    {
      title: 'Choisis la période',
      body: <>Dans la fenêtre « Export ICalendar », mets la <b>date de début</b> et la <b>date de fin</b> (par exemple jusqu’à la fin de l’année). Laisse « ICalendar » coché.</>
    },
    {
      title: 'Clique sur « Générer URL » et copie le lien',
      body: <>ADE affiche une adresse qui ressemble à <code>https://ade.univ-tours.fr/jsp/custom/modules/plannings/AbCdEf.shu</code>. Copie-la.</>
    },
    { title: 'Colle-la ci-dessous', body: <>ENT Studio se met ensuite à jour tout seul, à chaque lancement et toutes les 30 minutes.</> }
  ]

  return (
    <div className="ui-page">
      <div className="setup">
        <div className="setup-hero">
          <div className="setup-badge">
            <CalendarDays size={26} />
          </div>
          <h1>Connecte ton emploi du temps</h1>
          <p>Une seule fois, en 1 minute. Tu verras ensuite tes cours d’un coup d’œil, et tu seras prévenu dès qu’un cours change.</p>
        </div>

        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="step-num">{i + 1}</span>
              <div>
                <div className="step-title">{s.title}</div>
                <div className="step-body">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="ui-card setup-form">
          <label className="field-label" htmlFor="url">
            Lien de ton emploi du temps
          </label>
          <div className="ui-row">
            <input
              id="url"
              className="input mono"
              placeholder="https://ade.univ-tours.fr/jsp/custom/modules/plannings/….shu"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && url.trim() && void connect()}
              autoFocus
            />
            <button className="btn btn-primary" disabled={!url.trim() || busy} onClick={() => void connect()}>
              {busy ? <span className="spinner" /> : null}
              Connecter
            </button>
          </div>
          {error && (
            <div className="callout danger">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Emploi du temps ───────────────────────────────────────────────────────────────────────

type ViewMode = 'week' | 'month' | 'list' | 'exams' | 'stats'

function Timetable({ state, onChanges, onSettings }: { state: EntState; onChanges: () => void; onSettings: () => void }): JSX.Element {
  const [mode, setMode] = useState<ViewMode>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [now, setNow] = useState(Date.now())
  const [open, setOpen] = useState<Course | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  })
  const visible = useMemo(() => state.courses.filter((c) => !isHidden(c, state.settings.hidden)), [state.courses, state.settings.hidden])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  /** Semaine « actuelle » : celle-ci, ou la suivante s'il ne reste plus aucun cours cette semaine (week-end). */
  const currentWeek = (): number => {
    const w = startOfWeek(Date.now())
    return visible.some((c) => c.end >= Date.now() && c.start < w + 7 * DAY_MS) ? w : w + 7 * DAY_MS
  }
  useEffect(() => setWeekStart(currentWeek()), [])

  const unseen = state.history.filter((h) => !h.seen).reduce((n, h) => n + h.changes.length, 0)
  const changedUids = useMemo(() => {
    const s = new Set<string>()
    for (const h of state.history) if (!h.seen) for (const c of h.changes) s.add(c.uid)
    return s
  }, [state.history])

  const next = visible.find((c) => c.end > now)
  const current = next && next.start <= now ? next : null
  const weekEnd = weekStart + 7 * DAY_MS
  const isThisWeek = weekStart === currentWeek()

  const sync = (): void => {
    void window.kit.invoke<EntState>('ent:sync').then((s) => {
      if (s.lastError) toast(s.lastError, 'error')
      else toast('Emploi du temps à jour', 'success')
    })
  }

  return (
    <>
      <div className="ui-toolbar">
        {(mode === 'week' || mode === 'month') && (
          <div className="segmented-nav">
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => (mode === 'week' ? setWeekStart(weekStart - 7 * DAY_MS) : setMonthStart(new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() - 1, 1).getTime()))}
              title="Précédent"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className={`btn btn-sm ${isThisWeek && mode === 'week' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => {
                setWeekStart(currentWeek())
                const d = new Date()
                setMonthStart(new Date(d.getFullYear(), d.getMonth(), 1).getTime())
              }}
            >
              Aujourd’hui
            </button>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => (mode === 'week' ? setWeekStart(weekStart + 7 * DAY_MS) : setMonthStart(new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 1).getTime()))}
              title="Suivant"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <div className="week-label">
          {mode === 'week'
            ? `${dayLabel(weekStart, { day: 'numeric', month: 'long' })} – ${dayLabel(weekEnd - DAY_MS, { day: 'numeric', month: 'long', year: 'numeric' })}`
            : mode === 'month'
              ? new Date(monthStart).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
              : mode === 'exams'
                ? 'Examens à venir'
                : mode === 'stats'
                  ? 'Volume horaire'
                  : 'Prochains cours'}
          {mode === 'week' && <span className="faint week-hours-total"> · {fmtHours(visible.filter((c) => c.start >= weekStart && c.start < weekEnd).reduce((n, c) => n + (c.end - c.start), 0))} de cours</span>}
        </div>
        <div className="spacer" />
        <span className="faint sync-note" title={state.lastError ?? undefined}>
          {state.syncing ? 'Mise à jour…' : state.lastError ? 'Hors ligne' : state.lastSync ? `À jour ${relativeTime(state.lastSync)}` : ''}
        </span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={sync} disabled={state.syncing} title="Actualiser">
          <RefreshCw size={15} className={state.syncing ? 'spin' : undefined} />
        </button>
        <button className={`btn btn-sm ${unseen ? 'btn-primary' : 'btn-ghost'}`} onClick={onChanges} title="Modifications de l’emploi du temps">
          <Bell size={14} />
          {unseen ? `${unseen} modification${unseen > 1 ? 's' : ''}` : 'Modifications'}
        </button>
        <button className={`btn btn-sm btn-icon ${state.settings.hidden.length ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setFilterOpen(true)} title="Matières et types affichés">
          <Filter size={14} />
        </button>
        <Segmented<ViewMode>
          value={mode}
          onChange={setMode}
          options={[
            { id: 'week', label: <><CalendarDays size={13} /> Semaine</> },
            { id: 'month', label: <><CalendarRange size={13} /> Mois</> },
            { id: 'list', label: <><List size={13} /> Liste</> },
            { id: 'exams', label: <><GraduationCap size={13} /> Examens</> },
            { id: 'stats', label: <><BarChart3 size={13} /> Stats</> }
          ]}
        />
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onSettings} title="Réglages">
          <Settings size={15} />
        </button>
      </div>

      {state.lastError && (
        <div className="callout warn banner">
          <AlertTriangle size={15} />
          <span>
            <b>Mise à jour impossible.</b> {state.lastError} Les cours affichés sont ceux de la dernière mise à jour
            {state.lastSync ? ` (${relativeTime(state.lastSync)})` : ''}.
          </span>
        </div>
      )}

      {next && <NextCourse course={next} current={!!current} now={now} onOpen={() => setOpen(next)} />}

      {mode === 'week' && <WeekView courses={visible} weekStart={weekStart} now={now} changed={changedUids} onOpen={setOpen} />}
      {mode === 'month' && (
        <MonthView
          courses={visible}
          monthStart={monthStart}
          onDay={(d) => {
            setWeekStart(startOfWeek(d))
            setMode('week')
          }}
        />
      )}
      {mode === 'list' && <ListView courses={visible.filter((c) => c.end > now)} changed={changedUids} notes={state.notes} onOpen={setOpen} />}
      {mode === 'exams' && <ExamsView courses={visible} now={now} notes={state.notes} onOpen={setOpen} />}
      {mode === 'stats' && <StatsView courses={visible} now={now} />}

      {open && <CourseModal course={open} note={state.notes[open.uid] ?? ''} subjectNote={state.notes[`matiere:${subjectKey(open)}`] ?? ''} onClose={() => setOpen(null)} />}
      {filterOpen && <FilterModal state={state} onClose={() => setFilterOpen(false)} />}
    </>
  )
}

function NextCourse({ course, current, now, onOpen }: { course: Course; current: boolean; now: number; onOpen: () => void }): JSX.Element {
  const mins = Math.round((course.start - now) / 60_000)
  const when = current
    ? `En cours · fin à ${hm(course.end)}`
    : mins < 60
      ? `Dans ${mins} min`
      : startOfDay(course.start) === startOfDay(now)
        ? `Aujourd’hui à ${hm(course.start)}`
        : startOfDay(course.start) === startOfDay(now) + DAY_MS
          ? `Demain à ${hm(course.start)}`
          : `${dayLabel(course.start, { weekday: 'long', day: 'numeric', month: 'short' })} à ${hm(course.start)}`
  return (
    <button className="next" style={{ ['--c' as string]: colorOf(course) }} onClick={onOpen}>
      <span className="next-label">{current ? 'Maintenant' : 'Prochain cours'}</span>
      <span className="next-name">{course.name}</span>
      <span className="next-meta">
        <Clock size={13} /> {when}
      </span>
      {course.location && (
        <span className="next-meta">
          <MapPin size={13} /> {course.location}
        </span>
      )}
      {course.teachers.length > 0 && (
        <span className="next-meta">
          <User size={13} /> {teachersOf(course)}
        </span>
      )}
    </button>
  )
}

/** Séances qui se chevauchent dans une journée : réparties en colonnes côte à côte. */
function layoutDay(courses: Course[]): { c: Course; col: number; cols: number }[] {
  const out: { c: Course; col: number; cols: number }[] = []
  let group: { c: Course; col: number }[] = []
  let groupEnd = 0
  const flush = (): void => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1))
    for (const g of group) out.push({ ...g, cols })
    group = []
  }
  for (const c of courses) {
    if (group.length && c.start >= groupEnd) flush()
    const used = new Set(group.filter((g) => g.c.end > c.start).map((g) => g.col))
    let col = 0
    while (used.has(col)) col++
    group.push({ c, col })
    groupEnd = Math.max(groupEnd, c.end)
  }
  if (group.length) flush()
  return out
}

function WeekView({ courses, weekStart, now, changed, onOpen }: { courses: Course[]; weekStart: number; now: number; changed: Set<string>; onOpen: (c: Course) => void }): JSX.Element {
  const week = courses.filter((c) => c.start >= weekStart && c.start < weekStart + 7 * DAY_MS)
  const hasSat = week.some((c) => new Date(c.start).getDay() === 6)
  const hasSun = week.some((c) => new Date(c.start).getDay() === 0)
  const days = Array.from({ length: hasSun ? 7 : hasSat ? 6 : 5 }, (_, i) => weekStart + i * DAY_MS)

  // Plage horaire : 8 h – 18 h au minimum, élargie selon les cours de la semaine.
  const hourOf = (t: number): number => new Date(t).getHours() + new Date(t).getMinutes() / 60
  const first = Math.min(8, ...week.map((c) => Math.floor(hourOf(c.start))))
  const last = Math.max(18, ...week.map((c) => Math.ceil(hourOf(c.end) || 24)))
  const hours = Array.from({ length: last - first }, (_, i) => first + i)
  const top = (t: number): number => (hourOf(t) - first) * HOUR_PX

  if (!week.length) {
    return (
      <div className="ui-page">
        <Empty icon={<CalendarDays size={24} />} title="Aucun cours cette semaine">
          Profite ! Utilise les flèches pour voir les autres semaines.
        </Empty>
      </div>
    )
  }

  return (
    <div className="week">
      <div className="week-head" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={d} className={`day-head${startOfDay(now) === d ? ' today' : ''}`}>
            <span>{dayLabel(d, { weekday: 'short' })}</span>
            <b>{new Date(d).getDate()}</b>
          </div>
        ))}
      </div>
      <div className="week-body">
        <div className="week-grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, height: hours.length * HOUR_PX }}>
          <div className="hours">
            {hours.map((h) => (
              <div key={h} style={{ top: (h - first) * HOUR_PX }}>
                {h} h
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayCourses = week.filter((c) => startOfDay(c.start) === d)
            return (
              <div key={d} className={`day-col${startOfDay(now) === d ? ' today' : ''}`}>
                {hours.map((h) => (
                  <div key={h} className="hour-line" style={{ top: (h - first) * HOUR_PX }} />
                ))}
                {layoutDay(dayCourses).map(({ c, col, cols }) => {
                  const height = Math.max(26, top(c.end) - top(c.start) - 3)
                  return (
                    <button
                      key={c.uid}
                      className={`course${c.end < now ? ' past' : ''}${changed.has(c.uid) ? ' changed' : ''}${height < 70 ? ' compact' : ''}`}
                      style={{
                        ['--c' as string]: colorOf(c),
                        top: top(c.start) + 1,
                        height,
                        left: `calc(${(col / cols) * 100}% + 3px)`,
                        width: `calc(${100 / cols}% - 6px)`
                      }}
                      onClick={() => onOpen(c)}
                      title={`${c.summary}\n${hm(c.start)} – ${hm(c.end)}\n${c.location}\n${c.teachers.join(', ')}`}
                    >
                      <span className="course-time">
                        {hm(c.start)} – {hm(c.end)}
                        {c.kind && <span className={`kind ${KIND_CLASS[c.kind] ?? ''}`}>{c.kind}</span>}
                      </span>
                      <span className="course-name">{c.name}</span>
                      {c.location && (
                        <span className="course-meta">
                          <MapPin size={11} /> {c.location}
                        </span>
                      )}
                      {c.teachers.length > 0 && (
                        <span className="course-meta">
                          <User size={11} /> {teachersOf(c, 1)}
                        </span>
                      )}
                      {changed.has(c.uid) && <span className="changed-dot" title="Modifié récemment" />}
                    </button>
                  )
                })}
                {startOfDay(now) === d && hourOf(now) >= first && hourOf(now) <= last && <div className="now-line" style={{ top: top(now) }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ListView({ courses: all, changed, notes, onOpen }: { courses: Course[]; changed: Set<string>; notes: Record<string, string>; onOpen: (c: Course) => void }): JSX.Element {
  const [q, setQ] = useState('')
  const courses = q.trim()
    ? all.filter((c) => `${c.name} ${c.code ?? ''} ${c.location} ${c.teachers.join(' ')} ${c.kind ?? ''} ${c.groups.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    : all
  const byDay = new Map<number, Course[]>()
  for (const c of courses.slice(0, 200)) {
    const d = startOfDay(c.start)
    byDay.set(d, [...(byDay.get(d) ?? []), c])
  }
  return (
    <div className="ui-page">
      <div className="ui-page-inner list">
        <label className="search list-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une matière, une salle, un enseignant…" />
          {q && <span className="faint">{courses.length} cours</span>}
        </label>
        {!courses.length && <Empty icon={<CalendarDays size={24} />} title={q ? 'Aucun cours ne correspond' : 'Aucun cours à venir'} />}
        {[...byDay.entries()].map(([d, list]) => (
          <section key={d}>
            <h2 className="ui-section-title">{dayLabel(d)}</h2>
            <div className="ui-col">
              {list.map((c) => (
                <button key={c.uid} className={`row-course${changed.has(c.uid) ? ' changed' : ''}`} style={{ ['--c' as string]: colorOf(c) }} onClick={() => onOpen(c)}>
                  <span className="row-time">
                    <b>{hm(c.start)}</b>
                    <span>{hm(c.end)}</span>
                  </span>
                  <span className="row-main">
                    <span className="row-name">
                      {c.name}
                      {c.kind && <span className={`kind ${KIND_CLASS[c.kind] ?? ''}`}>{c.kind}</span>}
                      {changed.has(c.uid) && <span className="chip warning">Modifié</span>}
                      {notes[c.uid] && <NotebookPen size={12} className="note-icon" />}
                    </span>
                    {notes[c.uid] && <span className="row-note">📝 {notes[c.uid]}</span>}
                    <span className="row-meta">
                      {c.location && (
                        <span>
                          <MapPin size={12} /> {c.location}
                        </span>
                      )}
                      {c.teachers.length > 0 && (
                        <span>
                          <User size={12} /> {teachersOf(c)}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function CourseModal({ course: c, note: note0, subjectNote: sub0, onClose }: { course: Course; note: string; subjectNote: string; onClose: () => void }): JSX.Element {
  const [note, setNote] = useState(note0)
  const [subNote, setSubNote] = useState(sub0)
  const close = (): void => {
    if (note !== note0) void window.kit.invoke('ent:note', c.uid, note)
    if (subNote !== sub0) void window.kit.invoke('ent:note', `matiere:${subjectKey(c)}`, subNote)
    onClose()
  }
  return (
    <Modal
      title={c.name}
      onClose={close}
      footer={
        <button className="btn btn-secondary" onClick={close}>
          Fermer
        </button>
      }
    >
      <div className="detail" style={{ ['--c' as string]: colorOf(c) }}>
        <div className="detail-row">
          <CalendarDays size={15} />
          {dayLabel(c.start)}
        </div>
        <div className="detail-row">
          <Clock size={15} />
          <b>
            {hm(c.start)} – {hm(c.end)}
          </b>
          <span className="faint">({Math.round((c.end - c.start) / 60_000)} min)</span>
        </div>
        {c.location && (
          <div className="detail-row">
            <MapPin size={15} />
            {c.location}
          </div>
        )}
        {c.teachers.length > 0 && (
          <div className="detail-row">
            <User size={15} />
            {c.teachers.join(', ')}
          </div>
        )}
        {c.groups.length > 0 && (
          <div className="detail-row">
            <Users size={15} />
            {c.groups.length > 4 ? `${c.groups.slice(0, 4).join(', ')} et ${c.groups.length - 4} autres groupes` : c.groups.join(', ')}
          </div>
        )}
        <div className="detail-raw faint">
          {c.code && <span className="chip">{c.code}</span>} {c.kind && <span className={`chip ${KIND_CLASS[c.kind] ?? ''}`}>{c.kind}</span>} {c.summary}
        </div>
        <label className="field">
          <span className="field-label">
            <NotebookPen size={12} /> Note pour cette séance (devoir, à apporter…)
          </span>
          <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. rendre l’exercice 3, apporter la calculatrice" />
        </label>
        <label className="field">
          <span className="field-label">Note pour toute la matière</span>
          <textarea className="textarea" rows={2} value={subNote} onChange={(e) => setSubNote(e.target.value)} placeholder="Ex. coefficient 3, contact du prof, lien du cours en ligne" />
        </label>
      </div>
    </Modal>
  )
}

// ─── Modifications ─────────────────────────────────────────────────────────────────────────

const CHANGE_LABEL: Record<Change['type'], string> = {
  added: 'Nouveau cours',
  removed: 'Cours supprimé',
  moved: 'Horaire changé',
  room: 'Salle changée',
  teacher: 'Enseignant changé',
  renamed: 'Intitulé changé'
}
const CHANGE_CLASS: Record<Change['type'], string> = { added: 'success', removed: 'danger', moved: 'warning', room: 'info', teacher: 'accent', renamed: '' }

function ChangesPanel({ history, onClose }: { history: ChangeSet[]; onClose: () => void }): JSX.Element {
  const slot = (c: Course): string => `${dayLabel(c.start, { weekday: 'short', day: 'numeric', month: 'short' })} ${hm(c.start)}–${hm(c.end)}`
  return (
    <Modal title="Modifications de l’emploi du temps" onClose={onClose} width={600} footer={<button className="btn btn-primary" onClick={onClose}>J’ai vu</button>}>
      {history.length === 0 ? (
        <Empty icon={<Bell size={22} />} title="Aucune modification">
          Dès qu’un cours est ajouté, déplacé, annulé ou change de salle, il apparaît ici (et une notification te prévient).
        </Empty>
      ) : (
        history.map((h) => (
          <section key={h.at}>
            <div className="ui-section-title" style={{ marginTop: 6 }}>
              Détecté {relativeTime(h.at)} {!h.seen && <span className="chip accent">Nouveau</span>}
            </div>
            <div className="ui-col">
              {h.changes.map((c, i) => {
                const course = (c.after ?? c.before)!
                return (
                  <div key={i} className="change" style={{ ['--c' as string]: colorOf(course) }}>
                    <div className="ui-row">
                      <span className={`chip ${CHANGE_CLASS[c.type]}`}>{CHANGE_LABEL[c.type]}</span>
                      <b>{course.name}</b>
                    </div>
                    <div className="change-detail">
                      {c.type === 'moved' && (
                        <>
                          <s>{slot(c.before!)}</s> → <b>{slot(c.after!)}</b>
                        </>
                      )}
                      {c.type === 'room' && (
                        <>
                          {slot(course)} · <s>{c.before!.location || '—'}</s> → <b>{c.after!.location || '—'}</b>
                        </>
                      )}
                      {c.type === 'teacher' && (
                        <>
                          {slot(course)} · <s>{c.before!.teachers.join(', ') || '—'}</s> → <b>{c.after!.teachers.join(', ') || '—'}</b>
                        </>
                      )}
                      {(c.type === 'added' || c.type === 'removed' || c.type === 'renamed') && (
                        <>
                          {slot(course)}
                          {course.location && ` · ${course.location}`}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </Modal>
  )
}

function SettingsModal({ state, onState, onClose }: { state: EntState; onState: (s: EntState) => void; onClose: () => void }): JSX.Element {
  const [url, setUrl] = useState(state.settings.url)
  const [busy, setBusy] = useState(false)
  const patch = (p: Partial<EntSettings>): void => void window.kit.invoke<EntState>('ent:settings', p).then(onState)

  const saveUrl = async (): Promise<void> => {
    setBusy(true)
    try {
      onState(await window.kit.invoke<EntState>('ent:connect', url))
      toast('Nouveau lien enregistré', 'success')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Réglages" onClose={onClose} width={560} footer={<button className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
      <div className="field">
        <label className="field-label">Lien ADE (iCalendar)</label>
        <div className="ui-row">
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-secondary" disabled={busy || url.trim() === state.settings.url} onClick={() => void saveUrl()}>
            {busy && <span className="spinner" />}Enregistrer
          </button>
        </div>
        <div className="field-hint">Pour changer de période ou de groupe, génère un nouveau lien dans ADE et colle-le ici.</div>
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="field-label">Me prévenir quand un cours change</div>
          <div className="field-hint">Notification Windows : cours ajouté, déplacé, annulé, changement de salle ou d’enseignant.</div>
        </div>
        <Switch on={state.settings.notify} onChange={(v) => patch({ notify: v })} />
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="field-label">Vérifier les changements</div>
          <div className="field-hint">En plus de la vérification au lancement.</div>
        </div>
        <Segmented<string>
          value={String(state.settings.refreshMin)}
          onChange={(v) => patch({ refreshMin: Number(v) })}
          options={[
            { id: '15', label: '15 min' },
            { id: '30', label: '30 min' },
            { id: '60', label: '1 h' }
          ]}
        />
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="field-label">Me rappeler chaque cours</div>
          <div className="field-hint">Notification avec la salle (et ta note) juste avant le cours.</div>
        </div>
        <select className="select" style={{ width: 'auto' }} value={state.settings.remindBefore} onChange={(e) => patch({ remindBefore: Number(e.target.value) })}>
          <option value={0}>Jamais</option>
          <option value={5}>5 min avant</option>
          <option value={10}>10 min avant</option>
          <option value={15}>15 min avant</option>
          <option value={30}>30 min avant</option>
        </select>
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="field-label">Résumé du matin</div>
          <div className="field-hint">Vers 7 h : nombre de cours, premier cours et salle.</div>
        </div>
        <Switch on={state.settings.morning} onChange={(v) => patch({ morning: v })} />
      </div>
      <div className="ui-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => void exportIcs(state)}>
          <Download size={13} /> Exporter en .ics (cours affichés)
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.clipboard.write(state.settings.url).then(() => toast('Lien copié : abonne-toi avec dans Google Agenda (« À partir de l’URL »)', 'success'))}>
          <Copy size={13} /> Copier le lien d’abonnement
        </button>
      </div>
      <button
        className="btn btn-danger"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          void window.kit.invoke<EntState>('ent:disconnect').then(onState)
          onClose()
        }}
      >
        Déconnecter cet emploi du temps
      </button>
    </Modal>
  )
}

// ─── Export .ics ───────────────────────────────────────────────────────────────────────────

async function exportIcs(state: EntState): Promise<void> {
  const path = await window.kit.files.save({ title: 'Exporter l’emploi du temps', defaultPath: 'emploi-du-temps.ics', filters: [{ name: 'Calendrier', extensions: ['ics'] }] })
  if (!path) return
  const esc = (x: string): string => x.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
  const d = (t: number): string => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Studio//ENT Studio//FR']
  for (const c of state.courses.filter((x) => !isHidden(x, state.settings.hidden))) {
    const note = state.notes[c.uid]
    lines.push(
      'BEGIN:VEVENT',
      `UID:${c.uid}`,
      `DTSTAMP:${d(Date.now())}`,
      `DTSTART:${d(c.start)}`,
      `DTEND:${d(c.end)}`,
      `SUMMARY:${esc(`${c.name}${c.kind ? ` (${c.kind})` : ''}`)}`,
      ...(c.location ? [`LOCATION:${esc(c.location)}`] : []),
      `DESCRIPTION:${esc([c.teachers.join(', '), note ? `Note : ${note}` : ''].filter(Boolean).join('\n'))}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  await window.kit.files.writeText(path, lines.join('\r\n'))
  toast('Emploi du temps exporté', 'success')
}

// ─── Vue mois ──────────────────────────────────────────────────────────────────────────────

function MonthView({ courses, monthStart, onDay }: { courses: Course[]; monthStart: number; onDay: (d: number) => void }): JSX.Element {
  const first = startOfWeek(monthStart)
  const month = new Date(monthStart).getMonth()
  const cells = Array.from({ length: 42 }, (_, i) => first + i * DAY_MS + 3_600_000 * 2).map(startOfDay)
  const today = startOfDay(Date.now())
  return (
    <div className="ui-page">
      <div className="ui-page-inner wide">
        <div className="ent-month">
          {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((x) => (
            <div key={x} className="dow">
              {x}
            </div>
          ))}
          {cells.map((d) => {
            const list = courses.filter((c) => c.start >= d && c.start < d + DAY_MS)
            const hours = list.reduce((n, c) => n + (c.end - c.start), 0)
            const exam = list.some((c) => c.kind === 'Examen')
            return (
              <button key={d} className={`mcell${new Date(d).getMonth() !== month ? ' out' : ''}${d === today ? ' today' : ''}${exam ? ' exam' : ''}`} onClick={() => onDay(d)}>
                <span className="mnum">{new Date(d).getDate()}</span>
                {list.length > 0 && (
                  <>
                    <span className="mdots">
                      {list.slice(0, 8).map((c) => (
                        <i key={c.uid} style={{ background: colorOf(c) }} title={`${hm(c.start)} ${c.name}`} />
                      ))}
                    </span>
                    <span className="faint mh">
                      {list.length} cours · {fmtHours(hours)}
                    </span>
                    {exam && <span className="chip danger mexam">Examen</span>}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Examens ───────────────────────────────────────────────────────────────────────────────

function ExamsView({ courses, now, notes, onOpen }: { courses: Course[]; now: number; notes: Record<string, string>; onOpen: (c: Course) => void }): JSX.Element {
  const exams = courses.filter((c) => c.kind === 'Examen')
  const upcoming = exams.filter((c) => c.end > now)
  const past = exams.filter((c) => c.end <= now)
  if (!exams.length)
    return (
      <div className="ui-page">
        <Empty icon={<GraduationCap size={24} />} title="Aucun examen dans l’emploi du temps">
          Les séances marquées DS, CC, examen, partiel ou contrôle apparaîtront ici avec un compte à rebours.
        </Empty>
      </div>
    )
  return (
    <div className="ui-page">
      <div className="ui-page-inner">
        <div className="exams">
          {upcoming.map((c) => {
            const days = Math.ceil((startOfDay(c.start) - startOfDay(now)) / DAY_MS)
            return (
              <button key={c.uid} className={`exam-card${days <= 3 ? ' soon' : ''}`} style={{ ['--c' as string]: colorOf(c) }} onClick={() => onOpen(c)}>
                <span className="countdown">
                  <b>{days <= 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : days}</b>
                  {days > 1 && <span>jours</span>}
                </span>
                <span className="exam-main">
                  <b>{c.name}</b>
                  <span className="faint">
                    {dayLabel(c.start)} · {hm(c.start)}–{hm(c.end)}
                    {c.location ? ` · ${c.location}` : ''}
                  </span>
                  {notes[c.uid] && <span className="row-note">📝 {notes[c.uid]}</span>}
                </span>
              </button>
            )
          })}
          {!upcoming.length && <p className="faint">Plus d’examen à venir 🎉</p>}
        </div>
        {past.length > 0 && (
          <>
            <h2 className="ui-section-title">Passés</h2>
            {past
              .slice(-10)
              .reverse()
              .map((c) => (
                <div key={c.uid} className="faint past-exam">
                  {dayLabel(c.start, { day: 'numeric', month: 'short' })} — {c.name}
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Statistiques ──────────────────────────────────────────────────────────────────────────

function StatsView({ courses, now }: { courses: Course[]; now: number }): JSX.Element {
  const total = courses.reduce((n, c) => n + (c.end - c.start), 0)
  const done = courses.filter((c) => c.end <= now).reduce((n, c) => n + (c.end - c.start), 0)
  const bySubject = new Map<string, { c: Course; total: number; done: number; n: number }>()
  for (const c of courses) {
    const k = subjectKey(c)
    const e = bySubject.get(k) ?? { c, total: 0, done: 0, n: 0 }
    e.total += c.end - c.start
    if (c.end <= now) e.done += c.end - c.start
    e.n++
    bySubject.set(k, e)
  }
  const subjects = [...bySubject.values()].sort((a, b) => b.total - a.total)
  const byKind = new Map<string, number>()
  for (const c of courses) byKind.set(c.kind ?? 'Autre', (byKind.get(c.kind ?? 'Autre') ?? 0) + (c.end - c.start))
  // Heures par semaine, sur toute la période.
  const weeks = new Map<number, number>()
  for (const c of courses) weeks.set(startOfWeek(c.start), (weeks.get(startOfWeek(c.start)) ?? 0) + (c.end - c.start))
  const wk = [...weeks.entries()].sort((a, b) => a[0] - b[0])
  const maxW = Math.max(1, ...wk.map((w) => w[1]))
  const maxS = Math.max(1, ...subjects.map((x) => x.total))
  const thisWeek = startOfWeek(now)
  return (
    <div className="ui-page">
      <div className="ui-page-inner">
        <div className="stats-top">
          <div className="ui-card st">
            <span className="faint">Total de la période</span>
            <b>{fmtHours(total)}</b>
          </div>
          <div className="ui-card st">
            <span className="faint">Déjà faits</span>
            <b>{fmtHours(done)}</b>
            <span className="faint small">{total ? Math.round((done / total) * 100) : 0} %</span>
          </div>
          <div className="ui-card st">
            <span className="faint">Restants</span>
            <b>{fmtHours(total - done)}</b>
          </div>
          <div className="ui-card st">
            <span className="faint">Cette semaine</span>
            <b>{fmtHours(weeks.get(thisWeek) ?? 0)}</b>
          </div>
        </div>
        <section className="ui-card">
          <div className="ui-card-title">Par semaine</div>
          <div className="wbars">
            {wk.map(([w, ms]) => (
              <div key={w} className={`wbar${w === thisWeek ? ' now' : ''}${w + 7 * DAY_MS <= now ? ' past' : ''}`} title={`Semaine du ${dayLabel(w, { day: 'numeric', month: 'short' })} : ${fmtHours(ms)}`}>
                <div style={{ height: `${(ms / maxW) * 100}%` }} />
              </div>
            ))}
          </div>
        </section>
        <section className="ui-card">
          <div className="ui-card-title">Par type</div>
          <div className="kinds">
            {[...byKind.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, ms]) => (
                <span key={k} className={`chip ${KIND_CLASS[k] ?? ''}`}>
                  {k} · {fmtHours(ms)} ({total ? Math.round((ms / total) * 100) : 0} %)
                </span>
              ))}
          </div>
        </section>
        <section className="ui-card">
          <div className="ui-card-title">Par matière</div>
          {subjects.map(({ c, total: t, done: d, n }) => (
            <div key={subjectKey(c)} className="subj">
              <span className="subj-name">
                <i style={{ background: colorOf(c) }} />
                {c.code && <span className="faint">{c.code}</span>} {c.name}
              </span>
              <span className="subj-bar">
                <span className="all" style={{ width: `${(t / maxS) * 100}%` }}>
                  <span className="done" style={{ width: `${t ? (d / t) * 100 : 0}%`, background: colorOf(c) }} />
                </span>
              </span>
              <span className="faint subj-h">
                {fmtHours(d)} / {fmtHours(t)} · {n} séance{n > 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

// ─── Filtres ───────────────────────────────────────────────────────────────────────────────

function FilterModal({ state, onClose }: { state: EntState; onClose: () => void }): JSX.Element {
  const [hidden, setHidden] = useState(state.settings.hidden)
  const subjects = [...new Map(state.courses.map((c) => [subjectKey(c), c])).values()].sort((a, b) => subjectKey(a).localeCompare(subjectKey(b), 'fr', { numeric: true }))
  const kinds = [...new Set(state.courses.map((c) => c.kind).filter(Boolean) as string[])]
  const toggle = (k: string): void => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k])
  const save = (): void => {
    void window.kit.invoke('ent:settings', { hidden })
    onClose()
  }
  return (
    <Modal
      title="Ce que tu suis"
      onClose={save}
      width={560}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => setHidden([])}>
            Tout afficher
          </button>
          <button className="btn btn-primary" onClick={save}>
            Appliquer
          </button>
        </>
      }
    >
      <p className="faint">Décoche les options que tu ne suis pas : elles disparaissent de l’emploi du temps, des rappels et des statistiques.</p>
      <div className="field-label">Types de séance</div>
      <div className="ui-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {kinds.map((k) => (
          <label key={k} className={`chip filter-chip${hidden.includes(`type:${k}`) ? '' : ' on'}`}>
            <input type="checkbox" checked={!hidden.includes(`type:${k}`)} onChange={() => toggle(`type:${k}`)} /> {k}
          </label>
        ))}
      </div>
      <div className="field-label" style={{ marginTop: 12 }}>
        Matières
      </div>
      <div className="filter-list">
        {subjects.map((c) => (
          <label key={subjectKey(c)} className="filter-row">
            <input type="checkbox" checked={!hidden.includes(subjectKey(c))} onChange={() => toggle(subjectKey(c))} />
            <i style={{ background: colorOf(c) }} />
            {c.code && <span className="faint">{c.code}</span>} {c.name}
          </label>
        ))}
      </div>
    </Modal>
  )
}
