import { app, dialog, shell, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  readdirSync,
  statSync
} from 'fs'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import { getDbPath, checkpointDb, closeDb } from './db'
import { encryptString, decryptString } from './crypto'
import { encryptWithPassphrase, decryptWithPassphrase } from './transfercrypto'
import { revokeAccount } from './google/oauth'

function userData(): string {
  return app.getPath('userData')
}

function settingsPath(): string {
  return join(userData(), 'settings.json')
}

function backupsDir(): string {
  const dir = join(userData(), 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Exporte les données de l'app vers un .zip choisi par l'utilisateur : la
 * base SQLite (comptes, fichiers, dossiers, planifications, partages) et les
 * réglages. Les secrets (tokens OAuth, Client ID/Secret Google) sont
 * chiffrés au repos avec `safeStorage` (lié à cette machine) — impossible à
 * relire ailleurs, donc on les déchiffre puis on les re-chiffre avec la
 * passphrase fournie pour qu'ils survivent le transfert vers un autre PC.
 */
export async function exportData(window: BrowserWindow, passphrase: string): Promise<string | null> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Choisis une passphrase de 4 caractères minimum pour protéger tes comptes exportés.')
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Exporter mes données',
    defaultPath: `drive-backup-manager-export-${stamp}.zip`,
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }]
  })
  if (canceled || !filePath) return null

  checkpointDb()
  const tmpDb = join(app.getPath('temp'), `open-studio-export-${Date.now()}.db`)
  copyFileSync(getDbPath(), tmpDb)

  try {
    const db = new Database(tmpDb)
    try {
      const rows = db.prepare('SELECT id, access_token, refresh_token FROM accounts').all() as {
        id: string
        access_token: string
        refresh_token: string
      }[]
      const rewrap = db.prepare('UPDATE accounts SET access_token = ?, refresh_token = ? WHERE id = ?')
      for (const r of rows) {
        const plainAccess = decryptString(r.access_token)
        const plainRefresh = decryptString(r.refresh_token)
        rewrap.run(
          encryptWithPassphrase(plainAccess, passphrase),
          encryptWithPassphrase(plainRefresh, passphrase),
          r.id
        )
      }
    } finally {
      db.close()
    }

    // Réglages : mêmes secrets à re-chiffrer, le reste (thème...) passe tel quel.
    let settingsOut = '{}'
    if (existsSync(settingsPath())) {
      const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8'))
      if (raw.googleClientId) raw.googleClientId = encryptWithPassphrase(decryptString(raw.googleClientId), passphrase)
      if (raw.googleClientSecret)
        raw.googleClientSecret = encryptWithPassphrase(decryptString(raw.googleClientSecret), passphrase)
      settingsOut = JSON.stringify(raw, null, 2)
    }

    const zip = new JSZip()
    zip.file(
      'manifest.json',
      JSON.stringify(
        { app: 'gdrive-backup-manager', version: app.getVersion(), format: 1, createdAt: Date.now() },
        null,
        2
      )
    )
    zip.file('drive-backup-manager.db', readFileSync(tmpDb))
    zip.file('settings.json', settingsOut)

    const buffer: Buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    writeFileSync(filePath, buffer)
    return filePath
  } finally {
    rmSync(tmpDb, { force: true })
  }
}

/**
 * Restaure une archive exportée : remplace entièrement les données locales
 * (une copie de sécurité de l'état actuel est gardée dans le dossier des
 * sauvegardes), puis relance l'app.
 */
