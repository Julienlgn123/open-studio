import { createReadStream, createWriteStream, statSync } from 'fs'
import { basename } from 'path'
import { pipeline } from 'stream/promises'
import { google, type drive_v3 } from 'googleapis'
import { getAuthedClient } from './oauth'
import { HashingCounterStream } from '../checksum'
import { withRetry } from './retry'
import type { DriveRevision, ShareRole } from '@shared/types'

async function driveFor(accountId: string): Promise<drive_v3.Drive> {
  const auth = await getAuthedClient(accountId)
  return google.drive({ version: 'v3', auth })
}

export interface DriveQuota {
  total: number
  used: number
  email: string
}

export async function getQuota(accountId: string): Promise<DriveQuota> {
  const drive = await driveFor(accountId)
  const res = await withRetry(() => drive.about.get({ fields: 'storageQuota,user' }))
  const q = res.data.storageQuota || {}
  // "limit" absent = stockage illimité (Workspace) — on retombe sur une valeur large.
  const total = q.limit ? Number(q.limit) : 5_000_000_000_000
  const used = q.usage ? Number(q.usage) : 0
  return { total, used, email: res.data.user?.emailAddress || '' }
}

export interface RemoteFile {
  id: string
  name: string
  size: number
  mimeType: string
  md5Checksum?: string
  modifiedTime: string
  webViewLink?: string
}

export async function listFiles(
  accountId: string,
  opts: { onPage?: (count: number) => void } = {}
): Promise<RemoteFile[]> {
  const drive = await driveFor(accountId)
  const out: RemoteFile[] = []
  let pageToken: string | undefined
  do {
    const res = await withRetry(() =>
      drive.files.list({
        // 'me' in owners : sans ça, le corpus par défaut de l'API ('user')
        // inclut aussi "Partagé avec moi" — des fichiers qu'on peut lister
        // mais jamais supprimer (on n'en est pas propriétaire), d'où des
        // échecs 403 systématiques au moment de la suppression.
        q: "trashed = false and mimeType != 'application/vnd.google-apps.folder' and 'me' in owners",
        spaces: 'drive',
        fields:
          'nextPageToken, files(id, name, size, mimeType, md5Checksum, modifiedTime, webViewLink)',
        pageSize: 1000,
        pageToken
      })
    )
    for (const f of res.data.files || []) {
      out.push({
        id: f.id!,
        name: f.name || 'sans-nom',
        size: f.size ? Number(f.size) : 0,
        mimeType: f.mimeType || 'application/octet-stream',
        md5Checksum: f.md5Checksum || undefined,
        modifiedTime: f.modifiedTime || new Date().toISOString(),
        webViewLink: f.webViewLink || undefined
      })
    }
    opts.onPage?.(out.length)
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)
  return out
}

export interface UploadResult {
  driveFileId: string
  checksum: string
  size: number
  mimeType: string
  name: string
}

/**
 * Upload d'un fichier local vers Drive avec suivi de progression et calcul SHA-256.
 * onProgress reçoit (octets envoyés, octets totaux).
 */
export async function uploadFile(
  accountId: string,
  localPath: string,
  opts: { name?: string; mimeType?: string; onProgress?: (done: number, total: number) => void } = {}
): Promise<UploadResult> {
  const drive = await driveFor(accountId)
  const total = statSync(localPath).size
  const name = opts.name || basename(localPath)
  const mimeType = opts.mimeType || 'application/octet-stream'

  const counter = new HashingCounterStream((bytes) => opts.onProgress?.(bytes, total))
  const source = createReadStream(localPath)
  source.pipe(counter)

  const res = await drive.files.create({
    requestBody: { name },
    media: { mimeType, body: counter },
    fields: 'id, size, mimeType, name, md5Checksum'
  })

  return {
    driveFileId: res.data.id!,
    checksum: res.data.md5Checksum || counter.getHash(),
    size: res.data.size ? Number(res.data.size) : total,
    mimeType: res.data.mimeType || mimeType,
    name: res.data.name || name
  }
}

/**
 * Télécharge un fichier Drive vers un chemin local, avec progression et SHA-256.
 * Renvoie le hash calculé sur le flux reçu.
 */
export async function downloadFile(
  accountId: string,
  driveFileId: string,
  destPath: string,
  opts: { onProgress?: (done: number, total: number) => void; sizeHint?: number } = {}
): Promise<{ checksum: string; size: number }> {
  const drive = await driveFor(accountId)

  let total = opts.sizeHint || 0
  if (!total) {
    const meta = await withRetry(() => drive.files.get({ fileId: driveFileId, fields: 'size' }))
    total = meta.data.size ? Number(meta.data.size) : 0
  }

  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'stream' }
  )

  const hasher = new HashingCounterStream((bytes) => opts.onProgress?.(bytes, total))
  await pipeline(res.data as NodeJS.ReadableStream, hasher, createWriteStream(destPath))

  return { checksum: hasher.getHash(), size: hasher.byteCount }
}

export async function deleteFile(accountId: string, driveFileId: string): Promise<void> {
  const drive = await driveFor(accountId)
  await withRetry(() => drive.files.delete({ fileId: driveFileId }))
}

const ROLE_MAP: Record<ShareRole, string> = {
  reader: 'reader',
  commenter: 'commenter',
  writer: 'writer'
}

export async function shareFile(
  accountId: string,
  driveFileId: string,
  role: ShareRole,
  expirationTime?: string
): Promise<{ permissionId: string; url: string }> {
  const drive = await driveFor(accountId)
  const requestBody: drive_v3.Schema$Permission = { type: 'anyone', role: ROLE_MAP[role] }

  let perm
  try {
    perm = await withRetry(() =>
      drive.permissions.create({
        fileId: driveFileId,
        requestBody: expirationTime ? { ...requestBody, expirationTime } : requestBody,
        fields: 'id'
      })
    )
  } catch (err) {
    // Certains comptes/rôles refusent expirationTime côté API (ex. compte grand public
    // sur un rôle "writer") : on retente sans, la révocation applicative prend le relais.
    if (!expirationTime) throw err
    perm = await withRetry(() =>
      drive.permissions.create({ fileId: driveFileId, requestBody, fields: 'id' })
    )
  }

  const meta = await withRetry(() => drive.files.get({ fileId: driveFileId, fields: 'webViewLink' }))
  return {
    permissionId: perm.data.id!,
    url: meta.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`
  }
}

export async function unshareFile(
  accountId: string,
  driveFileId: string,
  permissionId: string
): Promise<void> {
  const drive = await driveFor(accountId)
  await withRetry(() => drive.permissions.delete({ fileId: driveFileId, permissionId }))
}

export async function listRevisions(
  accountId: string,
  driveFileId: string
): Promise<DriveRevision[]> {
  const drive = await driveFor(accountId)
  const res = await withRetry(() =>
    drive.revisions.list({
      fileId: driveFileId,
      fields: 'revisions(id, modifiedTime, size, keepForever, lastModifyingUser/displayName)'
    })
  )
  return (res.data.revisions || []).map((r) => ({
    id: r.id!,
    modifiedTime: r.modifiedTime || '',
    size: r.size ? Number(r.size) : 0,
    keepForever: !!r.keepForever,
    lastModifyingUser: r.lastModifyingUser?.displayName || undefined
  }))
}

export async function downloadRevision(
  accountId: string,
  driveFileId: string,
  revisionId: string,
  destPath: string
): Promise<void> {
  const drive = await driveFor(accountId)
  const res = await drive.revisions.get(
    { fileId: driveFileId, revisionId, alt: 'media' },
    { responseType: 'stream' }
  )
  await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(destPath))
}
