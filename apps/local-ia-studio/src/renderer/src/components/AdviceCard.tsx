import { Cloud, Download, Gauge, Wand2, X } from 'lucide-react'
import type { EngineKind, ModelAdvice } from '@shared/types'

const SPEED_STYLE: Record<string, string> = {
  rapide: 'bg-emerald-500/15 text-emerald-400',
  moyen: 'bg-amber-500/15 text-amber-500',
  lent: 'bg-red-500/15 text-red-400'
}

function shortName(id: string): string {
  return id.split(/[\\/]/).pop()?.replace(/\.gguf$/i, '') ?? id
}

/** Recommandation du conseiller : modèle déjà installé, téléchargements proposés, ou Mistral cloud. */
export default function AdviceCard({
  advice,
  mistralModel,
  onUse,
  onDownload,
  onClose
}: {
  advice: ModelAdvice
  /** Modèle Mistral proposé si le conseil est d'utiliser le cloud. */
  mistralModel: string | null
  onUse: (engine: EngineKind, model: string) => void
  onDownload: (ollamaName: string) => void
  onClose: () => void
}): JSX.Element {
  return (
    <div className="animate-fade-up space-y-3 rounded-2xl border border-accent-500/30 bg-accent-500/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Wand2 size={15} className="mt-0.5 shrink-0 text-accent-400" />
          <div>
            <p className="text-[13.5px] leading-6 text-base-100">{advice.summary}</p>
            {advice.answeredBy && <p className="text-[11px] text-amber-500">Réponse de {advice.answeredBy}</p>}
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 text-base-500 hover:text-base-100" title="Fermer">
          <X size={14} />
        </button>
      </div>

      {advice.bestInstalled && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-base-700 bg-base-900 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-emerald-400">Déjà installé</p>
            <p className="truncate text-[13.5px] font-medium text-base-100">{shortName(advice.bestInstalled.model)}</p>
            {advice.bestInstalled.reason && <p className="text-xs leading-5 text-base-400">{advice.bestInstalled.reason}</p>}
          </div>
          <button
            onClick={() => onUse(advice.bestInstalled!.engine, advice.bestInstalled!.model)}
            className="shrink-0 rounded-[10px] bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-400"
          >
            Utiliser
          </button>
        </div>
      )}

      {advice.toDownload.map((d) => (
        <div key={d.model} className="flex items-center justify-between gap-3 rounded-[10px] border border-base-700 bg-base-900 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-base-100">
              {d.model}
              <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${SPEED_STYLE[d.speed]}`}>
                <Gauge size={10} />
                {d.speed}
              </span>
              {d.sizeGb !== null && <span className="text-[11px] font-normal text-base-500">{d.sizeGb} Go</span>}
            </p>
            {d.reason && <p className="text-xs leading-5 text-base-400">{d.reason}</p>}
          </div>
          <button
            onClick={() => onDownload(d.model)}
            className="flex shrink-0 items-center gap-1 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100"
          >
            <Download size={12} />
            Télécharger
          </button>
        </div>
      ))}

      {advice.useCloud && mistralModel && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-base-700 bg-base-900 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-base-100">
              <Cloud size={13} className="text-accent-400" />
              Mistral (cloud)
            </p>
            {advice.cloudReason && <p className="text-xs leading-5 text-base-400">{advice.cloudReason}</p>}
          </div>
          <button
            onClick={() => onUse('mistral', mistralModel)}
            className="shrink-0 rounded-[10px] border border-base-700 bg-base-850 px-3 py-1.5 text-xs text-base-200 hover:bg-base-800 hover:text-base-100"
          >
            Utiliser
          </button>
        </div>
      )}
    </div>
  )
}
