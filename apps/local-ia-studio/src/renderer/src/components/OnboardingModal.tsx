import { useEffect, useState } from 'react'
import { Cpu, Lock, Sparkles, Wand2 } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import LogoMark from './LogoMark'
import MistralKeyForm from './MistralKeyForm'

function Point({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }): JSX.Element {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-500/15 text-accent-400">
        {icon}
      </span>
      <div>
        <p className="text-[13.5px] font-medium text-base-100">{title}</p>
        <p className="text-xs leading-5 text-base-400">{text}</p>
      </div>
    </div>
  )
}

/** Premier lancement : présentation + clé Mistral facultative (IA utilisable tout de suite + conseiller). */
export default function OnboardingModal(): JSX.Element | null {
  const loaded = useChatStore((s) => s.preferencesLoaded)
  const preferences = useChatStore((s) => s.preferences)
  const mistral = useChatStore((s) => s.mistral)
  const savePreferences = useChatStore((s) => s.savePreferences)
  const [name, setName] = useState('')

  useEffect(() => {
    if (loaded) setName(preferences.userName)
  }, [loaded])

  if (!loaded || preferences.onboardingDone) return null

  const finish = (): Promise<void> =>
    savePreferences({ ...preferences, userName: name.trim() || preferences.userName, onboardingDone: true })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div className="animate-fade-up flex max-h-full w-[34rem] max-w-full flex-col overflow-hidden rounded-[20px] border border-base-700 bg-base-850 shadow-panel">
        <div className="flex-1 space-y-6 overflow-y-auto p-7">
          <div className="flex flex-col items-center gap-3 text-center">
            <LogoMark size={52} />
            <div>
              <h2 className="text-[22px] font-bold text-base-100">Bienvenue dans Local IA Studio</h2>
              <p className="mt-1 text-sm text-base-300">Des IA qui tournent sur ta machine, sans abonnement.</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <Point icon={<Lock size={15} />} title="Privé par défaut" text="Avec Ollama ou un modèle GGUF, tes conversations ne quittent jamais ton ordinateur." />
            <Point icon={<Cpu size={15} />} title="Adapté à ton matériel" text="L’app détecte ton processeur, ta RAM et ta carte graphique." />
            <Point
              icon={<Wand2 size={15} />}
              title="Un conseiller pour choisir"
              text="Décris ce que tu veux faire : Mistral te dit quel modèle sera le plus rapide et le plus efficace sur ta machine."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.06em] text-base-300">Ton prénom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Julien"
              className="w-full rounded-[10px] border border-base-800 bg-base-900 px-3 py-[9px] text-sm text-base-100 outline-none placeholder:text-base-600 focus:border-accent-500"
            />
          </div>

          <div className="space-y-2.5 rounded-2xl border border-base-700 bg-base-900 p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-accent-400" />
              <p className="text-[13.5px] font-semibold text-base-100">Une IA prête tout de suite</p>
              <span className="rounded-full bg-base-800 px-2 py-0.5 text-[11px] text-base-400">facultatif</span>
            </div>
            <p className="text-xs leading-5 text-base-400">
              Avec une clé Mistral gratuite, tu peux discuter immédiatement (en attendant d’installer un modèle local) et
              utiliser le conseiller de modèles. Seuls les messages envoyés à Mistral passent par leurs serveurs.
            </p>
            <MistralKeyForm />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-base-800 px-7 py-4">
          <p className="text-xs text-base-500">Modifiable plus tard dans Préférences.</p>
          <button
            onClick={finish}
            className="rounded-[10px] bg-accent-500 px-4 py-[7px] text-[13.5px] font-medium text-white hover:bg-accent-400"
          >
            {mistral?.configured ? 'Commencer' : 'Continuer sans clé'}
          </button>
        </div>
      </div>
    </div>
  )
}
