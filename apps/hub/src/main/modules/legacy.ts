import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { ModuleManifest } from '@module-api/types'
import type { CatalogEntry } from '@shared/legacy'
import { winInstaller } from '../install/win'
import { macInstaller } from '../install/mac'
import { linuxInstaller } from '../install/linux'
import { dataDirFor } from './runtime'

// Les anciennes apps autonomes (Cours Studio, Drive Studio, Local IA Studio installées à part) :
// leurs données sont reprises telles quelles par le module, et on propose de les désinstaller.

const platformInstaller =
  process.platform === 'win32' ? winInstaller : process.platform === 'darwin' ? macInstaller : linuxInstaller

function entryFor(m: ModuleManifest): CatalogEntry | null {
  if (!m.legacy) return null
  return { id: m.id, name: m.name, productName: m.legacy.productName, debPackageName: m.legacy.debPackageName }
}

/** L'ancienne app a-t-elle laissé des données (que le module va retrouver) ? */
export function hasLegacyData(m: ModuleManifest): boolean {
  if (!m.legacy) return false
  try {
    return readdirSync(dataDirFor(m)).length > 0
  } catch {
    return false
  }
}

/** Open Studio 1.x installait les apps dans son dossier (%APPDATA%/open-studio/apps/<id>/install). */
const v1Dir = (): string => join(app.getPath('appData'), 'open-studio')
const v1Store = (): string => join(v1Dir(), 'open-studio-data.json')

function readV1(): { apps?: Record<string, { installPath: string }> } & Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(v1Store(), 'utf-8'))
  } catch {
    return {}
  }
}

export async function legacyExecPath(m: ModuleManifest): Promise<string | null> {
  const entry = entryFor(m)
  if (!entry) return null
  const candidates = [
    readV1().apps?.[m.id]?.installPath,
    process.platform === 'win32' ? join(v1Dir(), 'apps', m.id, 'install', `${entry.productName}.exe`) : null,
    await platformInstaller.detectExisting(entry).catch(() => null)
  ]
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null
}

/** L'ancienne app est-elle ouverte ? (deux programmes ne doivent pas écrire les mêmes données) */
export async function isLegacyRunning(m: ModuleManifest): Promise<boolean> {
  const exec = await legacyExecPath(m)
  if (!exec) return false
  return new Promise((resolveRunning) => {
    if (process.platform === 'win32') {
      const image = basename(exec)
      execFile('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
        resolveRunning(!err && stdout.toLowerCase().includes(`"${image.toLowerCase()}"`))
      })
      return
    }
    const pattern = process.platform === 'darwin' ? `${exec}/Contents/MacOS/` : exec
    execFile('pgrep', ['-f', pattern], (err) => resolveRunning(!err))
  })
}

/** Désinstalle l'ancienne app autonome. Ses données (le dossier repris par le module) restent. */
export async function uninstallLegacy(m: ModuleManifest): Promise<void> {
  const entry = entryFor(m)
  const exec = await legacyExecPath(m)
  if (!entry || !exec) return
  if (await isLegacyRunning(m)) throw new Error(`Ferme d’abord l’ancienne app ${m.name}.`)
  await platformInstaller.uninstall(entry, exec)
  // Ménage du suivi d'Open Studio 1.x (dossier d'install, entrée « apps »).
  const v1 = readV1()
  if (v1.apps?.[m.id]) {
    delete v1.apps[m.id]
    writeFileSync(v1Store(), JSON.stringify(v1, null, 2))
  }
  rmSync(join(v1Dir(), 'apps', m.id), { recursive: true, force: true })
}
