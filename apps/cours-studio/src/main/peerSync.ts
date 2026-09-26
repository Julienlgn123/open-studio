import { app, BrowserWindow } from 'electron'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { createSocket, type Socket } from 'dgram'
import { createServer, type IncomingMessage, type Server } from 'http'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { basename, dirname, join } from 'path'
import { getDb } from './db'

// Synchro continue entre PC déjà associés. Une fois associés (synchro complète ou simple
// association avec le code), les deux Cours Studio se retrouvent tout seuls sur le réseau
// local dès qu'ils sont ouverts, et peuvent :
//  - s'envoyer un cours (clic droit → « Envoyer à … ») ;
//  - comparer leurs cours et se remettre d'accord : pour chaque cours, celui qui a changé
//    depuis la dernière synchro donne sa version ; si les deux ont changé, la plus récente
//    gagne et l'autre est gardée dans l'historique du cours.
// Chaque requête est signée (HMAC) et chiffrée (AES-256-GCM) avec le secret de l'association :
// un appareil non associé ne peut ni lire ni écrire quoi que ce soit.

const PRESENCE_PORT = 47812
const BEACON_PORT = 47813
const MAGIC = 'cours-studio-peer'
const MAX_SKEW_MS = 2 * 60_000

// ─── Associations (fichier local, jamais transféré par la synchro) ───────────

interface Pairing {
  name: string
  secret: string
  pairedAt: number
  lastSyncAt: number | null
  /** Empreinte de chaque cours au moment de la dernière synchro avec ce PC. */
  baseline: Record<string, string>
}
interface PeerStore {
  deviceId: string
  devices: Record<string, Pairing>
}

const storePath = (): string => join(app.getPath('userData'), 'paired-devices.json')

function loadStore(): PeerStore {
  try {
    const s = JSON.parse(readFileSync(storePath(), 'utf-8')) as PeerStore
    if (s.deviceId && s.devices) return s
  } catch {
    /* premier lancement */
  }
  const fresh: PeerStore = { deviceId: randomUUID(), devices: {} }
  saveStore(fresh)
  return fresh
}
function saveStore(s: PeerStore): void {
  writeFileSync(storePath(), JSON.stringify(s, null, 2))
}

export const myDeviceId = (): string => loadStore().deviceId

export function addPairing(peerId: string, name: string, secret: Buffer, baseline: Record<string, string>): void {
  const s = loadStore()
  s.devices[peerId] = { name, secret: secret.toString('hex'), pairedAt: Date.now(), lastSyncAt: Date.now(), baseline }
  saveStore(s)
  startPresence()
  notifyPeers()
}

export function unpair(peerId: string): void {
  const s = loadStore()
  delete s.devices[peerId]
  saveStore(s)
  online.delete(peerId)
  if (!Object.keys(s.devices).length) stopPresence()
  notifyPeers()
}

// ─── État des cours ──────────────────────────────────────────────────────────

export interface CourseState {
  id: string
  title: string
  emoji: string
  subjectName: string
  updatedAt: number
  deletedAt: number | null
  /** Somme des révisions de flashcards : départage deux versions de même date. */
  reps: number
  fp: string
}

/** Morceau de chemin à partir de « attachments » ou « recordings » (identique sur les deux PC). */
function dataRel(p: string | null | undefined): string | null {
  if (!p) return null
  const parts = p.split(/[\\/]+/)
  const i = Math.max(parts.lastIndexOf('attachments'), parts.lastIndexOf('recordings'))
  return i < 0 ? null : parts.slice(i).join('/')
}
const localPath = (rel: string | null): string | null => (rel ? join(app.getPath('userData'), ...rel.split('/')) : null)

