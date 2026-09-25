import { useEffect, useState } from 'react'
import {
  Moon,
  Sun,
  Wand2,
  RefreshCw,
  Power,
  Save,
  Upload,
  FolderOpen,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react'
import { useStore } from '../store'
import GoogleSetup from '../components/GoogleSetup'
import { formatRelative } from '../lib/format'

export default function SettingsView(): JSX.Element {
  const { settings, accounts, lastSyncAt, syncing, setTheme, setLaunchAtStartup, syncQuotas, toast } =
    useStore()
  const [passphrase, setPassphrase] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [transferBusy, setTransferBusy] = useState<'' | 'export' | 'import' | 'reset'>('')
  const [lastBackup, setLastBackup] = useState<{ name: string; at: number } | null>(null)

  useEffect(() => {
    window.api.datatransfer.latestBackup().then(setLastBackup).catch(() => null)
  }, [])

  async function toggleLaunchAtStartup(): Promise<void> {
    try {
      await setLaunchAtStartup(!settings.launchAtStartup)
      toast(
        settings.launchAtStartup
          ? 'Démarrage automatique désactivé'
          : "Démarrage automatique activé — tes comptes seront reconnectés à chaque connexion",
        'success'
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec', 'error')
    }
  }

  async function handleExport(): Promise<void> {
    setTransferBusy('export')
    try {
      const path = await window.api.datatransfer.export(passphrase)
      if (path) {
        toast('Données exportées ✓ — garde cette archive en lieu sûr (comptes Google inclus)', 'success')
        window.api.datatransfer.latestBackup().then(setLastBackup).catch(() => null)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec de l'export", 'error')
    } finally {
      setTransferBusy('')
    }
  }

  async function handleImport(): Promise<void> {
    setTransferBusy('import')
    try {
      await window.api.datatransfer.import(passphrase)
      // Succès -> l'app relance. Si on arrive ici, l'utilisateur a annulé.
    } catch (err) {
      toast(err instanceof Error ? err.message : "Échec de l'import", 'error')
    } finally {
      setTransferBusy('')
    }
  }

  async function handleResetAll(): Promise<void> {
    setTransferBusy('reset')
    try {
      await window.api.datatransfer.resetAll()
      // Succès -> l'app relance vide. Si on arrive ici, l'utilisateur a annulé.
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec', 'error')
    } finally {
      setTransferBusy('')
    }
  }

  function reopenWizard(): void {
    // Réaffiche l'assistant : il apparaît tant qu'il reste des étapes à faire.
    useStore.setState({ onboardingDismissed: false })
  }

  return (
    <div className="view-scroll">
      <div className="page-header">
        <span className="page-header-title">Réglages</span>
      </div>

      <div className="view-pad col" style={{ gap: 24, maxWidth: 660 }}>
        {/* Assistant */}
        <div className="card col" style={{ gap: 12 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Prise en main
          </span>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            L'assistant te guide pas à pas : identifiants Google, ajout d'un compte, rôles.
          </p>
          <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={reopenWizard}>
            <Wand2 size={14} /> Ouvrir l'assistant de configuration
          </button>
        </div>

        {/* Thème */}
        <div className="card col" style={{ gap: 12 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Apparence
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={`btn ${settings.theme !== 'light' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={14} /> Sombre
            </button>
            <button
              className={`btn ${settings.theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={14} /> Clair
            </button>
          </div>
        </div>

        {/* Synchronisation */}
        <div className="card col" style={{ gap: 12 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Synchronisation
          </span>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Les quotas et les fichiers de chaque compte sont rafraîchis automatiquement au
            démarrage, toutes les 2 minutes, et au retour sur la fenêtre. Dernière synchro :{' '}
            <b>{accounts.length ? formatRelative(lastSyncAt) : 'aucun compte'}</b>.
          </p>
          <button
            className="btn btn-secondary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => syncQuotas()}
            disabled={syncing || accounts.length === 0}
          >
            <RefreshCw size={14} style={syncing ? { animation: 'spin 0.7s linear infinite' } : undefined} />
            Synchroniser maintenant
          </button>
        </div>

        {/* Démarrage */}
        <div className="card col" style={{ gap: 12 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Démarrage
          </span>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Tes comptes Google sont automatiquement reconnectés à chaque ouverture de l'app —
            ça évite qu'un compte peu utilisé finisse par expirer. Active cette option pour que
            l'app démarre aussi (réduite dans la barre système) à la connexion à ton PC, sans
            action de ta part.
          </p>
          <label className="row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="checkbox"
              checked={!!settings.launchAtStartup}
              onChange={toggleLaunchAtStartup}
            />
            <Power size={14} />
            Lancer au démarrage du PC
          </label>
        </div>

        {/* Google OAuth */}
        <div className="card col" style={{ gap: 12 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Identifiants Google OAuth
          </span>
          <GoogleSetup />
        </div>

        {/* Sauvegarde & transfert */}
        <div className="card col" style={{ gap: 12 }}>
          <span className="section-label" style={{ marginBottom: 0 }}>
            Sauvegarde &amp; transfert vers un autre PC
          </span>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Exporte une archive contenant tes comptes liés, fichiers, dossiers et planifications,
            pour la restaurer sur un autre ordinateur. Une passphrase protège tes comptes Google
            dans l'archive — retiens-la, elle sera redemandée à l'import.
            {lastBackup && (
              <>
                {' '}Dernière sauvegarde : <b>{formatRelative(lastBackup.at)}</b>.
              </>
            )}
          </p>
          <div className="field">
            <label className="field-label">Passphrase de l'archive</label>
            <div style={{ position: 'relative' }}>
              <input
                className="field-input"
                type={showPass ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Choisis une passphrase (export) ou retape-la (import)"
                style={{ paddingRight: 40 }}
              />
              <button
                className="icon-btn"
                onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExport}
              disabled={transferBusy !== '' || passphrase.length < 4}
            >
              {transferBusy === 'export' ? (
                <span className="spinner" style={{ width: 13, height: 13 }} />
              ) : (
                <Save size={13} />
              )}
              Exporter (.zip)
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleImport}
              disabled={transferBusy !== '' || passphrase.length < 4}
            >
              {transferBusy === 'import' ? (
                <span className="spinner" style={{ width: 13, height: 13 }} />
              ) : (
                <Upload size={13} />
              )}
              Importer une sauvegarde
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => window.api.datatransfer.openBackupsFolder()}
            >
              <FolderOpen size={13} /> Dossier
            </button>
          </div>
        </div>

        {/* Zone dangereuse */}
        <div className="card col" style={{ gap: 12, borderColor: 'rgba(248,113,113,0.2)' }}>
          <span className="section-label" style={{ marginBottom: 0, color: 'var(--danger)' }}>
            Zone dangereuse
          </span>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Supprime définitivement tous les comptes liés (révoqués côté Google), fichiers,
            dossiers et réglages sur cet ordinateur. Les fichiers restent sur Google Drive — seule
            la liaison locale disparaît. Exporte une sauvegarde avant si tu comptes réinstaller sur
            un autre PC.
          </p>
          <button
            className="btn btn-sm"
            onClick={handleResetAll}
            disabled={transferBusy !== ''}
            style={{
              alignSelf: 'flex-start',
              background: 'var(--danger-dim)',
              color: 'var(--danger)',
              border: '1px solid rgba(248,113,113,0.2)'
            }}
          >
            {transferBusy === 'reset' ? (
              <span className="spinner" style={{ width: 13, height: 13 }} />
            ) : (
              <Trash2 size={13} />
            )}
            Supprimer toutes mes données
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>
          Drive Studio · 100 % local · aucun serveur cloud.
        </p>
      </div>
    </div>
  )
}
