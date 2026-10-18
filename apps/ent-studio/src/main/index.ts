import { host } from '@open-studio/module'
import { kitFetch, notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import { diffCourses, parseIcs, type Change, type ChangeSet, type Course } from '../shared/ics'
import type { EntSettings, EntState } from '../shared/types'

// ENT Studio : emploi du temps ADE lu depuis l'URL iCalendar générée dans ADE. Mis à jour au
// lancement d'Open Studio puis régulièrement ; chaque changement de cours est signalé.

const DEFAULTS: EntSettings = { url: '', notify: true, refreshMin: 30 }
let syncing = false
let lastError: string | null = null
let timer: NodeJS.Timeout | null = null

const settings = (): EntSettings => ({ ...DEFAULTS, ...storeGet<Partial<EntSettings>>('settings', {}) })

function state(): EntState {
  return {
    settings: settings(),
    courses: storeGet<Course[]>('courses', []),
    lastSync: storeGet<number | null>('lastSync', null),
    lastError,
    history: storeGet<ChangeSet[]>('history', []),
    syncing
  }
}

const push = (): void => host.send('ent:state', state())

/** Résumé d'un changement, pour une notification. */
function describe(c: Change): string {
  const course = (c.after ?? c.before)!
  const day = new Date(course.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const h = (t: number): string => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  switch (c.type) {
    case 'added':
      return `Nouveau : ${course.name}, ${day} à ${h(course.start)}`
    case 'removed':
      return `Supprimé : ${course.name} du ${day}`
    case 'moved':
      return `Déplacé : ${course.name} → ${day} à ${h(course.start)}`
    case 'room':
      return `Salle changée : ${course.name} → ${c.after!.location || 'aucune'}`
    case 'teacher':
      return `Enseignant changé : ${course.name} → ${c.after!.teachers.join(', ') || '—'}`
    default:
      return `Modifié : ${course.name}`
  }
}

async function download(url: string): Promise<Course[]> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Colle l’adresse complète, qui commence par https://')
  let res
  try {
    res = await kitFetch(url, { timeoutMs: 30_000, headers: { 'User-Agent': 'Mozilla/5.0 (Open Studio ENT)' } })
  } catch {
    throw new Error('Pas de connexion à ADE (Internet ou serveur de la fac indisponible).')
  }
  if (!res.ok) throw new Error(`ADE a répondu ${res.status} : vérifie le lien, ou génère-en un nouveau.`)
  return parseIcs(res.body)
}

/** Télécharge l'emploi du temps, compare avec la version connue, prévient en cas de changement. */
async function sync(): Promise<EntState> {
  const { url, notify: wantNotify } = settings()
  if (!url || syncing) return state()
  syncing = true
  push()
  try {
    const next = await download(url)
    const prev = storeGet<Course[]>('courses', [])
    const hadData = storeGet<number | null>('lastSync', null) !== null
    const changes = hadData ? diffCourses(prev, next) : []
    storeSet('courses', next)
    storeSet('lastSync', Date.now())
    lastError = null
    if (changes.length) {
      const history = [{ at: Date.now(), changes, seen: false }, ...storeGet<ChangeSet[]>('history', [])].slice(0, 30)
      storeSet('history', history)
      if (wantNotify) {
        const title = changes.length === 1 ? 'Ton emploi du temps a changé' : `Ton emploi du temps a changé (${changes.length} cours)`
        notify(title, changes.slice(0, 3).map(describe).join('\n') + (changes.length > 3 ? '\n…' : ''), { channel: 'ent:openChanges' })
      }
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
  } finally {
    syncing = false
  }
  push()
  return state()
}

function schedule(): void {
  if (timer) clearInterval(timer)
  timer = setInterval(() => void sync(), Math.max(5, settings().refreshMin) * 60_000)
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('ent:state', () => state())
  ipc.handle('ent:sync', () => sync())
  /** Nouveau lien : vérifié avant d'être enregistré (on garde l'ancien s'il ne marche pas). */
  ipc.handle('ent:connect', async (_e, url: string) => {
    const clean = url.trim()
    const courses = await download(clean)
    storeSet('settings', { ...settings(), url: clean })
    storeSet('courses', courses)
    storeSet('lastSync', Date.now())
    storeSet('history', [])
    lastError = null
    push()
    return state()
  })
  ipc.handle('ent:settings', (_e, patch: Partial<EntSettings>) => {
    storeSet('settings', { ...settings(), ...patch })
    schedule()
    push()
    return state()
  })
  ipc.handle('ent:markSeen', () => {
    storeSet('history', storeGet<ChangeSet[]>('history', []).map((h) => ({ ...h, seen: true })))
    push()
    return state()
  })
  ipc.handle('ent:disconnect', () => {
    for (const k of ['courses', 'history']) storeSet(k, [])
    storeSet('lastSync', null)
    storeSet('settings', { ...settings(), url: '' })
    push()
    return state()
  })

  // Mise à jour au lancement, puis à intervalle régulier.
  setTimeout(() => void sync(), 2_000)
  schedule()
}

export function deactivate(): void {
  if (timer) clearInterval(timer)
}
