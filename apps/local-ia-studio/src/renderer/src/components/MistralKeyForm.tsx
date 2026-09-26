import { useState } from 'react'
import { CircleCheck, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useChatStore } from '../store/chatStore'

/** Saisie / vérification / suppression de la clé Mistral (la clé part au main process, jamais stockée côté page). */
export default function MistralKeyForm({ onSaved }: { onSaved?: () => void }): JSX.Element {
  const mistral = useChatStore((s) => s.mistral)
  const refreshMistral = useChatStore((s) => s.refreshMistral)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    if (!key.trim()) return
    setBusy(true)
    setError(null)
    try {
      await window.api.mistral.setKey(key)
      setKey('')
      await refreshMistral()
      onSaved?.()
    } catch (err) {
      // Les erreurs IPC arrivent préfixées « Error invoking remote method … : Error: ».
      setError((err instanceof Error ? err.message : String(err)).replace(/^.*?Error: /, ''))
    } finally {
      setBusy(false)
    }
  }

  if (mistral?.configured) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
        <span className="flex items-center gap-2 text-[13px] text-emerald-400">
          <CircleCheck size={15} />
          Clé Mistral enregistrée{mistral.encrypted ? ' · chiffrée sur cet appareil' : ''}
        </span>
        <button
          onClick={async () => {
            await window.api.mistral.clearKey()
            await refreshMistral()
          }}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-base-300 hover:bg-base-100/[0.06] hover:text-red-400"
        >
          Supprimer
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-base-800 bg-base-900 px-3 focus-within:border-accent-500">
          <KeyRound size={14} className="shrink-0 text-base-500" />
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="Colle ta clé API Mistral"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-[9px] font-mono text-[13px] text-base-100 outline-none placeholder:font-sans placeholder:text-base-600"
          />
          <button onClick={() => setShow((v) => !v)} className="shrink-0 text-base-500 hover:text-base-200" title={show ? 'Masquer' : 'Afficher'}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button
          onClick={save}
          disabled={!key.trim() || busy}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-accent-500 px-3.5 py-[7px] text-[13.5px] font-medium text-white enabled:hover:bg-accent-400 disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Vérifier et enregistrer
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="flex items-start gap-1.5 text-xs leading-5 text-base-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        <span>
          Clé gratuite sur{' '}
          <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">
            console.mistral.ai
          </a>{' '}
          (offre « Experiment »). Elle est chiffrée sur ton appareil et n’est envoyée qu’à Mistral.
        </span>
      </p>
    </div>
  )
}
