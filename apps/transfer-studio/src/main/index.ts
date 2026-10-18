import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { networkInterfaces } from 'os'
import { basename, extname, join } from 'path'
import { randomBytes } from 'crypto'
import { app } from 'electron'
import { host } from '@open-studio/module'
import { notify, registerKit, storeGet, storeSet } from '@open-studio/kit'
import { phonePage } from './page'
import type { Received, Shared, TransferState } from '../shared/types'

// Transfert local : un petit serveur sur le Wi-Fi, ouvert seulement quand on le demande. Le
// téléphone scanne un QR code qui contient une clé secrète : sans elle, le serveur refuse tout.

let server: Server | null = null
let port = 0
let token = ''
const shared: Shared[] = []
const uploads = new Map<string, { id: string; name: string; done: number; total: number }>()

const saveDir = (): string => storeGet<string>('saveDir', join(app.getPath('downloads'), 'Open Studio Transfert'))

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
  return {
    running: !!server,
    url: server && addresses[0] ? `http://${addresses[0]}:${port}/?k=${token}` : null,
    addresses,
    shared,
    received: storeGet<Received[]>('received', []),
    saveDir: saveDir(),
    uploads: [...uploads.values()]
  }
}
const push = (): void => host.send('transfer:state', state())

function freePath(dir: string, name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'fichier'
  const ext = extname(safe)
  const base = safe.slice(0, safe.length - ext.length)
  let p = join(dir, safe)
  for (let i = 2; existsSync(p); i++) p = join(dir, `${base} (${i})${ext}`)
  return p
}

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
  if (req.method === 'GET' && url.pathname === '/api/files') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(shared.map(({ id, name, size }) => ({ id, name, size }))))
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
    const f = shared.find((s) => s.id === url.pathname.slice(7))
    if (!f || !existsSync(f.path)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': statSync(f.path).size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`
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
      const item: Received = { id, name: basename(target), path: target, size: statSync(target).size, at: Date.now(), from }
      storeSet('received', [item, ...storeGet<Received[]>('received', [])].slice(0, 200))
      push()
      notify('Fichier reçu', `${item.name} (${(item.size / 1024 / 1024).toFixed(1)} Mo)`)
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
  push()
  return state()
}

function stop(): TransferState {
  server?.close()
  server = null
  token = ''
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
      if (!existsSync(p) || statSync(p).isDirectory() || shared.some((s) => s.path === p)) continue
      shared.push({ id: randomBytes(6).toString('hex'), path: p, name: basename(p), size: statSync(p).size })
    }
    push()
    return state()
  })
  ipc.handle('transfer:unshare', (_e, id: string) => {
    const i = shared.findIndex((s) => s.id === id)
    if (i >= 0) shared.splice(i, 1)
    push()
    return state()
  })
  ipc.handle('transfer:setDir', (_e, dir: string) => {
    storeSet('saveDir', dir)
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
