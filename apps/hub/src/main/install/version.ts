import { execFile } from 'child_process'
import { statSync } from 'fs'
import { join } from 'path'
import type { CatalogEntry } from '@shared/types'

// Version réellement installée d'une app, lue dans l'app elle-même (métadonnées de l'.exe,
// Info.plist du .app, paquet dpkg). Plus fiable que la version notée par Open Studio à
// l'install : celle-ci était le numéro de la release de la suite, pas celui de l'app.

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolveOut, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 15_000 }, (err, stdout) => (err ? reject(err) : resolveOut(stdout.trim())))
  })
}

/** « 1.7.4.0 » (version de fichier Windows) → « 1.7.4 ». */
export function normalizeVersion(v: string): string {
  const clean = v.trim().replace(/^v/, '')
  const parts = clean.split('.')
  return parts.length === 4 && parts[3] === '0' ? parts.slice(0, 3).join('.') : clean
}

// Lire la version lance un processus (PowerShell sous Windows) : mise en cache tant que
// l'exécutable n'a pas changé sur le disque.
const cache = new Map<string, { mtimeMs: number; version: string | null }>()

async function read(entry: CatalogEntry, execPath: string): Promise<string | null> {
  if (process.platform === 'win32') {
    const escaped = execPath.replace(/'/g, "''")
    const out = await exec('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`
    ])
    return out || null
  }
  if (process.platform === 'darwin') {
    const out = await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(execPath, 'Contents', 'Info.plist')])
    return out || null
  }
  const out = await exec('dpkg-query', ['-W', '-f=${Version}', entry.debPackageName])
  return out || null
}

export async function readInstalledVersion(entry: CatalogEntry, execPath: string): Promise<string | null> {
  let mtimeMs = 0
  try {
    mtimeMs = statSync(execPath).mtimeMs
  } catch {
    return null
  }
  const cached = cache.get(execPath)
  if (cached && cached.mtimeMs === mtimeMs) return cached.version
  const raw = await read(entry, execPath).catch(() => null)
  const version = raw ? normalizeVersion(raw) : null
  cache.set(execPath, { mtimeMs, version })
  return version
}