export function localState(): CourseState[] {
  const db = getDb()
  const courses = db
    .prepare(
      `SELECT c.*, s.name AS subject_name FROM courses c LEFT JOIN subjects s ON s.id = c.subject_id`
    )
    .all() as any[]
  const tagsBy = groupBy(db.prepare('SELECT course_id, tag_id FROM course_tags').all() as any[])
  const attsBy = groupBy(db.prepare('SELECT course_id, id, size FROM attachments').all() as any[])
  const cardsBy = groupBy(db.prepare('SELECT course_id, id, front, back, reps, due_at, interval_days, ease FROM flashcards').all() as any[])

  return courses.map((c) => {
    const tags = (tagsBy.get(c.id) ?? []).map((t) => t.tag_id).sort()
    const atts = (attsBy.get(c.id) ?? []).map((a) => `${a.id}:${a.size}`).sort()
    const cards = (cardsBy.get(c.id) ?? [])
      .map((f) => `${f.id}|${f.front}|${f.back}|${f.reps}|${f.due_at}|${f.interval_days}|${f.ease}`)
      .sort()
    const fp = createHash('sha256')
      .update(
        JSON.stringify([
          c.subject_id,
          c.title,
          c.emoji,
          c.content,
          !!c.deleted_at,
          c.audio_path ? basename(c.audio_path) : null,
          c.video_path ? basename(c.video_path) : null,
          tags,
          atts,
          cards
        ])
      )
      .digest('hex')
      .slice(0, 32)
    const reps = (cardsBy.get(c.id) ?? []).reduce((n, f) => n + (f.reps ?? 0), 0)
    return {
      id: c.id,
      title: c.title,
      emoji: c.emoji,
      subjectName: c.subject_name ?? '',
      updatedAt: c.updated_at,
      deletedAt: c.deleted_at ?? null,
      reps,
      fp
    }
  })
}

function groupBy(rows: any[]): Map<string, any[]> {
  const m = new Map<string, any[]>()
  for (const r of rows) {
    const list = m.get(r.course_id) ?? []
    list.push(r)
    m.set(r.course_id, list)
  }
  return m
}

export const fingerprints = (): Record<string, string> => Object.fromEntries(localState().map((s) => [s.id, s.fp]))

// ─── Paquet complet d'un cours ───────────────────────────────────────────────

interface Bundle {
  subject: any
  course: any
  versions: any[]
  tags: any[]
  tagIds: string[]
  attachments: any[]
  flashcards: any[]
  quizzes: any[]
  files: { rel: string; data: string }[]
}

function buildBundle(courseId: string): Bundle | null {
  const db = getDb()
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any
  if (!course) return null
  const files: { rel: string; data: string }[] = []
  const addFile = (rel: string): void => {
    const abs = localPath(rel)
    if (abs && existsSync(abs) && statSync(abs).isFile()) files.push({ rel, data: readFileSync(abs).toString('base64') })
  }
  const walk = (rel: string): void => {
    const abs = localPath(rel)!
    if (!existsSync(abs)) return
    for (const child of readdirSync(abs)) {
      const r = `${rel}/${child}`
      if (statSync(localPath(r)!).isDirectory()) walk(r)
      else addFile(r)
    }
  }
  walk(`attachments/${courseId}`)
  for (const p of [course.audio_path, course.video_path]) {
    const rel = dataRel(p)
    if (rel && !files.some((f) => f.rel === rel)) addFile(rel)
  }
  const tagIds = (db.prepare('SELECT tag_id FROM course_tags WHERE course_id = ?').all(courseId) as any[]).map((r) => r.tag_id)
  return {
    subject: db.prepare('SELECT * FROM subjects WHERE id = ?').get(course.subject_id),
    course: { ...course, audio_path: dataRel(course.audio_path), video_path: dataRel(course.video_path) },
    versions: db.prepare('SELECT * FROM course_versions WHERE course_id = ?').all(courseId) as any[],
    tags: tagIds.length ? (db.prepare(`SELECT * FROM tags WHERE id IN (${tagIds.map(() => '?').join(',')})`).all(...tagIds) as any[]) : [],
    tagIds,
    attachments: (db.prepare('SELECT * FROM attachments WHERE course_id = ?').all(courseId) as any[]).map((a) => ({ ...a, file_path: dataRel(a.file_path) })),
    flashcards: db.prepare('SELECT * FROM flashcards WHERE course_id = ?').all(courseId) as any[],
    quizzes: db.prepare('SELECT * FROM quiz_results WHERE course_id = ?').all(courseId) as any[],
    files
  }
}

