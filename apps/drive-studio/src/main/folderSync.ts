import { Notification } from 'electron'
import { existsSync, readdirSync, statSync, watch, type FSWatcher } from 'fs'
import { basename, join, relative } from 'path'
import { v4 as uuid } from 'uuid'
import { addFileToFolder, addLog, createFolder, getAccounts, getFolders, rawDb } from './db'
import { broadcast } from './events'
import { uploadLocalFile } from './filesvc'
import type { SyncFolder, SyncProgress } from '@shared/types'

// Dossiers synchronisés : un dossier du PC envoyé automatiquement sur tes Drive (dans le sens
// PC → Drive uniquement). Nouveaux fichiers et fichiers modifiés partent tout seuls ; un fichier
// supprimé du PC n'est JAMAIS supprimé du Drive (c'est une sauvegarde, pas un miroir), et les
// anciennes versions d'un fichier modifié restent disponibles.

const SKIP_DIRS = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', '.Trash', '__pycache__'])
const SKIP_FILE = /^(~\$|\.~lock|thumbs\.db$|desktop\.ini$|\.ds_store$)|\.(tmp|temp|crdownload|part|partial|lock|swp)$/i

let ready = false
function ensure(): void {
  if (ready) return
  rawDb().exec(`
    CREATE TABLE IF NOT EXISTS sync_folders (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, folder_id TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      interval_min INTEGER NOT NULL DEFAULT 15, exclude TEXT NOT NULL DEFAULT '', last_scan INTEGER,
      last_error TEXT, files INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_entries (
      sync_id TEXT NOT NULL, rel_path TEXT NOT NULL, size INTEGER NOT NULL, mtime INTEGER NOT NULL,
      file_id TEXT, synced_at INTEGER NOT NULL, PRIMARY KEY (sync_id, rel_path)
    );
  `)
  ready = true
}

interface Row {
  id: string
  path: string
  folder_id: string | null
  enabled: number
  interval_min: number
  exclude: string
  last_scan: number | null
  last_error: string | null
  files: number
  bytes: number
  created_at: number
}

const toSync = (r: Row): SyncFolder => ({
  id: r.id,
  path: r.path,
  name: basename(r.path) || r.path,
  folderId: r.folder_id,
  enabled: !!r.enabled,
  intervalMin: r.interval_min,
  exclude: r.exclude,
  lastScan: r.last_scan,
  lastError: r.last_error,
  files: r.files,
  bytes: r.bytes,
  running: running === r.id,
  exists: existsSync(r.path)
})

export function listSyncFolders(): SyncFolder[] {
  ensure()
  return (rawDb().prepare('SELECT * FROM sync_folders ORDER BY created_at').all() as Row[]).map(toSync)
}

function get(id: string): Row | undefined {
  ensure()
  return rawDb().prepare('SELECT * FROM sync_folders WHERE id = ?').get(id) as Row | undefined
}

