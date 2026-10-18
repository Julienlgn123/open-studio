import { create } from 'zustand'
import { DEFAULT_LAYOUT, type Layout, type AppSettings, CatalogState, ModuleInfo, ModuleProgress, Theme, ThemeSetting } from '@shared/types'

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
  /** Modules qui travaillent (leur interface reste chargée même hors de l'écran). */
  busy: Record<string, boolean>
  /** Dernier moment où chaque module était à l'écran. */
  lastSeen: Record<string, number>
  setBusy: (id: string, busy: boolean) => void
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
  /** Modifie la personnalisation (null = tout réinitialiser). */
  setLayout: (p: Partial<Layout> | null) => Promise<void>
  /** Visite guidée affichée. */
  tour: boolean
  openTour: () => void
  closeTour: () => void

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
  settings: { theme: 'dark', launchAtStartup: false, lastModule: null, tourSeen: true, layout: DEFAULT_LAYOUT, effectiveTheme: 'dark' },
  modules: [],
  catalog: null,
  loaded: false,
  progress: {},
  busy: {},
  lastSeen: {},
  setBusy: (id, busy) => set((s) => ({ busy: { ...s.busy, [id]: busy } })),
  view: { kind: 'home' },
  opened: [],
  toasts: [],
  confirm: null,

  ask: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
    applyLayout(settings.layout)
    get().applyTheme(settings.effectiveTheme)
  },
  setLayout: async (p) => {
    // Appliqué tout de suite, puis enregistré.
    if (p) applyLayout({ ...get().settings.layout, ...p })
    else applyLayout(DEFAULT_LAYOUT)
    const settings = await api.settings.setLayout(p)
    set((s) => ({ settings: { ...settings, effectiveTheme: s.settings.effectiveTheme } }))
    applyLayout(settings.layout)
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
  tour: false,
  openTour: () => set({ tour: true }),
  closeTour: () => {
    set({ tour: false })
    if (!get().settings.tourSeen) void api.settings.setTourSeen().then((settings) => set({ settings }))
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
    set((s) => ({
      lastSeen: s.view.kind === 'module' && !(v.kind === 'module' && v.id === s.view.id) ? { ...s.lastSeen, [s.view.id]: Date.now() } : s.lastSeen,
      view: v, opened: v.kind === 'module' && !s.opened.includes(v.id) ? [...s.opened, v.id] : s.opened }))
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

/** Modules installés dans l'ordre choisi par l'utilisateur. */
export function sortModules(list: ModuleInfo[], order: string[]): ModuleInfo[] {
  const rank = (id: string): number => {
    const i = order.indexOf(id)
    return i < 0 ? order.length : i
  }
  return [...list].sort((a, b) => rank(a.id) - rank(b.id))
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))))
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`
}

/** Pose la personnalisation sur la page (couleurs, tailles, côté de la barre…). */
export function applyLayout(l: Layout): void {
  const root = document.documentElement
  const st = root.style
  if (l.accent && /^#[0-9a-f]{6}$/i.test(l.accent)) {
    const n = parseInt(l.accent.slice(1), 16)
    st.setProperty('--accent', l.accent)
    st.setProperty('--accent-hover', shade(l.accent, 0.15))
    st.setProperty('--accent-soft', `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, 0.15)`)
    st.setProperty('--accent-text', shade(l.accent, 0.35))
  } else {
    for (const v of ['--accent', '--accent-hover', '--accent-soft', '--accent-text']) st.removeProperty(v)
  }
  const size = { small: 52, normal: 64, large: 80 }[l.railSize]
  st.setProperty('--rail-w', `${size}px`)
  st.setProperty('--rail-btn', `${size - 20}px`)
  const r = { sharp: [4, 2], normal: [12, 8], round: [20, 14] }[l.radius]
  st.setProperty('--radius', `${r[0]}px`)
  st.setProperty('--radius-sm', `${r[1]}px`)
  api.app.setZoom(l.scale || 1)
  root.setAttribute('data-rail', l.railSide)
}

export const isInstalled = (m: ModuleInfo): boolean => m.status !== 'available'
