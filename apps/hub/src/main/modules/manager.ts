import { app, nativeImage } from 'electron'
import { createHash } from 'crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import type { CatalogModule, ModuleManifest } from '@module-api/types'
import type { CatalogState, ModuleInfo, ModuleProgress } from '@shared/types'
import { compareVersions } from '../github'
import { broadcast } from '../events'
import { moduleSource } from './source'
import { activate, deactivate, entryUrlFor, isVisible, moduleError } from './runtime'
import { hasLegacyData, isLegacyRunning, legacyExecPath, uninstallLegacy } from './legacy'

// Installation, mise à jour et retrait des modules. Un module installé vit dans
// userData/modules/<id>/<version>/ (main, preload, renderer, manifest.json, icon.png) ;
// ses données, elles, restent dans son propre dossier (voir runtime.dataDirFor).

interface Installed {
  version: string
  installedAt: number
  manifest: ModuleManifest
}

const root = (): string => join(app.getPath('userData'), 'modules')
const registryPath = (): string => join(root(), 'installed.json')
const moduleDir = (id: string, version: string): string => join(root(), id, version)

function readRegistry(): Record<string, Installed> {
  try {
    return JSON.parse(readFileSync(registryPath(), 'utf-8')) as Record<string, Installed>
  } catch {
    return {}
  }
}

function writeRegistry(r: Record<string, Installed>): void {
  mkdirSync(root(), { recursive: true })
  writeFileSync(registryPath(), JSON.stringify(r, null, 2))
}

// ─── Catalogue ─────────────────────────────────────────────────────────────────────────────

let catalog: CatalogModule[] = []
let catalogState: CatalogState = { ok: false, error: null, source: moduleSource().label }
let catalogAt = 0
const CATALOG_TTL_MS = 5 * 60_000

async function refreshCatalog(force = false): Promise<void> {
  if (!force && catalogState.ok && Date.now() - catalogAt < CATALOG_TTL_MS) return
  const source = moduleSource()
  try {
    catalog = await source.list()
    catalogState = { ok: true, error: null, source: source.label }
    catalogAt = Date.now()
  } catch (err) {
    catalogState = { ok: false, error: err instanceof Error ? err.message : String(err), source: source.label }
  }
}

export function getCatalogState(): CatalogState {
  return catalogState
}

// ─── Logos ─────────────────────────────────────────────────────────────────────────────────

const icons = new Map<string, string>()

/** Logo réduit à 128 px (data URL) : celui du module installé, sinon celui du catalogue. */
function iconOf(id: string, installed?: Installed, fromCatalog?: string): string | null {
  const key = `${id}@${installed?.version ?? 'catalog'}`
  if (icons.has(key)) return icons.get(key) ?? null
  let img: Electron.NativeImage | null = null
  const file = installed ? join(moduleDir(id, installed.version), 'icon.png') : null
  if (file && existsSync(file)) img = nativeImage.createFromPath(file)
  else if (fromCatalog) img = nativeImage.createFromDataURL(fromCatalog)
  if (!img || img.isEmpty()) return null
  const url = img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL()
  icons.set(key, url)
  return url
}

// ─── État des modules ──────────────────────────────────────────────────────────────────────

export async function listModules(opts: { refresh?: boolean } = {}): Promise<ModuleInfo[]> {
  await refreshCatalog(opts.refresh)
  const reg = readRegistry()
  const ids = [...new Set([...catalog.map((m) => m.id), ...Object.keys(reg)])]
  return Promise.all(
    ids.map(async (id): Promise<ModuleInfo> => {
      const cat = catalog.find((m) => m.id === id)
      const inst = reg[id]
      const manifest: ModuleManifest = inst?.manifest ?? (cat as ModuleManifest)
      const latest = cat?.version ?? null
      const update = !!inst && !!latest && compareVersions(latest, inst.version) > 0
      return {
        id,
        name: manifest.name,
        tagline: (cat ?? manifest).tagline,
        description: (cat ?? manifest).description,
        category: manifest.category,
        accent: manifest.accent,
        icon: iconOf(id, inst, cat?.icon),
        status: !inst ? 'available' : update ? 'update' : 'installed',
        installedVersion: inst?.version ?? null,
        latestVersion: latest,
        size: cat?.size ?? null,
        entryUrl: inst ? entryUrlFor(moduleDir(id, inst.version)) : null,
        error: inst ? moduleError(id) : null,
        legacy: manifest.legacy ? { hasData: hasLegacyData(manifest), appInstalled: !!(await legacyExecPath(manifest)) } : null
      }
    })
  )
}

