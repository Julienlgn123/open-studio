import { create } from 'zustand'
import type {
  Account,
  AppSettings,
  BackupJob,
  FileMeta,
  SyncLog,
  TransferProgress,
  VirtualFolder,
  DashboardStats,
  RecentActivity
} from '@shared/types'

const api = window.api

export type ViewName =
  | 'dashboard'
  | 'files'
  | 'accounts'
  | 'backup'
  | 'logs'
  | 'settings'
  | 'folder'
  | 'shared'

export interface ToastMsg {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface AppStore {
  view: ViewName
  activeFolderId: string | null
  settings: AppSettings

  accounts: Account[]
  files: FileMeta[]
  folders: VirtualFolder[]
  jobs: BackupJob[]
  logs: SyncLog[]
  stats: DashboardStats | null
  recent: RecentActivity[]

  transfers: TransferProgress[]
  toasts: ToastMsg[]

  /** Onboarding : masqué manuellement par l'utilisateur pour la session. */
  onboardingDismissed: boolean
  lastSyncAt: number | null
  syncing: boolean

  setView: (v: ViewName, folderId?: string | null) => void
  dismissOnboarding: () => void

  loadAll: () => Promise<void>
  loadSettings: () => Promise<void>
  loadAccounts: () => Promise<void>
  loadFiles: () => Promise<void>
  loadFolders: () => Promise<void>
  loadJobs: () => Promise<void>
  loadLogs: () => Promise<void>
  loadDashboard: () => Promise<void>

  /** Rafraîchit les quotas Drive de tous les comptes puis recharge les données. */
  syncQuotas: (opts?: { silent?: boolean; minIntervalMs?: number }) => Promise<void>
  /** Scanne le contenu réel de chaque Drive (fichiers déjà présents inclus). */
  scanningAccountId: string | null
  scanCount: number
  syncDriveFiles: (opts?: { silent?: boolean }) => Promise<void>
  /** Pré-filtre appliqué à la page Fichiers lors de la prochaine ouverture. */
  filesAccountFilter: string | null
  openAccountFiles: (accountId: string) => void

  applyTheme: () => void
  setTheme: (t: 'dark' | 'light') => Promise<void>
  setLaunchAtStartup: (enabled: boolean) => Promise<void>

  pushTransfer: (t: TransferProgress) => void
  clearFinishedTransfers: () => void

  toast: (message: string, type?: ToastMsg['type']) => void
  dismissToast: (id: number) => void
}

export const useStore = create<AppStore>((set, get) => ({
  view: 'dashboard',
  activeFolderId: null,
  settings: { theme: 'dark', googleConfigured: false },

  accounts: [],
  files: [],
  folders: [],
  jobs: [],
  logs: [],
  stats: null,
  recent: [],

  transfers: [],
  toasts: [],

  onboardingDismissed: false,
  lastSyncAt: null,
  syncing: false,
  scanningAccountId: null,
  scanCount: 0,
  filesAccountFilter: null,

  setView: (v, folderId = null) => set({ view: v, activeFolderId: folderId }),
  dismissOnboarding: () => set({ onboardingDismissed: true }),
  openAccountFiles: (accountId) =>
    set({ view: 'files', activeFolderId: null, filesAccountFilter: accountId }),

  loadAll: async () => {
    await Promise.all([
      get().loadSettings(),
      get().loadAccounts(),
      get().loadFiles(),
      get().loadFolders(),
      get().loadJobs(),
      get().loadDashboard()
    ])
  },

  syncQuotas: async (opts) => {
    const { syncing, lastSyncAt, accounts } = get()
    if (syncing) return
    if (accounts.length === 0) return
    if (opts?.minIntervalMs && lastSyncAt && Date.now() - lastSyncAt < opts.minIntervalMs) return
    set({ syncing: true })
    try {
      await api.accounts.syncAll()
      await Promise.all([get().loadAccounts(), get().loadDashboard(), get().loadFiles()])
      set({ lastSyncAt: Date.now() })
    } catch (err) {
      if (!opts?.silent) {
        get().toast(err instanceof Error ? err.message : 'Échec de la synchronisation', 'error')
      }
    } finally {
      set({ syncing: false })
    }
  },

  syncDriveFiles: async (opts) => {
    if (get().accounts.length === 0) return
    if (get().scanningAccountId) return
    set({ scanningAccountId: 'all', scanCount: 0 })
    try {
      await api.accounts.syncAllFiles()
      await Promise.all([get().loadFiles(), get().loadAccounts(), get().loadDashboard()])
    } catch (err) {
      if (!opts?.silent) {
        get().toast(err instanceof Error ? err.message : 'Échec du scan Drive', 'error')
      }
    } finally {
      set({ scanningAccountId: null, scanCount: 0 })
    }
  },

  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
    get().applyTheme()
  },

  loadAccounts: async () => set({ accounts: await api.accounts.list() }),
  loadFiles: async () => set({ files: await api.files.list() }),
  loadFolders: async () => set({ folders: await api.folders.list() }),
  loadJobs: async () => set({ jobs: await api.backup.jobs() }),
  loadLogs: async () => set({ logs: await api.logs.list({ limit: 300 }) }),
  loadDashboard: async () => {
    const [stats, recent] = await Promise.all([api.dashboard.stats(), api.dashboard.recent()])
    set({ stats, recent })
  },

  applyTheme: () => {
    const t = get().settings.theme === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', t)
  },

  setTheme: async (t) => {
    const settings = await api.settings.setTheme(t)
    set({ settings })
    get().applyTheme()
  },

  setLaunchAtStartup: async (enabled) => {
    const settings = await api.settings.setLaunchAtStartup(enabled)
    set({ settings })
  },

  pushTransfer: (t) =>
    set((s) => {
      const idx = s.transfers.findIndex((x) => x.id === t.id)
      const next = [...s.transfers]
      if (idx >= 0) next[idx] = t
      else next.unshift(t)
      return { transfers: next.slice(0, 20) }
    }),

  clearFinishedTransfers: () =>
    set((s) => ({ transfers: s.transfers.filter((t) => t.status === 'active') })),

  toast: (message, type = 'info') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
