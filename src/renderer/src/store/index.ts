import { create } from 'zustand'
import type { AppSettings, AppState } from '@shared/types'

const api = window.api

export interface ToastMsg {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface Store {
  settings: AppSettings
  apps: AppState[]
  loading: boolean
  toasts: ToastMsg[]

  loadSettings: () => Promise<void>
  setTheme: (t: 'dark' | 'light') => Promise<void>
  applyTheme: () => void

  loadApps: () => Promise<void>
  install: (id: string) => Promise<void>
  update: (id: string) => Promise<void>
  launch: (id: string) => Promise<void>
  uninstall: (id: string) => Promise<void>

  toast: (message: string, type?: ToastMsg['type']) => void
  dismissToast: (id: number) => void
}

export const useStore = create<Store>((set, get) => ({
  settings: { theme: 'dark' },
  apps: [],
  loading: true,
  toasts: [],

  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
    get().applyTheme()
  },
  setTheme: async (t) => {
    const settings = await api.settings.setTheme(t)
    set({ settings })
    get().applyTheme()
  },
  applyTheme: () => {
    const t = get().settings.theme === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', t)
  },

  loadApps: async () => {
    set({ loading: true })
    try {
      const apps = await api.apps.list()
      set({ apps })
    } finally {
      set({ loading: false })
    }
  },

  install: async (id) => {
    try {
      await api.apps.install(id)
      await get().loadApps()
      get().toast('Installé — prêt à lancer ✓', 'success')
    } catch (err) {
      get().toast(err instanceof Error ? err.message : "Échec de l'installation", 'error')
    }
  },

  update: async (id) => {
    try {
      // Même flow que l'installation initiale : installOrUpdateApp gère les deux cas.
      await api.apps.install(id)
      await get().loadApps()
      get().toast('Mise à jour installée ✓', 'success')
    } catch (err) {
      get().toast(err instanceof Error ? err.message : 'Échec de la mise à jour', 'error')
    }
  },

  launch: async (id) => {
    try {
      await api.apps.launch(id)
    } catch (err) {
      get().toast(err instanceof Error ? err.message : 'Impossible de lancer cette app', 'error')
    }
  },

  uninstall: async (id) => {
    try {
      await api.apps.uninstall(id)
      await get().loadApps()
      get().toast('Désinstallé', 'success')
    } catch (err) {
      get().toast(err instanceof Error ? err.message : 'Échec de la désinstallation', 'error')
    }
  },

  toast: (message, type = 'info') => {
    const id = Date.now() + Math.random()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 4500)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
