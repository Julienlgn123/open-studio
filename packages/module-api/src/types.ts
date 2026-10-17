import type { App, BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, Session } from 'electron'

// Contrat entre Open Studio (l'hôte) et un module. Un module est une ancienne app de la suite
// (Cours Studio, Drive Studio…) qui tourne désormais à l'intérieur d'Open Studio : son code
// « main » est chargé dans le process d'Open Studio, son interface dans une <webview>.

/** Fiche d'un module, publiée dans le catalogue (`modules-index.json`) et dans son zip (`manifest.json`). */
export interface ModuleManifest {
  id: string
  name: string
  version: string
  /** Une phrase courte affichée sous le nom. */
  tagline: string
  description: string
  category: string
  accent: string
  /**
   * Dossier de données dans AppData. Pour un module issu d'une ancienne app, c'est le dossier de
   * celle-ci : le module retrouve tout seul les données existantes (rien à copier, rien à perdre).
   */
  dataDirName: string
  /** Ancienne app autonome, pour la repérer (données, désinstallation) sur l'ordinateur. */
  legacy?: {
    productName: string
    debPackageName: string
    /** Anciens dossiers de données (ancien nom de l'app) dont la clé a pu chiffrer des secrets. */
    previousDataDirs?: string[]
  }
}

/** Entrée du catalogue : la fiche + le zip à télécharger. */
export interface CatalogModule extends ModuleManifest {
  file: string
  size: number
  sha256: string
  /** Logo en data URL (le zip n'est pas encore téléchargé). */
  icon?: string
}

/** Version limitée de `ipcMain` : les canaux sont préfixés par l'id du module (pas de collision entre modules). */
export interface ScopedIpcMain {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void
  handleOnce(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void
  removeHandler(channel: string): void
  on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): ScopedIpcMain
  once(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): ScopedIpcMain
  removeListener(channel: string, listener: (...args: any[]) => void): ScopedIpcMain
  off(channel: string, listener: (...args: any[]) => void): ScopedIpcMain
  removeAllListeners(channel?: string): ScopedIpcMain
}

/** Ce qu'Open Studio donne à un module (côté main). */
export interface ModuleHost {
  id: string
  name: string
  version: string
  /** Dossier de données du module (renvoyé aussi par `app.getPath('userData')`). */
  dataDir: string
  /** `app` d'Electron, avec `getPath('userData')`, `getVersion()`… propres au module. */
  app: App
  ipcMain: ScopedIpcMain
  /** Envoie un événement à l'interface du module (ignoré si elle n'est pas ouverte). */
  send(channel: string, ...args: unknown[]): void
  /** Fenêtre d'Open Studio (parent des boîtes de dialogue). */
  window(): BrowserWindow | null
  /** Session de l'interface du module (protocoles, en-têtes…). */
  session(): Session
  /** Affiche Open Studio sur ce module. */
  reveal(): void
  getLaunchAtStartup(): boolean
  setLaunchAtStartup(enabled: boolean): void
  /**
   * `import()` résolu depuis Open Studio, pour un paquet ESM fourni par l'hôte (node-llama-cpp) :
   * un import() écrit dans le module chercherait ses node_modules à côté du module, où il n'y en a pas.
   */
  importHost<T = unknown>(specifier: string): Promise<T>
  /**
   * Déchiffre une valeur `safeStorage` écrite par l'ancienne app autonome (sa clé n'est pas celle
   * d'Open Studio). `null` si impossible. À tenter quand `safeStorage.decryptString` échoue.
   */
  decryptLegacy(data: Buffer): string | null
}

/** Ce qu'exporte le fichier main d'un module. */
export interface ModuleEntry {
  activate(): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export type StudioTheme = 'dark' | 'light'

/** API exposée à l'interface d'un module (`window.studio`). */
export interface StudioBridge {
  moduleId: string
  getTheme(): StudioTheme
  onTheme(cb: (theme: StudioTheme) => void): () => void
  openModule(id: string): void
  openHome(): void
}
