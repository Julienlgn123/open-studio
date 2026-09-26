import { app, BrowserWindow } from 'electron'
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto'
import { createSocket, type Socket } from 'dgram'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { hostname, networkInterfaces } from 'os'
import { dirname, join } from 'path'
import { checkpointDb, closeDb } from './db'
import { DATA_ENTRIES, getBackupsDir, rewriteMediaPaths } from './backup'
import { addPairing, fingerprints, myDeviceId } from './peerSync'

// Synchronisation directe entre deux PC sur le même réseau (Wi-Fi / câble), sans cloud.
// Le PC qui REÇOIT affiche un code à 6 chiffres et s'annonce sur le réseau local ; le PC
// qui ENVOIE le trouve, on tape le code, et tous les fichiers de données (base, pièces
// jointes, enregistrements, réglages) passent chiffrés (AES-256-GCM, clé dérivée du code).
// Le receveur met ses anciennes données de côté (dossier backups), installe les nouvelles
// et redémarre : ses données sont remplacées par celles de l'envoyeur.

const SYNC_PORT = 47810
const DISCOVERY_PORT = 47811
const MAGIC = 'cours-studio-sync'
const MAX_AUTH_ATTEMPTS = 5
/** Réglages propres à la machine, gardés sur le PC qui reçoit. */
const MACHINE_SETTINGS = ['autoBackupFolder']

export interface SyncStatus {
  role: 'receive' | 'send'
  phase: 'waiting' | 'transferring' | 'applying' | 'done' | 'paired' | 'error'
  done?: number
  total?: number
  message?: string
  peer?: string
}

export interface SyncPeer {
  name: string
  host: string
  port: number
}

function emit(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}
const status = (s: SyncStatus): void => emit('sync:status', s)

const userData = (): string => app.getPath('userData')

function deriveKey(code: string, salt: Buffer): Buffer {
  return scryptSync(code, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}
/** Secret durable de l'association, calculé des deux côtés à partir de la clé de session. */
const pairSecretOf = (key: Buffer, nonce: string): Buffer => createHmac('sha256', key).update(`pair:${nonce}`).digest()
const proofOf = (key: Buffer, salt: Buffer): Buffer => createHmac('sha256', key).update(`${MAGIC}:${salt.toString('hex')}`).digest()

function encrypt(key: Buffer, data: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}
function decrypt(key: Buffer, data: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
  decipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
}

/** Adresses IPv4 locales (pour saisie manuelle) et adresses de diffusion de chaque réseau. */
function lanInterfaces(): { address: string; broadcast: string }[] {
  const out: { address: string; broadcast: string }[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue
      const ip = i.address.split('.').map(Number)
      const mask = i.netmask.split('.').map(Number)
      out.push({ address: i.address, broadcast: ip.map((b, k) => (b & mask[k]) | (~mask[k] & 255)).join('.') })
    }
  }
  return out
}

