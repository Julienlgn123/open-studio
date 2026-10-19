import type { PlanEvent, Repeat } from '../../shared/types'

export const pad = (n: number): string => String(n).padStart(2, '0')
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = (): string => ymd(new Date())
export const long = (s: string): string => parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
export const short = (s: string): string => parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
export const addDays = (s: string, n: number): string => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export const byTime = (a: PlanEvent, b: PlanEvent): number => (a.start_time ?? '').localeCompare(b.start_time ?? '')
export const mondayOf = (s: string): string => {
  const d = parse(s)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}

export const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'daily', label: 'Tous les jours' },
  { id: 'weekdays', label: 'Du lundi au vendredi' },
  { id: 'weekly', label: 'Chaque semaine' },
  { id: 'monthly', label: 'Chaque mois' },
  { id: 'yearly', label: 'Chaque année' }
]

/** L'événement (éventuellement répété) a-t-il lieu ce jour-là ? */
export function occursOn(e: PlanEvent, day: string): boolean {
  if (e.date === day) return true
  if (!e.repeat || day < e.date || (e.repeat_until && day > e.repeat_until)) return false
  const a = parse(e.date)
  const b = parse(day)
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
export const eventsOn = (events: PlanEvent[], day: string): PlanEvent[] => events.filter((e) => occursOn(e, day)).sort(byTime)

// ─── Saisie en langage naturel ─────────────────────────────────────────────────────────────

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export interface Parsed {
  title: string
  date: string | null
  start: string | null
  end: string | null
  repeat: Repeat | null
  priority: 'high' | null
}

/**
 * « Réunion demain 14h-15h30 », « Rendre le TP vendredi ! », « Sport tous les lundis 18h »,
 * « Dentiste le 12/11 à 9h15 », « Anniversaire de Léa 3 mars »…
 */
export function parseQuick(input: string): Parsed {
  let s = ` ${input.trim()} `
  const out: Parsed = { title: '', date: null, start: null, end: null, repeat: null, priority: null }
  const now = new Date()
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): void => {
    const m = s.match(re)
    if (m) {
      fn(m)
      s = s.replace(m[0], ' ')
    }
  }
  take(/\s!+\s|\s(?:urgent|important)\s/i, () => (out.priority = 'high'))
  take(/\s(?:tous les jours|chaque jour|quotidien(?:nement)?)\s/i, () => (out.repeat = 'daily'))
  take(/\s(?:en semaine|du lundi au vendredi)\s/i, () => (out.repeat = 'weekdays'))
  take(/\s(?:tous les mois|chaque mois)\s/i, () => (out.repeat = 'monthly'))
  take(/\s(?:tous les ans|chaque année)\s/i, () => (out.repeat = 'yearly'))
  take(new RegExp(`\\s(?:tous les|chaque)\\s+(${DAYS.join('|')})s?\\s`, 'i'), (m) => {
    out.repeat = 'weekly'
    const d = new Date(now)
    const target = DAYS.indexOf(m[1].toLowerCase())
    d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7))
    out.date = ymd(d)
  })
  take(/\s(?:toutes les semaines|chaque semaine)\s/i, () => (out.repeat = 'weekly'))
  // Heures : 14h, 14h30, 14:30, de 14h à 16h, 14h-16h
  take(/\s(?:de\s+|à\s+)?(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:-|–|à|jusqu'à)\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s/i, (m) => {
    out.start = `${pad(Number(m[1]))}:${m[2] ?? '00'}`
    out.end = `${pad(Number(m[3]))}:${m[4] ?? '00'}`
  })
  if (!out.start) take(/\s(?:à\s+)?(\d{1,2})\s*[h:]\s*(\d{2})?\s/i, (m) => (out.start = `${pad(Number(m[1]))}:${m[2] ?? '00'}`))
  take(/\s(?:aujourd['’]hui|ce soir|tout à l['’]heure)\s/i, (m) => {
    out.date = today()
    if (/soir/i.test(m[0]) && !out.start) out.start = '19:00'
  })
  take(/\saprès[- ]demain\s/i, () => (out.date = addDays(today(), 2)))
  take(/\sdemain(?:\s+matin|\s+soir)?\s/i, (m) => {
    out.date = addDays(today(), 1)
    if (/matin/i.test(m[0]) && !out.start) out.start = '09:00'
    if (/soir/i.test(m[0]) && !out.start) out.start = '19:00'
  })
  take(/\sdans\s+(\d+)\s+(jours?|semaines?|mois)\s/i, (m) => {
    const n = Number(m[1])
    const d = new Date(now)
    if (/jour/i.test(m[2])) d.setDate(d.getDate() + n)
    else if (/semaine/i.test(m[2])) d.setDate(d.getDate() + 7 * n)
    else d.setMonth(d.getMonth() + n)
    out.date = ymd(d)
  })
  take(/\s(?:le\s+)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s/, (m) => {
    let y = m[3] ? Number(m[3]) : now.getFullYear()
    if (y < 100) y += 2000
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]))
    if (!m[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(y + 1)
    out.date = ymd(d)
  })
  take(new RegExp(`\\s(?:le\\s+)?(\\d{1,2})(?:er)?\\s+(${MONTHS.join('|')}|${MONTHS.map((x) => x.slice(0, 3)).join('|')})\\.?(?:\\s+(\\d{4}))?\\s`, 'i'), (m) => {
    const mi = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)))
    const d = new Date(m[3] ? Number(m[3]) : now.getFullYear(), mi, Number(m[1]))
    if (!m[3] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(d.getFullYear() + 1)
    out.date = ymd(d)
  })
  if (!out.date)
    take(new RegExp(`\\s(?:ce\\s+|le\\s+)?(${DAYS.join('|')})(?:\\s+prochain)?\\s`, 'i'), (m) => {
      const d = new Date(now)
      const target = DAYS.indexOf(m[1].toLowerCase())
      d.setDate(d.getDate() + (((target - d.getDay() + 7) % 7) || 7))
      out.date = ymd(d)
    })
  take(/\sla semaine prochaine\s/i, () => (out.date = addDays(mondayOf(today()), 7)))
  if (out.start && !out.date) out.date = today()
  out.title = s.replace(/\s+/g, ' ').replace(/\s(?:le|à|de|pour)\s*$/i, '').trim()
  out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1)
  return out
}

