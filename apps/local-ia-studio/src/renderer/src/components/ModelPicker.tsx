import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Cpu, Server } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import type { EngineKind } from '@shared/types'

export default function ModelPicker({
  engine,
  model,
  onChange
}: {
  engine: EngineKind
  model: string
  onChange: (engine: EngineKind, model: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ollamaModels = useChatStore((s) => s.ollamaModels)
  const llamaModels = useChatStore((s) => s.llamaModels)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const currentLabel =
    engine === 'ollama'
      ? (ollamaModels.find((m) => m.id === model)?.name ?? (model || 'Choisir un modèle'))
      : (llamaModels.find((m) => m.path === model)?.name ?? (model || 'Choisir un modèle'))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-base-700 bg-base-900 px-2.5 py-1.5 text-sm text-base-200 hover:bg-base-800"
      >
        {engine === 'ollama' ? <Server size={13} /> : <Cpu size={13} />}
        <span className="max-w-[220px] truncate">{currentLabel}</span>
        <ChevronDown size={13} className="text-base-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-base-700 bg-base-850 shadow-panel">
          <div className="max-h-80 overflow-y-auto py-1">
            <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-base-500">
              Ollama {ollamaModels.length === 0 && '· aucun modèle'}
            </div>
            {ollamaModels.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange('ollama', m.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-base-800 ${
                  engine === 'ollama' && model === m.id ? 'text-accent-400' : 'text-base-200'
                }`}
              >
                <span className="truncate">{m.name}</span>
                {m.paramsLabel && <span className="ml-2 shrink-0 text-xs text-base-500">{m.paramsLabel}</span>}
              </button>
            ))}

            <div className="mt-1 border-t border-base-800 px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-base-500">
              Modèles locaux (GGUF) {llamaModels.length === 0 && '· aucun modèle'}
            </div>
            {llamaModels.map((m) => (
              <button
                key={m.path}
                onClick={() => {
                  onChange('llamacpp', m.path)
                  setOpen(false)
                }}
                className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-base-800 ${
                  engine === 'llamacpp' && model === m.path ? 'text-accent-400' : 'text-base-200'
                }`}
              >
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
