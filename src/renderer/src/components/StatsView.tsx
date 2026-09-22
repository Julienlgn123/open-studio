import { useEffect, useState } from 'react'
import { ArrowLeft, BarChart3, Clock, Layers, BookOpen, Target, Flame } from 'lucide-react'
import { useStore } from '../store'
import type { QuizResult } from '../../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface StudyStats {
  total: number; week: number; today: number
  bySubject: Array<{ subjectId: string | null; seconds: number }>
  byDay: Array<{ day: string; seconds: number }>
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')}`
  return `${m} min`
}

export default function StatsView() {
  const { subjects, courses, setView } = useStore()
  const [study, setStudy] = useState<StudyStats | null>(null)
  const [quizzes, setQuizzes] = useState<QuizResult[]>([])
  const [due, setDue] = useState(0)
  const [streak, setStreak] = useState({ current: 0, longest: 0 })

  useEffect(() => {
    api.study.stats().then(setStudy).catch(() => setStudy(null))
    api.quizResults.get().then(setQuizzes).catch(() => setQuizzes([]))
    api.flashcards.dueAll().then((c: unknown[]) => setDue(c.length)).catch(() => setDue(0))
    api.study.streak().then(setStreak).catch(() => setStreak({ current: 0, longest: 0 }))
  }, [])

  const quizAvg = quizzes.length
    ? Math.round(quizzes.reduce((sum, q) => sum + (q.score / q.total) * 100, 0) / quizzes.length)
    : null

  const maxSubjectSeconds = Math.max(1, ...(study?.bySubject.map((s) => s.seconds) ?? [1]))
  const maxDaySeconds = Math.max(1, ...(study?.byDay.map((d) => d.seconds) ?? [1]))

  const tiles = [
    { icon: <Flame size={15} />, label: 'Série en cours', value: `${streak.current} j${streak.current !== 1 ? 'ours' : 'our'}` },
    { icon: <Clock size={15} />, label: 'Cette semaine', value: study ? fmtDuration(study.week) : '—' },
    { icon: <Target size={15} />, label: "Aujourd'hui", value: study ? fmtDuration(study.today) : '—' },
    { icon: <BookOpen size={15} />, label: 'Cours', value: String(courses.length) },
    { icon: <Layers size={15} />, label: 'Cartes à réviser', value: String(due) }
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Statistiques</h1>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 28 }}>
          {tiles.map((t) => (
            <div key={t.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 8 }}>
                {t.icon} {t.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{t.value}</div>
            </div>
          ))}
        </div>
        {streak.longest > streak.current && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: -18, marginBottom: 28 }}>
            Record : {streak.longest} jour{streak.longest !== 1 ? 's' : ''} d'affilée
          </p>
        )}

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            Temps d'étude — 14 derniers jours
          </h2>
          {study && study.total === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Aucune session enregistrée. Lance le minuteur Pomodoro (icône ⏱ en haut à droite) pendant que tu travailles.
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
              {study?.byDay.map((d) => (
                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    title={`${d.day} — ${fmtDuration(d.seconds)}`}
                    style={{
                      width: '100%', maxWidth: 28, borderRadius: 4,
                      height: `${Math.max(2, (d.seconds / maxDaySeconds) * 100)}%`,
                      background: d.seconds > 0 ? 'var(--accent)' : 'var(--bg-overlay)'
                    }}
                  />
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {study && study.bySubject.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
              Par matière — 30 derniers jours
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {study.bySubject.map((row) => {
                const subject = subjects.find((s) => s.id === row.subjectId)
                return (
                  <div key={row.subjectId ?? 'none'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                      <span>{subject ? `${subject.emoji} ${subject.name}` : 'Sans matière'}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{fmtDuration(row.seconds)}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(row.seconds / maxSubjectSeconds) * 100}%`, background: subject?.color ?? 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
            Quiz {quizAvg !== null && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· moyenne {quizAvg}%</span>}
          </h2>
          {quizzes.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aucun quiz passé pour l'instant.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {quizzes.slice(0, 10).map((q) => {
                const pct = Math.round((q.score / q.total) * 100)
                return (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.topic}</span>
                    <span style={{ color: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>
                      {q.score}/{q.total}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