// ─── iCalendar (.ics) ──────────────────────────────────────────────────────────────────────

const icsEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
const icsDate = (d: string, t?: string | null): string => (t ? `${d.replace(/-/g, '')}T${t.replace(':', '')}00` : d.replace(/-/g, ''))
const RRULE: Record<Repeat, string> = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }

export function toIcs(events: PlanEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Studio//Plan Studio//FR', 'CALSCALE:GREGORIAN']
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@plan-studio`, `DTSTAMP:${stamp}`)
    if (e.start_time) {
      lines.push(`DTSTART:${icsDate(e.date, e.start_time)}`, `DTEND:${icsDate(e.date, e.end_time ?? e.start_time)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`)
    }
    lines.push(`SUMMARY:${icsEscape(`${e.emoji && e.emoji !== '📅' ? `${e.emoji} ` : ''}${e.title}`)}`)
    if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`)
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`)
    if (e.repeat) lines.push(`RRULE:${RRULE[e.repeat]}${e.repeat_until ? `;UNTIL=${icsDate(e.repeat_until)}` : ''}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** Lecture simple d'un .ics (Google Agenda, Outlook, ENT…). */
export function fromIcs(text: string): Partial<PlanEvent>[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const out: Partial<PlanEvent>[] = []
  const un = (s: string): string => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0]
    const get = (key: string): { params: string; value: string } | null => {
      const m = body.match(new RegExp(`^${key}((?:;[^:\\r\\n]*)?):(.*)$`, 'm'))
      return m ? { params: m[1], value: m[2].trim() } : null
    }
    const start = get('DTSTART')
    if (!start) continue
    const end = get('DTEND')
    const parseIcs = (v: string, utc: boolean): { date: string; time: string | null } => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
      if (!m) return { date: today(), time: null }
      if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null }
      if (utc) {
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])))
        return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
      }
      return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` }
    }
    const s = parseIcs(start.value, start.value.endsWith('Z'))
    const e = end ? parseIcs(end.value, end.value.endsWith('Z')) : null
    const rr = get('RRULE')?.value ?? ''
    const freq = rr.match(/FREQ=(\w+)/)?.[1]
    const until = rr.match(/UNTIL=(\d{8})/)?.[1]
    out.push({
      title: un(get('SUMMARY')?.value ?? 'Sans titre'),
      date: s.date,
      start_time: s.time,
      end_time: e?.time ?? null,
      emoji: '📅',
      notes: get('DESCRIPTION') ? un(get('DESCRIPTION')!.value) : null,
      location: get('LOCATION') ? un(get('LOCATION')!.value) : null,
      repeat: freq === 'DAILY' ? 'daily' : freq === 'WEEKLY' ? (/BYDAY=MO,TU,WE,TH,FR/.test(rr) ? 'weekdays' : 'weekly') : freq === 'MONTHLY' ? 'monthly' : freq === 'YEARLY' ? 'yearly' : null,
      repeat_until: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null
    })
  }
  return out
}
