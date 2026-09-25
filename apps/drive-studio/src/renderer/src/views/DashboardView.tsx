import { useEffect, useMemo } from 'react'
import { Upload, FolderPlus, UserPlus, DatabaseBackup } from 'lucide-react'
import { useStore } from '../store'
import PieChart from '../components/charts/PieChart'
import BarChart from '../components/charts/BarChart'
import ProgressBar from '../components/ProgressBar'
import {
  formatBytes,
  formatRelative,
  accountColor,
  mimeCategory,
  CATEGORY_COLORS,
  type MimeCategory
} from '../lib/format'

export default function DashboardView(): JSX.Element {
  const { stats, recent, accounts, files, folders, setView, loadDashboard, loadFiles, toast } =
    useStore()

  useEffect(() => {
    loadDashboard()
    loadFiles()
  }, [])

  const pieData = useMemo(
    () =>
      accounts.map((a, i) => ({
        label: a.email,
        value: a.quotaUsed,
        color: accountColor(i)
      })),
    [accounts]
  )

  const barRows = useMemo(
    () =>
      accounts.map((a, i) => ({
        label: a.email.split('@')[0],
        used: a.quotaUsed,
        total: a.quotaTotal,
        color: accountColor(i)
      })),
    [accounts]
  )

  const byCategory = useMemo(() => {
    const map = new Map<MimeCategory, number>()
    for (const f of files) {
      const c = mimeCategory(f.mimeType)
      map.set(c, (map.get(c) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [files])

  const usedRatio = stats && stats.totalQuota > 0 ? stats.totalUsed / stats.totalQuota : 0

  async function pickUpload(): Promise<void> {
    try {
      const res = await window.api.files.pickAndUpload()
      if (res.length) {
        await Promise.all([loadFiles(), loadDashboard()])
        toast(`${res.length} fichier(s) envoyé(s)`, 'success')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec upload', 'error')
    }
  }

  return (
    <div className="view-scroll">
      <div className="hero">
        <div className="hero-row">
          <div>
            <h1>Bonjour 👋</h1>
            <p>
              {stats?.totalFiles ?? 0} fichiers · {accounts.length} compte
              {accounts.length !== 1 ? 's' : ''} · {folders.length} dossier
              {folders.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="wrap">
            <button className="btn btn-secondary" onClick={() => setView('accounts')}>
              <UserPlus size={15} /> Compte
            </button>
            <button className="btn btn-primary" onClick={pickUpload}>
              <Upload size={15} /> Ajouter des fichiers
            </button>
          </div>
        </div>
      </div>

      <div className="view-pad col" style={{ gap: 24 }}>
        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-card-label">Stockage utilisé</span>
            <span className="stat-card-value">{formatBytes(stats?.totalUsed ?? 0)}</span>
            <span className="stat-card-sub">sur {formatBytes(stats?.totalQuota ?? 0)}</span>
            <ProgressBar ratio={usedRatio} />
          </div>
          <div className="stat-card">
            <span className="stat-card-label">Fichiers</span>
            <span className="stat-card-value">{stats?.totalFiles ?? 0}</span>
            <span className="stat-card-sub">
              taille moyenne {formatBytes(stats?.avgFileSize ?? 0)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">Comptes</span>
            <span className="stat-card-value">{stats?.accountsCount ?? 0}</span>
            <span className="stat-card-sub">
              {stats?.primaryCount ?? 0} principaux · {stats?.backupCount ?? 0} backup
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">Espace libre</span>
            <span className="stat-card-value">
              {formatBytes((stats?.totalQuota ?? 0) - (stats?.totalUsed ?? 0))}
            </span>
            <span className="stat-card-sub">tous comptes confondus</span>
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">☁️</div>
            <div className="empty-state-title">Bienvenue 👋</div>
            <div className="empty-state-desc">
              L'assistant te guide en 3 étapes : identifiants Google, ajout d'un compte Drive,
              rôles. ~5 minutes, une seule fois.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => useStore.setState({ onboardingDismissed: false })}
            >
              Ouvrir l'assistant de configuration
            </button>
          </div>
        ) : (
          <>
            {/* Charts */}
            <div className="card-grid">
              <div className="chart-card">
                <span className="chart-card-title">Répartition de l'espace</span>
                <div className="row" style={{ gap: 20 }}>
                  <PieChart
                    data={pieData}
                    centerLabel={formatBytes(stats?.totalUsed ?? 0)}
                    centerSub="utilisé"
                  />
                  <div className="legend" style={{ flex: 1 }}>
                    {accounts.map((a, i) => (
                      <div className="legend-row" key={a.id}>
                        <span className="legend-dot" style={{ background: accountColor(i) }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.email}
                        </span>
                        <span className="legend-val">{formatBytes(a.quotaUsed)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="chart-card">
                <span className="chart-card-title">Utilisé / capacité par compte</span>
                <BarChart rows={barRows} format={(n) => formatBytes(n, 0)} />
              </div>

              <div className="chart-card">
                <span className="chart-card-title">Types de fichiers</span>
                {byCategory.length === 0 ? (
                  <span className="muted" style={{ fontSize: 13 }}>Aucun fichier.</span>
                ) : (
                  <div className="legend">
                    {byCategory.map(([cat, n]) => (
                      <div className="legend-row" key={cat}>
                        <span
                          className="legend-dot"
                          style={{ background: CATEGORY_COLORS[cat] }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{cat}</span>
                        <span className="legend-val">{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="wrap">
              <button className="btn btn-secondary" onClick={pickUpload}>
                <Upload size={14} /> Uploader
              </button>
              <button className="btn btn-secondary" onClick={() => setView('backup')}>
                <DatabaseBackup size={14} /> Lancer un backup
              </button>
              <button className="btn btn-secondary" onClick={() => setView('files')}>
                <FolderPlus size={14} /> Voir tous les fichiers
              </button>
            </div>

            {/* Recent activity */}
            <div className="col" style={{ gap: 10 }}>
              <span className="section-label">Activité récente</span>
              {recent.length === 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>Aucune activité pour l'instant.</span>
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  {recent.map((r) => (
                    <div className="log-line" key={r.id} style={{ gridTemplateColumns: '110px 1fr auto' }}>
                      <span
                        className="badge"
                        style={{
                          background: r.status === 'success' ? 'var(--success-dim)' : 'var(--danger-dim)',
                          color: r.status === 'success' ? 'var(--success)' : 'var(--danger)'
                        }}
                      >
                        {r.action}
                      </span>
                      <span className="log-msg">{r.label}</span>
                      <span className="log-time">{formatRelative(r.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
