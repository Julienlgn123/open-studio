import { useEffect, useState } from 'react'
import type { ConversationSettings, EngineKind } from '@shared/types'

const CONTEXT_SLIDER_MAX = 131072

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium uppercase tracking-[0.06em] text-base-300">{label}</label>
        {hint && <span className="text-xs text-base-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Contexte maximal du modèle, pour borner le curseur de longueur de contexte. */
export function useContextMax(engine: EngineKind | null, model: string | null): number | null {
  const [max, setMax] = useState<number | null>(null)
  useEffect(() => {
    setMax(null)
    if (!engine || !model) return
    let alive = true
    window.api.engines.contextMax(engine, model).then((v) => alive && setMax(v))
    return () => {
      alive = false
    }
  }, [engine, model])
  return max
}

export default function SettingsFields({
  value,
  onChange,
  contextMax
}: {
  value: ConversationSettings
  onChange: (patch: Partial<ConversationSettings>) => void
  contextMax: number | null
}): JSX.Element {
  const ctxMax = Math.max(512, Math.min(contextMax ?? 32768, CONTEXT_SLIDER_MAX))
  const tooLong = contextMax !== null && value.contextLength > contextMax

  return (
    <>
      <Field label="Prompt système">
        <textarea
          value={value.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
          rows={4}
          placeholder="Ex : Tu es un assistant concis et précis."
          className="w-full resize-none rounded-[10px] border border-base-800 bg-base-900 px-3 py-[9px] text-sm text-base-100 outline-none placeholder:text-base-600 focus:border-accent-500"
        />
      </Field>

      <Field label="Température" hint={value.temperature.toFixed(2)}>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={value.temperature}
          onChange={(e) => onChange({ temperature: Number(e.target.value) })}
          className="w-full accent-accent-500"
        />
      </Field>

      <Field label="Top P" hint={value.topP.toFixed(2)}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={value.topP}
          onChange={(e) => onChange({ topP: Number(e.target.value) })}
          className="w-full accent-accent-500"
        />
      </Field>

      <Field label="Longueur de contexte" hint={`${value.contextLength} tokens`}>
        <input
          type="range"
          min={512}
          max={ctxMax}
          step={512}
          value={Math.min(value.contextLength, ctxMax)}
          onChange={(e) => onChange({ contextLength: Number(e.target.value) })}
          className="w-full accent-accent-500"
        />
        <p className={`text-xs ${tooLong ? 'text-amber-400' : 'text-base-500'}`}>
          {contextMax === null
            ? 'Plus de contexte = plus de mémoire utilisée.'
            : tooLong
              ? `Ce modèle supporte au plus ${contextMax} tokens : la valeur sera réduite.`
              : `Maximum supporté par ce modèle : ${contextMax} tokens.`}
        </p>
      </Field>

      <Field label="Tokens max en réponse" hint={`${value.maxTokens} tokens`}>
        <input
          type="range"
          min={128}
          max={8192}
          step={128}
          value={value.maxTokens}
          onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
          className="w-full accent-accent-500"
        />
      </Field>
    </>
  )
}
