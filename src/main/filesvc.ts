import { dialog, BrowserWindow, shell } from 'electron'
import { basename, join } from 'path'
import { statSync } from 'fs'
import { v4 as uuid } from 'uuid'
import { lookup as mimeLookup } from './mime'
import {
  addLog,
  createFileMeta,
  deleteFileMeta,
  findFileByChecksum,
  getAccount,
  getFile,
  getSharedLinkForFile,
  getExpiredSharedLinks,
  createSharedLink,
  deleteSharedLink
} from './db'
import { sha256File } from './checksum'
import {
  deleteFile as driveDelete,
  downloadFile,
  shareFile as driveShareFile,
  unshareFile,
  uploadFile
} from './google/drive'
import { pickBestPrimary } from './distribution'
import { syncAccountQuota } from './google/accounts'
import { emitTransfer } from './events'
import { mapDriveError } from './google/errors'
import type { FileMeta, ShareRole } from '@shared/types'

/** Upload d'un fichier local : choisit le meilleur compte principal puis envoie. */
export async function uploadLocalFile(localPath: string): Promise<FileMeta> {
  const size = statSync(localPath).size
  const name = basename(localPath)
  const mimeType = mimeLookup(name)

  // Dédoublonnage : même SHA-256 déjà connu → on ne réenvoie pas.
  const checksum = await sha256File(localPath)
  const dup = findFileByChecksum(checksum)
  if (dup) {
    addLog({
      action: 'upload',
      accountId: dup.accountId,
      fileId: dup.id,
      status: 'success',
      label: `${name} (déjà présent, ignoré)`
    })
    return dup
  }

  const account = pickBestPrimary(size)
  const transferId = uuid()
  const startedAt = Date.now()

  emitTransfer({
    id: transferId,
    kind: 'upload',
    filename: name,
    bytesDone: 0,
    bytesTotal: size,
    speed: 0,
    status: 'active'
  })

  try {
    const res = await uploadFile(account.id, localPath, {
      name,
      mimeType,
      onProgress: (done, total) => {
        const elapsed = (Date.now() - startedAt) / 1000
        emitTransfer({
          id: transferId,
          kind: 'upload',
          filename: name,
          bytesDone: done,
          bytesTotal: total,
          speed: elapsed > 0 ? done / elapsed : 0,
          status: 'active'
        })
      }
    })

    const meta = createFileMeta({
      driveFileId: res.driveFileId,
      accountId: account.id,
      originalFilename: name,
      fileSize: res.size,
      mimeType: res.mimeType,
      checksum: checksum // on garde notre SHA-256 (comparable ensuite)
    })

    emitTransfer({
      id: transferId,
      kind: 'upload',
      filename: name,
      bytesDone: size,
      bytesTotal: size,
      speed: 0,
      status: 'done'
    })

    addLog({
      action: 'upload',
      accountId: account.id,
      fileId: meta.id,
      status: 'success',
      label: `${name} → ${account.email}`
    })

    await syncAccountQuota(account.id).catch(() => null)
    return meta
  } catch (err) {
    const msg = mapDriveError(err)
    emitTransfer({
      id: transferId,
      kind: 'upload',
      filename: name,
      bytesDone: 0,
      bytesTotal: size,
      speed: 0,
      status: 'error',
      error: msg
    })
    addLog({
      action: 'upload',
      accountId: account.id,
      status: 'failed',
      label: name,
      errorDetails: msg
    })
    throw new Error(msg)
  }
}