/** Chemin relatif sûr : uniquement dans une des entrées de données, jamais « .. ». */
function safeRelPath(rel: string): string | null {
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || clean.split('/').some((p) => p === '..' || p === '')) return null
  const top = clean.split('/')[0]
  return DATA_ENTRIES.includes(top) ? clean : null
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('Trop volumineux'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

// ─── Côté PC qui reçoit ─────────────────────────────────────────────────────

interface ReceiveSession {
  server: Server
  beacon: Socket
  beaconTimer: NodeJS.Timeout | null
  code: string
  salt: Buffer
  key: Buffer
  token: string | null
  attempts: number
  staging: string
  received: number
  peer: string
  peerId: string
  pairNonce: string
}

let receiving: ReceiveSession | null = null

export async function startReceive(): Promise<{ code: string; name: string; port: number; addresses: string[] }> {
  stopReceive()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const salt = randomBytes(16)
  const staging = join(userData(), 'sync-incoming')
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  const session: ReceiveSession = {
    server: createServer((req, res) => void handle(session, req, res).catch((err) => send(res, 500, { error: String(err?.message ?? err) }))),
    beacon: createSocket({ type: 'udp4', reuseAddr: true }),
    beaconTimer: null,
    code,
    salt,
    key: deriveKey(code, salt),
    token: null,
    attempts: 0,
    staging,
    received: 0,
    peer: '',
    peerId: '',
    pairNonce: randomBytes(16).toString('hex')
  }
  const port = await new Promise<number>((resolvePort, reject) => {
    const listen = (p: number): void => {
      session.server.once('error', (err: NodeJS.ErrnoException) => (err.code === 'EADDRINUSE' && p !== 0 ? listen(0) : reject(err)))
      session.server.listen(p, '0.0.0.0', () => {
        const addr = session.server.address()
        resolvePort(typeof addr === 'object' && addr ? addr.port : p)
      })
    }
    listen(SYNC_PORT)
  })

  // Annonce sur le réseau local toutes les 1,5 s, pour que l'autre PC nous trouve tout seul.
  const name = hostname()
  session.beacon.bind(() => {
    session.beacon.setBroadcast(true)
    const msg = Buffer.from(JSON.stringify({ app: MAGIC, v: 1, name, port }))
    const shout = (): void => {
      const targets = new Set(['255.255.255.255', ...lanInterfaces().map((i) => i.broadcast)])
      for (const t of targets) session.beacon.send(msg, DISCOVERY_PORT, t, () => {})
    }
    shout()
    session.beaconTimer = setInterval(shout, 1500)
  })

  receiving = session
  status({ role: 'receive', phase: 'waiting' })
  return { code, name, port, addresses: lanInterfaces().map((i) => i.address) }
}

export function stopReceive(): void {
  if (!receiving) return
  if (receiving.beaconTimer) clearInterval(receiving.beaconTimer)
  try {
    receiving.beacon.close()
  } catch {
    /* déjà fermé */
  }
  receiving.server.close()
  rmSync(receiving.staging, { recursive: true, force: true })
  receiving = null
}

async function handle(s: ReceiveSession, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local')

  if (req.method === 'GET' && url.pathname === '/hello') {
    return send(res, 200, { app: MAGIC, v: 1, name: hostname(), salt: s.salt.toString('hex') })
  }

  if (req.method === 'POST' && url.pathname === '/auth') {
    if (s.attempts >= MAX_AUTH_ATTEMPTS) return send(res, 429, { error: 'Trop d’essais : relance la réception sur ce PC.' })
    const { proof, name, deviceId } = JSON.parse((await readBody(req, 4096)).toString('utf-8')) as { proof?: string; name?: string; deviceId?: string }
    const expected = proofOf(s.key, s.salt)
    const given = Buffer.from(String(proof ?? ''), 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      s.attempts++
      if (s.attempts >= MAX_AUTH_ATTEMPTS) {
        status({ role: 'receive', phase: 'error', message: 'Trop de codes faux reçus : réception arrêtée par sécurité.' })
        setTimeout(stopReceive, 200)
      }
      return send(res, 401, { error: 'Code incorrect.' })
    }
    s.token = randomBytes(24).toString('hex')
    s.peer = String(name ?? 'un autre PC').slice(0, 80)
    s.peerId = String(deviceId ?? '').slice(0, 64)
    status({ role: 'receive', phase: 'transferring', done: 0, peer: s.peer })
    return send(res, 200, { token: s.token, deviceId: myDeviceId(), name: hostname(), pairNonce: s.pairNonce })
  }

  if (!s.token || req.headers['x-sync-token'] !== s.token) return send(res, 403, { error: 'Non autorisé.' })

  if (req.method === 'PUT' && url.pathname === '/file') {
    const rel = safeRelPath(url.searchParams.get('path') ?? '')
    if (!rel) return send(res, 400, { error: 'Chemin refusé.' })
    const data = decrypt(s.key, await readBody(req, 4 * 1024 * 1024 * 1024))
    const dest = join(s.staging, ...rel.split('/'))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, data)
    s.received++
    status({ role: 'receive', phase: 'transferring', done: s.received, total: Number(url.searchParams.get('total')) || undefined, peer: s.peer })
    return send(res, 200, { ok: true })
  }

  // Association seule : les deux PC se retiennent, sans rien transférer.
  if (req.method === 'POST' && url.pathname === '/pair') {
    if (s.peerId) addPairing(s.peerId, s.peer, pairSecretOf(s.key, s.pairNonce), {})
    send(res, 200, { ok: true })
    status({ role: 'receive', phase: 'paired', peer: s.peer })
    setTimeout(stopReceive, 300)
    return
  }

  if (req.method === 'POST' && url.pathname === '/commit') {
    const { count, fps } = JSON.parse((await readBody(req, 64 * 1024 * 1024)).toString('utf-8')) as { count?: number; fps?: Record<string, string> }
    if (count !== s.received) return send(res, 409, { error: `Transfert incomplet (${s.received}/${count} fichiers).` })
    if (!existsSync(join(s.staging, 'cours-studio.db'))) return send(res, 409, { error: 'La base de données n’a pas été reçue.' })
    // Après la synchro, les deux PC ont les mêmes cours : c'est le point de départ des synchros suivantes.
    if (s.peerId) addPairing(s.peerId, s.peer, pairSecretOf(s.key, s.pairNonce), fps ?? {})
    send(res, 200, { ok: true })
    status({ role: 'receive', phase: 'applying', peer: s.peer })
    setTimeout(() => applyStaged(s), 400)
    return
  }

  send(res, 404, { error: 'Inconnu.' })
}

