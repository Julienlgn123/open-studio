import { AlertTriangle, Check, Info, ShieldAlert, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../store/appStore'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-base-50">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] leading-5 text-base-300">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${checked ? 'bg-accent-500' : 'bg-base-700'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export function Checkbox({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): JSX.Element {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition disabled:opacity-40 ${
        checked ? 'border-accent-500 bg-accent-500 text-black' : 'border-base-600 hover:border-base-400'
      }`}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  )
}

/** Gros avertissement rouge, impossible à rater. */
export function DangerBanner({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="mb-6 flex gap-3 rounded-2xl border-2 border-red-500/60 bg-red-500/[0.08] p-4">
      <ShieldAlert size={26} className="mt-0.5 shrink-0 text-red-400" />
      <div className="text-[13px] leading-5 text-base-200">
        <div className="mb-1 text-[14px] font-bold uppercase tracking-wide text-red-400">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function WarnBox({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-3 text-[12.5px] leading-5 text-base-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
      <div>{children}</div>
    </div>
  )
}

export function InfoBox({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex gap-2.5 rounded-xl border border-base-700 bg-base-850 p-3 text-[12.5px] leading-5 text-base-300">
      <Info size={16} className="mt-0.5 shrink-0 text-base-400" />
      <div>{children}</div>
    </div>
  )
}

export function Modal({ onClose, children, width = 560 }: { onClose: () => void; children: ReactNode; width?: number }): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="card animate-fade-up max-h-full overflow-y-auto p-6 shadow-panel" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

/**
 * Confirmation d'une action risquée : case « j'ai compris » obligatoire + petit délai
 * avant que le bouton ne devienne cliquable (pour lire, pas cliquer par réflexe).
 */
export function ConfirmDanger({
  title,
  children,
  confirmLabel,
  ack = "J'ai compris les risques et j'ai une sauvegarde de mes fichiers importants.",
  delay = 3,
  onConfirm,
  onClose
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  ack?: string
  delay?: number
  onConfirm: () => void
  onClose: () => void
}): JSX.Element {
  const [checked, setChecked] = useState(false)
  const [left, setLeft] = useState(delay)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
          <AlertTriangle size={20} />
        </div>
        <h2 className="text-[17px] font-semibold text-base-50">{title}</h2>
        <button onClick={onClose} className="ml-auto text-base-400 hover:text-base-100">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-3 text-[13px] leading-5 text-base-200">{children}</div>
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-base-700 p-3 text-[12.5px] text-base-200">
        <Checkbox checked={checked} onChange={setChecked} />
        <span onClick={() => setChecked(!checked)}>{ack}</span>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button className="btn-danger" disabled={!checked || left > 0} onClick={onConfirm}>
          {left > 0 ? `${confirmLabel} (${left})` : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Toasts(): JSX.Element {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[380px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-fade-up pointer-events-auto rounded-xl border px-4 py-3 text-[13px] shadow-panel ${
            t.kind === 'ok'
              ? 'border-emerald-500/40 bg-base-850 text-emerald-300'
              : t.kind === 'error'
                ? 'border-red-500/50 bg-base-850 text-red-300'
                : 'border-base-700 bg-base-850 text-base-100'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function Badge({ color, children }: { color: 'red' | 'amber' | 'green' | 'blue' | 'gray' | 'violet'; children: ReactNode }): JSX.Element {
  const cls = {
    red: 'bg-red-500/15 text-red-300',
    amber: 'bg-amber-500/15 text-amber-300',
    green: 'bg-emerald-500/15 text-emerald-300',
    blue: 'bg-sky-500/15 text-sky-300',
    gray: 'bg-base-700/60 text-base-300',
    violet: 'bg-violet-500/15 text-violet-300'
  }[color]
  return <span className={`badge ${cls}`}>{children}</span>
}

export function Spinner({ size = 14 }: { size?: number }): JSX.Element {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} />
}
