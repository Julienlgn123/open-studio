import { useState } from 'react'
import { Check, ExternalLink, KeyRound, Trash2 } from 'lucide-react'
import { useStore } from '../store'

const LINKS = {
  project: 'https://console.cloud.google.com/projectcreate',
  driveApi: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
  consent: 'https://console.cloud.google.com/auth/overview',
  audience: 'https://console.cloud.google.com/auth/audience',
  credentials: 'https://console.cloud.google.com/apis/credentials'
}

function Step({
  n,
  title,
  children
}: {
  n: number
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--accent-dim)',
          color: 'var(--accent-light)',
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {n}
      </span>
      <div className="col" style={{ gap: 6, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        <div className="col" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function LinkBtn({ url, label }: { url: string; label: string }): JSX.Element {
  return (
    <button
      className="btn btn-sm btn-secondary"
      style={{ alignSelf: 'flex-start' }}
      onClick={() => window.api.shell.openExternal(url)}
    >
      {label} <ExternalLink size={12} />
    </button>
  )
}

/**
 * Formulaire + instructions pour configurer les identifiants Google OAuth.
 * Réutilisé dans l'assistant de configuration et dans les Réglages.
 */
export default function GoogleSetup({ onSaved }: { onSaved?: () => void }): JSX.Element {
  const { settings, loadSettings, loadAll, toast } = useStore()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast('Renseigne le Client ID et le Client Secret', 'error')
      return
    }
    setBusy(true)
    try {
      await window.api.settings.setGoogle(clientId.trim(), clientSecret.trim())
      setClientId('')
      setClientSecret('')
      await Promise.all([loadSettings(), loadAll()])
      toast('Identifiants Google enregistrés (chiffrés sur ta machine)', 'success')
      onSaved?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function clear(): Promise<void> {
    await window.api.settings.clearGoogle()
    await loadSettings()
    toast('Identifiants supprimés', 'success')
  }

  if (settings.googleConfigured) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <div
          className="row"
          style={{
            gap: 8,
            padding: '10px 12px',
            background: 'var(--success-dim)',
            border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            color: 'var(--success)'
          }}
        >
          <Check size={15} /> Identifiants Google enregistrés et chiffrés localement.
        </div>
        <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={clear}>
          <Trash2 size={14} /> Supprimer les identifiants
        </button>
      </div>
    )
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        L'app se connecte à Google avec <b>tes propres</b> identifiants (gratuits). Ils sont
        stockés chiffrés sur ta machine et ne sont jamais envoyés ailleurs. À faire une seule
        fois, ~5 minutes :
      </p>

      <div className="col" style={{ gap: 16 }}>
        <Step n={1} title="Créer un projet Google Cloud">
          Connecte-toi avec n'importe lequel de tes comptes Google, donne un nom au projet
          (ex. « Drive Backup »), puis « Créer ».
          <LinkBtn url={LINKS.project} label="Ouvrir la création de projet" />
        </Step>

        <Step n={2} title="Activer l'API Google Drive">
          Sur la page qui s'ouvre, clique sur « Activer ». Vérifie en haut que le bon projet
          est sélectionné.
          <LinkBtn url={LINKS.driveApi} label="Ouvrir Google Drive API" />
        </Step>

        <Step n={3} title="Configurer l'écran de consentement">
          Type « Externe ». Renseigne un nom d'app et ton e-mail de contact.
          <LinkBtn url={LINKS.consent} label="Ouvrir l'écran de consentement" />
        </Step>

        <Step n={4} title="Ajouter les comptes en « utilisateurs de test »">
          <b>Étape indispensable.</b> Dans « Audience », section <b>Utilisateurs de test</b> →
          « + Add users » : ajoute <b>chaque adresse Google</b> que tu veux relier à l'app.
          Sans ça, Google bloque la connexion (erreur 403 access_denied).
          <LinkBtn url={LINKS.audience} label="Ouvrir la page Audience" />
        </Step>

        <Step n={5} title="Créer les identifiants OAuth">
          « + Créer des identifiants » → « ID client OAuth » → type <b>Application de bureau</b>.
          Aucune URL de redirection à saisir. Copie le <b>Client ID</b> et le{' '}
          <b>Client Secret</b> affichés.
          <LinkBtn url={LINKS.credentials} label="Ouvrir les identifiants" />
        </Step>
      </div>

      <div className="field">
        <label className="field-label">Client ID</label>
        <input
          className="field-input mono"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="1234-abcd.apps.googleusercontent.com"
        />
      </div>
      <div className="field">
        <label className="field-label">Client Secret</label>
        <input
          className="field-input mono"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="GOCSPX-…"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={save} disabled={busy}>
        <KeyRound size={14} /> Enregistrer les identifiants
      </button>
    </div>
  )
}