/** Met les données actuelles de côté, installe celles reçues, puis redémarre. */
function applyStaged(s: ReceiveSession): void {
  const staging = s.staging
  if (s.beaconTimer) clearInterval(s.beaconTimer)
  try {
    s.beacon.close()
  } catch {
    /* ok */
  }
  s.server.close()
  receiving = null

  const keep: Record<string, unknown> = {}
  try {
    const current = JSON.parse(readFileSync(join(userData(), 'settings.json'), 'utf-8')) as Record<string, unknown>
    for (const k of MACHINE_SETTINGS) if (k in current) keep[k] = current[k]
  } catch {
    /* pas de réglages actuels */
  }

  checkpointDb()
  closeDb()

  // Filet de sécurité : les anciennes données sont déplacées (pas supprimées).
  const aside = join(getBackupsDir(), `avant-synchro-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)
  mkdirSync(aside, { recursive: true })
  for (const entry of DATA_ENTRIES) {
    const abs = join(userData(), entry)
    if (existsSync(abs)) renameSync(abs, join(aside, entry))
    for (const extra of ['-wal', '-shm']) {
      if (existsSync(abs + extra)) renameSync(abs + extra, join(aside, entry + extra))
    }
  }
  for (const entry of DATA_ENTRIES) {
    const src = join(staging, entry)
    if (existsSync(src)) renameSync(src, join(userData(), entry))
  }
  rmSync(staging, { recursive: true, force: true })

  // Réglages : ceux de l'autre PC, sauf ce qui est propre à cette machine.
  const settingsPath = join(userData(), 'settings.json')
  try {
    const incoming = existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>) : {}
    for (const k of MACHINE_SETTINGS) delete incoming[k]
    writeFileSync(settingsPath, JSON.stringify({ ...incoming, ...keep }, null, 2))
  } catch {
    /* réglages illisibles : on garde le fichier reçu tel quel */
  }

  // Les chemins des enregistrements pointaient vers le dossier de l'autre PC.
  rewriteMediaPaths(join(userData(), 'cours-studio.db'))

  status({ role: 'receive', phase: 'done', peer: s.peer })
  setTimeout(() => {
    app.relaunch()
    app.exit(0)
  }, 1500)
}

// ─── Côté PC qui envoie ─────────────────────────────────────────────────────

let discovery: Socket | null = null
const peers = new Map<string, SyncPeer & { seen: number }>()
let peersTimer: NodeJS.Timeout | null = null

export function startDiscovery(): void {
  stopDiscovery()
  peers.clear()
  const sock = createSocket({ type: 'udp4', reuseAddr: true })
  sock.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString('utf-8')) as { app?: string; name?: string; port?: number }
      if (data.app !== MAGIC || typeof data.port !== 'number') return
      // Ignore nos propres annonces (si ce PC reçoit aussi).
      if (lanInterfaces().some((i) => i.address === rinfo.address) && receiving) return
      peers.set(`${rinfo.address}:${data.port}`, { name: String(data.name ?? rinfo.address), host: rinfo.address, port: data.port, seen: Date.now() })
    } catch {
      /* paquet étranger */
    }
  })
  sock.on('error', () => {
    /* port de découverte indisponible : la saisie manuelle reste possible */
  })
  sock.bind(DISCOVERY_PORT)
  discovery = sock
  const push = (): void => {
    const now = Date.now()
    for (const [k, p] of peers) if (now - p.seen > 5000) peers.delete(k)
    // Un PC avec plusieurs cartes réseau s'annonce sur chacune : une seule ligne par PC,
    // en préférant une vraie adresse du réseau à une adresse auto-attribuée (169.254.x.x).
    const byPc = new Map<string, SyncPeer>()
    for (const p of peers.values()) {
      const k = `${p.name}:${p.port}`
      const cur = byPc.get(k)
      if (!cur || (cur.host.startsWith('169.254.') && !p.host.startsWith('169.254.'))) byPc.set(k, { name: p.name, host: p.host, port: p.port })
    }
    emit('sync:peers', [...byPc.values()])
  }
  peersTimer = setInterval(push, 1000)
}

export function stopDiscovery(): void {
  if (peersTimer) clearInterval(peersTimer)
  peersTimer = null
  try {
    discovery?.close()
  } catch {
    /* ok */
  }
  discovery = null
}

function listDataFiles(): string[] {
  const out: string[] = []
  const walk = (abs: string, rel: string): void => {
    const st = statSync(abs)
    if (st.isDirectory()) for (const child of readdirSync(abs)) walk(join(abs, child), `${rel}/${child}`)
    else out.push(rel)
  }
  for (const entry of DATA_ENTRIES) {
    const abs = join(userData(), entry)
    if (existsSync(abs)) walk(abs, entry)
  }
  return out
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('Impossible de joindre l’autre PC : vérifie qu’il est sur le même Wi-Fi et en mode « Recevoir ».')
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`)
  return body
}

