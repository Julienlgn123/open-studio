import { useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { QuickPrompt } from '@shared/types'
import { DEFAULT_QUICK_PROMPTS } from '@shared/types'
import { HiddenAssistantsReset } from './Assistants'

/** Raccourcis « / » de la zone de saisie : consignes toutes faites, modifiables. */
export default function QuickPromptsSection({ value, onChange }: { value: QuickPrompt[]; onChange: (v: QuickPrompt[]) => void }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const upd = (id: string, patch: Partial<QuickPrompt>): void => onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const input = 'h-8 rounded-[10px] border border-base-700 bg-base-900 px-2.5 text-xs text-base-100 outline-none placeholder:text-base-500 focus:border-accent-500'
  return (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-base-500">
        Tape <span className="font-mono text-accent-400">/</span> au début d’un message pour insérer une consigne toute faite (ex. <span className="font-mono">/resume</span>,{' '}
        <span className="font-mono">/anglais</span>).
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {value.map((p) => (
          <div key={p.id} className="rounded-[10px] border border-base-800 bg-base-900">
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="font-mono text-xs text-accent-400">/</span>
              <input
                value={p.command}
                onChange={(e) => upd(p.id, { command: e.target.value.replace(/[^\p{L}\d-]/gu, '').toLowerCase() })}
                className="w-20 bg-transparent font-mono text-xs text-accent-300 outline-none"
              />
              <input value={p.label} onChange={(e) => upd(p.id, { label: e.target.value })} className="min-w-0 flex-1 bg-transparent text-xs text-base-200 outline-none" />
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="text-[11px] text-base-500 hover:text-base-200">
                {open === p.id ? 'fermer' : 'texte'}
              </button>
              <button onClick={() => onChange(value.filter((x) => x.id !== p.id))} className="text-base-500 hover:text-red-400" title="Supprimer">
                <X size={12} />
              </button>
            </div>
            {open === p.id && (
              <textarea
                value={p.text}
                onChange={(e) => upd(p.id, { text: e.target.value })}
                rows={3}
                className="block w-full resize-none border-t border-base-800 bg-transparent px-2.5 py-1.5 text-xs leading-5 text-base-200 outline-none"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            const id = `q-${Date.now().toString(36)}`
            onChange([...value, { id, command: 'nouveau', label: 'Mon raccourci', text: '' }])
            setOpen(id)
          }}
          className={`${input} flex items-center gap-1 text-base-200 hover:bg-base-800`}
        >
          <Plus size={12} /> Ajouter
        </button>
        <button onClick={() => onChange(DEFAULT_QUICK_PROMPTS)} className={`${input} flex items-center gap-1 text-base-400 hover:bg-base-800`}>
          <RotateCcw size={12} /> Par défaut
        </button>
        <HiddenAssistantsReset />
      </div>
    </div>
  )
}