const safeRel = (rel: string): boolean =>
  /^(attachments|recordings)\//.test(rel) && !rel.split('/').some((p) => p === '..' || p === '')

/** Installe un cours reçu : remplace la version locale (gardée dans l'historique du cours). */
function applyBundle(b: Bundle, from: string): void {
  const db = getDb()
  const id = b.course.id as string
  for (const f of b.files) {
    if (!safeRel(f.rel)) continue
    const abs = localPath(f.rel)!
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, Buffer.from(f.data, 'base64'))
  }
  const incomingAtt = new Set(b.attachments.map((a) => a.id))
  const staleFiles: string[] = []

  db.transaction(() => {
    const s = b.subject
    if (s) {
      if (db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(s.id)) {
        db.prepare('UPDATE subjects SET name = ?, emoji = ?, color = ? WHERE id = ?').run(s.name, s.emoji, s.color, s.id)
        if (!b.course.deleted_at) db.prepare('UPDATE subjects SET deleted_at = NULL WHERE id = ?').run(s.id)
      } else {
        const max = (db.prepare('SELECT MAX(sort_order) AS m FROM subjects').get() as any).m ?? 0
        db.prepare('INSERT INTO subjects (id, name, emoji, color, created_at, sort_order, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(
          s.id, s.name, s.emoji, s.color, s.created_at, max + 1
        )
      }
    }

    const cur = db.prepare('SELECT content FROM courses WHERE id = ?').get(id) as any
    if (cur && cur.content !== b.course.content && String(cur.content).trim()) {
      db.prepare('INSERT INTO course_versions (id, course_id, content, label, source, ai_action, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(
        randomUUID(), id, cur.content, `Avant la synchro avec ${from}`, 'sync', Date.now()
      )
    }

    const c = b.course
    // UPSERT (pas INSERT OR REPLACE : un remplacement supprimerait les lignes liées en cascade).
    db.prepare(
      `INSERT INTO courses (id, subject_id, title, emoji, content, audio_path, video_path, created_at, updated_at, deleted_at)
       VALUES (@id, @subject_id, @title, @emoji, @content, @audio_path, @video_path, @created_at, @updated_at, @deleted_at)
       ON CONFLICT(id) DO UPDATE SET subject_id = excluded.subject_id, title = excluded.title, emoji = excluded.emoji,
         content = excluded.content, audio_path = excluded.audio_path, video_path = excluded.video_path,
         updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`
    ).run({ ...c, audio_path: localPath(c.audio_path), video_path: localPath(c.video_path), deleted_at: c.deleted_at ?? null })

    const insVersion = db.prepare(
      'INSERT OR IGNORE INTO course_versions (id, course_id, content, label, source, ai_action, created_at) VALUES (@id, @course_id, @content, @label, @source, @ai_action, @created_at)'
    )
    for (const v of b.versions) insVersion.run(v)

    const upTag = db.prepare(
      'INSERT INTO tags (id, name, emoji, color, created_at) VALUES (@id, @name, @emoji, @color, @created_at) ON CONFLICT(id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji, color = excluded.color'
    )
    for (const t of b.tags) upTag.run(t)
    db.prepare('DELETE FROM course_tags WHERE course_id = ?').run(id)
    const insCt = db.prepare('INSERT OR IGNORE INTO course_tags (course_id, tag_id) VALUES (?, ?)')
    for (const t of b.tagIds) insCt.run(id, t)

    for (const a of db.prepare('SELECT id, file_path FROM attachments WHERE course_id = ?').all(id) as any[]) {
      if (!incomingAtt.has(a.id)) staleFiles.push(a.file_path)
    }
    db.prepare('DELETE FROM attachments WHERE course_id = ?').run(id)
    const insAtt = db.prepare(
      'INSERT INTO attachments (id, course_id, file_name, file_path, size, created_at) VALUES (@id, @course_id, @file_name, @file_path, @size, @created_at)'
    )
    for (const a of b.attachments) insAtt.run({ ...a, file_path: localPath(a.file_path) ?? a.file_path })

    db.prepare('DELETE FROM flashcards WHERE course_id = ?').run(id)
    const insCard = db.prepare(
      'INSERT INTO flashcards (id, course_id, front, back, interval_days, ease, due_at, reps, created_at) VALUES (@id, @course_id, @front, @back, @interval_days, @ease, @due_at, @reps, @created_at)'
    )
    for (const f of b.flashcards) insCard.run(f)

    const insQuiz = db.prepare(
      'INSERT OR IGNORE INTO quiz_results (id, course_id, topic, score, total, created_at) VALUES (@id, @course_id, @topic, @score, @total, @created_at)'
    )
    for (const q of b.quizzes) insQuiz.run(q)
  })()

  for (const p of staleFiles) {
    try {
      rmSync(p, { force: true })
    } catch {
      /* déjà absent */
    }
  }
}

