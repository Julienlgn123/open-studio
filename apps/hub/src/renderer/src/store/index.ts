import { create } from 'zustand'
import type { AppSettings, CatalogState, ModuleInfo, ModuleProgress, Theme, ThemeSetting } from '@shared/types'

const api = window.api

export type View = { kind: 'home' } | { kind: 'store' } | { kind: 'settings' } | { kind: 'module'; id: string }

export interface ToastMsg {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export interface ConfirmRequest {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

interface Store {
  settings: AppSettings & { effectiveTheme: Theme }
  modules: ModuleInfo[]
  catalog: CatalogState | null
  loaded: boolean
  progress: Record<string, ModuleProgress>
  view: View
  /** Modules déjà ouverts une fois : leur interface reste chargée (état conservé). */
  opened: string[]
  toasts: ToastMsg[]
  /** Demande de confirmation affichée (remplace window.confirm). */
  confirm: ConfirmRequest | null

  ask: (req: ConfirmRequest) => void
  closeConfirm: () => void
  loadSettings: () => Promise<void>
  setTheme: (t: ThemeSetting) => Promise<void>
  applyTheme: (t: Theme) => void
  setLaunchAtStartup: (enabled: boolean) => Promise<void>

  loadModules: (refresh?: boolean) => Promise<void>
  install: (id: string) => Promise<void>
  uninstall: (id: string) => Promise<void>
  removeLegacy: (id: string) => Promise<void>
  setProgress: (p: ModuleProgress) => void

  go: (v: View) => void
  openModule: (id: string | null) => void

  toast: (message: string, type?: ToastMsg['type']) => void
  dismissToast: (id: number) => void
}

/** Message d'erreur IPC sans le préfixe technique d'Electron. */
const clean = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const useStore = create<Store>((set, get) => ({
  settings: { theme: 'dark', launchAtStartup: false, lastModule: null, effectiveTheme: 'dark' },
  modules: [],
  catalog: null,
  loaded: false,
  progress: {},
  view: { kind: 'home' },
  opened: [],
  toasts: [],
  confirm: null,

  ask: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
    get().applyTheme(settings.effectiveTheme)
  },
  setTheme: async (t) => {
    const settings = await api.settings.setTheme(t)
    set({ settings })
    get().applyTheme(settings.effectiveTheme)
  },
  applyTheme: (t) => {
    document.documentElement.setAttribute('data-theme', t)
    set((s) => ({ settings: { ...s.settings, effectiveTheme: t } }))
  },
  setLaunchAtStartup: async (enabled) => {
    set({ settings: await api.settings.setLaunchAtStartup(enabled) })
  },

  loadModules: async (refresh) => {
    const [modules, catalog] = await Promise.all([api.modules.list(refresh), api.modules.catalogState()])
    set({ modules, catalog, loaded: true })
    // Un module retiré entre-temps : on quitte sa page.
    const v = get().view
    if (v.kind === 'module' && !modules.some((m) => m.id === v.id && m.status !== 'available')) get().go({ kind: 'home' })
  },
  install: async (id) => {
    const name = get().modules.find((m) => m.id === id)?.name ?? 'Le module'
    const wasInstalled = get().modules.find((m) => m.id === id)?.status !== 'available'
    try {
      await api.modules.install(id)
      await get().loadModules()
      get().toast(wasInstalled ? `${name} est à jour` : `${name} est installé`, 'success')
    } catch (err) {
      get().toast(clean(err), 'error')
    }
  },
  uninstall: async (id) => {
    const name = get().modules.find((m) => m.id === id)?.name ?? 'Le module'
    try {
      await api.modules.uninstall(id)
      set((s) => ({ opened: s.opened.filter((o) => o !== id) }))
      await get().loadModules()
      get().toast(`${name} retiré. Tes données restent sur l’ordinateur.`, 'success')
    } catch (err) {
      get().toast(clean(err), 'error')
    }
  },
  removeLegacy: async (id) => {
    try {
      await api.modules.removeLegacy(id)
      await get().loadModules()
      get().toast('Ancienne app désinstallée. Tes données sont toujours là.', 'success')
    } catch (err) {
      get().toast(clean(err), 'error')
    }
  },
  setProgress: (p) =>
    set((s) => {
      const progress = { ...s.progress }
      if (p.phase === 'done') delete progress[p.id]
      else progress[p.id] = p
      return { progress }
    }),

  go: (v) => {
    set((s) => ({ view: v, opened: v.kind === 'module' && !s.opened.includes(v.id) ? [...s.opened, v.id] : s.opened }))
    api.modules.setCurrent(v.kind === 'module' ? v.id : null)
  },
  openModule: (id) => {
    const m = id ? get().modules.find((x) => x.id === id && x.status !== 'available') : null
    get().go(m ? { kind: 'module', id: m.id } : { kind: 'home' })
  },

  toast: (message, type = 'info') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 4500)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const isInstalled = (m: ModuleInfo): boolean => m.status !== 'available'