export function addSyncFolder(path: string, intervalMin = 15): SyncFolder {
  ensure()
  if (listSyncFolders().some((s) => s.path.toLowerCase() === path.toLowerCase())) throw new Error('Ce dossier est déjà synchronisé.')
  if (!getAccounts().some((a) => a.role === 'primary' && a.status === 'active')) throw new Error('Ajoute d’abord un compte Google principal.')
  // Un dossier virtuel du même nom regroupe ses fichiers dans l'onglet Fichiers.
  const name = basename(path) || path
  const folder = getFolders().find((f) => f.name === name) ?? createFolder({ name, emoji: '🔄', color: '#38bdf8' })
  const id = uuid()
  rawDb()
    .prepare('INSERT INTO sync_folders (id, path, folder_id, interval_min, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, path, folder.id, intervalMin, Date.now())
  startWatch(id)
  void runSync(id)
  return toSync(get(id)!)
}

export function updateSyncFolder(id: string, patch: { enabled?: boolean; intervalMin?: number; exclude?: string }): void {
  ensure()
  const r = get(id)
  if (!r) return
  rawDb()
    .prepare('UPDATE sync_folders SET enabled = ?, interval_min = ?, exclude = ? WHERE id = ?')
    .run(patch.enabled === undefined ? r.enabled : patch.enabled ? 1 : 0, patch.intervalMin ?? r.interval_min, patch.exclude ?? r.exclude, id)
  if (patch.enabled === false) stopWatch(id)
  if (patch.enabled === true) startWatch(id)
}

/** Arrête la synchro (les fichiers déjà envoyés restent sur le Drive). */
export function removeSyncFolder(id: string): void {
  ensure()
  stopWatch(id)
  rawDb().prepare('DELETE FROM sync_entries WHERE sync_id = ?').run(id)
  rawDb().prepare('DELETE FROM sync_folders WHERE id = ?').run(id)
}

/** Motifs d'exclusion simples, un par ligne ou séparés par des virgules : *.iso, Cache, brouillons/ */
export function excluded(rel: string, patterns: string): boolean {
  const parts = rel.split(/[\\/]/)
  return patterns
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => {
      const pat = p.replace(/[\\/]+$/, '')
      if (pat.includes('*')) {
        const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i')
        return parts.some((x) => re.test(x)) || re.test(rel.replace(/\\/g, '/'))
      }
      return parts.some((x) => x.toLowerCase() === pat.toLowerCase())
    })
}

function walk(root: string, dir: string, exclude: string, acc: { rel: string; size: number; mtime: number }[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const abs = join(dir, e.name)
    const rel = relative(root, abs)
    if (e.isSymbolicLink() || excluded(rel, exclude)) continue
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(root, abs, exclude, acc)
    } else if (e.isFile() && !SKIP_FILE.test(e.name)) {
      try {
        const st = statSync(abs)
        acc.push({ rel, size: st.size, mtime: Math.round(st.mtimeMs) })
      } catch {
        /* fichier verrouillé ou supprimé entre-temps */
      }
    }
  }
}

let running: string | null = null
const queue: string[] = []

const progress = (p: SyncProgress): void => broadcast('sync:progress', p)

/** Envoie les fichiers nouveaux ou modifiés depuis la dernière fois. Une synchro à la fois. */
export async function runSync(id: string): Promise<{ sent: number; failed: number } | null> {
  ensure()
  if (running) {
    if (running !== id && !queue.includes(id)) queue.push(id)
    return null
  }
  const r = get(id)
  if (!r) return null
  running = id
  let sent = 0
  let failed = 0
  let lastError: string | null = null
  try {
    if (!existsSync(r.path)) throw new Error('Dossier introuvable (disque débranché ou dossier déplacé ?)')
    const files: { rel: string; size: number; mtime: number }[] = []
    walk(r.path, r.path, r.exclude, files)
    const known = new Map(
      (rawDb().prepare('SELECT rel_path, size, mtime FROM sync_entries WHERE sync_id = ?').all(id) as { rel_path: string; size: number; mtime: number }[]).map((e) => [
        e.rel_path,
        e
      ])
    )
    // Un fichier qui vient de bouger (moins de 5 s) est peut-être encore en cours d'écriture.
    const todo = files.filter((f) => {
      const k = known.get(f.rel)
      return (!k || k.size !== f.size || k.mtime !== f.mtime) && Date.now() - f.mtime > 5000
    })
    const upsert = rawDb().prepare(
      `INSERT INTO sync_entries (sync_id, rel_path, size, mtime, file_id, synced_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sync_id, rel_path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, file_id = excluded.file_id, synced_at = excluded.synced_at`
    )
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i]
      progress({ syncId: id, done: i, total: todo.length, current: f.rel })
      try {
        const meta = await uploadLocalFile(join(r.path, f.rel))
        if (r.folder_id) {
          try {
            addFileToFolder(r.folder_id, meta.id)
          } catch {
            /* dossier virtuel supprimé entre-temps */
          }
        }
        upsert.run(id, f.rel, f.size, f.mtime, meta.id, Date.now())
        sent++
      } catch (err) {
        failed++
        lastError = `${f.rel} : ${err instanceof Error ? err.message : String(err)}`
        // Plus de place ou compte déconnecté : inutile d'insister sur les fichiers suivants.
        if (/quota|espace|storage|reconnect|invalid_grant|401/i.test(lastError)) break
      }
    }
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    rawDb().prepare('UPDATE sync_folders SET last_scan = ?, last_error = ?, files = ?, bytes = ? WHERE id = ?').run(Date.now(), lastError, files.length, totalBytes, id)
    if (sent || failed) {
      addLog({
        action: 'upload',
        accountId: null,
        status: failed ? 'failed' : 'success',
        label: `Dossier synchronisé « ${basename(r.path)} » : ${sent} envoyé(s)${failed ? `, ${failed} échec(s)` : ''}`,
        errorDetails: lastError
      })
      if (Notification.isSupported() && (sent >= 5 || failed)) {
        new Notification({ title: `Synchro « ${basename(r.path)} »`, body: `${sent} fichier(s) envoyé(s)${failed ? `, ${failed} échec(s)` : ''}` }).show()
      }
    }
    return { sent, failed }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    rawDb().prepare('UPDATE sync_folders SET last_scan = ?, last_error = ? WHERE id = ?').run(Date.now(), lastError, id)
    return { sent, failed: failed + 1 }
  } finally {
    running = null
    progress({ syncId: id, done: 0, total: 0, current: '' })
    const next = queue.shift()
    if (next) void runSync(next)
  }
}

