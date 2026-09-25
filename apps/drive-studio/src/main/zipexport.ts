import { app, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync, rmSync, createReadStream, createWriteStream, statSync } from 'fs'
import { v4 as uuid } from 'uuid'
import JSZip from 'jszip'
import { addLog, getFile } from './db'
import { downloadFile } from './google/drive'
import { emitTransfer } from './events'
import { sha256File } from './checksum'

function tmpDir(): string {
  const dir = join(app.getPath('userData'), 'export-tmp', uuid())
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Exporte plusieurs fichiers : soit dans un dossier, soit dans une archive ZIP.
 * Vérifie le SHA-256 après téléchargement quand l'app connaît un hash de référence.
 */
export async function exportFiles(
  fileIds: string[],
  opts: { zip: boolean }
): Promise<{ path: string; count: number; verified: number; failed: number } | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const files = fileIds.map(getFile).filter((f): f is NonNullable<typeof f> => !!f)
  if (files.length === 0) return null

  let destPath: string
  if (opts.zip) {
    const res = await dialog.showSaveDialog(win, {
      title: 'Exporter en ZIP',
      defaultPath: `export-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'Archive ZIP', extensions: ['zip'] }]
    })
    if (res.canceled || !res.filePath) return null
    destPath = res.filePath
  } else {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir le dossier de destination',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    destPath = res.filePaths[0]
  }

  const staging = tmpDir()
  const transferId = uuid()
  const bytesTotal = files.reduce((s, f) => s + f.fileSize, 0)
  let bytesBase = 0
  let verified = 0
  let failed = 0

  emitTransfer({
    id: transferId,
    kind: 'download',
    filename: `Export (${files.length} fichiers)`,
    bytesDone: 0,
    bytesTotal,
    speed: 0,
    status: 'active'
  })

  try {
    const zip = opts.zip ? new JSZip() : null
    const usedNames = new Set<string>()

    for (const file of files) {
      let name = file.originalFilename
      let n = 1
      while (usedNames.has(name)) {
        const dot = file.originalFilename.lastIndexOf('.')
        name =
          dot > 0
            ? `${file.originalFilename.slice(0, dot)} (${n})${file.originalFilename.slice(dot)}`
            : `${file.originalFilename} (${n})`
        n++
      }
      usedNames.add(name)

      const localPath = join(opts.zip ? staging : destPath, name)
      const dl = await downloadFile(file.accountId, file.driveFileId, localPath, {
        sizeHint: file.fileSize,
        onProgress: (done) => {
          emitTransfer({
            id: transferId,
            kind: 'download',
            filename: name,
            bytesDone: bytesBase + done,
            bytesTotal,
            speed: 0,
            status: 'active'
          })
        }
      })
      bytesBase += file.fileSize

      // Vérification d'intégrité si on a un SHA-256 de référence.
      if (file.checksum && file.checksum.length === 64) {
        const local = await sha256File(localPath)
        if (local === dl.checksum) verified++
        else {
          failed++
          addLog({
            action: 'download',
            accountId: file.accountId,
            fileId: file.id,
            status: 'failed',
            label: `${name} (checksum invalide à l'export)`
          })
        }
      }

      if (zip) {
        zip.file(name, createReadStream(localPath))
      }
    }

    if (zip) {
      await new Promise<void>((resolve, reject) => {
        zip
          .generateNodeStream({ streamFiles: true, compression: 'DEFLATE' })
          .pipe(createWriteStream(destPath))
          .on('finish', () => resolve())
          .on('error', reject)
      })
    }

    emitTransfer({
      id: transferId,
      kind: 'download',
      filename: `Export terminé (${files.length})`,
      bytesDone: bytesTotal,
      bytesTotal,
      speed: 0,
      status: 'done'
    })

    addLog({
      action: 'download',
      status: failed > 0 ? 'failed' : 'success',
      label: `export ${opts.zip ? 'ZIP' : 'dossier'} : ${files.length} fichier(s)`
    })

    // Taille réelle produite (info).
    let outSize = 0
    try {
      outSize = opts.zip ? statSync(destPath).size : bytesTotal
    } catch {
      /* ok */
    }
    void outSize

    return { path: destPath, count: files.length, verified, failed }
  } catch (err) {
    emitTransfer({
      id: transferId,
      kind: 'download',
      filename: 'Export',
      bytesDone: bytesBase,
      bytesTotal,
      speed: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  } finally {
    try {
      rmSync(staging, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  }
}
