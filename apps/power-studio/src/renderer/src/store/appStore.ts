import { create } from 'zustand'
import type { AppSettings, HardwareProfile, ProfileDef, ProfileId } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export type View = 'dashboard' | 'profiles' | 'tweaks' | 'startup' | 'apps' | 'clean' | 'auto' | 'settings'

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error' | 'info'
}

interface AppState {
  view: View
  setView: (v: View) => void
  settings: AppSettings
  loaded: boolean
  hardware: HardwareProfile | null
  profiles: ProfileDef[]
  activeProfile: ProfileId | null
  applying: ProfileId | null
  toasts: Toast[]
  load: () => Promise<void>
  refreshProfiles: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  applyProfile: (id: ProfileId) => Promise<void>
  toast: (text: string, kind?: Toast['kind']) => void
}

let toastId = 0

function applyTheme(theme: AppSettings['theme']): void {
  document.documentElement.dataset.theme = theme
}

export const useApp = create<AppState>((set, get) => ({
  view: 'dashboard',
  setView: (view) => set({ view }),
  settings: DEFAULT_SETTINGS,
  loaded: false,
  hardware: null,
  profiles: [],
  activeProfile: null,
  applying: null,
  toasts: [],

  load: async () => {
    const settings = await window.api.settings.get()
    applyTheme(settings.theme)
    set({ settings, loaded: true })
    const [hardware, activeProfile] = await Promise.all([window.api.hardware.get(), window.api.profiles.active()])
    set({ hardware, activeProfile })
    await get().refreshProfiles()
  },

  refreshProfiles: async () => {
    const [profiles, activeProfile] = await Promise.all([window.api.profiles.list(), window.api.profiles.active()])
    set({ profiles, activeProfile })
  },

  updateSettings: async (patch) => {
    const settings = await window.api.settings.set(patch)
    if (patch.theme) applyTheme(settings.theme)
    set({ settings })
  },

  applyProfile: async (id) => {
    set({ applying: id })
    try {
      const r = await window.api.profiles.apply(id)
      const name = get().profiles.find((p) => p.id === id)?.name ?? id
      if (r.ok && !r.failed.length) get().toast(`Profil « ${name} » appliqué`, 'ok')
      else if (r.ok) get().toast(`« ${name} » appliqué, sauf : ${r.failed.map((f) => (f.id === 'gpu' ? `GPU (${f.error})` : f.id)).join(', ')}`, 'info')
      else get().toast(r.adminDenied ? 'Droits administrateur refusés : rien n’a été changé.' : `Échec : ${r.failed[0]?.error ?? 'erreur inconnue'}`, 'error')
      set({ activeProfile: r.ok ? id : get().activeProfile })
    } finally {
      set({ applying: null })
    }
  },

  toast: (text, kind = 'info') => {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, text, kind }] })
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 8000 : 4500)
  }
}))

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} Mo`
  return `${(n / 1024 ** 3).toFixed(2)} Go`
}
