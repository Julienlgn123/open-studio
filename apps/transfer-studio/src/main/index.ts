import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { networkInterfaces } from 'os'
import { basename, extname, join, relative } from 'path'
import { randomBytes, randomInt } from 'crypto'
import { app, clipboard } from 'electron'
import JSZip from 'jszip'
import { host } from '@open-studio/module'
import { notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import { phonePage } from './page'
import type { Device, Received, Shared, TextItem, TransferSettings, TransferState } from '../shared/types'

// Transfert local : un petit serveur sur le Wi-Fi, ouvert seulement quand on le demande. Le
// téléphone scanne un QR code qui contient une clé secrète : sans elle, le serveur refuse tout.
// Option : un code PIN à 4 chiffres affiché sur le PC, en plus.

let server: Server | null = null
let port = 0
let token = ''
let pin: string | null = null
let lastActivity = 0
let stopTimer: ReturnType<typeof setInterval> | null = null
const shared: Shared[] = []
const uploads = new Map<string, { id: string; name: string; done: number; total: number }>()
const devices = new Map<string, Device>()

const DEFAULT_SETTINGS: TransferSettings = { pin: false, autoStop: 30, autoCopy: false, address: null }
const settings = (): TransferSettings => ({ ...DEFAULT_SETTINGS, ...storeGet<Partial<TransferSettings>>('settings', {}) })
const saveDir = (): string => storeGet<string>('saveDir', join(app.getPath('downloads'), 'Open Studio Transfert'))
const texts = (): TextItem[] => storeGet<TextItem[]>('texts', [])

/** Adresses du PC sur le réseau local (Wi-Fi, Ethernet). */
function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address)
  }
  // Les réseaux domestiques (192.168…) d'abord : c'est presque toujours le Wi-Fi.
  return out.sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')))
}

function state(): TransferState {
  const addresses = lanAddresses()
  const st = settings()
  const addr = st.address && addresses.includes(st.address) ? st.address : addresses[0]
  return {
    running: !!server,
    url: server && addr ? `http://${addr}:${port}/?k=${token}` : null,
    addresses,
    shared,
    received: storeGet<Received[]>('received', []),
    saveDir: saveDir(),
    uploads: [...uploads.values()],
    texts: texts(),
    devices: [...devices.values()].sort((a, b) => b.last - a.last),
    pin: server ? pin : null,
    settings: st,
    stopsAt: server && st.autoStop ? lastActivity + st.autoStop * 60_000 : null
  }
}
const push = (): void => host.send('transfer:state', state())

function freePath(dir: string, name: string): string {
  // Seulement le nom (jamais de chemin), sans caractères interdits ni point au début (fichier caché).
  const safe =
    (name.split(/[\\/]/).pop() ?? '')
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      .replace(/^[.\s]+/, '')
      .slice(0, 180) || 'fichier'
  const ext = extname(safe)
  const base = safe.slice(0, safe.length - ext.length)
  let p = join(dir, safe)
  for (let i = 2; existsSync(p); i++) p = join(dir, `${base} (${i})${ext}`)
  return p
}

/** Nom lisible de l'appareil, d'après son navigateur. */
function deviceName(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  const android = /Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/i.exec(ua)
  if (android) return android[1].trim() || 'Android'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'PC Windows'
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Linux/i.test(ua)) return 'PC Linux'
  return 'Appareil'
}

/** Tous les fichiers d'un dossier (sans les fichiers cachés), limité pour rester raisonnable. */
function walk(dir: string, out: string[] = [], max = 5000): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= max) break
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out, max)
    else if (e.isFile()) out.push(p)
  }
  return out
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8'
}

