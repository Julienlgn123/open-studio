import { useEffect, useState } from 'react'
import { Cpu, Gpu, Loader2, MemoryStick, Wand2 } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import AdviceCard from './AdviceCard'
import type { HardwareInfo, ModelAdvice } from '@shared/types'

function Spec({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5 rounded-[10px] border border-base-800 bg-base-900 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-accent-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-base-500">{label}</p>
        <p className="truncate text-[13px] text-base-100" title={value}>
          {value}
        </p>
        {hint && <p className="text-[11px] text-base-500">{hint}</p>}
      </div>
    </div>
  )
}

/** « Ma machine » : matériel détecté + conseil général de modèle (via Mistral). */
export default function MachinePanel({ onDownload }: { onDownload: (ollamaName: string) => void }): JSX.Element {
  const mistral = useChatStore((s) => s.mistral)
  const mistralModels = useChatStore((s) => s.mistralModels)
  const setDraftModel = useChatStore((s) => s.setDraftModel)
  const newConversation = useChatStore((s) => s.newConversation)
  const setModelManagerOpen = useChatStore((s) => s.setModelManagerOpen)
  const setPreferencesOpen = useChatStore((s) => s.setPreferencesOpen)
  const [hw, setHw] = useState<HardwareInfo | null>(null)
  const [advice, setAdvice] = useState<ModelAdvice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.hardware.info().then(setHw).catch(() => setHw(null))
  }, [])

  const ask = async (): Promise<void> => {
    if (!mistral?.configured) {
      setPreferencesOpen(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setAdvice(await window.api.advisor.recommend(''))
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^.*?Error: /, ''))
    } finally {
      setBusy(false)
    }
  }

  const gpuValue = hw ? (hw.gpus[0] ?? (hw.gpuBackend ? hw.gpuBackend : 'Aucun GPU dédié détecté')) : 'Détection…'
  const gpuHint = hw
    ? hw.unifiedMemory
      ? 'Mémoire unifiée (la RAM sert de VRAM)'
      : hw.vramTotalGb !== null
        ? `${hw.vramTotalGb} Go de VRAM · ${hw.vramFreeGb} Go libres${hw.gpuBackend ? ` · ${hw.gpuBackend}` : ''}`
        : hw.gpuBackend
          ? `Accélération ${hw.gpuBackend}`
          : 'Les modèles tourneront sur le processeur'
    : undefined

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-base-100">Ma machine</h3>
        <button
          onClick={ask}
          disabled={busy}
          title={mistral?.configured ? 'Demander à Mistral quels modèles conviennent à ce matériel' : 'Nécessite une clé Mistral'}
          className="flex items-center gap-1.5 rounded-[10px] border border-base-700 bg-base-850 px-2.5 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} className="text-accent-400" />}
          Quels modèles pour ma machine ?
        </button>
      </div>
      <div className="flex gap-2">
        <Spec icon={<Cpu size={15} />} label="Processeur" value={hw?.cpuModel ?? 'Détection…'} hint={hw ? `${hw.cpuCores} threads` : undefined} />
        <Spec
          icon={<MemoryStick size={15} />}
          label="Mémoire"
          value={hw ? `${hw.ramTotalGb} Go de RAM` : 'Détection…'}
          hint={hw ? `${hw.ramFreeGb} Go libres` : undefined}
        />
        <Spec icon={<Gpu size={15} />} label="Carte graphique" value={gpuValue} hint={gpuHint} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {advice && (
        <AdviceCard
          advice={advice}
          mistralModel={mistral?.configured ? (mistralModels[0]?.id ?? 'mistral-small-latest') : null}
          onUse={(engine, model) => {
            newConversation()
            setDraftModel(engine, model)
            setModelManagerOpen(false)
          }}
          onDownload={onDownload}
          onClose={() => setAdvice(null)}
        />
      )}
    </section>
  )
}
