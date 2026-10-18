// Kit commun du process main des modules : stockage JSON, fichiers, réseau, notifications.
// `registerKit()` branche ces handlers (canaux `kit:*`, préfixés par l'id du module comme les autres).
// Pas d'import de « electron » redirigé ici : on passe par `host` pour tout ce qui est propre au module.
import { BrowserWindow, Notification, clipboard, dialog, shell } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { host } from './host'

const storeDir = (): string => join(host.dataDir, 'store')
const safeKey = (key: string): string => key.replace(/[^a-zA-Z0-9_.-]/g, '_')

/** Lecture d'une valeur du stockage du module (fichier JSON par clé). */
export function storeGet<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(storeDir(), `${safeKey(key)}.json`), 'utf-8')) as T
  } catch {
    return fallback
  }
}

/** Écriture atomique (fichier temporaire puis renommage) : jamais de JSON à moitié écrit. */
export function storeSet(key: string, value: unknown): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = join(storeDir(), `${safeKey(key)}.json`)
  const tmp = `${file}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, file)
}

const win = (): BrowserWindow | undefined => host.window() ?? undefined

export interface KitFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface KitFetchResult {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  ms: number
  size: number
}

/** Requête HTTP depuis le main (pas de CORS), pour les modules qui interrogent le web. */
export async function kitFetch(url: string, init: KitFetchInit = {}): Promise<KitFetchResult> {
  const t0 = Date.now()
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: init.headers,
    body: init.body && !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase()) ? init.body : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000)
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => (headers[k] = v))
  return { ok: res.ok, status: res.status, statusText: res.statusText, headers, body: buf.toString('utf-8'), ms: Date.now() - t0, size: buf.length }
}

/** Notification système ; un clic ouvre Open Studio sur le module (et peut envoyer un événement). */
export function notify(title: string, body: string, onClickEvent?: { channel: string; payload?: unknown }): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    host.reveal()
    if (onClickEvent) host.send(onClickEvent.channel, onClickEvent.payload)
  })
  n.show()
}

export function registerKit(): void {
  const ipc = host.ipcMain
  ipc.handle('kit:store:get', (_e, key: string, fallback: unknown) => storeGet(key, fallback ?? null))
  ipc.handle('kit:store:set', (_e, key: string, value: unknown) => {
    storeSet(key, value)
    return true
  })

  ipc.handle('kit:files:open', async (_e, opts: { title?: string; filters?: Electron.FileFilter[]; multi?: boolean; directory?: boolean } = {}) => {
    const props: Electron.OpenDialogOptions['properties'] = [opts.directory ? 'openDirectory' : 'openFile']
    if (opts.multi) props.push('multiSelections')
    const w = win()
    const opt = { title: opts.title, filters: opts.filters, properties: props }
    const r = w ? await dialog.showOpenDialog(w, opt) : await dialog.showOpenDialog(opt)
    return r.canceled ? [] : r.filePaths
  })
  ipc.handle('kit:files:save', async (_e, opts: { title?: string; defaultPath?: string; filters?: Electron.FileFilter[] } = {}) => {
    const w = win()
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
    return r.canceled ? null : (r.filePath ?? null)
  })
  ipc.handle('kit:files:readText', (_e, path: string) => readFileSync(path, 'utf-8'))
  ipc.handle('kit:files:writeText', (_e, path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text, 'utf-8')
    return true
  })
  ipc.handle('kit:files:readBase64', (_e, path: string) => readFileSync(path).toString('base64'))
  ipc.handle('kit:files:writeBase64', (_e, path: string, b64: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, Buffer.from(b64, 'base64'))
    return true
  })
  ipc.handle('kit:files:stat', (_e, path: string) => {
    try {
      const s = statSync(path)
      return { exists: true, size: s.size, isDir: s.isDirectory(), mtime: s.mtimeMs }
    } catch {
      return { exists: false, size: 0, isDir: false, mtime: 0 }
    }
  })
  ipc.handle('kit:files:list', (_e, dir: string) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, path: join(dir, d.name), isDir: d.isDirectory() }))
      : []
  )
  ipc.handle('kit:files:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipc.handle('kit:files:openPath', (_e, path: string) => shell.openPath(path))
  ipc.handle('kit:files:dataDir', () => host.dataDir)

  ipc.handle('kit:net:fetch', (_e, url: string, init?: KitFetchInit) => kitFetch(url, init))
  ipc.handle('kit:notify', (_e, title: string, body: string) => notify(title, body))
  ipc.handle('kit:openExternal', (_e, url: string) => {
    if (/^https?:|^mailto:/.test(url)) return shell.openExternal(url)
  })
  ipc.handle('kit:clipboard:write', (_e, text: string) => clipboard.writeText(text))
  ipc.handle('kit:clipboard:read', () => clipboard.readText())
  ipc.handle('kit:hash', (_e, algo: string, text: string) => createHash(algo).update(text, 'utf-8').digest('hex'))
}
