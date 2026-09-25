import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Check, UserPlus, ArrowRight, ShieldCheck, HardDriveDownload } from 'lucide-react'
import { useStore } from '../store'
import GoogleSetup from './GoogleSetup'
import { mapAuthError } from '../lib/authErrors'

/**
 * Assistant de première configuration. S'affiche tant qu'aucun compte n'est lié.
 * 3 étapes : identifiants Google → premier compte → rôles.
 */
export default function Onboarding(): JSX.Element {
  const { settings, accounts, dismissOnboarding, loadAll, setView, toast } = useStore()
  const [step, setStep] = useState(settings.googleConfigured ? 1 : 0)
  const [adding, setAdding] = useState(false)

  // Avance automatiquement quand une étape est satisfaite.
  useEffect(() => {
    if (step === 0 && settings.googleConfigured) setStep(1)
    if (step === 1 && accounts.length > 0) setStep(2)
  }, [settings.googleConfigured, accounts.length, step])

  async function addAccount(): Promise<void> {
    setAdding(true)
    try {
      await window.api.accounts.add()
      await loadAll()
      toast('Compte lié', 'success')
    } catch (err) {
      toast(mapAuthError(err), 'error')
    } finally {
      setAdding(false)
    }
  }

  function finish(): void {
    dismissOnboarding()
    setView('accounts')
  }

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', overflowY: 'auto', padding: '48px 16px' }}>
      <motion.div
        className="modal"
        style={{ maxWidth: 620 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="modal-header">
          <span className="modal-title">Configuration · étape {step + 1} / 3</span>
          <button className="icon-btn" onClick={dismissOnboarding} data-tooltip="Fermer l'assistant">
            <X size={16} />
          </button>
        </div>

        {/* progress dots */}
        <div className="row" style={{ gap: 6, marginBottom: 18 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 'var(--radius-full)',
                background: i <= step ? 'var(--accent)' : 'var(--bg-overlay)'
              }}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="col" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 8, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
              <ShieldCheck size={18} style={{ color: 'var(--accent-light)' }} /> Connecter l'app à Google
            </div>
            <GoogleSetup onSaved={() => setStep(1)} />
          </div>
        )}

        {step === 1 && (
          <div className="col" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 8, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
              <UserPlus size={18} style={{ color: 'var(--accent-light)' }} /> Ajouter ton premier compte Drive
            </div>
            <div className="col" style={{ gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div
                className="row"
                style={{
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '9px 11px',
                  background: 'var(--warning-dim)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--warning)'
                }}
              >
                <span>⚠️</span>
                <span>
                  <b>Avant de cliquer</b> : chaque adresse Google que tu veux relier doit être
                  ajoutée en <b>« utilisateur de test »</b> dans l'écran de consentement OAuth.
                  Sinon Google renvoie « Accès bloqué · erreur 403 ».
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginTop: 6 }}
                    onClick={() =>
                      window.api.shell.openExternal('https://console.cloud.google.com/auth/audience')
                    }
                  >
                    Ouvrir la page « Audience » <ArrowRight size={12} />
                  </button>
                </span>
              </div>
              <p>Ensuite, quand tu cliques sur le bouton :</p>
              <ol style={{ paddingLeft: 18 }}>
                <li>Ton navigateur s'ouvre sur la connexion Google.</li>
                <li>Choisis le compte (celui déclaré comme testeur) et accepte l'accès à Drive.</li>
                <li>
                  Message « Google n'a pas validé cette application » → « Paramètres avancés » →
                  « Accéder à … » : c'est ton propre projet en mode test.
                </li>
                <li>
                  Une page « <b>Compte Google lié — vous pouvez fermer cet onglet</b> » s'affiche
                  (adresse <span className="mono">127.0.0.1</span>, normal et local).
                </li>
                <li>Reviens ici : le compte apparaît automatiquement.</li>
              </ol>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={addAccount} disabled={adding}>
              {adding ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} /> En attente de l'autorisation…
                </>
              ) : (
                <>
                  <UserPlus size={15} /> Ajouter un compte Google
                </>
              )}
            </button>
            {adding && (
              <p className="muted" style={{ fontSize: 12 }}>
                Termine l'autorisation dans le navigateur puis reviens. Tu peux annuler en
                fermant l'onglet.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="col" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 8, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
              <Check size={18} style={{ color: 'var(--success)' }} /> {accounts.length} compte
              {accounts.length > 1 ? 's' : ''} lié{accounts.length > 1 ? 's' : ''}
            </div>
            <div className="col" style={{ gap: 10, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <p>Attribue un rôle à chaque compte (modifiable à tout moment dans Comptes) :</p>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <HardDriveDownload size={15} style={{ color: 'var(--accent-light)', flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>Principal</b> — reçoit tes uploads. L'app envoie chaque fichier sur le
                  principal ayant le plus d'espace libre.
                </span>
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <ShieldCheck size={15} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                <span>
                  <b>Backup</b> — sert de copie de sécurité. Les backups (manuels ou planifiés)
                  répliquent les fichiers des principaux vers les comptes backup.
                </span>
              </div>
              <p className="muted">
                Avec un seul compte, garde-le en « Principal » — tu pourras ajouter des comptes
                backup plus tard.
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary" onClick={addAccount} disabled={adding}>
                <UserPlus size={14} /> Ajouter un autre compte
              </button>
              <button className="btn btn-primary" onClick={finish}>
                Terminer <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
