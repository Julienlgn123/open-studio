import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { MemoryItem } from '@shared/types'

/** Mémoire longue : ce que le modèle sait de toi, modifiable ici. */
export default function MemorySection({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }): JSX.Element {
  const [items, setItems] = useState<MemoryItem[]>([])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const load = (): void => {
    window.api.memory.list().then(setItems).catch(() => setItems([]))
  }
  useEffect(load, [])

  async function add(): Promise<void> {
    if (!draft.trim()) return
    await window.api.memory.add(draft)
    setDraft('')
    load()
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-base-500">
        Des faits que le modèle garde d’une conversation à l’autre (préférences, projets, contexte). Dis « retiens que … » dans
        un message, ou ajoute-les ici. Tout reste sur ton ordinateur.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-base-300">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="accent-accent-500" />
        Utiliser la mémoire dans les conversations
      </label>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Ex. Je code surtout en TypeScript et React"
          className="h-8 flex-1 rounded-[10px] border border-base-700 bg-base-900 px-3 text-xs text-base-100 outline-none placeholder:text-base-500 focus:border-accent-500"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="flex items-center gap-1 rounded-[10px] border border-base-700 bg-base-850 px-3 text-xs text-base-200 hover:bg-base-800 disabled:opacity-40"
        >
          <Plus size={13} /> Ajouter
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-base-600">Rien de retenu pour l’instant.</p>
      ) : (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-[10px] border border-base-800 bg-base-900 px-3 py-1.5">
              {editing === m.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={async () => {
                    if (editText.trim() && editText !== m.content) await window.api.memory.update(m.id, editText)
                    setEditing(null)
                    load()
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="flex-1 bg-transparent text-xs text-base-100 outline-none"
                />
              ) : (
                <span
                  className="flex-1 cursor-text text-xs text-base-200"
                  onClick={() => {
                    setEditing(m.id)
                    setEditText(m.content)
                  }}
                  title="Cliquer pour modifier"
                >
                  {m.content}
                </span>
              )}
              <button
                onClick={async () => {
                  await window.api.memory.delete(m.id)
                  load()
                }}
                className="shrink-0 text-base-500 hover:text-red-400"
                title="Oublier"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
