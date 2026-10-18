import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, MoreHorizontal, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { ModuleInfo } from '@shared/types'
import { useStore } from '../store'
import ProgressBar from './ProgressBar'
import { formatBytes } from '../lib/format'

const PHASE: Record<string, string> = { downloading: 'Téléchargement', installing: 'Installation…' }

/** Boutons d'un module : installer / ouvrir / mettre à jour, et retirer (menu ⋯). */
export default function ModuleActions({ module: m, compact }: { module: ModuleInfo; compact?: boolean }): JSX.Element {
  const { install, uninstall, go, progress, ask } = useStore()
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: Event): void => {
      if (e.target instanceof Element && e.target.closest('.menu-pop, .menu-trigger')) return
      setMenu(null)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
    }
  }, [menu])
  const p = progress[m.id]

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (p) {
    return (
      <div className="progress-box">
        <div className="progress-label">
          <span>{PHASE[p.phase]}</span>
          {p.phase === 'downloading' && <span>{Math.round(p.pct * 100)} %</span>}
        </div>
        <ProgressBar ratio={p.pct} indeterminate={p.phase !== 'downloading'} />
      </div>
    )
  }

  if (m.status === 'available') {
    return (
      <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => install(m.id))}>
        {busy ? <span className="spinner" /> : <Download size={14} />}
        {m.legacy?.hasData ? 'Installer et reprendre mes données' : 'Installer'}
        {!compact && m.size != null && <span className="btn-meta">{formatBytes(m.size)}</span>}
      </button>
    )
  }

  return (
    <div className="actions">
      {m.status === 'update' && (
        <button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => install(m.id))} title={`v${m.installedVersion} → v${m.latestVersion}`}>
          {busy ? <span className="spinner" /> : <RefreshCw size={14} />}
          Mettre à jour
        </button>
      )}
      <button className="btn btn-primary" onClick={() => go({ kind: 'module', id: m.id })}>
        <Play size={13} fill="currentColor" />
        Ouvrir
      </button>
      <div className="menu-wrap">
        <button
          ref={btn}
          className="btn btn-ghost btn-icon menu-trigger"
          onClick={() => {
            if (menu) return setMenu(null)
            const r = btn.current!.getBoundingClientRect()
            setMenu({ x: Math.max(8, r.right - 190), y: r.bottom + 4 })
          }}
          title="Plus d’options"
        >
          <MoreHorizontal size={16} />
        </button>
        {menu &&
          createPortal(
          <div className="menu menu-pop" style={{ left: menu.x, top: menu.y }}>
            <div className="menu-note">Version {m.installedVersion}</div>
            <button
              className="menu-item danger"
              onClick={() => {
                setMenu(null)
                ask({
                  title: `Retirer ${m.name} ?`,
                  body: 'Tes données restent sur l’ordinateur : tu les retrouveras en réinstallant le module.',
                  confirmLabel: 'Retirer',
                  danger: true,
                  onConfirm: () => void run(() => uninstall(m.id))
                })
              }}
            >
              <Trash2 size={14} />
              Retirer le module
            </button>
          </div>,
          document.body
        )}
      </div>
    </div>
  )
}
