// Composants communs aux interfaces des modules (avec ui.css).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import type { Kit } from '../module-api/src/kit-preload'
import type { StudioBridge } from '../module-api/src/types'
import './ui.css'

declare global {
  interface Window {
    kit: Kit
    studio?: StudioBridge
  }
}

/** Point d'entrée d'une interface de module. */
export function boot(App: () => JSX.Element): void {
  createRoot(document.getElementById('root') as HTMLElement).render(<App />)
}

// ─── Mise en page ───────────────────────────────────────────────────────────────────────────

export function Layout({ side, children }: { side?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="ui-app">
      {side && <aside className="ui-side">{side}</aside>}
      <main className="ui-main">{children}</main>
    </div>
  )
}

export function SideTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="ui-side-title">
      {icon}
      {children}
    </div>
  )
}

export function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  onContextMenu
}: {
  icon?: ReactNode
  label: ReactNode
  count?: ReactNode
  active?: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}): JSX.Element {
  return (
    <button className={`ui-nav${active ? ' active' : ''}`} onClick={onClick} onContextMenu={onContextMenu}>
      {icon}
      <span>{label}</span>
      {count != null && <span className="count">{count}</span>}
    </button>
  )
}

export function Page({
  title,
  sub,
  tools,
  wide,
  children
}: {
  title?: ReactNode
  sub?: ReactNode
  tools?: ReactNode
  wide?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className="ui-page">
      <div className={`ui-page-inner${wide ? ' wide' : ''}`}>
        {(title || tools) && (
          <div className="ui-head">
            <div>
              {title && <h1 className="ui-title">{title}</h1>}
              {sub && <div className="ui-sub">{sub}</div>}
            </div>
            {tools && <div className="ui-tools">{tools}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div className="ui-empty">
      {icon && <div className="ui-empty-icon">{icon}</div>}
      <div className="ui-empty-title">{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="ui-overlay" onMouseDown={onClose}>
      <div className="ui-modal" style={width ? { width } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ui-modal-head">{title}</div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }): JSX.Element {
  return <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} title={title} onClick={() => onChange(!on)} />
}

export function Progress({ ratio }: { ratio: number }): JSX.Element {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
    </div>
  )
}

// ─── Notifications dans le module ───────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'
let pushToast: (msg: string, type?: ToastType) => void = () => {}

/** Petit message en bas à droite. */
export function toast(message: string, type: ToastType = 'info'): void {
  pushToast(message, type)
}

export function Toasts(): JSX.Element | null {
  const [t, setT] = useState<{ id: number; message: string; type: ToastType } | null>(null)
  const timer = useRef<number>()
  useEffect(() => {
    pushToast = (message, type = 'info') => {
      window.clearTimeout(timer.current)
      setT({ id: Date.now(), message, type })
      timer.current = window.setTimeout(() => setT(null), 4000)
    }
  }, [])
  if (!t) return null
  const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info
  const color = t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--accent-text)'
  return (
    <div className="ui-toast" key={t.id} onClick={() => setT(null)}>
      <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <span>{t.message}</span>
    </div>
  )
}

/** Message d'erreur IPC sans le préfixe technique d'Electron. */
export function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

// ─── Données ────────────────────────────────────────────────────────────────────────────────

/**
 * État gardé dans le stockage du module (fichier JSON dans son dossier de données).
 * `ready` passe à vrai une fois la valeur enregistrée relue.
 */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial)
  const [ready, setReady] = useState(false)
  const latest = useRef(value)
  const loaded = useRef(false)
  /** Modifications faites avant la relecture : rejouées sur la valeur enregistrée, jamais perdues. */
  const early = useRef<((prev: T) => T)[]>([])
  const save = useRef<number>()
  const persist = useCallback(() => {
    window.clearTimeout(save.current)
    save.current = window.setTimeout(() => void window.kit.store.set(key, latest.current), 250)
  }, [key])
  useEffect(() => {
    let alive = true
    loaded.current = false
    window.kit.store.get<T>(key, initial).then((v) => {
      if (!alive) return
      let next = v ?? initial
      for (const op of early.current) next = op(next)
      latest.current = next
      loaded.current = true
      setValue(next)
      setReady(true)
      if (early.current.length) persist()
      early.current = []
    })
    return () => {
      alive = false
    }
  }, [key])
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const op = typeof v === 'function' ? (v as (p: T) => T) : () => v
      if (!loaded.current) early.current.push(op)
      latest.current = op(latest.current)
      setValue(latest.current)
      if (loaded.current) persist()
    },
    [key, persist]
  )
  return [value, set, ready]
}

/** Thème d'Open Studio, à jour en direct (pour les canvas, graphiques…). */
export function useTheme(): 'dark' | 'light' {
  const [t, setT] = useState<'dark' | 'light'>(window.studio?.getTheme() ?? 'dark')
  useEffect(() => window.studio?.onTheme(setT), [])
  return t
}

export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !isFinite(bytes)) return '—'
  const u = ['o', 'Ko', 'Mo', 'Go', 'To']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? n : n.toFixed(n >= 100 ? 0 : 1).replace('.', ',')} ${u[i]}`
}

export function formatDate(ts: number | string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Date(ts).toLocaleDateString('fr-FR', opts)
}

export function formatTime(ts: number | string | Date): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** « il y a 3 min », « hier »… */
export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return 'à l’instant'
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  if (s < 172800) return 'hier'
  return formatDate(ts)
}

/** Glisser-déposer de fichiers sur un élément : renvoie les chemins. */
export function useFileDrop(onFiles: (paths: string[]) => void): { over: boolean; bind: Record<string, (e: React.DragEvent) => void> } {
  const [over, setOver] = useState(false)
  return {
    over,
    bind: {
      onDragOver: (e) => {
        e.preventDefault()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e) => {
        e.preventDefault()
        setOver(false)
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => window.kit.files.pathFor(f))
          .filter(Boolean)
        if (paths.length) onFiles(paths)
      }
    }
  }
}

/**
 * Demande de texte (window.prompt n'existe pas dans Electron).
 * `const [promptNode, ask] = usePrompt()` puis `const v = await ask('Nom', 'défaut')`.
 */
export function usePrompt(): [JSX.Element | null, (title: string, initial?: string, multiline?: boolean) => Promise<string | null>] {
  const [req, setReq] = useState<{ title: string; value: string; multiline: boolean; resolve: (v: string | null) => void } | null>(null)
  const ask = useCallback(
    (title: string, initial = '', multiline = false) => new Promise<string | null>((resolve) => setReq({ title, value: initial, multiline, resolve })),
    []
  )
  const close = (v: string | null): void => {
    req?.resolve(v)
    setReq(null)
  }
  const node = req ? (
    <Modal
      title={req.title}
      onClose={() => close(null)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => close(null)}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!req.value.trim()} onClick={() => close(req.value)}>
            OK
          </button>
        </>
      }
    >
      {req.multiline ? (
        <textarea className="textarea" rows={4} autoFocus value={req.value} onChange={(e) => setReq({ ...req, value: e.target.value })} />
      ) : (
        <input
          className="input"
          autoFocus
          value={req.value}
          onChange={(e) => setReq({ ...req, value: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && req.value.trim() && close(req.value)}
        />
      )}
    </Modal>
  ) : null
  return [node, ask]
}
