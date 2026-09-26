import { useEffect, useRef, useState } from 'react'
import { Boxes, Check, ChevronDown, Cloud, Cpu, Server } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import type { EngineKind } from '@shared/types'

function shortName(name: string): string {
  return name.replace(/\.gguf$/i, '')
}

export default function ModelPicker({
  engine,
  model,
  onChange,
  variant = 'default',
  placement = 'down'
}: {
  engine: EngineKind | null
  model: string | null
  onChange: (engine: EngineKind, model: string) => void
  /** `ghost` : bouton discret intégré à la zone de saisie (comme Codex / Claude). */
  variant?: 'default' | 'ghost'
  placement?: 'down' | 'up'
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ollamaModels = useChatStore((s) => s.ollamaModels)
  const llamaModels = useChatStore((s) => s.llamaModels)
  const mistral = useChatStore((s) => s.mistral)
  const mistralModels = useChatStore((s) => s.mistralModels)
  const setModelManagerOpen = useChatStore((s) => s.setModelManagerOpen)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const currentLabel = !model
    ? 'Choisir un modèle'
    : engine === 'mistral'
      ? model
      : engine === 'ollama'
      ? (ollamaModels.find((m) => m.id === model)?.name ?? model)
      : shortName(llamaModels.find((m) => m.path === model)?.name ?? model.split(/[\\/]/).pop() ?? model)

  const Item = ({
    selected,
    label,
    meta,
    onPick
  }: {
    selected: boolean
    label: string
    meta?: string | null
    onPick: () => void
  }): JSX.Element => (
    <button
      onClick={() => {
        onPick()
        setOpen(false)
      }}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-base-800 ${
        selected ? 'text-base-50' : 'text-base-200'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-[11px] text-base-500">{meta}</span>}
      <Check size={13} className={`shrink-0 text-accent-400 ${selected ? '' : 'invisible'}`} />
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'ghost'
            ? 'flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-base-300 transition hover:bg-base-800 hover:text-base-100'
            : 'flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-2.5 py-1.5 text-sm text-base-200 hover:bg-base-800'
        }
      >
        {variant === 'default' && (engine === 'llamacpp' ? <Cpu size={13} /> : engine === 'mistral' ? <Cloud size={13} /> : <Server size={13} />)}
        {variant === 'ghost' && engine === 'mistral' && <Cloud size={13} className="text-accent-400" />}
        <span className={`truncate ${variant === 'ghost' ? 'max-w-[180px] font-medium' : 'max-w-[220px]'}`}>{currentLabel}</span>
        <ChevronDown size={13} className="shrink-0 text-base-500" />
      </button>

      {open && (
        <div
          className={`absolute z-30 w-72 overflow-hidden rounded-xl border border-base-700 bg-base-850 shadow-panel ${
            placement === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${variant === 'ghost' ? 'right-0' : 'left-0'}`}
        >
          <div className="max-h-80 overflow-y-auto p-1">
            <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-base-500">
              <Server size={11} /> Ollama {ollamaModels.length === 0 && '· aucun modèle'}
            </div>
            {ollamaModels.map((m) => (
              <Item
                key={m.id}
                selected={engine === 'ollama' && model === m.id}
                label={m.name}
                meta={m.paramsLabel}
                onPick={() => onChange('ollama', m.id)}
              />
            ))}

            <div className="mt-1 flex items-center gap-1.5 border-t border-base-800 px-2.5 pb-1 pt-2 text-[11px] font-medium text-base-500">
              <Cpu size={11} /> Moteur embarqué (GGUF) {llamaModels.length === 0 && '· aucun modèle'}
            </div>
            {llamaModels.map((m) => (
              <Item
                key={m.path}
                selected={engine === 'llamacpp' && model === m.path}
                label={shortName(m.name)}
                onPick={() => onChange('llamacpp', m.path)}
              />
            ))}
            {mistral?.configured && (
              <>
                <div className="mt-1 flex items-center gap-1.5 border-t border-base-800 px-2.5 pb-1 pt-2 text-[11px] font-medium text-base-500">
                  <Cloud size={11} /> Mistral · cloud
                </div>
                {(mistralModels.length ? mistralModels : [{ id: 'mistral-small-latest', vision: true }]).map((m) => (
                  <Item
                    key={m.id}
                    selected={engine === 'mistral' && model === m.id}
                    label={m.id}
                    meta={m.vision ? 'images' : null}
                    onPick={() => onChange('mistral', m.id)}
                  />
                ))}
              </>
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false)
              setModelManagerOpen(true)
            }}
            className="flex w-full items-center gap-2 border-t border-base-800 px-3.5 py-2 text-[12px] text-base-400 hover:bg-base-800 hover:text-base-100"
          >
            <Boxes size={13} />
            Gérer les modèles…
          </button>
        </div>
      )}
    </div>
  )
}