// ─── Qui donne quoi ──────────────────────────────────────────────────────────

export interface PlanItem {
  id: string
  title: string
  emoji: string
  subjectName: string
  direction: 'push' | 'pull'
  reason: string
  conflict: boolean
}

function plan(local: CourseState[], remote: CourseState[], baseline: Record<string, string>, peerName: string): PlanItem[] {
  const L = new Map(local.map((s) => [s.id, s]))
  const R = new Map(remote.map((s) => [s.id, s]))
  const out: PlanItem[] = []
  const item = (s: CourseState, direction: 'push' | 'pull', reason: string, conflict = false): PlanItem => ({
    id: s.id, title: s.title, emoji: s.emoji, subjectName: s.subjectName, direction, reason, conflict
  })
  const when = (s: CourseState): number => Math.max(s.updatedAt ?? 0, s.deletedAt ?? 0)

  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(id)
    const r = R.get(id)
    if (l && r && l.fp === r.fp) continue
    if (l && !r) {
      if (!l.deletedAt) out.push(item(l, 'push', `absent sur ${peerName}`))
      continue
    }
    if (!l && r) {
      if (!r.deletedAt) out.push(item(r, 'pull', 'absent ici'))
      continue
    }
    const base = baseline[id]
    if (base && base === r!.fp) out.push(item(l!, 'push', l!.deletedAt ? 'mis à la corbeille ici' : 'modifié ici'))
    else if (base && base === l!.fp) out.push(item(r!, 'pull', r!.deletedAt ? `mis à la corbeille sur ${peerName}` : `modifié sur ${peerName}`))
    else {
      const localWins = when(l!) !== when(r!) ? when(l!) > when(r!) : l!.reps >= r!.reps
      out.push(
        localWins
          ? item(l!, 'push', 'modifié des deux côtés : la version d’ici est la plus récente', true)
          : item(r!, 'pull', `modifié des deux côtés : la version de ${peerName} est la plus récente`, true)
      )
    }
  }
  return out.sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.title.localeCompare(b.title))
}

// ─── Réseau : présence + requêtes signées et chiffrées ───────────────────────

interface Online {
  host: string
  port: number
  seen: number
  pending: number | null
}
const online = new Map<string, Online>()
let server: Server | null = null
let serverPort = 0
let beacon: Socket | null = null
let beaconRx: Socket | null = null
let beaconTimer: NodeJS.Timeout | null = null
let sweepTimer: NodeJS.Timeout | null = null
const seenNonces = new Map<string, number>()

