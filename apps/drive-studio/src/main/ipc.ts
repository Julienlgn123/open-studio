import { ipcMain, BrowserWindow, dialog, shell, clipboard } from 'electron'
import * as db from './db'
import {
  getPublicSettings,
  setTheme,
  setGoogleCredentials,
  clearGoogleCredentials,
  getGoogleCredentials
} from './settings'
import {
  addAccount,
  removeAccount,
  reconnectAccount,
  setAccountRole,
  syncAccountQuota,
  syncAllQuotas,
  syncAccountFiles,
  syncAllFiles
} from './google/accounts'
import {
  uploadLocalFile,
  downloadToDisk,
  deleteFileEverywhere,
  shareFileLink,
  revokeShare
} from './filesvc'
import { listRevisions } from './google/drive'
import { runBackup, isBackupRunning } from './backup'
import { exportFiles } from './zipexport'
import { exportData, importData, resetAllData, openBackupsFolder, latestBackupInfo } from './datatransfer'
import { computeNextRun } from './db'
import type {
  AccountRole,
  BackupMode,
  ScheduleFrequency,
  ShareRole,
  DashboardStats,
  RecentActivity
} from '@shared/types'

function getWin(): BrowserWindow {
  return BrowserWindow.getAllWindows()[0]
}

export function registerIpc(): void {
  // ─── Window ──────────────────────────────────────────────────────────────
  ipcMain.handle('window:minimize', () => getWin()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const w = getWin()
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.handle('window:close', () => getWin()?.close())

  // ─── Settings ────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => getPublicSettings())
  ipcMain.handle('settings:setTheme', (_, theme: 'dark' | 'light') => {
    setTheme(theme)
    return getPublicSettings()
  })
  ipcMain.handle(
    'settings:setGoogle',
    (_, { clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
      if (!clientId?.trim() || !clientSecret?.trim()) {
        throw new Error('Client ID et Client Secret requis.')
      }
      setGoogleCredentials(clientId, clientSecret)
      return getPublicSettings()
    }
  )
  ipcMain.handle('settings:clearGoogle', () => {
    clearGoogleCredentials()
    return getPublicSettings()
  })
  ipcMain.handle('settings:hasGoogle', () => !!getGoogleCredentials())

  // ─── Accounts ────────────────────────────────────────────────────────────
  ipcMain.handle('accounts:list', () => db.getAccounts())
  ipcMain.handle('accounts:get', (_, id: string) => db.getAccount(id))
  ipcMain.handle('accounts:add', () => addAccount())
  ipcMain.handle('accounts:remove', (_, id: string) => removeAccount(id))
  ipcMain.handle('accounts:reconnect', (_, id: string) => reconnectAccount(id))
  ipcMain.handle('accounts:setRole', (_, id: string, role: AccountRole) => setAccountRole(id, role))
  // Sync léger : quotas uniquement (un appel about.get par compte).
  ipcMain.handle('accounts:sync', async (_, id: string) => {
    await syncAccountQuota(id)
    await syncAccountFiles(id).catch(() => 0)
    return db.getAccount(id)
  })
  ipcMain.handle('accounts:syncAll', () => syncAllQuotas())
  // Sync lourd : liste complète des fichiers de chaque Drive.
  ipcMain.handle('accounts:syncFiles', (_, id: string) => syncAccountFiles(id))
  ipcMain.handle('accounts:syncAllFiles', () => syncAllFiles())

  // ─── Files ───────────────────────────────────────────────────────────────
  ipcMain.handle('files:list', (_, filters) => db.getFiles(filters))
  ipcMain.handle('files:get', (_, id: string) => db.getFile(id))
  ipcMain.handle('files:pickAndUpload', async () => {
    const res = await dialog.showOpenDialog(getWin(), {
      title: 'Ajouter des fichiers',
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled) return []
    const out = []
    for (const p of res.filePaths) {
      out.push(await uploadLocalFile(p))
    }
    return out
  })
  ipcMain.handle('files:uploadPaths', async (_, paths: string[]) => {
    const out = []
    for (const p of paths) out.push(await uploadLocalFile(p))
    return out
  })
  ipcMain.handle('files:download', (_, id: string) => downloadToDisk(id))
  ipcMain.handle('files:delete', (_, id: string) => deleteFileEverywhere(id))
  ipcMain.handle('files:export', (_, ids: string[], zip: boolean) => exportFiles(ids, { zip }))
  ipcMain.handle('files:revisions', (_, id: string) => {
    const f = db.getFile(id)
    if (!f) throw new Error('Fichier introuvable')
    return listRevisions(f.accountId, f.driveFileId)
  })

  // ─── Sharing ─────────────────────────────────────────────────────────────
  ipcMain.handle('share:create', async (_, id: string, role: ShareRole) => {
    const { url, expiresAt } = await shareFileLink(id, role)
    clipboard.writeText(url)
    return { url, expiresAt }
  })
  ipcMain.handle('share:revoke', (_, id: string) => revokeShare(id))
  ipcMain.handle('share:list', () => db.getSharedLinks())
  ipcMain.handle('share:forFile', (_, id: string) => db.getSharedLinkForFile(id))

  // ─── Folders ─────────────────────────────────────────────────────────────
  ipcMain.handle('folders:list', () => db.getFolders())
  ipcMain.handle('folders:create', (_, data: { name: string; emoji: string; color: string }) =>
    db.createFolder(data)
  )
  ipcMain.handle('folders:update', (_, id: string, data) => {
    db.updateFolder(id, data)
    return true
  })
  ipcMain.handle('folders:delete', (_, id: string) => {
    db.deleteFolder(id)
    return true
  })
  ipcMain.handle('folders:addFile', (_, folderId: string, fileId: string) => {
    db.addFileToFolder(folderId, fileId)
    return true
  })
  ipcMain.handle('folders:removeFile', (_, folderId: string, fileId: string) => {
    db.removeFileFromFolder(folderId, fileId)
    return true
  })

  // ─── Backup ──────────────────────────────────────────────────────────────
  ipcMain.handle(
    'backup:start',
    (
      _,
      config: {
        sourceAccountIds: string[]
        targetAccountIds: string[]
        mode: BackupMode
        verify: boolean
      }
    ) => runBackup(config)
  )
  ipcMain.handle('backup:running', () => isBackupRunning())
  ipcMain.handle('backup:jobs', () => db.getBackupJobs())
  ipcMain.handle('backup:job', (_, id: string) => db.getBackupJob(id))

  // ─── Schedules ───────────────────────────────────────────────────────────
  ipcMain.handle('schedules:list', () => db.getSchedules())
  ipcMain.handle(
    'schedules:create',
    (
      _,
      data: {
        sourceAccountId: string
        targetAccountId: string
        frequency: ScheduleFrequency
        time: string
        mode: BackupMode
      }
    ) => db.createSchedule(data)
  )
  ipcMain.handle('schedules:update', (_, id: string, data) => {
    if (data.frequency || data.time) {
      const sched = db.getSchedules().find((s) => s.id === id)
      if (sched) {
        data.nextRun = computeNextRun(
          data.frequency ?? sched.frequency,
          data.time ?? sched.time
        )
      }
    }
    db.updateSchedule(id, data)
    return true
  })
  ipcMain.handle('schedules:delete', (_, id: string) => {
    db.deleteSchedule(id)
    return true
  })

  // ─── Logs ────────────────────────────────────────────────────────────────
  ipcMain.handle('logs:list', (_, filters) => db.getLogs(filters))
  ipcMain.handle('logs:clearOlderThan', (_, days: number) =>
    db.clearOldLogs(Date.now() - days * 86400_000)
  )

  // ─── Dashboard ───────────────────────────────────────────────────────────
  ipcMain.handle('dashboard:stats', (): DashboardStats => {
    const accounts = db.getAccounts()
    const files = db.getFiles()
    const totalUsed = accounts.reduce((s, a) => s + a.quotaUsed, 0)
    const totalQuota = accounts.reduce((s, a) => s + a.quotaTotal, 0)
    const totalBytes = files.reduce((s, f) => s + f.fileSize, 0)
    return {
      totalQuota,
      totalUsed,
      totalFiles: files.length,
      avgFileSize: files.length ? totalBytes / files.length : 0,
      accountsCount: accounts.length,
      primaryCount: accounts.filter((a) => a.role === 'primary').length,
      backupCount: accounts.filter((a) => a.role === 'backup').length
    }
  })
  ipcMain.handle('dashboard:recent', (): RecentActivity[] =>
    db.getLogs({ limit: 20 }).map((l) => ({
      id: l.id,
      action: l.action,
      label: l.label || l.action,
      status: l.status,
      timestamp: l.timestamp
    }))
  )

  // ─── Sauvegarde / transfert / suppression totale ────────────────────────
  ipcMain.handle('datatransfer:export', (_, passphrase: string) => exportData(getWin(), passphrase))
  ipcMain.handle('datatransfer:import', (_, passphrase: string) => importData(getWin(), passphrase))
  ipcMain.handle('datatransfer:openBackupsFolder', () => {
    openBackupsFolder()
    return true
  })
  ipcMain.handle('datatransfer:latestBackup', () => latestBackupInfo())
  ipcMain.handle('datatransfer:resetAll', () =>
    resetAllData(
      getWin(),
      db.getAccounts().map((a) => a.id)
    )
  )

  // ─── Divers ──────────────────────────────────────────────────────────────
  ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url))
  ipcMain.handle('clipboard:write', (_, text: string) => clipboard.writeText(text))
}
