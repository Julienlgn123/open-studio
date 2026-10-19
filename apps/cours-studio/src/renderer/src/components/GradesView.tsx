import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Award, Plus, Trash2, Target } from 'lucide-react'
import { useStore } from '../store'
import { average, neededScore, dayKey, type Grade } from '../lib/planner'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }
const field: React.CSSProperties = { background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, minWidth: 0 }
const fmt = (n: number | null): string => (n === null ? '—' : n.toFixed(2).replace('.', ',').replace(/,00$/, ''))
const tone = (n: number | null): string => (n === null ? 'var(--text-tertiary)' : n >= 14 ? 'var(--success, #22c55e)' : n >= 10 ? 'var(--accent)' : 'var(--danger, #ef4444)')

function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 120, h = 30
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (Math.max(0, Math.min(20, v)) / 20) * h}`).join(' ')
  return <svg width={w} height={h} style={{ overflow: 'visible' }}><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" /></svg>
}

export default function GradesView() {
  const { subjects, setView } = useStore() as any
  const [grades, setGrades] = useState<Grade[]>([])
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [score, setScore] = useState('')
  const [outOf, setOutOf] = useState('20')
  const [coef, setCoef] = useState('1')
  const [date, setDate] = useState(dayKey(Date.now()))
  const [target, setTarget] = useState(() => { try { return localStorage.getItem('cours.gradeTarget') ?? '12' } catch { return '12' } })
  const [nextCoef, setNextCoef] = useState('1')

  const load = () => api.planner.grades().then(setGrades)
  useEffect(() => { load() }, [])
  useEffect(() => { try { localStorage.setItem('cours.gradeTarget', target) } catch { /* ok */ } }, [target])

  async function add() {
    const sc = Number(score.replace(',', '.'))
    if (!title.trim() || !Number.isFinite(sc) || score === '') return
    await api.planner.saveGrade({ title: title.trim(), subjectId: subjectId || null, score: sc, outOf: Number(outOf) || 20, coef: Number(coef) || 1, date: new Date(date + 'T12:00:00').getTime() })
    setTitle(''); setScore(''); load()
  }

  const groups = useMemo(() => {
    const ids = [...new Set(grades.map((g) => g.subjectId))]
    return ids.map((id) => {
      const list = grades.filter((g) => g.subjectId === id)
      const chrono = [...list].sort((a, b) => a.date - b.date)
      return { id, subject: subjects.find((s: any) => s.id === id), list, avg: average(list), coef: Math.max(...list.map((g) => g.coef)), trend: chrono.map((g) => (g.score / g.outOf) * 20) }
    }).sort((a, b) => (a.subject?.name ?? 'zz').localeCompare(b.subject?.name ?? 'zz'))
  }, [grades, subjects])

  // moyenne générale : moyenne des matières (chacune pesée par la somme de ses coefficients)
  const general = useMemo(() => {
    let n = 0, d = 0
    for (const g of groups) { if (g.avg === null) continue; const w = g.list.reduce((a, x) => a + x.coef, 0); n += g.avg * w; d += w }
    return d ? n / d : null
  }, [groups])

  const tgt = Number(target.replace(',', '.')) || 0
  const nc = Number(nextCoef) || 1

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <Award size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Notes & moyennes</h1>
        </div>
        <div className="page-header-right">
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Moyenne générale</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: tone(general) }}>{fmt(general)}<span style={{ fontSize: 12, fontWeight: 400 }}> / 20</span></span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <input style={{ ...field, flex: '2 1 180px' }} placeholder="Évaluation (ex : DS n°2)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select style={{ ...field, flex: '1 1 140px' }} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Sans matière</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
            <input style={{ ...field, width: 70 }} placeholder="Note" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <span style={{ alignSelf: 'center', color: 'var(--text-tertiary)' }}>/</span>
            <input style={{ ...field, width: 56 }} title="Barème" value={outOf} onChange={(e) => setOutOf(e.target.value)} />
            <input style={{ ...field, width: 60 }} title="Coefficient" placeholder="Coef" value={coef} onChange={(e) => setCoef(e.target.value)} />
            <input style={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={add} disabled={!title.trim() || score === ''}><Plus size={13} /> Ajouter</button>
          </div>

          {groups.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aucune note pour l'instant. Ajoute tes évaluations pour suivre tes moyennes par matière.</p>}

          <div style={{ display: 'grid', gap: 14 }}>
            {groups.map((g) => {
              const need = neededScore(g.list, tgt, nc)
              return (
                <div key={g.id ?? 'none'} style={{ ...card, borderLeft: `3px solid ${g.subject?.color ?? 'var(--border)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontWeight: 600 }}>{g.subject ? `${g.subject.emoji} ${g.subject.name}` : 'Sans matière'}</div>
                    <Trend values={g.trend} />
                    <div style={{ fontSize: 20, fontWeight: 700, color: tone(g.avg) }}>{fmt(g.avg)}</div>
                  </div>
                  {g.list.map((x) => (
                    <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '3px 0' }}>
                      <span style={{ flex: 1 }}>{x.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(x.date).toLocaleDateString('fr-FR')} · coef {x.coef}</span>
                      <span style={{ width: 70, textAlign: 'right', fontWeight: 600 }}>{fmt(x.score)}/{fmt(x.outOf)}</span>
                      <button className="icon-btn" onClick={async () => { await api.planner.deleteGrade(x.id); load() }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {need !== null && g.avg !== null && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Target size={12} />
                      {need <= 0 ? `Objectif ${tgt} déjà assuré.` : need > 20 ? `Objectif ${tgt} hors de portée avec un prochain coef ${nc}.` : <>Pour atteindre <b>{tgt}</b> avec un coef {nc} : il faut au moins <b style={{ color: tone(need > 14 ? 5 : 15) }}>{fmt(Math.ceil(need * 100) / 100)}/20</b>.</>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {groups.length > 0 && (
            <div style={{ ...card, marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <Target size={14} /> Simulateur :
              objectif <input style={{ ...field, width: 60 }} value={target} onChange={(e) => setTarget(e.target.value)} /> / 20,
              prochaine évaluation coef <input style={{ ...field, width: 60 }} value={nextCoef} onChange={(e) => setNextCoef(e.target.value)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
