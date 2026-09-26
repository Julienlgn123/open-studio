import { spawn } from 'child_process'
import { createReadStream, existsSync, statSync } from 'fs'
import { createServer, type Server } from 'http'
import { extname, join, normalize, sep } from 'path'
import { BrowserWindow, shell } from 'electron'
import type { RunningProcess } from '@shared/types'
import { inside, resolveSafe, roots, type ToolDef } from './tools'

// Outils web sans risque : servir un site statique sur localhost (serveur intégré à l'app,
// rien à installer) et l'ouvrir dans le navigateur. Aucune commande shell n'est exécutée.

export const WEB_TOOL_DEFS: ToolDef[] = [
  {
    name: 'serve_folder',
    description:
      "Sert un dossier de site (HTML/CSS/JS) sur http://localhost via le serveur intégré, sans rien installer. Renvoie l'adresse.",
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Dossier contenant index.html (chemin absolu)' } },
      required: ['path']
    }
  },
  {
    name: 'stop_server',
    description: 'Arrête un site servi avec serve_folder.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id renvoyé par serve_folder' } },
      required: ['id']
    }
  },
  {
    name: 'open_in_browser',
    description: "Ouvre une adresse (ex. http://localhost:5500/) ou un fichier .html dans Chrome (sinon le navigateur par défaut).",
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Adresse http(s) ou chemin de fichier .html' } },
      required: ['url']
    }
  }
]

export const WEB_TOOL_NAMES = new Set(WEB_TOOL_DEFS.map((d) => d.name))

interface Served extends RunningProcess {
  server: Server
}

const served = new Map<string, Served>()
let nextId = 1
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function notify(): void {
  const list = listServers()
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('servers:changed', list)
}

export function listServers(): RunningProcess[] {
  return [...served.values()].map(({ id, label, cwd, url, running, startedAt }) => ({ id, label, cwd, url, running, startedAt }))
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8'
}

function serveFolder(dir: string): Promise<string> {
  const existing = [...served.values()].find((s) => s.cwd === dir)
  if (existing) return Promise.resolve(`Déjà servi : ${existing.url} (id ${existing.id}). Les fichiers modifiés sont pris en compte au rechargement.`)

  const server = createServer((req, res) => {
    let urlPath: string
    try {
      urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    } catch {
      res.writeHead(400).end()
      return
    }
    let file = normalize(join(dir, urlPath))
    if (!inside(dir, file)) {
      res.writeHead(403).end('Interdit')
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Introuvable : ${urlPath}`)
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    createReadStream(file).pipe(res)
  })

  return new Promise((resolveResult, reject) => {
    const tryPort = (port: number): void => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && port < 5600) tryPort(port + 1)
        else reject(err)
      })
      // 127.0.0.1 uniquement : le site n'est pas visible depuis le réseau.
      server.listen(port, '127.0.0.1', () => {
        const id = `s${nextId++}`
        const url = `http://localhost:${port}/`
        served.set(id, { id, label: dir.split(sep).pop() ?? dir, cwd: dir, url, running: true, startedAt: Date.now(), server })
        notify()
        const warn = existsSync(join(dir, 'index.html')) ? '' : ' Attention : pas de index.html à la racine.'
        resolveResult(`Site servi sur ${url} (id ${id}).${warn}`)
      })
    }
    tryPort(5500)
  })
}

export function stopServer(id: string): string {
  const s = served.get(id)
  if (!s) return `Aucun site servi avec l'id ${id}.`
  s.server.close()
  served.delete(id)
  notify()
  return `Site ${id} arrêté.`
}

export function stopAllServers(): void {
  for (const id of [...served.keys()]) stopServer(id)
}

function chromePath(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return candidates.find((c) => c && existsSync(c)) ?? null
}

/** Ouvre une adresse http(s) ou file: dans Chrome s'il est installé, sinon dans le navigateur par défaut. */
export async function openInBrowser(url: string): Promise<string> {
  if (!/^(https?|file):\/\//i.test(url)) throw new Error('Adresse non prise en charge.')
  const chrome = chromePath()
  if (chrome) {
    spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref()
    return `Ouvert dans Chrome : ${url}`
  }
  await shell.openExternal(url)
  return `Ouvert dans le navigateur : ${url}`
}

function toBrowserUrl(raw: string): string {
  const v = raw.trim().replace(/^["']|["']$/g, '')
  if (/^https?:\/\//i.test(v)) return v
  const file = resolveSafe(v)
  if (!roots().some((r) => inside(r, file))) throw new Error('Fichier en dehors des dossiers autorisés.')
  return `file:///${file.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

/** Exécute un outil web ; renvoie toujours du texte pour le modèle. */
export async function runWebTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'serve_folder': {
        const dir = resolveSafe(str(args.path))
        if (!statSync(dir).isDirectory()) return `${dir} n'est pas un dossier.`
        return await serveFolder(dir)
      }
      case 'stop_server':
        return stopServer(str(args.id))
      case 'open_in_browser':
        return await openInBrowser(toBrowserUrl(str(args.url)))
      default:
        return `Outil inconnu : ${name}`
    }
  } catch (err) {
    return `Erreur : ${err instanceof Error ? err.message : String(err)}`
  }
}
