import { app } from 'electron'
import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { CATALOG } from './catalog'
import { dirSize } from './install/dirSize'
import { getInstalledSize, isAppRunning } from './install'
import type { AppStorage, CatalogEntry } from '@shared/types'

// Espace disque occupé par chaque app de la suite, et nettoyage de ce qui peut partir sans
// risque : caches du navigateur intégré, anciens installateurs, vieilles sauvegardes (on garde
// toujours les plus récentes). Les données elles-mêmes (cours, conversations…) ne sont jamais touchées.

/** Dossiers de cache d'Electron/Chromium : recréés tout seuls au prochain lancement. */
const CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Shared Dictionary', 'blob_storage']
/** Sauvegardes automatiques de chaque app (relatif à son dossier de données). */
const BACKUP_DIRS: Record<string, string[]> = {
  'cours-studio': ['backups'],
  'local-ia-studio': ['sauvegardes'],
  'drive-studio': ['backups']
}
/** Nombre de sauvegardes gardées par dossier lors d'un nettoyage. */
const KEEP_BACKUPS = 3

/** Dossier de données (userData) d'une app : AppData/<nom du paquet>. */
function dataDir(entry: CatalogEntry): string {
  return join(app.getPath('appData'), entry.debPackageName)
}

/** Fichiers laissés par Open Studio à côté d'une install (anciens installateurs, zips). */
function leftovers(id: string): string[] {
  const dir = join(app.getPath('userData'), 'apps', id)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f !== 'install')
    .map((f) => join(dir, f))
}

function sizeOf(path: string): number {
  try {
    return statSync(path).isDirectory() ? dirSize(path) : statSync(path).size
  } catch {
    return 0
  }
}

/** Sauvegardes au-delà des plus récentes, triées de la plus ancienne à la plus récente. */
function oldBackups(entry: CatalogEntry): string[] {
  const out: string[] = []
  for (const rel of BACKUP_DIRS[entry.id] ?? []) {
    const dir = join(dataDir(entry), rel)
    if (!existsSync(dir)) continue
    const items = readdirSync(dir)
      .map((f) => ({ path: join(dir, f), at: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
    out.push(...items.slice(KEEP_BACKUPS).map((i) => i.path))
  }
  return out
}

export async function getAppStorage(): Promise<AppStorage[]> {
  const list: AppStorage[] = []
  for (const entry of CATALOG) {
    const data = dataDir(entry)
    const appBytes = (await getInstalledSize(entry.id).catch(() => null)) ?? 0
    const hasData = existsSync(data)
    if (!appBytes && !hasData) continue
    const cacheBytes = CACHE_DIRS.reduce((n, d) => n + sizeOf(join(data, d)), 0)
    const backups = (BACKUP_DIRS[entry.id] ?? []).reduce((n, d) => n + sizeOf(join(data, d)), 0)
    const leftoverBytes = leftovers(entry.id).reduce((n, p) => n + sizeOf(p), 0)
    const oldBackupBytes = oldBackups(entry).reduce((n, p) => n + sizeOf(p), 0)
    const total = hasData ? sizeOf(data) : 0
    list.push({
      id: entry.id,
      name: entry.name,
      appBytes,
      dataBytes: Math.max(0, total - cacheBytes - backups),
      backupBytes: backups,
      cacheBytes: cacheBytes + leftoverBytes,
      reclaimableBytes: cacheBytes + leftoverBytes + oldBackupBytes,
      dataPath: hasData ? data : null
    })
  }
  return list
}

/** Libère l'espace récupérable d'une app. Refuse si elle est ouverte (ses caches sont verrouillés). */
export async function cleanAppStorage(id: string): Promise<number> {
  const entry = CATALOG.find((c) => c.id === id)
  if (!entry) throw new Error('App inconnue : ' + id)
  if (await isAppRunning(id)) throw new Error(`Ferme ${entry.name} avant de faire le ménage.`)
  const targets = [...CACHE_DIRS.map((d) => join(dataDir(entry), d)), ...leftovers(id), ...oldBackups(entry)]
  let freed = 0
  for (const p of targets) {
    if (!existsSync(p)) continue
    const size = sizeOf(p)
    try {
      rmSync(p, { recursive: true, force: true })
      freed += size
    } catch {
      /* fichier verrouillé : ignoré */
    }
  }
  return freed
}
