import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Plus, Trash2, Check, GraduationCap, ListChecks, Sparkles, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { buildPlan, daysUntil, dayKey, type Exam, type Task } from '../lib/planner'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }
const field: React.CSSProperties = { width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13 }
const toInput = (t: number | null): string => (t ? dayKey(t) : '')
const fromInput = (s: string): number | null => (s ? new Date(s + 'T12:00:00').getTime() : null)

function countdown(d: number): { text: string; color: string } {
  if (d < 0) return { text: `passé (${-d} j)`, color: 'var(--text-tertiary)' }
  if (d === 0) return { text: "aujourd'hui", color: 'var(--danger, #ef4444)' }
  if (d === 1) return { text: 'demain', color: 'var(--danger, #ef4444)' }
  if (d <= 7) return { text: `dans ${d} jours`, color: 'var(--warning, #f59e0b)' }
  return { text: `dans ${d} jours`, color: 'var(--text-secondary)' }
}

function ExamModal({ exam, onClose, onSaved }: { exam?: Exam; onClose: () => void; onSaved: () => void }) {
  const { subjects } = useStore()
  const [title, setTitle] = useState(exam?.title ?? '')
  const [subjectId, setSubjectId] = useState<string>(exam?.subjectId ?? subjects[0]?.id ?? '')
  const [date, setDate] = useState(toInput(exam?.date ?? Date.now() + 7 * 86_400_000))
  const [coef, setCoef] = useState(String(exam?.coef ?? 1))
  const [notes, setNotes] = useState(exam?.notes ?? '')
  async function save() {
    if (!title.trim() || !date) return
    await api.planner.saveExam({ id: exam?.id, title: title.trim(), subjectId: subjectId || null, date: fromInput(date), coef: Number(coef) || 1, notes })
    onSaved(); onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><span className="modal-title">{exam ? "Modifier l'examen" : 'Nouvel examen'}</span></div>
        <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
          <input style={field} autoFocus placeholder="Titre (ex : Partiel de maths)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select style={field} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Sans matière</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10 }}>
            <input style={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input style={{ ...field, width: 90 }} type="number" min="0.5" step="0.5" title="Coefficient" value={coef} onChange={(e) => setCoef(e.target.value)} />
          </div>
          <textarea style={{ ...field, minHeight: 60, resize: 'vertical' }} placeholder="Notes (chapitres au programme…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim() || !date}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

export default function PlannerView() {
  const { subjects, setView, setActiveSubject, loadCourses, setActiveCourse } = useStore() as any
  const [exams, setExams] = useState<Exam[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [courses, setCourses] = useState<{ id: string; subjectId: string; title: string; emoji: string }[]>([])
  const [editing, setEditing] = useState<Exam | 'new' | null>(null)
  const [newTask, setNewTask] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [showDone, setShowDone] = useState(false)

  async function load() {
    const [e, t, c] = await Promise.all([api.planner.exams(), api.planner.tasks(), api.courses.all()])
    setExams(e); setTasks(t); setCourses(c)
  }
  useEffect(() => { load() }, [])

  const subjectOf = (id: string | null) => subjects.find((s: any) => s.id === id)
  const upcoming = exams.filter((e) => daysUntil(e.date) >= 0)
  const past = exams.filter((e) => daysUntil(e.date) < 0)
  const plan = useMemo(() => buildPlan(upcoming, courses), [exams, courses])
  const today = dayKey(Date.now())
  const planDays = useMemo(() => {
    const m = new Map<string, typeof plan>()
    for (const p of plan) m.set(p.day, [...(m.get(p.day) ?? []), p])
    return [...m.entries()].slice(0, 14)
  }, [plan])

  async function addTask() {
    if (!newTask.trim()) return
    await api.planner.saveTask({ title: newTask.trim(), subjectId: newSubject || null, dueAt: fromInput(newDue), priority: 1 })
    setNewTask(''); setNewDue(''); load()
  }
  const visibleTasks = tasks.filter((t) => showDone || !t.done)
  const open = async (courseId?: string) => {
    const c = courses.find((x) => x.id === courseId)
    if (!c) return
    setActiveSubject(c.subjectId)
    await loadCourses(c.subjectId)
    setActiveCourse(c.id)
    setView('editor')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <CalendarDays size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Planning</h1>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={13} /> Examen</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, maxWidth: 1100, margin: '0 auto' }}>
          <section>
            <h2 style={h2}><GraduationCap size={13} style={{ verticalAlign: -2 }} /> Examens à venir</h2>
            {upcoming.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aucun examen prévu. Ajoute-en un pour obtenir un plan de révision automatique.</p>}
            <div style={{ display: 'grid', gap: 8 }}>
              {upcoming.map((e) => {
                const s = subjectOf(e.subjectId); const c = countdown(daysUntil(e.date))
                return (
                  <div key={e.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', borderLeft: `3px solid ${s?.color ?? 'var(--accent)'}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{s?.emoji} {e.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · coef {e.coef}{s ? ` · ${s.name}` : ''}
                      </div>
                      {e.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{e.notes}</div>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.color, whiteSpace: 'nowrap' }}>{c.text}</span>
                    <button className="icon-btn" onClick={() => setEditing(e)} data-tooltip="Modifier"><Pencil size={13} /></button>
                    <button className="icon-btn" onClick={async () => { await api.planner.deleteExam(e.id); load() }} data-tooltip="Supprimer"><Trash2 size={13} /></button>
                  </div>
                )
              })}
            </div>
            {past.length > 0 && (
              <details style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                <summary style={{ cursor: 'pointer' }}>{past.length} examen{past.length > 1 ? 's' : ''} passé{past.length > 1 ? 's' : ''}</summary>
                {past.map((e) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>{e.title} · {new Date(e.date).toLocaleDateString('fr-FR')}</span>
                    <button className="icon-btn" onClick={async () => { await api.planner.deleteExam(e.id); load() }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </details>
            )}

            <h2 style={{ ...h2, marginTop: 26 }}><Sparkles size={13} style={{ verticalAlign: -2 }} /> Plan de révision automatique</h2>
            {planDays.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Le plan se génère à partir de tes examens et des cours de chaque matière.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {planDays.map(([day, items]) => (
                  <div key={day} style={{ ...card, padding: 10, borderColor: day === today ? 'var(--accent)' : 'var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: day === today ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {day === today ? "Aujourd'hui" : new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </div>
                    {items.map((p, i) => (
                      <div key={i} onClick={() => open(p.courseId)} style={{ fontSize: 13, padding: '2px 0', cursor: p.courseId ? 'pointer' : 'default', display: 'flex', gap: 6 }}>
                        <span>{p.kind === 'learn' ? '📖' : p.kind === 'review' ? '🔁' : '🎯'}</span>
                        <span style={{ flex: 1 }}>{p.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.examTitle}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 style={h2}><ListChecks size={13} style={{ verticalAlign: -2 }} /> Devoirs & tâches</h2>
            <div style={{ ...card, display: 'grid', gap: 8, marginBottom: 12 }}>
              <input style={field} placeholder="Nouvelle tâche (ex : Rendre le TP de physique)" value={newTask}
                onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select style={field} value={newSubject} onChange={(e) => setNewSubject(e.target.value)}>
                  <option value="">Sans matière</option>
                  {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                </select>
                <input style={field} type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                <button className="btn btn-primary btn-sm" onClick={addTask} disabled={!newTask.trim()}><Plus size={13} /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {visibleTasks.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Rien à faire. 🎉</p>}
              {visibleTasks.map((t) => {
                const s = subjectOf(t.subjectId); const d = t.dueAt ? daysUntil(t.dueAt) : null
                const late = d !== null && d < 0 && !t.done
                return (
                  <div key={t.id} style={{ ...card, padding: '8px 10px', display: 'flex', gap: 10, alignItems: 'center', opacity: t.done ? 0.55 : 1 }}>
                    <button onClick={async () => { await api.planner.toggleTask(t.id, !t.done); load() }}
                      style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--border-medium, var(--border))', background: t.done ? 'var(--accent)' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {t.done && <Check size={12} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: late ? 'var(--danger, #ef4444)' : 'var(--text-tertiary)' }}>
                        {s ? `${s.emoji} ${s.name}` : 'Sans matière'}{t.dueAt ? ` · ${late ? 'en retard · ' : ''}${countdown(d!).text}` : ''}
                      </div>
                    </div>
                    <button className="icon-btn" onClick={async () => { await api.planner.deleteTask(t.id); load() }}><Trash2 size={13} /></button>
                  </div>
                )
              })}
            </div>
            {tasks.some((t) => t.done) && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowDone((v) => !v)}>
                {showDone ? 'Masquer' : 'Afficher'} les tâches terminées
              </button>
            )}
          </section>
        </div>
      </div>
      {editing && <ExamModal exam={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}
