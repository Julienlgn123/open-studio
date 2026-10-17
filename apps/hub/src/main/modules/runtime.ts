import { app, BrowserWindow, ipcMain, Menu, MenuItem, session, shell, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { ModuleEntry, ModuleHost, ModuleManifest, ScopedIpcMain } from '@module-api/types'
import { effectiveTheme, getLaunchAtStartup, setLaunchAtStartup } from '../store'
import { decryptLegacy } from './legacyCrypto'

// Fait tourner les modules dans Open Studio : leur code main est chargé dans ce process (avec un
// `app` et un `ipcMain` qui leur sont propres), leur interface dans une <webview> de la fenêtre.

interface ActiveModule {
  manifest: ModuleManifest
  dir: string
  entry: ModuleEntry | null
  error: string | null
  /** Ce qu'il faut défaire à l'arrêt du module (handlers IPC, écouteurs d'app). */
  cleanups: (() => void)[]
  guest: WebContents | null
}

const active = new Map<string, ActiveModule>()
let getWindow: () => BrowserWindow | null = () => null
let reveal: (id: string | null) => void = () => {}

export function initRuntime(opts: { window: () => BrowserWindow | null; reveal: (id: string | null) => void }): void {
  getWindow = opts.window
  reveal = opts.reveal
}

export const partitionFor = (id: string): string => `persist:module-${id}`
export const entryUrlFor = (dir: string): string => pathToFileURL(join(dir, 'renderer', 'index.html')).href

export function dataDirFor(manifest: ModuleManifest): string {
  return join(app.getPath('appData'), manifest.dataDirName)
}

export function moduleError(id: string): string | null {
  return active.get(id)?.error ?? null
}

export function isActive(id: string): boolean {
  return active.has(id)
}

/** L'interface du module est-elle affichée en ce moment ? (on ne la met pas à jour sous les yeux) */
export function isVisible(id: string): boolean {
  const guest = active.get(id)?.guest
  return !!guest && !guest.isDestroyed() && currentModule === id
}

let currentModule: string | null = null
export function setCurrentModule(id: string | null): void {
  currentModule = id
}

function scopedIpc(id: string, cleanups: (() => void)[]): ScopedIpcMain {
  const ch = (c: string): string => `m:${id}:${c}`
  const scoped: ScopedIpcMain = {
    handle(c, fn) {
      ipcMain.handle(ch(c), fn as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)
      cleanups.push(() => ipcMain.removeHandler(ch(c)))
    },
    handleOnce(c, fn) {
      ipcMain.handleOnce(ch(c), fn as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)
      cleanups.push(() => ipcMain.removeHandler(ch(c)))
    },
    removeHandler: (c) => ipcMain.removeHandler(ch(c)),
    on(c, fn) {
      ipcMain.on(ch(c), fn as (e: IpcMainEvent, ...a: unknown[]) => void)
      cleanups.push(() => ipcMain.removeListener(ch(c), fn))
      return scoped
    },
    once(c, fn) {
      ipcMain.once(ch(c), fn as (e: IpcMainEvent, ...a: unknown[]) => void)
      return scoped
    },
    removeListener(c, fn) {
      ipcMain.removeListener(ch(c), fn)
      return scoped
    },
    off(c, fn) {
      ipcMain.removeListener(ch(c), fn)
      return scoped
    },
    removeAllListeners(c) {
      if (c) ipcMain.removeAllListeners(ch(c))
      return scoped
    }
  }
  return scoped
}

/** `app` d'Electron vu par un module : son dossier de données, sa version, ses écouteurs suivis. */
function moduleApp(manifest: ModuleManifest, dataDir: string, cleanups: (() => void)[]): Electron.App {
  const proxy: Electron.App = new Proxy(app, {
    get(target, prop) {
      switch (prop) {
        case 'getPath':
          return (name: Parameters<typeof app.getPath>[0]) => (name === 'userData' ? dataDir : target.getPath(name))
        case 'getVersion':
          return () => manifest.version
        case 'getName':
          return () => manifest.name
        case 'name':
          return manifest.name
        case 'setAppUserModelId':
          return () => {}
        // Le démarrage avec l'ordinateur est celui d'Open Studio, qui fait tourner ses modules.
        case 'setLoginItemSettings':
          return (s: Electron.Settings) => setLaunchAtStartup(!!s.openAtLogin)
        case 'getLoginItemSettings':
          return () => ({ ...target.getLoginItemSettings(), openAtLogin: getLaunchAtStartup() })
        case 'on':
        case 'once':
        case 'addListener':
          return (event: string, fn: (...a: unknown[]) => void) => {
            ;(target[prop] as (e: string, f: (...a: unknown[]) => void) => void).call(target, event, fn)
            cleanups.push(() => target.removeListener(event as 'quit', fn))
            return proxy
          }
      }
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    }
  })
  return proxy
}

/** Charge et démarre un module installé dans `dir`. Une erreur ne bloque pas Open Studio. */
export async function activate(manifest: ModuleManifest, dir: string): Promise<void> {
  if (active.has(manifest.id)) await deactivate(manifest.id)
  const dataDir = dataDirFor(manifest)
  mkdirSync(dataDir, { recursive: true })
  const cleanups: (() => void)[] = []
  const mod: ActiveModule = { manifest, dir, entry: null, error: null, cleanups, guest: null }
  active.set(manifest.id, mod)

  const host: ModuleHost = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    dataDir,
    app: moduleApp(manifest, dataDir, cleanups),
    ipcMain: scopedIpc(manifest.id, cleanups),
    send(channel, ...args) {
      if (mod.guest && !mod.guest.isDestroyed()) mod.guest.send(channel, ...args)
    },
    window: () => getWindow(),
    session: () => session.fromPartition(partitionFor(manifest.id)),
    reveal: () => reveal(manifest.id),
    getLaunchAtStartup,
    setLaunchAtStartup,
    importHost: (specifier) => import(/* @vite-ignore */ specifier),
    // Clé de l'ancienne app (ou de son ancien nom), ou d'un ancien Open Studio qui a pu rechiffrer ces données.
    decryptLegacy: (data) => {
      const appData = app.getPath('appData')
      const dirs = [dataDir, ...(manifest.legacy?.previousDataDirs ?? []).map((d) => join(appData, d)), join(appData, 'open-studio')]
      return decryptLegacy(data, dirs, [manifest.dataDirName, manifest.legacy?.productName ?? manifest.name, 'Open Studio'])
    }
  }

  const g = globalThis as { __openStudioModule?: ModuleHost }
  try {
    g.__openStudioModule = host
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod.entry = require(join(dir, 'main', 'index.js')) as ModuleEntry
  } catch (err) {
    mod.error = `Chargement impossible : ${err instanceof Error ? err.message : String(err)}`
    console.error(`[module ${manifest.id}]`, err)
    return
  } finally {
    delete g.__openStudioModule
  }
  try {
    await mod.entry.activate()
  } catch (err) {
    mod.error = err instanceof Error ? err.message : String(err)
    console.error(`[module ${manifest.id}]`, err)
  }
}