/** Envoie toutes les données de ce PC vers le PC `host:port`, qui les installe à la place des siennes. */
export async function sendTo(host: string, port: number, code: string, pairOnly = false): Promise<void> {
  const base = `http://${host.includes(':') ? `[${host}]` : host}:${port}`
  try {
    const hello = (await call(`${base}/hello`, { method: 'GET' })) as { app?: string; name?: string; salt?: string }
    if (hello.app !== MAGIC || !hello.salt) throw new Error('Ce n’est pas un Cours Studio en réception.')
    const salt = Buffer.from(hello.salt, 'hex')
    const key = deriveKey(code.trim(), salt)
    const auth = (await call(`${base}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof: proofOf(key, salt).toString('hex'), name: hostname(), deviceId: myDeviceId() })
    })) as { token: string; deviceId?: string; name?: string; pairNonce?: string }
    const { token } = auth
    const remember = (baseline: Record<string, string>): void => {
      if (auth.deviceId && auth.pairNonce) addPairing(auth.deviceId, auth.name ?? hello.name ?? host, pairSecretOf(key, auth.pairNonce), baseline)
    }

    if (pairOnly) {
      await call(`${base}/pair`, { method: 'POST', headers: { 'x-sync-token': token, 'Content-Type': 'application/json' }, body: '{}' })
      remember({})
      status({ role: 'send', phase: 'paired', peer: auth.name ?? hello.name ?? host })
      return
    }

    checkpointDb()
    const files = listDataFiles()
    const peer = hello.name ?? host
    for (let i = 0; i < files.length; i++) {
      status({ role: 'send', phase: 'transferring', done: i, total: files.length, peer })
      const rel = files[i]
      const data = readFileSync(join(userData(), ...rel.split('/')))
      await call(`${base}/file?path=${encodeURIComponent(rel)}&total=${files.length}`, {
        method: 'PUT',
        headers: { 'x-sync-token': token, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(encrypt(key, data))
      })
    }
    const fps = fingerprints()
    await call(`${base}/commit`, {
      method: 'POST',
      headers: { 'x-sync-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: files.length, fps })
    })
    remember(fps)
    status({ role: 'send', phase: 'done', done: files.length, total: files.length, peer })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    status({ role: 'send', phase: 'error', message })
    throw new Error(message)
  }
}
