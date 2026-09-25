import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import { v4 as uuid } from 'uuid'
import {
  addLog,
  createBackupJob,
  getAccount,
  getFile,
  getFiles,
  getLastCompletedJob,
  setFileReplicatedOn,
  updateBackupJob
} from './db'
import { downloadFile, uploadFile } from './google/drive'
import { syncAccountQuota } from './google/accounts'
import { emitBackup } from './events'
import type { BackupMode, BackupProgress, FileMeta } from '@shared/types'

let activeRun = false

export function isBackupRunning(): boolean {
  return activeRun
}

function tmpDir(): string {
  const dir = join(app.getPath('userData'), 'backup-tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

interface RunConfig {
  sourceAccountIds: string[]
  targetAccountIds: string[]
  mode: BackupMode
  verify: boolean
}

interface RunReport {
  jobIds: string[]
  copied: number
  skipped: number
  failed: number
  errors: { file: string; reason: string }[]
  durationMs: number
}

/**
 * Réplique les fichiers des comptes source vers les comptes cible.
 * full        : tous les fichiers des sources
 * incremental : uniquement ceux ajoutés depuis le dernier backup réussi (par paire source→cible)
 *
 * Le transfert transite par le disque local (téléchargement puis ré-upload) :
 * Google Drive ne permet pas de copie serveur-à-serveur entre comptes distincts.
 */
export async function runBackup(config: RunConfig): Promise<RunReport> {
  if (activeRun) throw new Error('Un backup est déjà en cours.')
  activeRun = true
  const startedAt = Date.now()
  const report: RunReport = {
    jobIds: [],
    copied: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0
  }

  try {
    for (const targetId of config.targetAccountIds) {
      for (const sourceId of config.sourceAccountIds) {
        if (sourceId === targetId) continue
        await runPair(sourceId, targetId, config, report)
      }
    }
  } finally {
    activeRun = false
    report.durationMs = Date.now() - startedAt
    try {
      rmSync(tmpDir(), { recursive: true, force: true })
    } catch {
      /* ok */
    }
    // Rafraîchit les quotas touchés.
    for (const id of [...config.sourceAccountIds, ...config.targetAccountIds]) {
      await syncAccountQuota(id).catch(() => null)
    }
  }

  return report
}

async function runPair(
  sourceId: string,
  targetId: string,
  config: RunConfig,
  report: RunReport
): Promise<void> {
  const source = getAccount(sourceId)
  const target = getAccount(targetId)
  if (!source || !target) return

  const job = createBackupJob({ sourceAccountId: sourceId, targetAccountId: targetId, mode: config.mode })
  report.jobIds.push(job.id)

  let files = getFiles({ accountId: sourceId })
  if (config.mode === 'incremental') {
    const last = getLastCompletedJob(sourceId, targetId)
    const since = last?.completedAt ?? 0
    files = files.filter((f) => f.uploadedAt > since)
  }
  // Ne pas recopier ce qui est déjà répliqué sur cette cible.
  const pending = files.filter((f) => !f.replicatedOn.includes(targetId))

  const bytesTotal = pending.reduce((s, f) => s + f.fileSize, 0)
  updateBackupJob(job.id, { filesCount: pending.length, bytesTotal })

  const progress: BackupProgress = {
    jobId: job.id,
    sourceAccountId: sourceId,
    targetAccountId: targetId,
    filesDone: 0,
    filesTotal: pending.length,
    bytesDone: 0,
    bytesTotal,
    currentFile: '',
    status: 'in_progress',
    errors: []
  }
  emitBackup(progress)

  let bytesBase = 0

  for (const file of pending) {
    progress.currentFile = file.originalFilename
    emitBackup(progress)

    try {
      await replicateOne(file, sourceId, targetId, config.verify, (done) => {
        progress.bytesDone = bytesBase + done
        emitBackup(progress)
      })
      report.copied++
      progress.filesDone++
      bytesBase += file.fileSize
      progress.bytesDone = bytesBase
      addLog({
        action: 'replicate',
        accountId: targetId,
        fileId: file.id,
        status: 'success',
        label: `${file.originalFilename} → ${target.email}`
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      report.failed++
      report.errors.push({ file: file.originalFilename, reason })
      progress.errors.push({ file: file.originalFilename, reason })
      addLog({
        action: 'replicate',
        accountId: targetId,
        fileId: file.id,
        status: 'failed',
        label: `${file.originalFilename} → ${target.email}`,
        errorDetails: reason
      })
    }
    updateBackupJob(job.id, { filesDone: progress.filesDone })
    emitBackup(progress)
  }

  const failed = progress.errors.length > 0
  updateBackupJob(job.id, {
    status: failed ? 'failed' : 'completed',
    completedAt: Date.now(),
    errorMessage: failed ? `${progress.errors.length} erreur(s)` : null
  })
  progress.status = failed ? 'failed' : 'completed'
  emitBackup(progress)

  addLog({
    action: 'backup',
    accountId: targetId,
    status: failed ? 'failed' : 'success',
    label: `${source.email} → ${target.email} (${progress.filesDone}/${pending.length})`
  })
}

async function replicateOne(
  file: FileMeta,
  sourceId: string,
  targetId: string,
  verify: boolean,
  onProgress: (bytesDone: number) => void
): Promise<void> {
  const dir = tmpDir()
  const localPath = join(dir, uuid() + '-' + file.originalFilename.replace(/[/\\]/g, '_'))

  try {
    const dl = await downloadFile(sourceId, file.driveFileId, localPath, {
      sizeHint: file.fileSize,
      onProgress: (done) => onProgress(done / 2)
    })

    if (verify && file.checksum && dl.checksum && file.checksum.length === 64) {
      // On ne compare que si le checksum stocké est un SHA-256 (upload via l'app).
      if (dl.checksum !== file.checksum) {
        throw new Error('Checksum du téléchargement différent de la source')
      }
    }

    const up = await uploadFile(targetId, localPath, {
      name: file.originalFilename,
      mimeType: file.mimeType,
      onProgress: (done, total) => onProgress(total / 2 + done / 2)
    })

    if (verify && dl.checksum && up.checksum && up.checksum.length === 64) {
      if (up.checksum !== dl.checksum) {
        throw new Error("Checksum de l'upload différent après copie")
      }
    }

    // Marque le fichier comme répliqué sur la cible.
    const fresh = getFile(file.id)
    setFileReplicatedOn(file.id, [...(fresh?.replicatedOn ?? []), targetId])
  } finally {
    try {
      rmSync(localPath, { force: true })
    } catch {
      /* ok */
    }
  }
}

/** Utilisé par le scheduler : un seul couple source→cible. */
export async function runScheduledBackup(
  sourceAccountId: string,
  targetAccountId: string,
  mode: BackupMode
): Promise<RunReport> {
  return runBackup({
    sourceAccountIds: [sourceAccountId],
    targetAccountIds: [targetAccountId],
    mode,
    verify: true
  })
}
