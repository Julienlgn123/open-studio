import { useState } from 'react'
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
  const [menu, setMenu] = useState(false)
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
      <div className="menu-wrap" onMouseLeave={() => setMenu(false)}>
        <button className="btn btn-ghost btn-icon" onClick={() => setMenu((v) => !v)} title="Plus d’options">
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <div className="menu">
            <div className="menu-note">Version {m.installedVersion}</div>
            <button
              className="menu-item danger"
              onClick={() => {
                setMenu(false)
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
          </div>
        )}
      </div>
    </div>
  )
}
