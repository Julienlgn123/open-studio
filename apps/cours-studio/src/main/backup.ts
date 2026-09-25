import { app, dialog, shell, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
  statSync, rmSync, copyFileSync
} from 'fs'
import { checkpointDb, closeDb, getDbPath } from './db'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip')

// Folders / files inside userData that make up the full user data set
const DATA_ENTRIES = ['cours-studio.db', 'settings.json', 'attachments', 'recordings']

function userData(): string {
  return app.getPath('userData')
}

export function getBackupsDir(): string {
  const dir = join(userData(), 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function addPathToZip(zip: any, absPath: string, relPath: string): void {
  const stat = statSync(absPath)
  if (stat.isDirectory()) {
    for (const child of readdirSync(absPath)) {
      addPathToZip(zip, join(absPath, child), `${relPath}/${child}`)
    }
  } else {
    zip.file(relPath, readFileSync(absPath))
  }
}

// ─── Manual export: full .zip the user chooses where to save ──────────────────
export async function exportBackup(window: BrowserWindow): Promise<string | null> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Exporter une sauvegarde',
    defaultPath: `cours-studio-sauvegarde-${stamp}.zip`,
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }]
  })
  if (canceled || !filePath) return null

  checkpointDb()
  const zip = new JSZip()
  zip.file('cours-studio-backup.json', JSON.stringify({
    app: 'cours-studio', version: app.getVersion(), createdAt: Date.now()
  }, null, 2))

  for (const entry of DATA_ENTRIES) {
    const abs = join(userData(), entry)
    if (existsSync(abs)) addPathToZip(zip, abs, entry)
  }

  const buffer: Buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  writeFileSync(filePath, buffer)
  return filePath
}

// ─── Manual import: replace all local data with a .zip, then relaunch ─────────
export async function importBackup(window: BrowserWindow): Promise<boolean> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Restaurer une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }]
  })
  if (canceled || filePaths.length === 0) return false

  const buffer = readFileSync(filePaths[0])
  let zip: any
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Fichier illisible — ce n\'est pas une archive ZIP valide.')
  }
  if (!zip.file('cours-studio-backup.json') && !zip.file('cours-studio.db')) {
    throw new Error('Cette archive ne ressemble pas à une sauvegarde Cours Studio.')
  }

  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['Annuler', 'Restaurer et redémarrer'],
    defaultId: 1,
    cancelId: 0,
    title: 'Restaurer une sauvegarde',
    message: 'Toutes les données actuelles seront remplacées par le contenu de la sauvegarde.',
    detail: 'Une copie de sécurité de l\'état actuel est gardée dans le dossier des sauvegardes. L\'application va redémarrer.'
  })
  if (response !== 1) return false

  // Safety net: snapshot the current db before wiping
  try {
    const dbPath = getDbPath()
    if (existsSync(dbPath)) {
      checkpointDb()
      copyFileSync(dbPath, join(getBackupsDir(), `avant-restauration-${Date.now()}.db`))
    }
  } catch { /* non-blocking */ }

  closeDb()

  // Wipe the known data entries, then write the archive contents back
  for (const entry of DATA_ENTRIES) {
    const abs = join(userData(), entry)
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true })
  }

  const files = Object.keys(zip.files)
  for (const rel of files) {
    const file = zip.files[rel]
    if (file.dir || rel === 'cours-studio-backup.json') continue
    // Keep archive paths sandboxed to userData
    const safeRel = rel.replace(/\\/g, '/').replace(/^\/+/, '')
    if (safeRel.includes('..')) continue
    const dest = join(userData(), safeRel)
    mkdirSync(join(dest, '..'), { recursive: true })
    writeFileSync(dest, Buffer.from(await file.async('nodebuffer')))
  }

  app.relaunch()
  app.exit(0)
  return true
}

// ─── Auto-backup to a user-chosen folder (e.g. a Google Drive/Dropbox sync folder) ──
// A real Drive/cloud API integration is a lot more machinery (OAuth, a live network
// dependency) than "let the user point this at a folder their cloud client already
// syncs" — same end result, none of the extra failure modes, and it works with
// whatever sync tool the user already has instead of locking them into one.

