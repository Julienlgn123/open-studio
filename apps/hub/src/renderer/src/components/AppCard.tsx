import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Download, ExternalLink, MoreHorizontal, Play, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { useStore } from '../store'
import ProgressBar from './ProgressBar'
import { formatBytes } from '../lib/format'
import type { AppState, InstallProgress } from '@shared/types'

/** Icône de l'app (logo du dépôt, ou emoji de repli). */
export function AppIcon({ app }: { app: AppState }): JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <div className="app-icon" style={{ ['--app-accent' as string]: app.accent }}>
      {!failed ? <img src={app.logoUrl} alt="" onError={() => setFailed(true)} /> : app.fallbackEmoji}
    </div>
  )
}

const PHASE_LABEL: Record<InstallProgress['phase'], string> = {
  uninstalling: 'Préparation…',
  downloading: 'Téléchargement',
  installing: 'Installation…',
  done: 'Terminé'
}

export default function AppCard({
  app,
  progress,
  onDone,
  index = 0
}: {
  app: AppState
  progress?: InstallProgress
  /** Appelé quand une action (install/lancement/désinstall) se termine, succès ou échec. */
  onDone: () => void
  index?: number
}): JSX.Element {
  const { install, update, launch, uninstall, toast } = useStore()
  const [busy, setBusy] = useState<'primary' | 'uninstall' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [diskUsage, setDiskUsage] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isInstalled = app.status === 'installed' || app.status === 'update_available'
  const hasUpdate = app.status === 'update_available'

  useEffect(() => {
    if (!isInstalled) return
    let cancelled = false
    window.api.apps
      .getInstalledSize(app.id)
      .then((size) => !cancelled && setDiskUsage(size))
      .catch(() => !cancelled && setDiskUsage(null))
    return () => {
      cancelled = true
    }
  }, [app.id, app.status])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  async function run(kind: 'primary' | 'uninstall', fn: () => Promise<void>): Promise<void> {
    setBusy(kind)
    try {
      await fn()
    } finally {
      setBusy(null)
      onDone()
    }
  }

  const onPrimary = (): Promise<void> =>
    run('primary', () => (app.status === 'installed' ? launch(app.id) : hasUpdate ? update(app.id) : install(app.id)))

  const onUninstall = (): void => {
    setMenuOpen(false)
    if (!window.confirm(`Désinstaller ${app.name} ? Tes données dans l'app restent intactes.`)) return
    void run('uninstall', () => uninstall(app.id))
  }

  const version = app.installedVersion && app.installedVersion !== 'inconnue' ? app.installedVersion : app.latestVersion
  const working = !!busy || !!progress

  return (
    <div className="card" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
      <div className="card-head">
        <AppIcon app={app} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="card-title">{app.name}</div>
          <div className="card-meta">
            {app.category}
            {version && (
              <>
                <span>·</span>v{version}
              </>
            )}
          </div>
        </div>
        {app.status === 'installed' && (
          <span className="badge installed">
            <CircleCheck size={12} />
            Installée
          </span>
        )}
        {hasUpdate && (
          <span className="badge update" title={`${app.installedVersion} → ${app.latestVersion}`}>
            <RefreshCw size={11} />v{app.latestVersion}
          </span>
        )}
        {app.status === 'error' && (
          <span className="badge error">
            <TriangleAlert size={12} />
            Erreur
          </span>
        )}
      </div>

      <p className="card-desc">{app.description}</p>

      <div className="card-foot">
        {progress ? (
          <div className="progress-box">
            <div className="progress-label">
              <span>{PHASE_LABEL[progress.phase]}</span>
              {progress.phase === 'downloading' && <span>{Math.round(progress.pct * 100)} %</span>}
            </div>
            <ProgressBar ratio={progress.pct} indeterminate={progress.phase !== 'downloading'} />
          </div>
        ) : (
          <>
            <button
              className={`btn btn-block ${app.status === 'installed' ? 'btn-primary' : hasUpdate ? 'btn-warning' : 'btn-secondary'}`}
              onClick={onPrimary}
              disabled={working}
            >
              {busy === 'primary' ? (
                <span className="spinner" />
              ) : app.status === 'installed' ? (
                <Play size={14} fill="currentColor" />
              ) : hasUpdate ? (
                <RefreshCw size={14} />
              ) : (
                <Download size={14} />
              )}
              {app.status === 'installed' ? 'Ouvrir' : hasUpdate ? 'Mettre à jour' : 'Installer'}
            </button>
            {hasUpdate && (
              <button className="btn btn-secondary btn-icon" onClick={() => void run('primary', () => launch(app.id))} disabled={working} title="Ouvrir sans mettre à jour">
                <Play size={14} fill="currentColor" />
              </button>
            )}
            <div className="menu-wrap" ref={menuRef}>
              <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen((v) => !v)} disabled={working} title="Plus d'options">
                {busy === 'uninstall' ? <span className="spinner" /> : <MoreHorizontal size={16} />}
              </button>
              {menuOpen && (
                <div className="menu">
                  <button
                    className="menu-item"
                    onClick={() => {
                      setMenuOpen(false)
                      window.api.shell.openExternal(app.repoUrl).catch(() => toast('Impossible d’ouvrir le lien', 'error'))
                    }}
                  >
                    <ExternalLink size={14} />
                    Voir sur GitHub
                  </button>
                  {isInstalled && (
                    <>
                      <div className="menu-sep" />
                      {diskUsage != null && <div className="menu-note">{formatBytes(diskUsage)} sur le disque</div>}
                      <button className="menu-item danger" onClick={onUninstall}>
                        <Trash2 size={14} />
                        Désinstaller
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