function emit(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

export interface PairedDevice {
  id: string
  name: string
  online: boolean
  pending: number | null
  lastSyncAt: number | null
}

export function listPaired(): PairedDevice[] {
  return Object.entries(loadStore().devices).map(([id, p]) => {
    const o = online.get(id)
    return { id, name: p.name, online: !!o, pending: o?.pending ?? null, lastSyncAt: p.lastSyncAt }
  })
}
const notifyPeers = (): void => emit('peers:changed', listPaired())

const encKey = (secret: string): Buffer => createHash('sha256').update(`${secret}:enc`).digest()
const macOf = (secret: string, parts: string[]): Buffer => createHmac('sha256', Buffer.from(secret, 'hex')).update(parts.join('\n')).digest()

function seal(secret: string, data: unknown): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', encKey(secret), iv)
  const body = Buffer.concat([c.update(Buffer.from(JSON.stringify(data))), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body])
}
function open<T>(secret: string, buf: Buffer): T {
  const d = createDecipheriv('aes-256-gcm', encKey(secret), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf-8')) as T
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => res(Buffer.concat(chunks)))
    req.on('error', rej)
  })
}

function lanBroadcasts(): string[] {
  const out = new Set(['255.255.255.255'])
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue
      const ip = i.address.split('.').map(Number)
      const mask = i.netmask.split('.').map(Number)
      out.add(ip.map((b, k) => (b & mask[k]) | (~mask[k] & 255)).join('.'))
    }
  }
  return [...out]
}

async function handleRequest(req: IncomingMessage): Promise<{ code: number; body?: Buffer }> {
  const from = String(req.headers['x-device'] ?? '')
  const ts = Number(req.headers['x-ts'])
  const nonce = String(req.headers['x-nonce'] ?? '')
  const pairing = loadStore().devices[from]
  if (!pairing || !nonce || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return { code: 403 }
  const raw = await readBody(req)
  const path = (req.url ?? '').split('?')[0]
  const expected = macOf(pairing.secret, [req.method ?? '', path, String(ts), nonce, createHash('sha256').update(raw).digest('hex')])
  const given = Buffer.from(String(req.headers['x-mac'] ?? ''), 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected) || seenNonces.has(nonce)) return { code: 403 }
  seenNonces.set(nonce, Date.now())

  const input = raw.length ? open<any>(pairing.secret, raw) : {}
  const reply = (data: unknown): { code: number; body: Buffer } => ({ code: 200, body: seal(pairing.secret, data) })

  switch (path) {
    case '/hello':
      markOnline(from, String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''), Number(input.port))
      return reply({ ok: true })
    case '/state':
      return reply({ state: localState() })
    case '/pull':
      return reply({ bundles: (input.ids as string[]).map(buildBundle).filter(Boolean) })
    case '/push': {
      const bundles = input.bundles as Bundle[]
      for (const b of bundles) applyBundle(b, pairing.name)
      emit('peersync:received', { from: pairing.name, courseIds: bundles.map((b) => b.course.id), titles: bundles.map((b) => b.course.title), live: !!input.live })
      return reply({ ok: true })
    }
    case '/done': {
      const s = loadStore()
      const p = s.devices[from]
      if (p) {
        Object.assign(p.baseline, input.fps as Record<string, string>)
        p.lastSyncAt = Date.now()
        saveStore(s)
      }
      const o = online.get(from)
      if (o) o.pending = 0
      notifyPeers()
      return reply({ ok: true })
    }
    default:
      return { code: 404 }
  }
}

