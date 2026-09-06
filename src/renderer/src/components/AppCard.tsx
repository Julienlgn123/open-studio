import { useState } from 'react'
import { Download, ExternalLink, Play, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import ProgressBar from './ProgressBar'
import type { AppState, InstallProgress } from '@shared/types'

const STATUS_LABEL: Record<AppState['status'], string> = {
  not_installed: 'Non installé',
  installed: 'Installé',
  update_available: 'Mise à jour dispo',
  downloading: 'Téléchargement…',
  installing: 'Installation…',
  launching: 'Lancement…',
  uninstalling: 'Suppression…',
  error: 'Erreur'
}

export default function AppCard({
  app,
  progress,
  onDone
}: {
  app: AppState
  progress?: InstallProgress
  /** Appelé quand une action (install/lancement/désinstall) se termine, succès ou échec. */
  onDone: () => void
}): JSX.Element {
  const { install, launch, uninstall, toast } = useStore()
  const [busy, setBusy] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const working = busy || !!progress

  async function onPrimary(): Promise<void> {
    setBusy(true)
    try {
      if (app.status === 'installed') await launch(app.id)
      else await install(app.id)
    } finally {
      setBusy(false)
      onDone()
    }
  }

  async function onUninstall(): Promise<void> {
    if (!window.confirm(`Désinstaller ${app.name} ? Ses données perso restent intactes.`)) return
    setBusy(true)
    try {
      await uninstall(app.id)
    } finally {
      setBusy(false)
      onDone()
    }
  }

  const canLaunch = app.status === 'installed'
  const canUpdate = app.status === 'update_available'

  return (
    <div className="app-card fade-in">
      <div className="app-card-head">
        <div className="app-logo" style={{ background: app.accent }}>
          {!logoFailed ? (
            <img src={app.logoUrl} alt="" onError={() => setLogoFailed(true)} />
          ) : (
            app.fallbackEmoji
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="app-card-title">{app.name}</div>
          <div className="app-card-category">{app.category}</div>
        </div>
        <span className={`status-pill ${app.status}`}>{STATUS_LABEL[app.status]}</span>
      </div>

      <p className="app-card-desc">{app.description}</p>

      <div className="app-card-meta">
        {app.installedVersion && <span>Installé : {app.installedVersion}</span>}
        {app.latestVersion && <span>Dernière : {app.latestVersion}</span>}
        <button
          className="icon-btn"
          style={{ width: 22, height: 22, marginLeft: 'auto' }}
          title="Voir sur GitHub"
          onClick={() =>
            window.api.shell.openExternal(app.repoUrl).catch(() => toast('Impossible d’ouvrir le lien', 'error'))
          }
        >
          <ExternalLink size={13} />
        </button>
      </div>

      {progress && (
        <div className="col" style={{ gap: 4 }}>
          <ProgressBar ratio={progress.phase === 'downloading' ? progress.pct : 1} height={4} />
          <span className="muted" style={{ fontSize: 11 }}>
            {progress.phase === 'downloading'
              ? `Téléchargement… ${Math.round(progress.pct * 100)}%`
              : 'Installation…'}
          </span>
        </div>
      )}

      <div className="app-card-actions">
        <button className="btn btn-primary" onClick={onPrimary} disabled={working} style={{ flex: 1 }}>
          {working ? (
            <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
          ) : canLaunch ? (
            <Play size={13} />
          ) : canUpdate ? (
            <RefreshCw size={13} />
          ) : (
            <Download size={13} />
          )}
          {canLaunch ? 'Lancer' : canUpdate ? 'Mettre à jour' : 'Installer'}
        </button>
        {(app.status === 'installed' || app.status === 'update_available') && (
          <button
            className="btn btn-sm btn-danger"
            onClick={onUninstall}
            disabled={working}
            data-tooltip="Désinstaller"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