/** Démarre tous les modules installés (au lancement d'Open Studio). */
export async function activateInstalled(): Promise<void> {
  for (const [id, inst] of Object.entries(readRegistry())) {
    const dir = moduleDir(id, inst.version)
    if (existsSync(dir)) await activate(inst.manifest, dir)
  }
}

// ─── Installation ──────────────────────────────────────────────────────────────────────────

const busy = new Set<string>()

function progress(id: string, phase: ModuleProgress['phase'], pct: number): void {
  broadcast('modules:progress', { id, phase, pct } satisfies ModuleProgress)
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (c) => hash.update(c))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/** Installe ou met à jour un module, puis le démarre. Les données ne sont jamais touchées. */
export async function installModule(id: string): Promise<void> {
  if (busy.has(id)) throw new Error('Une installation de ce module est déjà en cours.')
  busy.add(id)
  try {
    await refreshCatalog(true)
    const cat = catalog.find((m) => m.id === id)
    if (!cat) throw new Error('Module introuvable dans le catalogue.')
    // Deux programmes ne doivent pas écrire dans les mêmes données en même temps.
    if (await isLegacyRunning(cat)) {
      throw new Error(`Ferme d’abord l’ancienne app ${cat.name} : le module va reprendre ses données.`)
    }

    const tmp = join(root(), `.tmp-${id}-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    try {
      // Tout est préparé à côté : en cas d'échec (réseau, fichier abîmé), la version en place reste intacte.
      const zip = join(tmp, cat.file)
      progress(id, 'downloading', 0)
      await moduleSource().fetch(cat, zip, (r) => progress(id, 'downloading', r))
      progress(id, 'installing', 0)
      if ((await sha256(zip)) !== cat.sha256) throw new Error('Le fichier téléchargé est abîmé (empreinte différente) : réessaie.')
      const unpacked = join(tmp, 'module')
      new AdmZip(zip).extractAllTo(unpacked, true)
      const manifest = JSON.parse(readFileSync(join(unpacked, 'manifest.json'), 'utf-8')) as ModuleManifest
      if (manifest.id !== id) throw new Error('Ce zip ne contient pas le bon module.')

      const reg = readRegistry()
      const previous = reg[id]
      await deactivate(id)
      const dest = moduleDir(id, manifest.version)
      rmSync(dest, { recursive: true, force: true })
      mkdirSync(join(root(), id), { recursive: true })
      renameSync(unpacked, dest)
      reg[id] = { version: manifest.version, installedAt: Date.now(), manifest }
      writeRegistry(reg)
      if (previous && previous.version !== manifest.version) {
        rmSync(moduleDir(id, previous.version), { recursive: true, force: true })
      }
      await activate(manifest, dest)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  } finally {
    busy.delete(id)
    progress(id, 'done', 1)
    broadcast('modules:changed', null)
  }
}

/** Retire un module. Ses données restent sur l'ordinateur : le réinstaller les retrouve. */
export async function uninstallModule(id: string): Promise<void> {
  if (busy.has(id)) throw new Error('Ce module est en cours d’installation.')
  await deactivate(id)
  const reg = readRegistry()
  delete reg[id]
  writeRegistry(reg)
  rmSync(join(root(), id), { recursive: true, force: true })
  broadcast('modules:changed', null)
}

export async function removeLegacyApp(id: string): Promise<void> {
  const manifest = readRegistry()[id]?.manifest ?? catalog.find((m) => m.id === id)
  if (!manifest) throw new Error('Module inconnu.')
  await uninstallLegacy(manifest)
  broadcast('modules:changed', null)
}

/**
 * Mises à jour automatiques : un module se met à jour tout seul, sauf s'il est affiché à
 * l'écran (on ne recharge pas une interface sous les yeux de la personne : il attendra).
 */
export async function autoUpdate(): Promise<void> {
  const list = await listModules({ refresh: true }).catch(() => [])
  for (const m of list) {
    if (m.status !== 'update' || busy.has(m.id) || isVisible(m.id)) continue
    try {
      await installModule(m.id)
      broadcast('modules:autoUpdated', { id: m.id, name: m.name, version: m.latestVersion })
    } catch (err) {
      console.error('[modules] mise à jour automatique', m.id, err)
    }
  }
}
