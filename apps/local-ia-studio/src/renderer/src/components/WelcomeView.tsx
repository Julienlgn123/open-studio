import { useState } from 'react'
import { Code2, Download, FileText, GraduationCap, HardDrive, Lightbulb, Loader2, PenLine, Rocket, Wand2 } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import Composer from './Composer'
import ModelPicker from './ModelPicker'
import LogoMark from './LogoMark'
import AdviceCard from './AdviceCard'
import type { ModelAdvice } from '@shared/types'

const SUGGESTIONS = [
  { icon: PenLine, label: 'Écrire', prompt: 'Aide-moi à rédiger ' },
  { icon: GraduationCap, label: 'Apprendre', prompt: 'Explique-moi simplement ' },
  { icon: Code2, label: 'Code', prompt: 'Écris un programme qui ' },
  { icon: FileText, label: 'Résumer', prompt: 'Résume ce texte en quelques points clés :\n\n' },
  { icon: Lightbulb, label: 'Idées', prompt: 'Donne-moi 10 idées pour ' }
]

function greeting(): string {
  const h = new Date().getHours()
  return h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour'
}

function SetupCard({
  icon,
  title,
  text,
  onClick
}: {
  icon: React.ReactNode
  title: string
  text: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-start gap-2 rounded-2xl border border-base-800 bg-base-900 p-4 text-left transition hover:border-base-700 hover:bg-base-850"
    >
      <span className="text-accent-400">{icon}</span>
      <span className="text-[13px] font-medium text-base-100">{title}</span>
      <span className="text-xs leading-5 text-base-400">{text}</span>
    </button>
  )
}

