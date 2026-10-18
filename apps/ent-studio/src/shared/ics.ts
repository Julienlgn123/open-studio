// Lecture d'un flux iCalendar ADE (export « Générer URL ») et comparaison entre deux versions.

export interface Course {
  /** UID ADE : stable d'un export à l'autre pour une même séance. */
  uid: string
  start: number
  end: number
  /** Intitulé brut (« R110 Anglais technique 1 TP A »). */
  summary: string
  /** Code de la ressource (R110, SAÉ104…), si présent. */
  code: string | null
  /** Nom lisible de la matière. */
  name: string
  /** CM, TD, TP, DS, Examen… */
  kind: string | null
  location: string
  teachers: string[]
  groups: string[]
}

export type ChangeType = 'added' | 'removed' | 'moved' | 'room' | 'teacher' | 'renamed'

export interface Change {
  type: ChangeType
  uid: string
  before?: Course
  after?: Course
}

export interface ChangeSet {
  at: number
  changes: Change[]
  seen: boolean
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

const unescape = (v: string): string => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

/** Date iCal : « 20261109T120000Z » (UTC), « 20261109T120000 » (heure locale) ou « 20261109 ». */
function parseDate(v: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v.trim())
  if (!m) return NaN
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m
  return z
    ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    : new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime()
}

const KINDS: [RegExp, string][] = [
  [/^(CM|AMPHI|COURS)$/i, 'CM'],
  [/^TD$/i, 'TD'],
  [/^TP$/i, 'TP'],
  [/^(DS|CC|EXAM|EXAMEN|PARTIEL|CONTR[OÔ]LE)$/i, 'Examen'],
  [/^PROJET$/i, 'Projet'],
  [/^RN$/i, 'RN']
]

/** « R103 Réseaux locaux et équipements actifs  TD AB » → code, nom, type. */
function splitSummary(summary: string): { code: string | null; name: string; kind: string | null } {
  let words = summary.trim().split(/\s+/)
  let code: string | null = null
  if (words.length > 1 && /^[A-ZÉÈ]{1,5}\d{2,4}[A-Z]?$/i.test(words[0]) && /\d/.test(words[0])) code = words.shift() ?? null
  let kind: string | null = null
  // Le type est souvent l'avant-dernier ou le dernier mot (« … TD AB », « … TP A », « … CM »).
  for (let i = words.length - 1; i >= Math.max(0, words.length - 3); i--) {
    const k = KINDS.find(([re]) => re.test(words[i]))
    if (k) {
      kind = k[1]
      words = words.slice(0, i)
      break
    }
  }
  let name = words.join(' ').trim() || summary.trim()
  // « VIE ETUDIANTE » → « Vie etudiante » : plus lisible que tout en majuscules.
  if (name === name.toUpperCase() && /[A-Z]{3}/.test(name)) name = name.charAt(0) + name.slice(1).toLowerCase()
  return { code, name, kind }
}

/** Ligne de description : un nom d'enseignant (MAJUSCULES, sans chiffre) ou un groupe (« R&T1 A »). */
function splitDescription(desc: string): { teachers: string[]; groups: string[] } {
  const lines = desc
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\(?export/i.test(l))
  const teachers: string[] = []
  const groups: string[] = []
  for (const l of lines) {
    if (!/\d/.test(l) && /[A-ZÀ-Ý]{2,}/.test(l) && l === l.toUpperCase() && !/&/.test(l)) teachers.push(l)
    else groups.push(l)
  }
  return { teachers, groups }
}

/** Les séances du flux, triées, sans doublon (même UID, ou même cours au même moment dans la même salle). */
export function parseIcs(text: string): Course[] {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('Ce lien ne renvoie pas un emploi du temps (format iCalendar attendu).')
  const out = new Map<string, Course>()
  const seen = new Set<string>()
  let cur: Record<string, string> | null = null
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT' && cur) {
      const start = parseDate(cur.DTSTART ?? '')
      const end = parseDate(cur.DTEND ?? cur.DTSTART ?? '')
      const summary = unescape(cur.SUMMARY ?? '').trim()
      if (!isNaN(start) && summary) {
        const location = unescape(cur.LOCATION ?? '').trim()
        const { teachers, groups } = splitDescription(unescape(cur.DESCRIPTION ?? ''))
        const course: Course = { uid: cur.UID || `${start}-${summary}`, start, end: isNaN(end) ? start : end, summary, location, teachers, groups, ...splitSummary(summary) }
        const sameSlot = `${course.start}|${course.end}|${course.summary}|${course.location}`
        if (!out.has(course.uid) && !seen.has(sameSlot)) {
          out.set(course.uid, course)
          seen.add(sameSlot)
        }
      }
      cur = null
    } else if (cur) {
      const i = line.indexOf(':')
      if (i > 0) cur[line.slice(0, i).split(';')[0].toUpperCase()] = line.slice(i + 1)
    }
  }
  return [...out.values()].sort((a, b) => a.start - b.start)
}

/**
 * Ce qui a changé entre deux versions, pour les séances à venir seulement (les horodatages
 * d'export d'ADE changent à chaque fois : seuls l'heure, la salle, l'enseignant et l'intitulé comptent).
 */
export function diffCourses(before: Course[], after: Course[], now = Date.now()): Change[] {
  const prev = new Map(before.map((c) => [c.uid, c]))
  const next = new Map(after.map((c) => [c.uid, c]))
  const changes: Change[] = []
  for (const c of after) {
    const old = prev.get(c.uid)
    if (!old) {
      if (c.end >= now) changes.push({ type: 'added', uid: c.uid, after: c })
      continue
    }
    if (Math.max(old.end, c.end) < now) continue
    if (old.start !== c.start || old.end !== c.end) changes.push({ type: 'moved', uid: c.uid, before: old, after: c })
    else if (old.location !== c.location) changes.push({ type: 'room', uid: c.uid, before: old, after: c })
    else if (old.teachers.join() !== c.teachers.join()) changes.push({ type: 'teacher', uid: c.uid, before: old, after: c })
    else if (old.summary !== c.summary) changes.push({ type: 'renamed', uid: c.uid, before: old, after: c })
  }
  for (const c of before) if (!next.has(c.uid) && c.end >= now) changes.push({ type: 'removed', uid: c.uid, before: c })
  return changes.sort((a, b) => (a.after ?? a.before)!.start - (b.after ?? b.before)!.start)
}
