import { useEffect, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { useChatStore } from '../store/chatStore'
import SettingsFields, { useContextMax } from './SettingsFields'
import type { ConversationSettings } from '@shared/types'

const SAVE_DELAY_MS = 400

export default function SettingsPanel(): JSX.Element | null {
  const open = useChatStore((s) => s.settingsOpen)
  const setOpen = useChatStore((s) => s.setSettingsOpen)
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const defaults = useChatStore((s) => s.preferences.defaultSettings)
  const updateSettings = useChatStore((s) => s.updateConversationSettings)
  const contextMax = useContextMax(open && conv ? conv.engine : null, open && conv ? conv.model : null)

  const [local, setLocal] = useState<ConversationSettings | null>(null)
  // Écriture en base différée : un curseur déplacé ne déclenche qu'une sauvegarde.
  const pending = useRef<{ id: string; settings: ConversationSettings } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current) updateSettings(pending.current.id, pending.current.settings)
    pending.current = null
  }

  // Resynchronise à l'ouverture et au changement de conversation (en sauvegardant l'éventuel brouillon).
  useEffect(() => {
    flush()
    if (open && conv) setLocal(conv.settings)
  }, [conv?.id, open])

  useEffect(() => flush, [])

  if (!open || !conv || !local) return null

  const commit = (patch: Partial<ConversationSettings>): void => {
    const next = { ...local, ...patch }
    setLocal(next)
    pending.current = { id: conv.id, settings: next }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[340px] flex-col border-l border-base-700 bg-base-850 shadow-panel"
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-[17px] font-semibold text-base-100">Réglages de la conversation</h2>
          <button onClick={() => setOpen(false)} className="text-base-400 hover:text-base-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-4">
          <SettingsFields value={local} onChange={commit} contextMax={contextMax} />
        </div>

        <div className="border-t border-base-800 p-3">
          <button
            onClick={() => commit(defaults)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-base-700 px-3 py-1.5 text-xs text-base-300 hover:bg-base-800"
          >
            <RotateCcw size={12} />
            Revenir aux réglages par défaut
          </button>
        </div>
      </div>
    </div>
  )
}
