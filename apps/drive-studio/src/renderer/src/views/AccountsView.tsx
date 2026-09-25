import { useEffect, useState } from 'react'
import { UserPlus, RefreshCw, Trash2, DownloadCloud, AlertCircle, Wand2, PlugZap } from 'lucide-react'
import { useStore } from '../store'
import ProgressBar from '../components/ProgressBar'
import { mapAuthError } from '../lib/authErrors'
import { formatBytes, formatRelative, accountColor } from '../lib/format'
import type { Account, AccountRole } from '@shared/types'

export default function AccountsView(): JSX.Element {
  const { accounts, settings, loadAccounts, loadAll, openAccountFiles, toast } = useStore()
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    loadAccounts()
  }, [])

  async function addAccount(): Promise<void> {
    if (!settings.googleConfigured) {
      toast("Configure d'abord tes identifiants Google (assistant ou Réglages)", 'error')
      useStore.setState({ onboardingDismissed: false })
      return
    }
    setAdding(true)
    try {
      await window.api.accounts.add()
      await loadAll()
      toast('Compte lié ✓', 'success')
    } catch (err) {
      toast(mapAuthError(err), 'error')
    } finally {
      setAdding(false)
    }
  }

  async function setRole(id: string, role: AccountRole): Promise<void> {
    await window.api.accounts.setRole(id, role)
    await loadAccounts()
  }

  async function sync(id: string): Promise<void> {
    setBusyId(id)
    try {
      await window.api.accounts.sync(id)
      await loadAll()
      toast('Compte synchronisé', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de la sync', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function scanDrive(id: string): Promise<void> {
    setBusyId(id)
    try {
      const n = await window.api.accounts.syncFiles(id)
      await loadAll()
      toast(
        n > 0 ? `${n} fichier(s) trouvé(s) sur ce Drive` : 'Contenu du Drive à jour',
        'success'
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec du scan', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function reconnect(id: string): Promise<void> {
    setBusyId(id)
    try {
      await window.api.accounts.reconnect(id)
      await loadAll()
      toast('Compte reconnecté ✓', 'success')
    } catch (err) {
      toast(mapAuthError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string, email: string): Promise<void> {
    if (!window.confirm(`Retirer le compte ${email} ? Les fichiers restent sur Google Drive.`)) return
    setBusyId(id)
    try {
      await window.api.accounts.remove(id)
      await loadAll()
      toast('Compte retiré', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="view-scroll">
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-header-title">Comptes Google Drive</span>
          <span className="muted" style={{ fontSize: 13 }}>
            {accounts.length} lié{accounts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={addAccount} disabled={adding}>
            {adding ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <UserPlus size={15} />}
            {adding ? 'En attente de Google…' : 'Ajouter un compte'}
          </button>
        </div>
      </div>

      <div className="view-pad">
        {adding && (
          <div
            className="card"
            style={{
              marginBottom: 16,
              background: 'var(--accent-dim)',
              borderColor: 'var(--accent)',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 13,
              color: 'var(--accent-light)'
            }}
          >
            <div className="spinner" style={{ width: 14, height: 14 }} />
            Une fenêtre de navigateur s'est ouverte — connecte-toi, autorise l'accès à Drive,
            puis reviens ici. Le compte apparaîtra automatiquement.
          </div>
        )}

        {!settings.googleConfigured && (
          <div
            className="card"
            style={{
              marginBottom: 16,
              borderColor: 'rgba(251,191,36,0.3)',
              background: 'var(--warning-dim)',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 13,
              color: 'var(--warning)'
            }}
          >
            <AlertCircle size={16} />
            Identifiants Google OAuth non configurés (obligatoire pour ajouter un compte).
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => useStore.setState({ onboardingDismissed: false })}
              style={{ marginLeft: 'auto' }}
            >
              <Wand2 size={13} /> Assistant
            </button>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <div className="empty-state-title">Aucun compte lié</div>
            <div className="empty-state-desc">
              {settings.googleConfigured
                ? 'Clique sur « Ajouter un compte ». Ton navigateur s’ouvrira pour choisir le compte Google et autoriser l’accès à Drive ; une page « vous pouvez fermer cet onglet » confirmera.'
                : 'Configure d’abord tes identifiants Google via l’assistant, puis ajoute autant de comptes Drive que tu veux.'}
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 8 }}
              onClick={settings.googleConfigured ? addAccount : () => useStore.setState({ onboardingDismissed: false })}
              disabled={adding}
            >
              {settings.googleConfigured ? (
                <>
                  <UserPlus size={14} /> Ajouter un compte
                </>
              ) : (
                <>
                  <Wand2 size={14} /> Ouvrir l'assistant
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="card-grid">
            {accounts.map((a, i) => (
              <AccountCard
                key={a.id}
                account={a}
                index={i}
                busy={busyId === a.id}
                onRole={setRole}
                onSync={sync}
                onScan={scanDrive}
                onOpenFiles={openAccountFiles}
                onRemove={remove}
                onReconnect={reconnect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountCard({
  account: a,
  index,
  busy,
  onRole,
  onSync,
  onScan,
  onOpenFiles,
  onRemove,
  onReconnect
}: {
  account: Account
  index: number
  busy: boolean
  onRole: (id: string, role: AccountRole) => void
  onSync: (id: string) => void
  onScan: (id: string) => void
  onOpenFiles: (id: string) => void
  onRemove: (id: string, email: string) => void
  onReconnect: (id: string) => void
}): JSX.Element {
  const ratio = a.quotaTotal > 0 ? a.quotaUsed / a.quotaTotal : 0
  const total = a.filesCount ?? 0
  const fromDrive = a.driveFilesCount ?? 0
  return (
    <div className="account-card">
      <div className="account-card-head">
        <div className="account-avatar" style={{ background: accountColor(index) }}>
          {a.email.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="account-email">{a.email}</div>
          <div className="account-meta">Sync {formatRelative(a.lastSync)}</div>
        </div>
        <span className={`status-pill ${a.status}`}>
          {a.status === 'active' ? '✓ actif' : a.status === 'error' ? '✗ erreur' : '⏸ pause'}
        </span>
      </div>

      <div className="col" style={{ gap: 4 }}>
        <div className="spread" style={{ fontSize: 12 }}>
          <span className="muted">
            {formatBytes(a.quotaUsed)} / {formatBytes(a.quotaTotal)}
          </span>
          <button
            className="muted"
            style={{ fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 2 }}
            onClick={() => onOpenFiles(a.id)}
            title="Voir les fichiers de ce compte"
          >
            {total} fichier{total !== 1 ? 's' : ''}
            {fromDrive > 0 ? ` · ${fromDrive} déjà présent${fromDrive !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
        <ProgressBar ratio={ratio} />
      </div>

      {a.status === 'error' && (
        <div
          className="row"
          style={{
            gap: 8,
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--danger, #f87171)',
            background: 'var(--warning-dim)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 8,
            padding: '6px 10px'
          }}
        >
          <AlertCircle size={13} />
          <span style={{ flex: 1 }}>
            Connexion perdue (accès révoqué ou expiré) — les fichiers restent sur Drive.
          </span>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onReconnect(a.id)}
            disabled={busy}
          >
            <PlugZap size={12} /> Reconnecter
          </button>
        </div>
      )}

      <div className="role-toggle">
        <button className={a.role === 'primary' ? 'on' : ''} onClick={() => onRole(a.id, 'primary')}>
          Principal
        </button>
        <button className={a.role === 'backup' ? 'on' : ''} onClick={() => onRole(a.id, 'backup')}>
          Backup
        </button>
      </div>

      <div className="row" style={{ gap: 4 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => onSync(a.id)} disabled={busy}>
          <RefreshCw size={12} /> Sync
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => onScan(a.id)}
          disabled={busy}
          data-tooltip="Lister tout le contenu du Drive"
        >
          <DownloadCloud size={12} /> Scanner
        </button>
        <button
          className="btn btn-sm btn-danger"
          style={{ marginLeft: 'auto' }}
          onClick={() => onRemove(a.id, a.email)}
          disabled={busy}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