/** Télécharge un fichier vers un dossier choisi par l'utilisateur, avec vérif checksum. */
export async function downloadToDisk(
  fileId: string,
  destDir?: string
): Promise<{ path: string; verified: boolean } | null> {
  const file = getFile(fileId)
  if (!file) throw new Error('Fichier introuvable')

  let dir = destDir
  if (!dir) {
    const win = BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir le dossier de destination',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    dir = res.filePaths[0]
  }

  const destPath = join(dir, file.originalFilename)
  const transferId = uuid()
  const startedAt = Date.now()

  emitTransfer({
    id: transferId,
    kind: 'download',
    filename: file.originalFilename,
    bytesDone: 0,
    bytesTotal: file.fileSize,
    speed: 0,
    status: 'active'
  })

  try {
    const dl = await downloadFile(file.accountId, file.driveFileId, destPath, {
      sizeHint: file.fileSize,
      onProgress: (done, total) => {
        const elapsed = (Date.now() - startedAt) / 1000
        emitTransfer({
          id: transferId,
          kind: 'download',
          filename: file.originalFilename,
          bytesDone: done,
          bytesTotal: total,
          speed: elapsed > 0 ? done / elapsed : 0,
          status: 'active'
        })
      }
    })

    let verified = false
    if (file.checksum && file.checksum.length === 64) {
      const local = await sha256File(destPath)
      verified = local === dl.checksum && local === file.checksum
    }

    emitTransfer({
      id: transferId,
      kind: 'download',
      filename: file.originalFilename,
      bytesDone: file.fileSize,
      bytesTotal: file.fileSize,
      speed: 0,
      status: 'done'
    })

    addLog({
      action: 'download',
      accountId: file.accountId,
      fileId: file.id,
      status: 'success',
      label: file.originalFilename + (verified ? ' (checksum ✓)' : '')
    })

    shell.showItemInFolder(destPath)
    return { path: destPath, verified }
  } catch (err) {
    const msg = mapDriveError(err)
    emitTransfer({
      id: transferId,
      kind: 'download',
      filename: file.originalFilename,
      bytesDone: 0,
      bytesTotal: file.fileSize,
      speed: 0,
      status: 'error',
      error: msg
    })
    addLog({
      action: 'download',
      accountId: file.accountId,
      fileId: file.id,
      status: 'failed',
      label: file.originalFilename,
      errorDetails: msg
    })
    throw new Error(msg)
  }
}

export async function deleteFileEverywhere(fileId: string): Promise<void> {
  const file = getFile(fileId)
  if (!file) return
  const account = getAccount(file.accountId)
  try {
    await driveDelete(file.accountId, file.driveFileId)
  } catch (err) {
    const msg = mapDriveError(err)
    addLog({
      action: 'delete',
      accountId: file.accountId,
      fileId: file.id,
      status: 'failed',
      label: file.originalFilename,
      errorDetails: msg
    })
    throw new Error(msg)
  }
  deleteFileMeta(fileId)
  addLog({
    action: 'delete',
    accountId: file.accountId,
    status: 'success',
    label: `${file.originalFilename}${account ? ' @ ' + account.email : ''}`
  })
  await syncAccountQuota(file.accountId).catch(() => null)
}

/** Durée de vie fixe des liens de partage temporaires. */
export const SHARE_TTL_MS = 60 * 60 * 1000

export async function shareFileLink(
  fileId: string,
  role: ShareRole
): Promise<{ url: string; expiresAt: number }> {
  const file = getFile(fileId)
  if (!file) throw new Error('Fichier introuvable')
  const existing = getSharedLinkForFile(fileId)
  if (existing && existing.expiresAt > Date.now()) {
    return { url: existing.url, expiresAt: existing.expiresAt }
  }
  // Lien précédent périmé mais pas encore nettoyé : on le révoque avant d'en recréer un.
  if (existing) await revokeShare(fileId)

  const expiresAt = Date.now() + SHARE_TTL_MS
  let permissionId: string
  let url: string
  try {
    ;({ permissionId, url } = await driveShareFile(
      file.accountId,
      file.driveFileId,
      role,
      new Date(expiresAt).toISOString()
    ))
  } catch (err) {
    const msg = mapDriveError(err)
    addLog({
      action: 'share',
      accountId: file.accountId,
      fileId,
      status: 'failed',
      label: file.originalFilename,
      errorDetails: msg
    })
    throw new Error(msg)
  }
  createSharedLink({ fileId, drivePermissionId: permissionId, url, role, expiresAt })
  addLog({
    action: 'share',
    accountId: file.accountId,
    fileId,
    status: 'success',
    label: `${file.originalFilename} (${role}, expire dans 1h)`
  })
  return { url, expiresAt }
}

export async function revokeShare(fileId: string): Promise<void> {
  const file = getFile(fileId)
  const link = getSharedLinkForFile(fileId)
  if (!file || !link) return
  await unshareFile(file.accountId, file.driveFileId, link.drivePermissionId).catch(() => null)
  deleteSharedLink(link.id)
  addLog({
    action: 'unshare',
    accountId: file.accountId,
    fileId,
    status: 'success',
    label: file.originalFilename
  })
}

/** Révoque tous les liens de partage dont l'échéance de 1h est dépassée. */
export async function revokeExpiredShares(): Promise<void> {
  for (const link of getExpiredSharedLinks()) {
    await revokeShare(link.fileId).catch(() => null)
  }
}