// ─── Surveillance ──────────────────────────────────────────────────────────────────────────

const watchers = new Map<string, FSWatcher>()
const debounce = new Map<string, NodeJS.Timeout>()

function startWatch(id: string): void {
  const r = get(id)
  if (!r || !r.enabled || watchers.has(id) || !existsSync(r.path)) return
  try {
    // Récursif : Windows et macOS (et Linux avec Node ≥ 20).
    const w = watch(r.path, { recursive: true }, (_ev, file) => {
      if (file && (SKIP_FILE.test(basename(String(file))) || excluded(String(file), r.exclude))) return
      clearTimeout(debounce.get(id))
      // On attend que ça se calme (copie d'un gros dossier, enregistrement…).
      debounce.set(id, setTimeout(() => void runSync(id), 30_000))
    })
    w.on('error', () => stopWatch(id))
    watchers.set(id, w)
  } catch {
    /* surveillance impossible : la synchro périodique prend le relais */
  }
}

function stopWatch(id: string): void {
  watchers.get(id)?.close()
  watchers.delete(id)
  clearTimeout(debounce.get(id))
  debounce.delete(id)
}

let timer: NodeJS.Timeout | null = null

/** Démarre la surveillance et la synchro périodique de tous les dossiers actifs. */
export function startFolderSync(): void {
  ensure()
  for (const s of listSyncFolders()) if (s.enabled) startWatch(s.id)
  const tick = (): void => {
    for (const s of listSyncFolders()) {
      if (!s.enabled) continue
      if (!s.lastScan || Date.now() - s.lastScan >= s.intervalMin * 60_000) void runSync(s.id)
    }
  }
  timer = setInterval(tick, 60_000)
  setTimeout(tick, 20_000)
}

export function stopFolderSync(): void {
  if (timer) clearInterval(timer)
  timer = null
  for (const id of [...watchers.keys()]) stopWatch(id)
}

export function syncedFiles(id: string, limit = 200): { relPath: string; size: number; syncedAt: number }[] {
  ensure()
  return (
    rawDb().prepare('SELECT rel_path, size, synced_at FROM sync_entries WHERE sync_id = ? ORDER BY synced_at DESC LIMIT ?').all(id, limit) as {
      rel_path: string
      size: number
      synced_at: number
    }[]
  ).map((e) => ({ relPath: e.rel_path, size: e.size, syncedAt: e.synced_at }))
}