/** Arrête un module (avant mise à jour ou retrait) : minuteries, serveurs, handlers IPC. */
export async function deactivate(id: string): Promise<void> {
  const mod = active.get(id)
  if (!mod) return
  active.delete(id)
  try {
    await mod.entry?.deactivate?.()
  } catch (err) {
    console.error(`[module ${id}] arrêt`, err)
  }
  for (const fn of mod.cleanups.reverse()) {
    try {
      fn()
    } catch {
      /* déjà retiré */
    }
  }
  // Le prochain chargement (nouvelle version) relit les fichiers au lieu du cache de require.
  for (const key of Object.keys(require.cache)) if (key.startsWith(mod.dir)) delete require.cache[key]
}

export async function deactivateAll(): Promise<void> {
  for (const id of [...active.keys()]) await deactivate(id)
}

/** Thème d'Open Studio, poussé à toutes les interfaces de modules ouvertes. */
export function broadcastTheme(): void {
  const theme = effectiveTheme()
  for (const mod of active.values()) if (mod.guest && !mod.guest.isDestroyed()) mod.guest.send('studio:theme', theme)
}

// ─── <webview> des modules ─────────────────────────────────────────────────────────────────

/**
 * Branche la fenêtre : chaque <webview> doit correspondre à un module actif. C'est ici (et pas
 * dans le renderer) qu'on fixe son preload, sa page et ses permissions.
 */
