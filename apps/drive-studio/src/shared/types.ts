// Types partagés entre le process main et le renderer.
// Les tokens OAuth ne transitent JAMAIS jusqu'au renderer : ils restent dans le main.

export type AccountRole = 'primary' | 'backup'
export type AccountStatus = 'active' | 'paused' | 'error'

export interface Account {
  id: string
  email: string
  quotaTotal: number
  quotaUsed: number
  role: AccountRole
  status: AccountStatus
  lastSync: number | null
  createdAt: number
  /** Nombre total de fichiers connus pour ce compte (calculé). */
  filesCount?: number
  /** Dont fichiers déjà présents sur le Drive (non ajoutés via l'app). */
  driveFilesCount?: number
}

export type FileStatus = 'synced' | 'pending' | 'error'

/** Origine d'une entrée : envoyée via l'app ou déjà présente sur le Drive. */
export type FileSource = 'app' | 'drive'

export interface FileMeta {
  id: string
  driveFileId: string
  accountId: string
  originalFilename: string
  fileSize: number
  mimeType: string
  checksum: string
  uploadedAt: number
  /** Ids des comptes (backup) où le fichier est répliqué. */
  replicatedOn: string[]
  status: FileStatus
  source: FileSource
  /** Date de dernière modification côté Drive (ms). */
  modifiedAt: number
  /** Lien de consultation Google Drive. */
  webViewLink?: string
  /** Ids des dossiers virtuels contenant ce fichier (calculé). */
  folderIds?: string[]
}

export type BackupMode = 'full' | 'incremental'
export type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface BackupJob {
  id: string
  sourceAccountId: string
  targetAccountId: string
  mode: BackupMode
  status: BackupStatus
  filesCount: number
  filesDone: number
  bytesTotal: number
  startedAt: number
  completedAt: number | null
  errorMessage: string | null
}

export type LogAction =
  | 'upload'
  | 'download'
  | 'replicate'
  | 'delete'
  | 'share'
  | 'unshare'
  | 'account_add'
  | 'account_remove'
  | 'backup'

export type LogStatus = 'success' | 'failed'

export interface SyncLog {
  id: string
  action: LogAction
  accountId: string | null
  fileId: string | null
  status: LogStatus
  errorDetails: string | null
  timestamp: number
  /** Libellé lisible (nom de fichier, email...) pour l'affichage. */
  label?: string
}

export interface VirtualFolder {
  id: string
  name: string
  emoji: string
  color: string
  createdAt: number
  fileCount?: number
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'

export interface BackupSchedule {
  id: string
  sourceAccountId: string
  targetAccountId: string
  frequency: ScheduleFrequency
  /** "HH:MM" 24h */
  time: string
  mode: BackupMode
  enabled: boolean
  nextRun: number
  lastRun: number | null
}

export type ShareRole = 'reader' | 'commenter' | 'writer'

export interface SharedLink {
  id: string
  fileId: string
  drivePermissionId: string
  url: string
  role: ShareRole
  createdAt: number
  expiresAt: number
}

export interface DashboardStats {
  totalQuota: number
  totalUsed: number
  totalFiles: number
  avgFileSize: number
  accountsCount: number
  primaryCount: number
  backupCount: number
}

export interface RecentActivity {
  id: string
  action: LogAction
  label: string
  status: LogStatus
  timestamp: number
}

export interface TransferProgress {
  id: string
  kind: 'upload' | 'download' | 'replicate'
  filename: string
  bytesDone: number
  bytesTotal: number
  speed: number // bytes/s
  status: 'active' | 'done' | 'error'
  error?: string
}

export interface BackupProgress {
  jobId: string
  sourceAccountId: string
  targetAccountId: string
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  currentFile: string
  status: BackupStatus
  errors: { file: string; reason: string }[]
}

export interface AppSettings {
  theme?: 'dark' | 'light'
  /** Présence seule exposée au renderer, jamais la valeur. */
  googleConfigured?: boolean
  /** Lance l'app (masquée, dans la barre système) à la connexion à Windows/macOS/Linux. */
  launchAtStartup?: boolean
}

export interface DriveRevision {
  id: string
  modifiedTime: string
  size: number
  keepForever: boolean
  lastModifyingUser?: string
}

export interface AddAccountResult {
  account: Account
}