export function startPresence(): void {
  if (server || !Object.keys(loadStore().devices).length) return
  server = createServer((req, res) => {
    handleRequest(req)
      .then(({ code, body }) => {
        res.writeHead(code, { 'Content-Type': 'application/octet-stream' }).end(body)
      })
      .catch(() => res.writeHead(500).end())
  })
  const listen = (p: number): void => {
    server!.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && p !== 0) listen(0)
    })
    server!.listen(p, '0.0.0.0', () => {
      const addr = server!.address()
      serverPort = typeof addr === 'object' && addr ? addr.port : p
      startBeacon()
    })
  }
  listen(PRESENCE_PORT)

  sweepTimer = setInterval(() => {
    const now = Date.now()
    let changed = false
    for (const [id, o] of online) {
      if (now - o.seen > 10_000) {
        online.delete(id)
        changed = true
      }
    }
    for (const [n, t] of seenNonces) if (now - t > MAX_SKEW_MS * 2) seenNonces.delete(n)
    if (changed) notifyPeers()
  }, 3000)
}

function markOnline(peerId: string, host: string, port: number): void {
  const prev = online.get(peerId)
  // Préfère une vraie adresse du réseau à une adresse auto-attribuée (169.254.x.x).
  if (prev && !prev.host.startsWith('169.254.') && host.startsWith('169.254.')) {
    prev.seen = Date.now()
    return
  }
  online.set(peerId, { host, port, seen: Date.now(), pending: prev?.pending ?? null })
  if (!prev) {
    notifyPeers()
    // Se présente directement à l'autre PC : il nous connaît même s'il ne capte pas nos annonces.
    void request(peerId, '/hello', { port: serverPort })
      .catch(() => {})
      .then(() => refreshPending(peerId))
  }
}

function startBeacon(): void {
  const me = myDeviceId()
  // Écoute des annonces (port fixe, partagé si possible). Si le port est pris, ce PC se fait
  // quand même connaître : ses annonces partent d'une autre prise, et l'autre PC le salue.
  const rx = createSocket({ type: 'udp4', reuseAddr: true })
  rx.on('message', (msg, rinfo) => {
    try {
      const d = JSON.parse(msg.toString('utf-8')) as { app?: string; id?: string; port?: number }
      if (d.app !== MAGIC || !d.id || d.id === me || typeof d.port !== 'number') return
      if (!loadStore().devices[d.id]) return
      markOnline(d.id, rinfo.address, d.port)
    } catch {
      /* paquet étranger */
    }
  })
  rx.on('error', () => {
    try {
      rx.close()
    } catch {
      /* déjà fermé */
    }
  })
  try {
    rx.bind(BEACON_PORT)
  } catch {
    /* ignoré : voir plus haut */
  }
  beaconRx = rx

  const tx = createSocket({ type: 'udp4' })
  tx.on('error', () => {
    /* réseau indisponible : on réessaie au prochain tour */
  })
  tx.bind(() => {
    try {
      tx.setBroadcast(true)
    } catch {
      return
    }
    const shout = (): void => {
      const msg = Buffer.from(JSON.stringify({ app: MAGIC, v: 1, id: me, port: serverPort }))
      for (const t of lanBroadcasts()) {
        try {
          tx.send(msg, BEACON_PORT, t, () => {})
        } catch {
          /* socket fermée */
        }
      }
    }
    shout()
    beaconTimer = setInterval(shout, 3000)
  })
  beacon = tx
}

export function stopPresence(): void {
  if (beaconTimer) clearInterval(beaconTimer)
  if (sweepTimer) clearInterval(sweepTimer)
  beaconTimer = sweepTimer = null
  for (const sock of [beacon, beaconRx]) {
    try {
      sock?.close()
    } catch {
      /* ok */
    }
  }
  beacon = beaconRx = null
  server?.close()
  server = null
  online.clear()
}