export function guardWebviews(win: BrowserWindow): void {
  win.webContents.on('will-attach-webview', (event, prefs, params) => {
    const id = params.partition?.startsWith('persist:module-') ? params.partition.slice('persist:module-'.length) : null
    const mod = id ? active.get(id) : null
    if (!id || !mod) {
      event.preventDefault()
      return
    }
    delete (prefs as { preloadURL?: string }).preloadURL
    prefs.preload = join(mod.dir, 'preload', 'index.js')
    prefs.contextIsolation = true
    prefs.nodeIntegration = false
    prefs.sandbox = false
    prefs.spellcheck = true
    prefs.plugins = true // lecteur PDF intégré (pièces jointes de Cours Studio)
    prefs.additionalArguments = [`--os-module=${id}`]
    params.src = entryUrlFor(mod.dir)
  })

  win.webContents.on('did-attach-webview', (_event, guest) => {
    const mod = [...active.values()].find((m) => guest.session === session.fromPartition(partitionFor(m.manifest.id)))
    if (!mod) return
    mod.guest = guest
    setupGuest(guest, mod.manifest.id)
    guest.once('destroyed', () => {
      if (mod.guest === guest) mod.guest = null
    })
  })
}

function setupGuest(guest: WebContents, id: string): void {
  // Liens externes : navigateur par défaut ; la webview ne quitte jamais la page du module.
  guest.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  guest.on('will-navigate', (e, url) => {
    if (url.startsWith('file:') && url.split('#')[0] === guest.getURL().split('#')[0]) return
    e.preventDefault()
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })

  // Correcteur orthographique (français + anglais) et menu clic droit, pareils dans tous les modules.
  const ses = guest.session
  if (process.platform !== 'darwin') {
    const langs = ['fr', 'en-US'].filter((l) => ses.availableSpellCheckerLanguages.includes(l))
    if (langs.length) ses.setSpellCheckerLanguages(langs)
  }
  guest.on('context-menu', (_e, params) => {
    const menu = new Menu()
    for (const s of params.dictionarySuggestions) {
      menu.append(new MenuItem({ label: s, click: () => guest.replaceMisspelling(s) }))
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length) menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ label: 'Ajouter au dictionnaire', click: () => ses.addWordToSpellCheckerDictionary(params.misspelledWord) }))
      menu.append(new MenuItem({ type: 'separator' }))
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'cut', label: 'Couper' }))
      menu.append(new MenuItem({ role: 'copy', label: 'Copier' }))
      menu.append(new MenuItem({ role: 'paste', label: 'Coller' }))
    } else if (params.selectionText) {
      menu.append(new MenuItem({ role: 'copy', label: 'Copier' }))
    }
    if (menu.items.length) menu.popup()
  })

  // Raccourcis d'Open Studio, même quand le module a le focus : Ctrl+1…9 (modules), Ctrl+0 (accueil).
  guest.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt || input.shift) return
    if (/^[0-9]$/.test(input.key)) {
      e.preventDefault()
      getWindow()?.webContents.send('studio:shortcut', `digit:${input.key}`)
    }
  })

  guest.send('studio:theme', effectiveTheme())
  void id
}