const readBody = (req: IncomingMessage, max = 1_000_000): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c: Buffer) => {
      data += c.toString('utf-8')
      if (data.length > max) {
        reject(new Error('trop long'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x')
  const from = (req.socket.remoteAddress ?? '').replace('::ffff:', '')
  if (url.searchParams.get('k') !== token) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Lien expiré : scanne à nouveau le QR code affiché sur le PC.')
    return
  }
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(phonePage())
    return
  }
  // Code PIN : demandé pour tout le reste.
  if (pin && url.searchParams.get('p') !== pin) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end('{"pin":true}')
    return
  }
  lastActivity = Date.now()
  const known = devices.get(from)
  const dev: Device = { ip: from, name: known?.name ?? deviceName(String(req.headers['user-agent'] ?? '')), last: Date.now() }
  devices.set(from, dev)
  if (!known) {
    push()
    notify('Appareil connecté', `${dev.name} (${from}) a ouvert le transfert.`)
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(shared.map(({ id, name, size, dir, files }) => ({ id, name, size, dir, files, image: /\.(jpe?g|png|gif|webp)$/i.test(name) }))))
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/texts') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(texts().slice(0, 30)))
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/text') {
    void readBody(req)
      .then((text) => {
        const t = text.trim()
        if (!t) throw new Error('vide')
        const item: TextItem = { id: randomBytes(6).toString('hex'), from: 'phone', text: t, at: Date.now(), device: dev.name }
        storeSet('texts', [item, ...texts()].slice(0, 100))
        if (settings().autoCopy) clipboard.writeText(t)
        notify(`Texte reçu de ${dev.name}`, t.slice(0, 120))
        push()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      })
      .catch(() => res.writeHead(400).end())
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
    const f = shared.find((s) => s.id === url.pathname.slice(7))
    if (!f || !existsSync(f.path)) {
      res.writeHead(404).end()
      return
    }
    if (f.dir) {
      // Dossier : ZIP fabriqué à la volée (sans compression : rapide, les photos/vidéos ne gagnent rien).
      const zip = new JSZip()
      for (const p of walk(f.path)) zip.file(relative(f.path, p).split('\\').join('/'), createReadStream(p))
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${f.name}.zip`)}` })
      zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' }).pipe(res)
      return
    }
    const inline = url.searchParams.get('inline') === '1'
    res.writeHead(200, {
      'Content-Type': inline ? (MIME[extname(f.name).toLowerCase()] ?? 'application/octet-stream') : 'application/octet-stream',
      'Content-Length': statSync(f.path).size,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`
    })
    createReadStream(f.path).pipe(res)
    return
  }
  if (req.method === 'PUT' && url.pathname === '/api/upload') {
    const name = url.searchParams.get('name') ?? 'fichier'
    const total = Number(req.headers['content-length'] ?? 0)
    mkdirSync(saveDir(), { recursive: true })
    const target = freePath(saveDir(), name)
    const id = randomBytes(6).toString('hex')
    const up = { id, name: basename(target), done: 0, total }
    uploads.set(id, up)
    push()
    const out = createWriteStream(target)
    let last = 0
    req.on('data', (c: Buffer) => {
      up.done += c.length
      lastActivity = Date.now()
      if (Date.now() - last > 250) {
        last = Date.now()
        push()
      }
    })
    req.pipe(out)
    const fail = (): void => {
      uploads.delete(id)
      out.destroy()
      try {
        unlinkSync(target)
      } catch {
        /* rien à nettoyer */
      }
      push()
    }
    req.on('aborted', fail)
    out.on('finish', () => {
      uploads.delete(id)
      const item: Received = { id, name: basename(target), path: target, size: statSync(target).size, at: Date.now(), from: dev.name }
      storeSet('received', [item, ...storeGet<Received[]>('received', [])].slice(0, 300))
      push()
      // Une seule notification pour une rafale de photos.
      if (!uploads.size) notify('Fichier reçu', `${item.name} (${(item.size / 1024 / 1024).toFixed(1)} Mo)`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    out.on('error', () => {
      fail()
      res.writeHead(500).end()
    })
    return
  }
  res.writeHead(404).end()
}

async function start(): Promise<TransferState> {
  if (server) return state()
  token = randomBytes(12).toString('base64url')
  pin = settings().pin ? String(randomInt(0, 10000)).padStart(4, '0') : null
  devices.clear()
  lastActivity = Date.now()
  const srv = createServer(handle)
  srv.requestTimeout = 0 // gros fichiers : pas de coupure en plein envoi
  for (let p = 8787; p < 8820; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      srv.once('error', () => resolve(false))
      srv.listen(p, '0.0.0.0', () => resolve(true))
    })
    if (ok) {
      port = p
      server = srv
      break
    }
  }
  if (!server) throw new Error('Aucun port libre pour lancer le partage.')
  // Fermeture automatique quand plus personne ne s'en sert (sécurité).
  stopTimer = setInterval(() => {
    const min = settings().autoStop
    if (server && min && !uploads.size && Date.now() - lastActivity > min * 60_000) {
      stop()
      notify('Partage fermé', `Fermé automatiquement après ${min} minutes sans activité.`)
    }
  }, 30_000)
  push()
  return state()
}

function stop(): TransferState {
  server?.close()
  server = null
  token = ''
  pin = null
  if (stopTimer) clearInterval(stopTimer)
  stopTimer = null
  push()
  return state()
}

export function activate(): void {
  registerKit()
  const ipc = host.ipcMain
  ipc.handle('transfer:state', () => state())
  ipc.handle('transfer:start', () => start())
  ipc.handle('transfer:stop', () => stop())
  ipc.handle('transfer:share', (_e, paths: string[]) => {
    for (const p of paths) {
      if (!existsSync(p) || shared.some((s) => s.path === p)) continue
      if (statSync(p).isDirectory()) {
        const files = walk(p)
        const size = files.reduce((n, f) => n + statSync(f).size, 0)
        shared.push({ id: randomBytes(6).toString('hex'), path: p, name: basename(p), size, dir: true, files: files.length })
      } else shared.push({ id: randomBytes(6).toString('hex'), path: p, name: basename(p), size: statSync(p).size })
    }
    lastActivity = Date.now()
    push()
    return state()
  })
  ipc.handle('transfer:unshare', (_e, id: string) => {
    const i = shared.findIndex((s) => s.id === id)
    if (i >= 0) shared.splice(i, 1)
    push()
    return state()
  })
  ipc.handle('transfer:unshareAll', () => {
    shared.splice(0)
    push()
    return state()
  })
  ipc.handle('transfer:sendText', (_e, text: string) => {
    const t = text.trim()
    if (t) storeSet('texts', [{ id: randomBytes(6).toString('hex'), from: 'pc', text: t, at: Date.now() } satisfies TextItem, ...texts()].slice(0, 100))
    lastActivity = Date.now()
    push()
    return state()
  })
  ipc.handle('transfer:deleteText', (_e, id: string) => {
    storeSet('texts', texts().filter((t) => t.id !== id))
    push()
    return state()
  })
  ipc.handle('transfer:clearTexts', () => {
    storeSet('texts', [])
    push()
    return state()
  })
  ipc.handle('transfer:settings', (_e, patch: Partial<TransferSettings>) => {
    const next = { ...settings(), ...patch }
    storeSet('settings', next)
    // Activer/désactiver le PIN pendant que le partage est ouvert : appliqué tout de suite.
    if (server && 'pin' in patch) pin = next.pin ? String(randomInt(0, 10000)).padStart(4, '0') : null
    push()
    return state()
  })
  ipc.handle('transfer:setDir', (_e, dir: string) => {
    storeSet('saveDir', dir)
    push()
    return state()
  })
  ipc.handle('transfer:deleteReceived', (_e, id: string, alsoFile: boolean) => {
    const list = storeGet<Received[]>('received', [])
    const item = list.find((r) => r.id === id)
    if (item && alsoFile) {
      try {
        unlinkSync(item.path)
      } catch {
        /* déjà supprimé ou déplacé */
      }
    }
    storeSet('received', list.filter((r) => r.id !== id))
    push()
    return state()
  })
  ipc.handle('transfer:clearReceived', () => {
    storeSet('received', [])
    push()
    return state()
  })
}

export function deactivate(): void {
  stop()
}