export async function chooseAutoBackupFolder(window: BrowserWindow): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Choisir un dossier de sauvegarde automatique',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
}

// Writes a full .zip straight into the given folder — no dialog, meant to run
// unattended on launch. Silent failure (e.g. folder got deleted/unmounted, like an
// unplugged drive or a signed-out cloud client) since this must never block startup.
export function runAutoBackupToFolder(folderPath: string): void {
  try {
    if (!existsSync(folderPath)) return
    checkpointDb()
    const zip = new JSZip()
    zip.file('cours-studio-backup.json', JSON.stringify({
      app: 'cours-studio', version: app.getVersion(), createdAt: Date.now()
    }, null, 2))
    for (const entry of DATA_ENTRIES) {
      const abs = join(userData(), entry)
      if (existsSync(abs)) addPathToZip(zip, abs, entry)
    }
    zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      .then((buffer: Buffer) => {
        const stamp = new Date().toISOString().slice(0, 10)
        writeFileSync(join(folderPath, `cours-studio-sauvegarde-${stamp}.zip`), buffer)
        // Keep only the most recent one in that folder — it's meant to always
        // reflect "now", not to be a second version history on top of the local one.
        const olds = readdirSync(folderPath).filter((f) => /^cours-studio-sauvegarde-\d{4}-\d{2}-\d{2}\.zip$/.test(f) && f !== `cours-studio-sauvegarde-${stamp}.zip`)
        for (const f of olds) { try { rmSync(join(folderPath, f)) } catch { /* ok */ } }
      })
      .catch(() => { /* never block startup on a failed cloud-folder write */ })
  } catch { /* ok */ }
}

// ─── Auto-backup: cheap db-only copy on every launch, keep the last N ────────
const AUTO_KEEP = 7

export function autoBackup(): void {
  try {
    const dbPath = getDbPath()
    if (!dbPath || !existsSync(dbPath)) return
    checkpointDb()
    const dir = getBackupsDir()
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    copyFileSync(dbPath, join(dir, `auto-${stamp}.db`))

    const autos = readdirSync(dir)
      .filter((f) => f.startsWith('auto-') && f.endsWith('.db'))
      .sort()
    for (const old of autos.slice(0, Math.max(0, autos.length - AUTO_KEEP))) {
      try { rmSync(join(dir, old)) } catch { /* ok */ }
    }
  } catch { /* auto-backup must never block startup */ }
}

// ─── Suppression totale : remet l'app à zéro (cours, médias, réglages) ─────────
export function resetAllData(window: BrowserWindow): Promise<boolean> {
  return dialog
    .showMessageBox(window, {
      type: 'warning',
      buttons: ['Annuler', 'Tout supprimer'],
      defaultId: 0,
      cancelId: 0,
      title: 'Supprimer toutes les données',
      message: 'Supprimer définitivement tous tes cours, médias et réglages ?',
      detail:
        "Action irréversible — aucune copie n'est gardée. Pense à exporter une sauvegarde " +
        "avant si tu n'es pas sûr. L'application va redémarrer, vide."
    })
    .then(({ response }) => {
      if (response !== 1) return false
      closeDb()
      for (const entry of [...DATA_ENTRIES, 'backups']) {
        const abs = join(userData(), entry)
        if (existsSync(abs)) rmSync(abs, { recursive: true, force: true })
      }
      app.relaunch()
      app.exit(0)
      return true
    })
}

export function openBackupsFolder(): void {
  shell.openPath(getBackupsDir())
}

export function latestBackupInfo(): { name: string; at: number } | null {
  try {
    const dir = getBackupsDir()
    const files = readdirSync(dir).filter((f) => f.endsWith('.db') || f.endsWith('.zip'))
    if (!files.length) return null
    let newest = { name: '', at: 0 }
    for (const f of files) {
      const at = statSync(join(dir, f)).mtimeMs
      if (at > newest.at) newest = { name: basename(f), at }
    }
    return newest.at ? newest : null
  } catch {
    return null
  }
}
