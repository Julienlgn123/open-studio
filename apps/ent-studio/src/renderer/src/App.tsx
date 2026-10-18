import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
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
import type { EntSettings, EntState } from '../../shared/types'
import './ent.css'

const DAY_MS = 86_400_000
const HOUR_PX = 76

// Couleurs des matières : stables (même matière, même couleur) et lisibles dans les deux thèmes.
// Une couleur par matière, attribuée dans l'ordre des codes (R101, R102…) : deux matières
// différentes ont des couleurs différentes tant qu'il y en a assez dans la palette.
const PALETTE = ['#6366f1', '#0ea5e9', '#f97316', '#22c55e', '#ec4899', '#eab308', '#14b8a6', '#a855f7', '#ef4444', '#84cc16', '#06b6d4', '#f43f5e', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6']
const colors = new Map<string, string>()
const keyOf = (c: Course): string => c.code ?? c.name
function assignColors(courses: Course[]): void {
  const keys = [...new Set(courses.map(keyOf))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
  colors.clear()
  keys.forEach((k, i) => colors.set(k, PALETTE[i % PALETTE.length]))
}
function colorOf(c: Course): string {
  return colors.get(keyOf(c)) ?? PALETTE[0]
}

const KIND_CLASS: Record<string, string> = { CM: 'info', TD: 'success', TP: 'warning', Examen: 'danger', Projet: 'accent', RN: 'accent' }

/** « DUPONT JEAN, MARTIN LÉA +3 » : jamais une ligne interminable. */
const teachersOf = (c: Course, max = 2): string =>
  c.teachers.length > max ? `${c.teachers.slice(0, max).join(', ')} +${c.teachers.length - max}` : c.teachers.join(', ')

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

type ViewMode = 'week' | 'list'

function Timetable({ state, onChanges, onSettings }: { state: EntState; onChanges: () => void; onSettings: () => void }): JSX.Element {
  const [mode, setMode] = useState<ViewMode>('week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [now, setNow] = useState(Date.now())
  const [open, setOpen] = useState<Course | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Le week-end, on montre directement la semaine suivante.
  useEffect(() => {
    const d = new Date().getDay()
    if ((d === 6 || d === 0) && !state.courses.some((c) => c.start >= now && c.start < startOfWeek(now) + 7 * DAY_MS)) {
      setWeekStart(startOfWeek(now) + 7 * DAY_MS)
    }
  }, [])

  const unseen = state.history.filter((h) => !h.seen).reduce((n, h) => n + h.changes.length, 0)
  const changedUids = useMemo(() => {
    const s = new Set<string>()
    for (const h of state.history) if (!h.seen) for (const c of h.changes) s.add(c.uid)
    return s
  }, [state.history])

  const next = state.courses.find((c) => c.end > now)
  const current = next && next.start <= now ? next : null
  const weekEnd = weekStart + 7 * DAY_MS
  const isThisWeek = weekStart === startOfWeek(now)

  const sync = (): void => {
    void window.kit.invoke<EntState>('ent:sync').then((s) => {
      if (s.lastError) toast(s.lastError, 'error')
      else toast('Emploi du temps à jour', 'success')
    })
  }

  return (
    <>
      <div className="ui-toolbar">
        <div className="segmented-nav">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setWeekStart(weekStart - 7 * DAY_MS)} title="Semaine précédente">
            <ChevronLeft size={16} />
          </button>
          <button className={`btn btn-sm ${isThisWeek ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setWeekStart(startOfWeek(now))}>
            Aujourd’hui
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setWeekStart(weekStart + 7 * DAY_MS)} title="Semaine suivante">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="week-label">
          {mode === 'week'
            ? `${dayLabel(weekStart, { day: 'numeric', month: 'long' })} – ${dayLabel(weekEnd - DAY_MS, { day: 'numeric', month: 'long', year: 'numeric' })}`
            : 'Prochains cours'}
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
        <Segmented<ViewMode>
          value={mode}
          onChange={setMode}
          options={[
            { id: 'week', label: <><CalendarDays size={13} /> Semaine</> },
            { id: 'list', label: <><List size={13} /> Liste</> }
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

      {mode === 'week' ? (
        <WeekView courses={state.courses} weekStart={weekStart} now={now} changed={changedUids} onOpen={setOpen} />
      ) : (
        <ListView courses={state.courses.filter((c) => c.end > now)} changed={changedUids} onOpen={setOpen} />
      )}

      {open && <CourseModal course={open} onClose={() => setOpen(null)} />}
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

function ListView({ courses, changed, onOpen }: { courses: Course[]; changed: Set<string>; onOpen: (c: Course) => void }): JSX.Element {
  const byDay = new Map<number, Course[]>()
  for (const c of courses.slice(0, 200)) {
    const d = startOfDay(c.start)
    byDay.set(d, [...(byDay.get(d) ?? []), c])
  }
  if (!courses.length) return <Empty icon={<CalendarDays size={24} />} title="Aucun cours à venir" />
  return (
    <div className="ui-page">
      <div className="ui-page-inner list">
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
                    </span>
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

function CourseModal({ course: c, onClose }: { course: Course; onClose: () => void }): JSX.Element {
  return (
    <Modal title={c.name} onClose={onClose} footer={<button className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
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
