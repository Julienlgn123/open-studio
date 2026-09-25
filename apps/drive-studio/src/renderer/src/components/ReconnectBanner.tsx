import { useState } from 'react'
import { AlertCircle, PlugZap, X } from 'lucide-react'
import { useStore } from '../store'
import { mapAuthError } from '../lib/authErrors'

/**
 * Bandeau persistant (indépendant de la vue active) listant les comptes en
 * statut 'error' — typiquement un refresh_token révoqué/expiré côté Google,
 * détecté soit au lancement soit lors du refresh périodique (voir
 * main/scheduler.ts). Contrairement au toast affiché une fois lors de
 * l'événement 'accounts:tokensRefreshed', ce bandeau reste visible tant que
 * le problème n'est pas résolu (ou masqué manuellement pour la session).
 */
export default function ReconnectBanner(): JSX.Element | null {
  const { accounts, loadAll, toast } = useStore()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const errored = accounts.filter((a) => a.status === 'error' && !dismissed.has(a.id))
  if (errored.length === 0) return null

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

  function dismiss(): void {
    // Masqué pour la session en cours uniquement : réapparaît au prochain
    // lancement de l'app si le compte n'a toujours pas été reconnecté.
    setDismissed((prev) => {
      const next = new Set(prev)
      for (const a of errored) next.add(a.id)
      return next
    })
  }

  return (
    <div className="reconnect-banner">
      <AlertCircle size={15} />
      <span className="reconnect-banner-text">
        {errored.length === 1
          ? `${errored[0].email} a perdu la connexion à Google — les sauvegardes le concernant sont en pause.`
          : `${errored.length} comptes ont perdu la connexion à Google (${errored
              .map((a) => a.email)
              .join(', ')}) — les sauvegardes les concernant sont en pause.`}
      </span>
      <div className="reconnect-banner-actions">
        {errored.map((a) => (
          <button
            key={a.id}
            className="btn btn-sm btn-primary"
            onClick={() => reconnect(a.id)}
            disabled={busyId === a.id}
            title={`Reconnecter ${a.email}`}
          >
            <PlugZap size={12} />
            {errored.length > 1 ? a.email : 'Reconnecter'}
          </button>
        ))}
        <button className="icon-btn" onClick={dismiss} title="Masquer pour cette session">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
