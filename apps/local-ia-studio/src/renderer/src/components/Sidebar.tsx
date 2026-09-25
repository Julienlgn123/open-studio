import { useState } from 'react'
import { Plus, MessageSquare, Trash2, Boxes, Pencil, Check, X as XIcon } from 'lucide-react'
import { useChatStore } from '../store/chatStore'

export default function Sidebar(): JSX.Element {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const newConversation = useChatStore((s) => s.newConversation)
  const setModelManagerOpen = useChatStore((s) => s.setModelManagerOpen)
  const ollamaModels = useChatStore((s) => s.ollamaModels)
  const llamaModels = useChatStore((s) => s.llamaModels)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleNewChat = (): void => {
    const engine = ollamaModels.length ? 'ollama' : 'llamacpp'
    const model = ollamaModels.length ? ollamaModels[0].id : (llamaModels[0]?.path ?? '')
    if (!model) {
      setModelManagerOpen(true)
      return
    }
    newConversation(engine, model)
  }

  const startEdit = (id: string, title: string): void => {
    setEditingId(id)
    setEditValue(title)
  }

  const commitEdit = (id: string): void => {
    if (editValue.trim()) renameConversation(id, editValue.trim())
    setEditingId(null)
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-base-800 bg-base-900">
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-600"
        >
          <Plus size={16} />
          Nouvelle conversation
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-base-500">Aucune conversation pour l’instant.</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => editingId !== c.id && selectConversation(c.id)}
            className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition ${
              c.id === activeId ? 'bg-base-800 text-base-50' : 'text-base-300 hover:bg-base-800/60'
            }`}
          >
            <MessageSquare size={14} className="shrink-0 text-base-500" />
            {editingId === c.id ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(c.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 rounded bg-base-950 px-1.5 py-0.5 text-sm outline-none ring-1 ring-accent-500"
                />
                <button onClick={(e) => { e.stopPropagation(); commitEdit(c.id) }} className="shrink-0 text-base-400 hover:text-base-100">
                  <Check size={13} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="shrink-0 text-base-400 hover:text-base-100">
                  <XIcon size={13} />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(c.id, c.title) }}
                  className="shrink-0 text-base-500 opacity-0 hover:text-base-100 group-hover:opacity-100"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(c.id) }}
                  className="shrink-0 text-base-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-base-800 p-2">
        <button
          onClick={() => setModelManagerOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-base-300 transition hover:bg-base-800"
        >
          <Boxes size={15} />
          Gérer les modèles
        </button>
      </div>
    </div>
  )
}
