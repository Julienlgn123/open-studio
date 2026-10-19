export interface Exam { id: string; subjectId: string | null; title: string; date: number; coef: number; notes: string }
export interface Task { id: string; subjectId: string | null; courseId: string | null; title: string; dueAt: number | null; done: boolean; priority: number }
export interface Grade { id: string; subjectId: string | null; title: string; score: number; outOf: number; coef: number; date: number }
export interface MiniCourse { id: string; subjectId: string; title: string; emoji: string }

export interface PlanItem { day: string; examId: string; examTitle: string; subjectId: string | null; kind: 'learn' | 'review' | 'final'; courseId?: string; label: string }

export const dayKey = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const startOfDay = (t: number): number => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

export function daysUntil(t: number, now = Date.now()): number {
  return Math.round((startOfDay(t) - startOfDay(now)) / 86_400_000)
}

/**
 * Plan de révision : pour chaque examen à venir, répartit les cours de la matière sur les jours
 * restants (un cours par jour au plus, ceux déjà vus d'abord), garde les 2 derniers jours pour
 * une relecture générale (flashcards + quiz) et le dernier pour la fiche de synthèse.
 */
export function buildPlan(exams: Exam[], courses: MiniCourse[], now = Date.now()): PlanItem[] {
  const out: PlanItem[] = []
  for (const ex of exams) {
    const left = daysUntil(ex.date, now)
    if (left < 0) continue
    const mine = courses.filter((c) => c.subjectId === ex.subjectId)
    const day = (offset: number): string => dayKey(startOfDay(now) + offset * 86_400_000 + 3_600_000 * 12)
    if (left === 0) { out.push({ day: day(0), examId: ex.id, examTitle: ex.title, subjectId: ex.subjectId, kind: 'final', label: 'Jour J : relis ta fiche de synthèse' }); continue }
    // jours disponibles : aujourd'hui .. veille de l'examen
    const reviewDays = left >= 4 ? 2 : left >= 2 ? 1 : 0
    const learnSlots = Math.max(0, left - reviewDays)
    // on étale les cours sur les créneaux d'apprentissage
    const n = mine.length
    for (let i = 0; i < learnSlots; i++) {
      if (n === 0) break
      // si plus de cours que de jours, certains créneaux en regroupent plusieurs
      const from = Math.floor((i * n) / learnSlots)
      const to = Math.max(from + 1, Math.floor(((i + 1) * n) / learnSlots))
      for (const c of mine.slice(from, to)) {
        out.push({ day: day(i), examId: ex.id, examTitle: ex.title, subjectId: ex.subjectId, kind: 'learn', courseId: c.id, label: `Apprendre « ${c.title} »` })
      }
    }
    if (n === 0 && left > 0) out.push({ day: day(0), examId: ex.id, examTitle: ex.title, subjectId: ex.subjectId, kind: 'learn', label: 'Crée tes cours pour cette matière' })
    for (let r = 0; r < reviewDays; r++) {
      out.push({
        day: day(left - reviewDays + r), examId: ex.id, examTitle: ex.title, subjectId: ex.subjectId, kind: 'review',
        label: r === reviewDays - 1 ? 'Quiz blanc + fiche de révision' : 'Flashcards de toute la matière'
      })
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

/** Moyenne pondérée ramenée sur 20. */
export function average(grades: Pick<Grade, 'score' | 'outOf' | 'coef'>[]): number | null {
  let num = 0, den = 0
  for (const g of grades) {
    if (!(g.outOf > 0) || !(g.coef > 0)) continue
    num += (g.score / g.outOf) * 20 * g.coef
    den += g.coef
  }
  return den ? num / den : null
}

/** Note (sur 20) à obtenir à la prochaine évaluation de coef `coef` pour atteindre `target`. */
export function neededScore(grades: Pick<Grade, 'score' | 'outOf' | 'coef'>[], target: number, coef: number): number | null {
  let num = 0, den = 0
  for (const g of grades) {
    if (!(g.outOf > 0) || !(g.coef > 0)) continue
    num += (g.score / g.outOf) * 20 * g.coef
    den += g.coef
  }
  if (!(coef > 0)) return null
  return (target * (den + coef) - num) / coef
}
