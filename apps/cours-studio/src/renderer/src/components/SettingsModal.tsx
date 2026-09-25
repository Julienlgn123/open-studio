import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Download, RefreshCw, CheckCircle, Sun, Moon, Upload, FolderOpen, Save, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Props {
  onClose: () => void
}

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export default function SettingsModal({ onClose }: Props) {
  const { settings, saveSettings, showToast, startTour } = useStore()
  const [apiKey, setApiKey] = useState(settings.mistralApiKey ?? '')
  const [model, setModel] = useState(settings.mistralModel ?? 'open-mistral-7b')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const [appVersion, setAppVersion] = useState<string>('')
  const [backupBusy, setBackupBusy] = useState<'' | 'export' | 'import' | 'reset'>('')
  const [lastBackup, setLastBackup] = useState<{ name: string; at: number } | null>(null)

  useEscapeToClose(onClose)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateVersion, setUpdateVersion] = useState<string>('')
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateError, setUpdateError] = useState('')

  useEffect(() => {
    api.app.version().then(setAppVersion).catch(() => setAppVersion('dev'))
    api.backup.latest().then(setLastBackup).catch(() => setLastBackup(null))

    const cleanups = [
      api.app.onUpdateAvailable(({ version }: { version: string }) => {
        setUpdateVersion(version)
        setUpdateState('available')
      }),
      api.app.onUpdateNotAvailable(() => setUpdateState('not-available')),
      api.app.onUpdateProgress((pct: number) => { setUpdateProgress(pct); setUpdateState('downloading') }),
      api.app.onUpdateDownloaded(() => setUpdateState('downloaded')),
      api.app.onUpdateError((err: string) => { setUpdateError(err); setUpdateState('error') })
    ]
    return () => cleanups.forEach((c) => c())
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await saveSettings({ ...settings, mistralApiKey: apiKey.trim(), mistralModel: model })
      showToast('Paramètres sauvegardés', 'success')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleExportBackup() {
    setBackupBusy('export')
    try {
      const path = await api.backup.export()
      if (path) {
        showToast('Sauvegarde exportée', 'success')
        api.backup.latest().then(setLastBackup).catch(() => {})
      }
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBackupBusy('')
    }
  }

  async function handleImportBackup() {
    setBackupBusy('import')
    try {
      await api.backup.import()
      // On success the app relaunches; if we get here the user cancelled
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBackupBusy('')
    }
  }

  async function handleResetAll() {
    setBackupBusy('reset')
    try {
      await api.backup.resetAll()
      // Succès -> l'app relance vide. Si on arrive ici, l'utilisateur a annulé.
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBackupBusy('')
    }
  }

  function checkUpdate() {
    setUpdateState('checking')
    setUpdateError('')
    api.app.checkUpdate()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
        <div className="modal-header">
          <span className="modal-title">Paramètres</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Clé API Mistral</label>
            <div style={{ position: 'relative' }}>
              <input
                className="field-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{ paddingRight: 40 }}
              />
              <button
                className="icon-btn"
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Obtiens ta clé sur <span style={{ color: 'var(--accent)' }}>console.mistral.ai</span>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Modèle Mistral</label>
            <select className="field-input" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="open-mistral-7b">open-mistral-7b (gratuit)</option>
              <option value="open-mixtral-8x7b">open-mixtral-8x7b (gratuit)</option>
              <option value="mistral-small-latest">mistral-small-latest (payant)</option>
              <option value="mistral-medium-latest">mistral-medium-latest (payant)</option>
              <option value="mistral-large-latest">mistral-large-latest (payant)</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label">Apparence</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-sm"
                onClick={() => saveSettings({ ...settings, theme: 'dark' })}
                style={{ flex: 1, justifyContent: 'center', background: (settings.theme ?? 'dark') === 'dark' ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: (settings.theme ?? 'dark') === 'dark' ? 'var(--accent-light)' : 'var(--text-secondary)' }}
              >
                <Moon size={13} /> Sombre
              </button>
              <button
                className="btn btn-sm"
                onClick={() => saveSettings({ ...settings, theme: 'light' })}
                style={{ flex: 1, justifyContent: 'center', background: settings.theme === 'light' ? 'var(--accent-dim)' : 'var(--bg-overlay)', color: settings.theme === 'light' ? 'var(--accent-light)' : 'var(--text-secondary)' }}
              >
                <Sun size={13} /> Clair
              </button>
            </div>
          </div>

          {/* Help section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Aide</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              La visite guidée qui explique les boutons de l'app.
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { onClose(); startTour('main') }}>
              Revoir la visite guidée
            </button>
          </div>

          {/* Backup section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Sauvegarde</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Tes cours, médias et réglages sont sur cet ordinateur uniquement. Exporte une archive régulièrement.
              {lastBackup && (
                <> Dernière copie&nbsp;: <strong>{format(new Date(lastBackup.at), 'dd MMM à HH:mm', { locale: fr })}</strong>.</>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleExportBackup} disabled={backupBusy !== ''}>
                {backupBusy === 'export' ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Save size={13} />}
                Exporter (.zip)
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleImportBackup} disabled={backupBusy !== ''}>
                {backupBusy === 'import' ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Upload size={13} />}
                Restaurer
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => api.backup.openFolder()}>
                <FolderOpen size={13} /> Dossier
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>Sauvegarde automatique</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                {settings.autoBackupFolder
                  ? <>Une copie est écrite ici à chaque lancement : <strong style={{ wordBreak: 'break-all' }}>{settings.autoBackupFolder}</strong>. Pointe ce dossier vers ton client Google Drive/Dropbox/OneDrive pour une sauvegarde cloud automatique.</>
                  : "Choisis un dossier synchronisé par Google Drive, Dropbox... et une copie y sera écrite à chaque lancement."}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={async () => {
                  const folder = await api.backup.chooseAutoFolder()
                  if (folder) { await saveSettings({ ...settings, autoBackupFolder: folder }); showToast('Sauvegarde automatique activée', 'success') }
                }}>
                  <FolderOpen size={13} /> {settings.autoBackupFolder ? 'Changer le dossier' : 'Choisir un dossier'}
                </button>
                {settings.autoBackupFolder && (
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    await saveSettings({ ...settings, autoBackupFolder: undefined })
                    showToast('Sauvegarde automatique désactivée', 'info')
                  }}>
                    Désactiver
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Update section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Mise à jour</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Version actuelle : <strong>{appVersion || '—'}</strong>
                </div>
              </div>

              {(updateState === 'idle' || updateState === 'not-available' || updateState === 'error') && (
                <button className="btn btn-secondary btn-sm" onClick={checkUpdate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={13} />
                  Vérifier
                </button>
              )}
            </div>

            {updateState === 'checking' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 12, height: 12 }} /> Vérification en cours...
              </div>
            )}

            {updateState === 'not-available' && (
              <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={13} /> L'application est à jour.
              </div>
            )}

            {updateState === 'available' && (
              <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-light)' }}>Mise à jour disponible</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Version {updateVersion} est disponible</div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (api?.platform === 'darwin') { api.app.openReleases(); return }
                    api.app.downloadUpdate(); setUpdateState('downloading')
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                >
                  <Download size={13} /> Télécharger
                </button>
              </div>
            )}

            {updateState === 'downloading' && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Téléchargement... {updateProgress}%
                </div>
                <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${updateProgress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {updateState === 'downloaded' && (
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>Prêt à installer</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>L'app va redémarrer pour installer la mise à jour</div>
                </div>
                <button className="btn btn-sm" onClick={() => api.app.installUpdate()} style={{ background: 'var(--success)', color: '#fff', flexShrink: 0 }}>
                  Installer et relancer
                </button>
              </div>
            )}

            {updateState === 'error' && (
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                Erreur : {updateError || 'Impossible de vérifier les mises à jour.'}
              </div>
            )}
          </div>

          {/* Zone dangereuse */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, color: 'var(--danger)' }}>
              Zone dangereuse
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Supprime définitivement tous tes cours, médias et réglages sur cet ordinateur.
              Exporte une sauvegarde avant si tu comptes réinstaller sur un autre PC.
            </div>
            <button
              className="btn btn-sm"
              onClick={handleResetAll}
              disabled={backupBusy !== ''}
              style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              {backupBusy === 'reset' ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Trash2 size={13} />}
              Supprimer toutes mes données
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  )
}
