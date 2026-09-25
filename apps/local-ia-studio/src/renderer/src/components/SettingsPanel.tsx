import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import type { ConversationSettings } from '@shared/types'

function Field({
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
        <label className="text-sm font-medium text-base-200">{label}</label>
        {hint && <span className="text-xs text-base-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPanel(): JSX.Element | null {
  const open = useChatStore((s) => s.settingsOpen)
  const setOpen = useChatStore((s) => s.setSettingsOpen)
  const activeId = useChatStore((s) => s.activeId)
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const updateSettings = useChatStore((s) => s.updateConversationSettings)

  const [local, setLocal] = useState<ConversationSettings | null>(null)

  useEffect(() => {
    if (conv) setLocal(conv.settings)
  }, [conv?.id])

  if (!open || !activeId || !conv || !local) return null

  const commit = (patch: Partial<ConversationSettings>): void => {
    const next = { ...local, ...patch }
    setLocal(next)
    updateSettings(activeId, next)
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-80 flex-col border-l border-base-800 bg-base-900 shadow-panel"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-base-800 px-4">
          <h2 className="text-sm font-semibold text-base-100">Réglages de la conversation</h2>
          <button onClick={() => setOpen(false)} className="text-base-400 hover:text-base-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <Field label="Prompt système">
            <textarea
              value={local.systemPrompt}
              onChange={(e) => commit({ systemPrompt: e.target.value })}
              rows={4}
              placeholder="Ex : Tu es un assistant concis et précis."
              className="w-full resize-none rounded-lg border border-base-700 bg-base-950 px-2.5 py-2 text-sm text-base-100 outline-none placeholder:text-base-600 focus:border-accent-500"
            />
          </Field>

          <Field label="Température" hint={local.temperature.toFixed(2)}>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={local.temperature}
              onChange={(e) => commit({ temperature: Number(e.target.value) })}
              className="w-full accent-accent-500"
            />
          </Field>

          <Field label="Top P" hint={local.topP.toFixed(2)}>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={local.topP}
              onChange={(e) => commit({ topP: Number(e.target.value) })}
              className="w-full accent-accent-500"
            />
          </Field>

          <Field label="Longueur de contexte" hint={`${local.contextLength} tokens`}>
            <input
              type="range"
              min={512}
              max={32768}
              step={512}
              value={local.contextLength}
              onChange={(e) => commit({ contextLength: Number(e.target.value) })}
              className="w-full accent-accent-500"
            />
          </Field>

          <Field label="Tokens max en réponse" hint={`${local.maxTokens} tokens`}>
            <input
              type="range"
              min={128}
              max={8192}
              step={128}
              value={local.maxTokens}
              onChange={(e) => commit({ maxTokens: Number(e.target.value) })}
              className="w-full accent-accent-500"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