export async function importData(window: BrowserWindow, passphrase: string): Promise<boolean> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Importer une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Archive ZIP', extensions: ['zip'] }]
  })
  if (canceled || filePaths.length === 0) return false

  const buffer = readFileSync(filePaths[0])
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error("Fichier illisible — ce n'est pas une archive ZIP valide.")
  }
  const dbFile = zip.file('drive-backup-manager.db')
  if (!dbFile) {
    throw new Error('Cette archive ne ressemble pas à une sauvegarde Drive Studio.')
  }

  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['Annuler', 'Restaurer et redémarrer'],
    defaultId: 1,
    cancelId: 0,
    title: 'Restaurer une sauvegarde',
    message: 'Toutes les données actuelles seront remplacées par le contenu de la sauvegarde.',
    detail:
      "Une copie de sécurité de l'état actuel est gardée dans le dossier des sauvegardes. " +
      "L'application va redémarrer."
  })
  if (response !== 1) return false

  const tmpDb = join(app.getPath('temp'), `open-studio-import-${Date.now()}.db`)
  writeFileSync(tmpDb, await dbFile.async('nodebuffer'))

  const settingsFile = zip.file('settings.json')
  const importedSettings = settingsFile ? JSON.parse(await settingsFile.async('string')) : {}

  try {
    // Re-chiffre les secrets avec passphrase -> re-chiffre avec safeStorage de CETTE machine.
    const db = new Database(tmpDb)
    try {
      const rows = db.prepare('SELECT id, access_token, refresh_token FROM accounts').all() as {
        id: string
        access_token: string
        refresh_token: string
      }[]
      const rewrap = db.prepare('UPDATE accounts SET access_token = ?, refresh_token = ? WHERE id = ?')
      for (const r of rows) {
        const plainAccess = decryptWithPassphrase(r.access_token, passphrase)
        const plainRefresh = decryptWithPassphrase(r.refresh_token, passphrase)
        rewrap.run(encryptString(plainAccess), encryptString(plainRefresh), r.id)
      }
    } finally {
      db.close()
    }

    if (importedSettings.googleClientId) {
      importedSettings.googleClientId = encryptString(
        decryptWithPassphrase(importedSettings.googleClientId, passphrase)
      )
    }
    if (importedSettings.googleClientSecret) {
      importedSettings.googleClientSecret = encryptString(
        decryptWithPassphrase(importedSettings.googleClientSecret, passphrase)
      )
    }
  } catch (err) {
    rmSync(tmpDb, { force: true })
    throw err
  }

  // Sauvegarde de sécurité de l'état actuel avant de l'écraser.
  try {
    checkpointDb()
    const dbPath = getDbPath()
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, join(backupsDir(), `avant-restauration-${Date.now()}.db`))
    }
    if (existsSync(settingsPath())) {
      copyFileSync(settingsPath(), join(backupsDir(), `avant-restauration-${Date.now()}-settings.json`))
    }
  } catch {
    // non-bloquant
  }

  closeDb()
  copyFileSync(tmpDb, getDbPath())
  rmSync(tmpDb, { force: true })
  writeFileSync(settingsPath(), JSON.stringify(importedSettings, null, 2))

  app.relaunch()
  app.exit(0)
  return true
}

/** Supprime définitivement toutes les données locales (comptes révoqués côté Google d'abord). */
export async function resetAllData(window: BrowserWindow, accountIds: string[]): Promise<boolean> {
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['Annuler', 'Tout supprimer'],
    defaultId: 0,
    cancelId: 0,
    title: 'Supprimer toutes les données',
    message: 'Supprimer définitivement tous les comptes liés, fichiers, dossiers et réglages ?',
    detail:
      "Action irréversible — aucune copie n'est gardée. Les fichiers restent sur Google Drive, " +
      "seule la liaison locale disparaît. Pense à exporter une sauvegarde avant si tu comptes " +
      "réinstaller sur un autre PC. L'application va redémarrer, vide."
  })
  if (response !== 1) return false

  for (const id of accountIds) {
    await revokeAccount(id).catch(() => null)
  }

  closeDb()
  for (const entry of ['drive-backup-manager.db', 'drive-backup-manager.db-wal', 'drive-backup-manager.db-shm', 'settings.json', 'backups']) {
    const abs = join(userData(), entry)
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true })
  }

  app.relaunch()
  app.exit(0)
  return true
}

export function openBackupsFolder(): void {
  shell.openPath(backupsDir())
}

export function latestBackupInfo(): { name: string; at: number } | null {
  try {
    const dir = backupsDir()
    const files = readdirSync(dir).filter((f) => f.endsWith('.db'))
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

