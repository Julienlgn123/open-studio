import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import { encryptString, decryptString } from './crypto'
import type {
  Account,
  BackupJob,
  BackupSchedule,
  FileMeta,
  SharedLink,
  SyncLog,
  VirtualFolder,
  AccountRole,
  AccountStatus,
  BackupMode,
  BackupStatus,
  LogAction,
  LogStatus,
  ScheduleFrequency,
  ShareRole
} from '@shared/types'

let db: Database.Database

export function getDbPath(): string {
  return join(app.getPath('userData'), 'drive-backup-manager.db')
}

/** Force l'écriture du WAL dans le fichier .db principal (avant une copie/export à froid). */
export function checkpointDb(): void {
  db?.pragma('wal_checkpoint(TRUNCATE)')
}

export function closeDb(): void {
  db?.close()
}

export function initDb(): void {
  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      access_token TEXT NOT NULL DEFAULT '',
      refresh_token TEXT NOT NULL DEFAULT '',
      token_expiry INTEGER NOT NULL DEFAULT 0,
      quota_total INTEGER NOT NULL DEFAULT 0,
      quota_used INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'primary',
      status TEXT NOT NULL DEFAULT 'active',
      last_sync INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files_metadata (
      id TEXT PRIMARY KEY,
      drive_file_id TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      checksum TEXT NOT NULL DEFAULT '',
      uploaded_at INTEGER NOT NULL,
      replicated_on TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'synced',
      -- 'app'   : envoyé via l'application (on connaît le SHA-256)
      -- 'drive' : déjà présent sur le Drive, découvert lors d'une synchro
      source TEXT NOT NULL DEFAULT 'app',
      modified_at INTEGER NOT NULL DEFAULT 0,
      web_view_link TEXT
    );

    CREATE TABLE IF NOT EXISTS backup_jobs (
      id TEXT PRIMARY KEY,
      source_account_id TEXT NOT NULL,
      target_account_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'full',
      status TEXT NOT NULL DEFAULT 'pending',
      files_count INTEGER NOT NULL DEFAULT 0,
      files_done INTEGER NOT NULL DEFAULT 0,
      bytes_total INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      account_id TEXT,
      file_id TEXT,
      status TEXT NOT NULL,
      error_details TEXT,
      label TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS virtual_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📁',
      color TEXT NOT NULL DEFAULT '#7c6ff7',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folder_files (
      folder_id TEXT NOT NULL REFERENCES virtual_folders(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files_metadata(id) ON DELETE CASCADE,
      PRIMARY KEY (folder_id, file_id)
    );

    CREATE TABLE IF NOT EXISTS backup_schedules (
      id TEXT PRIMARY KEY,
      source_account_id TEXT NOT NULL,
      target_account_id TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      time TEXT NOT NULL DEFAULT '02:00',
      mode TEXT NOT NULL DEFAULT 'incremental',
      enabled INTEGER NOT NULL DEFAULT 1,
      next_run INTEGER NOT NULL,
      last_run INTEGER
    );

    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES files_metadata(id) ON DELETE CASCADE,
      drive_permission_id TEXT NOT NULL,
      url TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'reader',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_files_account ON files_metadata(account_id);
    CREATE INDEX IF NOT EXISTS idx_files_checksum ON files_metadata(checksum);
    CREATE INDEX IF NOT EXISTS idx_files_drive ON files_metadata(drive_file_id);
    CREATE INDEX IF NOT EXISTS idx_logs_ts ON sync_logs(timestamp DESC);
  `)

  // Migrations défensives pour les bases créées avant l'ajout de colonnes.
  const fileCols = new Set(
    (db.prepare('PRAGMA table_info(files_metadata)').all() as { name: string }[]).map((c) => c.name)
  )
  if (!fileCols.has('source'))
    db.exec("ALTER TABLE files_metadata ADD COLUMN source TEXT NOT NULL DEFAULT 'app'")
  if (!fileCols.has('modified_at'))
    db.exec('ALTER TABLE files_metadata ADD COLUMN modified_at INTEGER NOT NULL DEFAULT 0')
  if (!fileCols.has('web_view_link'))
    db.exec('ALTER TABLE files_metadata ADD COLUMN web_view_link TEXT')

  const shareCols = new Set(
    (db.prepare('PRAGMA table_info(shared_links)').all() as { name: string }[]).map((c) => c.name)
  )
  if (!shareCols.has('expires_at'))
    db.exec('ALTER TABLE shared_links ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0')
}

// ─── Accounts ──────────────────────────────────────────────────────────────

interface DbAccount {
  id: string
  email: string
  access_token: string
  refresh_token: string
  token_expiry: number
  quota_total: number
  quota_used: number
  role: string
  status: string
  last_sync: number | null
  created_at: number
}

function rowToAccount(row: DbAccount): Account {
  const counts = countFilesBySource(row.id)
  return {
    id: row.id,
    email: row.email,
    quotaTotal: row.quota_total,
    quotaUsed: row.quota_used,
    role: row.role as AccountRole,
    status: row.status as AccountStatus,
    lastSync: row.last_sync,
    createdAt: row.created_at,
    filesCount: counts.app + counts.drive,
    driveFilesCount: counts.drive
  }
}

export interface AccountTokens {
  accessToken: string
  refreshToken: string
  expiry: number
}

/** Tokens déchiffrés — usage main uniquement. */
export function getAccountTokens(id: string): AccountTokens | null {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as DbAccount | undefined
  if (!row) return null
  return {
    accessToken: decryptString(row.access_token),
    refreshToken: decryptString(row.refresh_token),
    expiry: row.token_expiry
  }
}

export function setAccountTokens(id: string, tokens: Partial<AccountTokens>): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (tokens.accessToken !== undefined) {
    fields.push('access_token = ?')
    values.push(encryptString(tokens.accessToken))
  }
  if (tokens.refreshToken !== undefined && tokens.refreshToken) {
    fields.push('refresh_token = ?')
    values.push(encryptString(tokens.refreshToken))
  }
  if (tokens.expiry !== undefined) {
    fields.push('token_expiry = ?')
    values.push(tokens.expiry)
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function getAccounts(): Account[] {
  return (db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as DbAccount[]).map(
    rowToAccount
  )
}

export function getAccount(id: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as DbAccount | undefined
  return row ? rowToAccount(row) : null
}

export function getAccountByEmail(email: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email) as DbAccount | undefined
  return row ? rowToAccount(row) : null
}

export function createAccount(data: {
  email: string
  tokens: AccountTokens
  quotaTotal: number
  quotaUsed: number
  role?: AccountRole
}): Account {
  const id = uuid()
  const now = Date.now()
  db.prepare(
    `INSERT INTO accounts
      (id, email, access_token, refresh_token, token_expiry, quota_total, quota_used, role, status, last_sync, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(
    id,
    data.email,
    encryptString(data.tokens.accessToken),
    encryptString(data.tokens.refreshToken),
    data.tokens.expiry,
    data.quotaTotal,
    data.quotaUsed,
    data.role ?? 'primary',
    now,
    now
  )
  return getAccount(id)!
}

export function updateAccount(
  id: string,
  data: Partial<{
    role: AccountRole
    status: AccountStatus
    quotaTotal: number
    quotaUsed: number
    lastSync: number
  }>
): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (data.role !== undefined) {
    fields.push('role = ?')
    values.push(data.role)
  }
  if (data.status !== undefined) {
    fields.push('status = ?')
    values.push(data.status)
  }
  if (data.quotaTotal !== undefined) {
    fields.push('quota_total = ?')
    values.push(data.quotaTotal)
  }
  if (data.quotaUsed !== undefined) {
    fields.push('quota_used = ?')
    values.push(data.quotaUsed)
  }
  if (data.lastSync !== undefined) {
    fields.push('last_sync = ?')
    values.push(data.lastSync)
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteAccount(id: string): void {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
}

// ─── Files ─────────────────────────────────────────────────────────────────

interface DbFile {
  id: string
  drive_file_id: string
  account_id: string
  original_filename: string
  file_size: number
  mime_type: string
  checksum: string
  uploaded_at: number
  replicated_on: string
  status: string
  source: string
  modified_at: number
  web_view_link: string | null
}

function rowToFile(row: DbFile): FileMeta {
  let replicatedOn: string[] = []
  try {
    replicatedOn = JSON.parse(row.replicated_on)
  } catch {
    replicatedOn = []
  }
  const folderIds = (
    db.prepare('SELECT folder_id FROM folder_files WHERE file_id = ?').all(row.id) as {
      folder_id: string
    }[]
  ).map((r) => r.folder_id)
  return {
    id: row.id,
    driveFileId: row.drive_file_id,
    accountId: row.account_id,
    originalFilename: row.original_filename,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    checksum: row.checksum,
    uploadedAt: row.uploaded_at,
    replicatedOn,
    status: row.status as FileMeta['status'],
    source: (row.source as FileMeta['source']) ?? 'app',
    modifiedAt: row.modified_at || row.uploaded_at,
    webViewLink: row.web_view_link ?? undefined,
    folderIds
  }
}

export function getFiles(filters?: {
  accountId?: string
  folderId?: string
  search?: string
  mimePrefix?: string
  source?: 'app' | 'drive'
}): FileMeta[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filters?.accountId) {
    where.push('f.account_id = ?')
    params.push(filters.accountId)
  }
  if (filters?.search) {
    where.push('LOWER(f.original_filename) LIKE ?')
    params.push('%' + filters.search.toLowerCase() + '%')
  }
  if (filters?.mimePrefix) {
    where.push('f.mime_type LIKE ?')
    params.push(filters.mimePrefix + '%')
  }
  if (filters?.source) {
    where.push('f.source = ?')
    params.push(filters.source)
  }
  let sql = 'SELECT f.* FROM files_metadata f'
  if (filters?.folderId) {
    sql += ' JOIN folder_files ff ON ff.file_id = f.id AND ff.folder_id = ?'
    params.unshift(filters.folderId)
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY f.uploaded_at DESC'
  return (db.prepare(sql).all(...params) as DbFile[]).map(rowToFile)
}

export function getFile(id: string): FileMeta | null {
  const row = db.prepare('SELECT * FROM files_metadata WHERE id = ?').get(id) as DbFile | undefined
  return row ? rowToFile(row) : null
}

export function getFileByDriveId(accountId: string, driveFileId: string): FileMeta | null {
  const row = db
    .prepare('SELECT * FROM files_metadata WHERE account_id = ? AND drive_file_id = ?')
    .get(accountId, driveFileId) as DbFile | undefined
  return row ? rowToFile(row) : null
}

export function findFileByChecksum(checksum: string): FileMeta | null {
  if (!checksum) return null
  const row = db
    .prepare('SELECT * FROM files_metadata WHERE checksum = ? LIMIT 1')
    .get(checksum) as DbFile | undefined
  return row ? rowToFile(row) : null
}

export function createFileMeta(data: {
  driveFileId: string
  accountId: string
  originalFilename: string
  fileSize: number
  mimeType: string
  checksum: string
  source?: 'app' | 'drive'
  modifiedAt?: number
  webViewLink?: string
}): FileMeta {
  const id = uuid()
  const now = Date.now()
  db.prepare(
    `INSERT INTO files_metadata
      (id, drive_file_id, account_id, original_filename, file_size, mime_type, checksum,
       uploaded_at, replicated_on, status, source, modified_at, web_view_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 'synced', ?, ?, ?)`
  ).run(
    id,
    data.driveFileId,
    data.accountId,
    data.originalFilename,
    data.fileSize,
    data.mimeType,
    data.checksum,
    now,
    data.source ?? 'app',
    data.modifiedAt ?? now,
    data.webViewLink ?? null
  )
  return getFile(id)!
}

export function updateFileMeta(
  id: string,
  data: Partial<{
    originalFilename: string
    fileSize: number
    mimeType: string
    checksum: string
    modifiedAt: number
    webViewLink: string
  }>
): void {
  const map: Record<string, string> = {
    originalFilename: 'original_filename',
    fileSize: 'file_size',
    mimeType: 'mime_type',
    checksum: 'checksum',
    modifiedAt: 'modified_at',
    webViewLink: 'web_view_link'
  }
  const fields: string[] = []
  const values: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    const v = (data as Record<string, unknown>)[k]
    if (v !== undefined) {
      fields.push(`${col} = ?`)
      values.push(v)
    }
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE files_metadata SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

/** Ids Drive de tous les fichiers connus pour un compte. */
export function driveIdsForAccount(accountId: string): Set<string> {
  return new Set(
    (
      db
        .prepare('SELECT drive_file_id FROM files_metadata WHERE account_id = ?')
        .all(accountId) as { drive_file_id: string }[]
    ).map((r) => r.drive_file_id)
  )
}

/**
 * Supprime les entrées d'un compte dont le fichier n'existe plus sur Drive.
 * Ne touche pas aux fichiers 'app' non encore confirmés (au cas où la liste
 * Drive serait incomplète juste après un upload).
 */
export function pruneMissingFiles(accountId: string, presentDriveIds: Set<string>): number {
  const rows = db
    .prepare('SELECT id, drive_file_id, source FROM files_metadata WHERE account_id = ?')
    .all(accountId) as { id: string; drive_file_id: string; source: string }[]
  const del = db.prepare('DELETE FROM files_metadata WHERE id = ?')
  let removed = 0
  for (const r of rows) {
    if (!presentDriveIds.has(r.drive_file_id)) {
      del.run(r.id)
      removed++
    }
  }
  return removed
}

export function countFilesBySource(accountId: string): { app: number; drive: number } {
  const rows = db
    .prepare(
      "SELECT source, COUNT(*) AS n FROM files_metadata WHERE account_id = ? GROUP BY source"
    )
    .all(accountId) as { source: string; n: number }[]
  const out = { app: 0, drive: 0 }
  for (const r of rows) {
    if (r.source === 'drive') out.drive = r.n
    else out.app = r.n
  }
  return out
}

export function setFileReplicatedOn(id: string, accountIds: string[]): void {
  db.prepare('UPDATE files_metadata SET replicated_on = ? WHERE id = ?').run(
    JSON.stringify([...new Set(accountIds)]),
    id
  )
}

export function setFileStatus(id: string, status: FileMeta['status']): void {
  db.prepare('UPDATE files_metadata SET status = ? WHERE id = ?').run(status, id)
}

export function deleteFileMeta(id: string): void {
  db.prepare('DELETE FROM files_metadata WHERE id = ?').run(id)
}

// ─── Virtual folders ───────────────────────────────────────────────────────

interface DbFolder {
  id: string
  name: string
  emoji: string
  color: string
  created_at: number
}

function rowToFolder(row: DbFolder): VirtualFolder {
  const fileCount = (
    db.prepare('SELECT COUNT(*) AS n FROM folder_files WHERE folder_id = ?').get(row.id) as {
      n: number
    }
  ).n
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    createdAt: row.created_at,
    fileCount
  }
}

export function getFolders(): VirtualFolder[] {
  return (
    db.prepare('SELECT * FROM virtual_folders ORDER BY created_at ASC').all() as DbFolder[]
  ).map(rowToFolder)
}

export function createFolder(data: { name: string; emoji: string; color: string }): VirtualFolder {
  const id = uuid()
  const now = Date.now()
  db.prepare(
    'INSERT INTO virtual_folders (id, name, emoji, color, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, data.name, data.emoji, data.color, now)
  return rowToFolder(
    db.prepare('SELECT * FROM virtual_folders WHERE id = ?').get(id) as DbFolder
  )
}

export function updateFolder(
  id: string,
  data: Partial<{ name: string; emoji: string; color: string }>
): void {
  const fields: string[] = []
  const values: unknown[] = []
  for (const key of ['name', 'emoji', 'color'] as const) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(data[key])
    }
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE virtual_folders SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteFolder(id: string): void {
  db.prepare('DELETE FROM virtual_folders WHERE id = ?').run(id)
}

export function addFileToFolder(folderId: string, fileId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO folder_files (folder_id, file_id) VALUES (?, ?)'
  ).run(folderId, fileId)
}

export function removeFileFromFolder(folderId: string, fileId: string): void {
  db.prepare('DELETE FROM folder_files WHERE folder_id = ? AND file_id = ?').run(folderId, fileId)
}

// ─── Backup jobs ───────────────────────────────────────────────────────────

interface DbJob {
  id: string
  source_account_id: string
  target_account_id: string
  mode: string
  status: string
  files_count: number
  files_done: number
  bytes_total: number
  started_at: number
  completed_at: number | null
  error_message: string | null
}

function rowToJob(row: DbJob): BackupJob {
  return {
    id: row.id,
    sourceAccountId: row.source_account_id,
    targetAccountId: row.target_account_id,
    mode: row.mode as BackupMode,
    status: row.status as BackupStatus,
    filesCount: row.files_count,
    filesDone: row.files_done,
    bytesTotal: row.bytes_total,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message
  }
}

export function createBackupJob(data: {
  sourceAccountId: string
  targetAccountId: string
  mode: BackupMode
}): BackupJob {
  const id = uuid()
  const now = Date.now()
  db.prepare(
    `INSERT INTO backup_jobs
      (id, source_account_id, target_account_id, mode, status, files_count, files_done, bytes_total, started_at)
     VALUES (?, ?, ?, ?, 'in_progress', 0, 0, 0, ?)`
  ).run(id, data.sourceAccountId, data.targetAccountId, data.mode, now)
  return rowToJob(db.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id) as DbJob)
}

export function updateBackupJob(
  id: string,
  data: Partial<{
    status: BackupStatus
    filesCount: number
    filesDone: number
    bytesTotal: number
    completedAt: number
    errorMessage: string | null
  }>
): void {
  const map: Record<string, string> = {
    status: 'status',
    filesCount: 'files_count',
    filesDone: 'files_done',
    bytesTotal: 'bytes_total',
    completedAt: 'completed_at',
    errorMessage: 'error_message'
  }
  const fields: string[] = []
  const values: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    const v = (data as Record<string, unknown>)[k]
    if (v !== undefined) {
      fields.push(`${col} = ?`)
      values.push(v)
    }
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE backup_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function getBackupJobs(limit = 100): BackupJob[] {
  return (
    db.prepare('SELECT * FROM backup_jobs ORDER BY started_at DESC LIMIT ?').all(limit) as DbJob[]
  ).map(rowToJob)
}

export function getBackupJob(id: string): BackupJob | null {
  const row = db.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id) as DbJob | undefined
  return row ? rowToJob(row) : null
}

export function getLastCompletedJob(
  sourceAccountId: string,
  targetAccountId: string
): BackupJob | null {
  const row = db
    .prepare(
      `SELECT * FROM backup_jobs
       WHERE source_account_id = ? AND target_account_id = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`
    )
    .get(sourceAccountId, targetAccountId) as DbJob | undefined
  return row ? rowToJob(row) : null
}

// ─── Sync logs ─────────────────────────────────────────────────────────────

interface DbLog {
  id: string
  action: string
  account_id: string | null
  file_id: string | null
  status: string
  error_details: string | null
  label: string | null
  timestamp: number
}

function rowToLog(row: DbLog): SyncLog {
  return {
    id: row.id,
    action: row.action as LogAction,
    accountId: row.account_id,
    fileId: row.file_id,
    status: row.status as LogStatus,
    errorDetails: row.error_details,
    label: row.label ?? undefined,
    timestamp: row.timestamp
  }
}

export function addLog(data: {
  action: LogAction
  accountId?: string | null
  fileId?: string | null
  status: LogStatus
  errorDetails?: string | null
  label?: string | null
}): void {
  db.prepare(
    `INSERT INTO sync_logs (id, action, account_id, file_id, status, error_details, label, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(),
    data.action,
    data.accountId ?? null,
    data.fileId ?? null,
    data.status,
    data.errorDetails ?? null,
    data.label ?? null,
    Date.now()
  )
}

export function getLogs(filters?: {
  action?: LogAction
  accountId?: string
  status?: LogStatus
  limit?: number
}): SyncLog[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filters?.action) {
    where.push('action = ?')
    params.push(filters.action)
  }
  if (filters?.accountId) {
    where.push('account_id = ?')
    params.push(filters.accountId)
  }
  if (filters?.status) {
    where.push('status = ?')
    params.push(filters.status)
  }
  let sql = 'SELECT * FROM sync_logs'
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(filters?.limit ?? 300)
  return (db.prepare(sql).all(...params) as DbLog[]).map(rowToLog)
}

export function clearOldLogs(beforeTs: number): number {
  const info = db.prepare('DELETE FROM sync_logs WHERE timestamp < ?').run(beforeTs)
  return info.changes
}

// ─── Backup schedules ──────────────────────────────────────────────────────

interface DbSchedule {
  id: string
  source_account_id: string
  target_account_id: string
  frequency: string
  time: string
  mode: string
  enabled: number
  next_run: number
  last_run: number | null
}

function rowToSchedule(row: DbSchedule): BackupSchedule {
  return {
    id: row.id,
    sourceAccountId: row.source_account_id,
    targetAccountId: row.target_account_id,
    frequency: row.frequency as ScheduleFrequency,
    time: row.time,
    mode: row.mode as BackupMode,
    enabled: !!row.enabled,
    nextRun: row.next_run,
    lastRun: row.last_run
  }
}

export function computeNextRun(frequency: ScheduleFrequency, time: string, from = new Date()): number {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10))
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(h || 0, m || 0, 0, 0)
  if (next <= from) {
    if (frequency === 'daily') next.setDate(next.getDate() + 1)
    else if (frequency === 'weekly') next.setDate(next.getDate() + 7)
    else next.setMonth(next.getMonth() + 1)
  }
  return next.getTime()
}

export function getSchedules(): BackupSchedule[] {
  return (
    db.prepare('SELECT * FROM backup_schedules ORDER BY next_run ASC').all() as DbSchedule[]
  ).map(rowToSchedule)
}

export function getDueSchedules(now = Date.now()): BackupSchedule[] {
  return (
    db
      .prepare('SELECT * FROM backup_schedules WHERE enabled = 1 AND next_run <= ?')
      .all(now) as DbSchedule[]
  ).map(rowToSchedule)
}

export function createSchedule(data: {
  sourceAccountId: string
  targetAccountId: string
  frequency: ScheduleFrequency
  time: string
  mode: BackupMode
}): BackupSchedule {
  const id = uuid()
  db.prepare(
    `INSERT INTO backup_schedules
      (id, source_account_id, target_account_id, frequency, time, mode, enabled, next_run, last_run)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL)`
  ).run(
    id,
    data.sourceAccountId,
    data.targetAccountId,
    data.frequency,
    data.time,
    data.mode,
    computeNextRun(data.frequency, data.time)
  )
  return rowToSchedule(
    db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(id) as DbSchedule
  )
}

export function updateSchedule(
  id: string,
  data: Partial<{
    frequency: ScheduleFrequency
    time: string
    mode: BackupMode
    enabled: boolean
    nextRun: number
    lastRun: number
  }>
): void {
  const map: Record<string, string> = {
    frequency: 'frequency',
    time: 'time',
    mode: 'mode',
    enabled: 'enabled',
    nextRun: 'next_run',
    lastRun: 'last_run'
  }
  const fields: string[] = []
  const values: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    let v = (data as Record<string, unknown>)[k]
    if (v === undefined) continue
    if (k === 'enabled') v = v ? 1 : 0
    fields.push(`${col} = ?`)
    values.push(v)
  }
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE backup_schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteSchedule(id: string): void {
  db.prepare('DELETE FROM backup_schedules WHERE id = ?').run(id)
}

// ─── Shared links ──────────────────────────────────────────────────────────

interface DbShare {
  id: string
  file_id: string
  drive_permission_id: string
  url: string
  role: string
  created_at: number
  expires_at: number
}

function rowToShare(row: DbShare): SharedLink {
  return {
    id: row.id,
    fileId: row.file_id,
    drivePermissionId: row.drive_permission_id,
    url: row.url,
    role: row.role as ShareRole,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }
}

export function getSharedLinks(): SharedLink[] {
  return (
    db.prepare('SELECT * FROM shared_links ORDER BY created_at DESC').all() as DbShare[]
  ).map(rowToShare)
}

export function getSharedLinkForFile(fileId: string): SharedLink | null {
  const row = db
    .prepare('SELECT * FROM shared_links WHERE file_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(fileId) as DbShare | undefined
  return row ? rowToShare(row) : null
}

/** Liens dont l'échéance est dépassée : à révoquer côté Drive puis supprimer. */
export function getExpiredSharedLinks(now = Date.now()): SharedLink[] {
  return (
    db
      .prepare('SELECT * FROM shared_links WHERE expires_at > 0 AND expires_at <= ?')
      .all(now) as DbShare[]
  ).map(rowToShare)
}

export function createSharedLink(data: {
  fileId: string
  drivePermissionId: string
  url: string
  role: ShareRole
  expiresAt: number
}): SharedLink {
  const id = uuid()
  db.prepare(
    `INSERT INTO shared_links (id, file_id, drive_permission_id, url, role, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.fileId, data.drivePermissionId, data.url, data.role, Date.now(), data.expiresAt)
  return rowToShare(db.prepare('SELECT * FROM shared_links WHERE id = ?').get(id) as DbShare)
}

export function deleteSharedLink(id: string): void {
  db.prepare('DELETE FROM shared_links WHERE id = ?').run(id)
}