async function request<T>(peerId: string, path: string, payload: unknown): Promise<T> {
  const pairing = loadStore().devices[peerId]
  const o = online.get(peerId)
  if (!pairing) throw new Error('Ce PC n’est plus associé.')
  if (!o) throw new Error(`${pairing.name} n’est pas joignable : ouvre Cours Studio dessus, sur le même réseau.`)
  const body = seal(pairing.secret, payload)
  const ts = String(Date.now())
  const nonce = randomBytes(12).toString('hex')
  const mac = macOf(pairing.secret, ['POST', path, ts, nonce, createHash('sha256').update(body).digest('hex')]).toString('hex')
  let res: Response
  try {
    res = await fetch(`http://${o.host}:${o.port}${path}`, {
      method: 'POST',
      headers: { 'x-device': myDeviceId(), 'x-ts': ts, 'x-nonce': nonce, 'x-mac': mac, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(body)
    })
  } catch {
    throw new Error(`Connexion à ${pairing.name} perdue.`)
  }
  if (res.status === 403) throw new Error(`${pairing.name} refuse la connexion : associe à nouveau les deux PC.`)
  if (!res.ok) throw new Error(`${pairing.name} a répondu ${res.status}.`)
  return open<T>(pairing.secret, Buffer.from(await res.arrayBuffer()))
}

/** Ce qu'il faudrait échanger avec ce PC (et dans quel sens). */
export async function getPlan(peerId: string): Promise<PlanItem[]> {
  const pairing = loadStore().devices[peerId]
  if (!pairing) throw new Error('Ce PC n’est plus associé.')
  const { state } = await request<{ state: CourseState[] }>(peerId, '/state', {})
  const items = plan(localState(), state, pairing.baseline, pairing.name)
  const o = online.get(peerId)
  if (o) o.pending = items.length
  notifyPeers()
  return items
}

async function refreshPending(peerId: string): Promise<void> {
  try {
    const items = await getPlan(peerId)
    if (items.length) emit('peersync:proposal', { peerId, name: loadStore().devices[peerId]?.name, count: items.length })
  } catch {
    /* réessayé à la prochaine apparition */
  }
}

/** Applique les échanges choisis : envoie ce qui part d'ici, récupère ce qui vient de l'autre PC. */
export async function runPlan(peerId: string, items: PlanItem[]): Promise<{ pushed: number; pulled: number }> {
  const name = loadStore().devices[peerId]?.name ?? 'l’autre PC'
  const push = items.filter((i) => i.direction === 'push').map((i) => i.id)
  const pull = items.filter((i) => i.direction === 'pull').map((i) => i.id)
  const total = push.length + pull.length
  let done = 0
  const progress = (): void => emit('peersync:progress', { peerId, done, total })

  for (const id of push) {
    const b = buildBundle(id)
    if (b) await request(peerId, '/push', { bundles: [b] })
    done++
    progress()
  }
  for (const id of pull) {
    const { bundles } = await request<{ bundles: Bundle[] }>(peerId, '/pull', { ids: [id] })
    for (const b of bundles) applyBundle(b, name)
    done++
    progress()
  }
  if (pull.length) emit('peersync:received', { from: name, courseIds: pull, titles: [], live: false })
  await finish(peerId, [...push, ...pull])
  return { pushed: push.length, pulled: pull.length }
}

/** Envoie tout de suite des cours à un PC associé (clic droit → « Envoyer à … »). */
export async function sendCourses(peerId: string, courseIds: string[]): Promise<void> {
  const bundles = courseIds.map(buildBundle).filter(Boolean)
  await request(peerId, '/push', { bundles, live: true })
  await finish(peerId, courseIds)
}

/** Les deux PC ont maintenant la même version de ces cours : on s'en souvient des deux côtés. */
async function finish(peerId: string, ids: string[]): Promise<void> {
  const all = fingerprints()
  const fps = Object.fromEntries(ids.filter((id) => all[id]).map((id) => [id, all[id]]))
  await request(peerId, '/done', { fps })
  const s = loadStore()
  const p = s.devices[peerId]
  if (p) {
    Object.assign(p.baseline, fps)
    p.lastSyncAt = Date.now()
    saveStore(s)
  }
  void getPlan(peerId).catch(() => {})
}

