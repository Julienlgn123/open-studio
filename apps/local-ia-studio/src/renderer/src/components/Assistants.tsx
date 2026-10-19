import { useState } from 'react'
import { EyeOff, Pencil, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import type { Assistant } from '@shared/types'
import { BUILTIN_ASSISTANTS, allAssistants } from '@shared/types'
import { useChatStore } from '../store/chatStore'

const EMOJIS = ['🤖', '🎓', '💻', '✍️', '🌍', '📝', '💡', '📄', '🧪', '📊', '🎨', '🧠', '⚖️', '🩺', '🍳', '🎮', '🏋️', '💼', '🎵', '📚']

/** Rangée d'assistants sur l'accueil : un clic applique leur rôle à la prochaine conversation. */
export function AssistantsBar(): JSX.Element {
  const prefs = useChatStore((s) => s.preferences)
  const selected = useChatStore((s) => s.draftAssistant)
  const setSelected = useChatStore((s) => s.setDraftAssistant)
  const [editing, setEditing] = useState<Assistant | null>(null)
  const list = allAssistants(prefs)

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 text-[12px] text-base-500">
        <Sparkles size={13} /> Assistants
        {selected && (
          <span className="text-accent-400">
            · {selected.emoji} {selected.name} sera utilisé pour cette conversation
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((a) => {
          const on = selected?.id === a.id
          return (
            <div key={a.id} className="group relative">
              <button
                onClick={() => setSelected(on ? null : a)}
                title={a.description}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${
                  on ? 'border-accent-500 bg-accent-500/15 text-accent-300' : 'border-base-700 bg-base-900 text-base-300 hover:border-base-600 hover:text-base-100'
                }`}
              >
                <span>{a.emoji}</span>
                {a.name}
              </button>
              <button
                onClick={() => setEditing(a)}
                className="absolute -right-1 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-base-700 bg-base-800 text-base-300 hover:text-base-50 group-hover:flex"
                title="Modifier"
              >
                <Pencil size={10} />
              </button>
            </div>
          )
        })}
        <button
          onClick={() => setEditing({ id: '', name: '', emoji: '🤖', description: '', systemPrompt: '', temperature: null })}
          className="flex h-8 items-center gap-1 rounded-full border border-dashed border-base-700 px-3 text-[13px] text-base-400 hover:text-base-100"
        >
          <Plus size={13} /> Créer
        </button>
      </div>
      {editing && <AssistantEditor assistant={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function AssistantEditor({ assistant, onClose }: { assistant: Assistant; onClose: () => void }): JSX.Element {
  const prefs = useChatStore((s) => s.preferences)
  const save = useChatStore((s) => s.savePreferences)
  const setSelected = useChatStore((s) => s.setDraftAssistant)
  const [a, setA] = useState<Assistant>(assistant)
  const isBuiltin = BUILTIN_ASSISTANTS.some((b) => b.id === assistant.id)
  const isNew = !assistant.id

  const commit = async (): Promise<void> => {
    if (!a.name.trim() || !a.systemPrompt.trim()) return
    const item: Assistant = { ...a, id: a.id || `a-${Date.now().toString(36)}`, name: a.name.trim(), builtin: undefined }
    const others = (prefs.assistants ?? []).filter((x) => x.id !== item.id)
    await save({ ...prefs, assistants: [...others, item] })
    setSelected(item)
    onClose()
  }
  const remove = async (): Promise<void> => {
    if (isBuiltin) await save({ ...prefs, hiddenAssistants: [...(prefs.hiddenAssistants ?? []), a.id], assistants: (prefs.assistants ?? []).filter((x) => x.id !== a.id) })
    else await save({ ...prefs, assistants: (prefs.assistants ?? []).filter((x) => x.id !== a.id) })
    setSelected(null)
    onClose()
  }
  const reset = async (): Promise<void> => {
    await save({ ...prefs, assistants: (prefs.assistants ?? []).filter((x) => x.id !== a.id) })
    onClose()
  }

  const input = 'w-full rounded-[10px] border border-base-700 bg-base-900 px-3 py-2 text-[13px] text-base-100 outline-none placeholder:text-base-500 focus:border-accent-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[34rem] max-w-full rounded-[20px] border border-base-700 bg-base-850 p-6 shadow-panel">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-[16px] font-semibold text-base-100">{isNew ? 'Nouvel assistant' : `Modifier « ${assistant.name} »`}</h2>
          <button onClick={onClose} className="ml-auto text-base-400 hover:text-base-100">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <select value={a.emoji} onChange={(e) => setA({ ...a, emoji: e.target.value })} className={`${input} w-16 text-center`}>
              {[...new Set([a.emoji, ...EMOJIS])].map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
            <input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Nom (ex. Coach sportif)" className={input} autoFocus />
          </div>
          <input value={a.description} onChange={(e) => setA({ ...a, description: e.target.value })} placeholder="Description courte (affichée au survol)" className={input} />
          <textarea
            value={a.systemPrompt}
            onChange={(e) => setA({ ...a, systemPrompt: e.target.value })}
            rows={7}
            placeholder="Consignes : qui est l’assistant, comment il répond, ce qu’il doit éviter…"
            className={`${input} resize-none leading-5`}
          />
          <label className="flex items-center gap-3 text-[12.5px] text-base-300">
            Créativité
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={a.temperature ?? 0.7}
              onChange={(e) => setA({ ...a, temperature: Number(e.target.value) })}
              className="flex-1 accent-accent-500"
            />
            <span className="w-24 text-right text-base-400">
              {(a.temperature ?? 0.7).toFixed(1)} · {(a.temperature ?? 0.7) < 0.4 ? 'précis' : (a.temperature ?? 0.7) > 0.9 ? 'inventif' : 'équilibré'}
            </span>
          </label>
        </div>
        <div className="mt-5 flex items-center gap-2">
          {!isNew && (
            <button onClick={() => void remove()} className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12.5px] text-base-400 hover:text-red-400">
              {isBuiltin ? <EyeOff size={13} /> : <X size={13} />} {isBuiltin ? 'Masquer' : 'Supprimer'}
            </button>
          )}
          {isBuiltin && (prefs.assistants ?? []).some((x) => x.id === a.id) && (
            <button onClick={() => void reset()} className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12.5px] text-base-400 hover:text-base-100">
              <RotateCcw size={13} /> D’origine
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-[10px] border border-base-700 px-3 py-1.5 text-[13px] text-base-200 hover:bg-base-800">
            Annuler
          </button>
          <button
            onClick={() => void commit()}
            disabled={!a.name.trim() || !a.systemPrompt.trim()}
            className="rounded-[10px] bg-accent-500 px-3 py-1.5 text-[13px] text-white hover:bg-accent-400 disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

/** Masqués : on peut les réafficher depuis les préférences. */
export function HiddenAssistantsReset(): JSX.Element | null {
  const prefs = useChatStore((s) => s.preferences)
  const save = useChatStore((s) => s.savePreferences)
  if (!prefs.hiddenAssistants?.length) return null
  return (
    <button onClick={() => void save({ ...prefs, hiddenAssistants: [] })} className="text-xs text-accent-400 hover:underline">
      Réafficher les {prefs.hiddenAssistants.length} assistant(s) masqué(s)
    </button>
  )
}