export default function WelcomeView(): JSX.Element {
  const userName = useChatStore((s) => s.preferences.userName)
  const ollamaModels = useChatStore((s) => s.ollamaModels)
  const llamaModels = useChatStore((s) => s.llamaModels)
  const engineStatus = useChatStore((s) => s.engineStatus)
  const mistral = useChatStore((s) => s.mistral)
  const mistralModels = useChatStore((s) => s.mistralModels)
  // draftModel() renvoie un nouvel objet : on s'abonne à ses dépendances et on le calcule au rendu.
  useChatStore((s) => s.draft)
  useChatStore((s) => s.preferences)
  const target = useChatStore.getState().draftModel()
  const setDraftModel = useChatStore((s) => s.setDraftModel)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const setModelManagerOpen = useChatStore((s) => s.setModelManagerOpen)
  const setPreferencesOpen = useChatStore((s) => s.setPreferencesOpen)
  const requestPull = useChatStore((s) => s.requestPull)
  const draftFileAccess = useChatStore((s) => s.draftFileAccess)
  const setDraftFileAccess = useChatStore((s) => s.setDraftFileAccess)
  const workspaceRoots = useChatStore((s) => s.preferences.workspaceRoots)
  const [prefill, setPrefill] = useState<{ text: string; n: number } | undefined>()
  const [advice, setAdvice] = useState<ModelAdvice | null>(null)
  const [adviceError, setAdviceError] = useState<string | null>(null)
  const [advising, setAdvising] = useState(false)

  const noLocalModel = ollamaModels.length === 0 && llamaModels.length === 0

  const askAdvice = async (task: string): Promise<void> => {
    if (!mistral?.configured) {
      setPreferencesOpen(true)
      return
    }
    setAdvising(true)
    setAdviceError(null)
    setAdvice(null)
    try {
      setAdvice(await window.api.advisor.recommend(task))
    } catch (err) {
      setAdviceError((err instanceof Error ? err.message : String(err)).replace(/^.*?Error: /, ''))
    } finally {
      setAdvising(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="m-auto w-full max-w-[720px] px-6 py-10">
        <div className="animate-fade-up mb-7 flex flex-col items-center gap-3 text-center">
          <LogoMark size={44} />
          <div>
            <h1 className="mb-1 text-[26px] font-bold text-base-100">
              {greeting()}
              {userName ? ` ${userName}` : ''} 👋
            </h1>
            <p className="text-sm text-base-300">Tes modèles IA, 100 % en local. Que veux-tu faire ?</p>
          </div>
        </div>

        <Composer
          variant="hero"
          disabled={!target}
          isStreaming={false}
          engine={target?.engine ?? null}
          prefill={prefill}
          placeholder="Comment puis-je t’aider aujourd’hui ?"
          onSend={(text, attachments) => sendMessage(text, attachments)}
          onStop={() => {}}
          fileAccess={{
            on: draftFileAccess,
            configured: workspaceRoots.length > 0,
            onToggle: () => (workspaceRoots.length ? setDraftFileAccess(!draftFileAccess) : setPreferencesOpen(true))
          }}
          extraAction={{
            label: advising ? 'Analyse…' : 'Conseil',
            icon: advising ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />,
            title: mistral?.configured
              ? 'Quel modèle utiliser pour ce message ? (analyse ton matériel et tes modèles)'
              : 'Ajoute une clé Mistral pour obtenir un conseil de modèle',
            busy: advising,
            onClick: askAdvice
          }}
          toolbar={
            <ModelPicker
              variant="ghost"
              placement="up"
              engine={target?.engine ?? null}
              model={target?.model ?? null}
              onChange={setDraftModel}
            />
          }
        />

        {(advice || adviceError) && (
          <div className="mt-3">
            {adviceError ? (
              <p className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">{adviceError}</p>
            ) : (
              advice && (
                <AdviceCard
                  advice={advice}
                  mistralModel={mistral?.configured ? (mistralModels[0]?.id ?? 'mistral-small-latest') : null}
                  onUse={(engine, model) => {
                    setDraftModel(engine, model)
                    setAdvice(null)
                  }}
                  onDownload={(name) => requestPull(name)}
                  onClose={() => setAdvice(null)}
                />
              )
            )}
          </div>
        )}

        {!advice && noLocalModel && (
          <div className="animate-fade-up mt-4 space-y-3">
            <p className="text-center text-sm text-base-400">
              {mistral?.configured
                ? 'Tu peux déjà discuter avec Mistral (cloud). Pour une IA 100 % locale, installe un modèle :'
                : 'Pour commencer, installe un modèle — tout reste sur ta machine.'}
            </p>
            <div className="flex gap-3">
              {!engineStatus?.ollama.available && (
                <SetupCard
                  icon={<Rocket size={18} />}
                  title="Installer Ollama"
                  text="Le moteur le plus simple, en un clic. Des centaines de modèles disponibles."
                  onClick={() => setModelManagerOpen(true)}
                />
              )}
              {engineStatus?.ollama.available && (
                <SetupCard
                  icon={<Download size={18} />}
                  title="Télécharger via Ollama"
                  text="llama3.2, qwen2.5, mistral, gemma… en un clic."
                  onClick={() => setModelManagerOpen(true)}
                />
              )}
              <SetupCard
                icon={<HardDrive size={18} />}
                title="Modèle GGUF (Hugging Face)"
                text="Sans rien installer : télécharge un fichier .gguf et discute avec, même hors-ligne."
                onClick={() => setModelManagerOpen(true)}
              />
              {!mistral?.configured && (
                <SetupCard
                  icon={<Wand2 size={18} />}
                  title="Clé Mistral (gratuite)"
                  text="Une IA prête tout de suite + un conseiller qui choisit le modèle adapté à ta machine."
                  onClick={() => setPreferencesOpen(true)}
                />
              )}
            </div>
          </div>
        )}

        {!advice && !noLocalModel && (
          <div className="animate-fade-up mt-3 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                onClick={() => setPrefill((p) => ({ text: prompt, n: (p?.n ?? 0) + 1 }))}
                className="flex items-center gap-1.5 rounded-[10px] border border-base-800 bg-base-900 px-3 py-1.5 text-[13px] text-base-300 transition hover:border-base-700 hover:bg-base-850 hover:text-base-100"
              >
                <Icon size={14} className="text-base-400" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
