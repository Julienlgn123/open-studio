import { create } from 'zustand'
import type { ChatMessage, Conversation, EngineKind, EngineStatus, ModelInfo } from '@shared/types'

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  messages: Record<string, ChatMessage[]>
  streamingText: Record<string, string>
  isStreaming: Record<string, boolean>
  engineStatus: EngineStatus | null
  ollamaModels: ModelInfo[]
  llamaModels: { path: string; name: string; addedAt: number }[]
  modelManagerOpen: boolean
  settingsOpen: boolean

  loadInitial: () => Promise<void>
  refreshEngines: () => Promise<void>
  refreshOllamaModels: () => Promise<void>
  refreshLlamaModels: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: (engine: EngineKind, model: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  updateConversationSettings: (id: string, settings: Conversation['settings']) => Promise<void>
  switchModel: (id: string, engine: EngineKind, model: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  stopStreaming: (conversationId: string) => void
  setModelManagerOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: {},
  streamingText: {},
  isStreaming: {},
  engineStatus: null,
  ollamaModels: [],
  llamaModels: [],
  modelManagerOpen: false,
  settingsOpen: false,

  loadInitial: async () => {
    const [conversations, engineStatus] = await Promise.all([window.api.conversations.list(), window.api.engines.status()])
    set({ conversations, engineStatus })
    if (conversations.length) {
      await get().selectConversation(conversations[0].id)
    }
    get().refreshOllamaModels()
    get().refreshLlamaModels()
  },

  refreshEngines: async () => {
    const engineStatus = await window.api.engines.status()
    set({ engineStatus })
  },

  refreshOllamaModels: async () => {
    try {
      const ollamaModels = await window.api.ollama.list()
      set({ ollamaModels })
    } catch {
      set({ ollamaModels: [] })
    }
  },

  refreshLlamaModels: async () => {
    const llamaModels = await window.api.llamacpp.list()
    set({ llamaModels })
  },

  selectConversation: async (id: string) => {
    set({ activeId: id })
    if (!get().messages[id]) {
      const msgs = await window.api.conversations.messages(id)
      set((s) => ({ messages: { ...s.messages, [id]: msgs } }))
    }
  },

  newConversation: async (engine, model) => {
    const conv = await window.api.conversations.create(engine, model)
    set((s) => ({
      conversations: [conv, ...s.conversations],
      messages: { ...s.messages, [conv.id]: [] },
      activeId: conv.id
    }))
  },

  deleteConversation: async (id: string) => {
    await window.api.conversations.delete(id)
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id)
      const activeId = s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId
      const messages = { ...s.messages }
      delete messages[id]
      return { conversations, activeId, messages }
    })
  },

  renameConversation: async (id: string, title: string) => {
    await window.api.conversations.update(id, { title })
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)) }))
  },

  updateConversationSettings: async (id: string, settings) => {
    await window.api.conversations.update(id, { settings })
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, settings } : c)) }))
  },

  switchModel: async (id: string, engine, model) => {
    await window.api.conversations.update(id, { engine, model })
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, engine, model } : c)) }))
  },

  sendMessage: async (content: string) => {
    const id = get().activeId
    if (!id) return
    const conv = get().conversations.find((c) => c.id === id)
    if (!conv) return

    const userMsg: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content, createdAt: Date.now() }
    set((s) => ({
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), userMsg] },
      streamingText: { ...s.streamingText, [id]: '' },
      isStreaming: { ...s.isStreaming, [id]: true }
    }))

    const history = (get().messages[id] ?? [])
      .filter((m) => m.id !== userMsg.id)
      .map((m) => ({ role: m.role, content: m.content }))
    if (conv.settings.systemPrompt.trim()) {
      history.unshift({ role: 'system', content: conv.settings.systemPrompt })
    }

    window.api.chat.send(
      {
        conversationId: id,
        engine: conv.engine,
        model: conv.model,
        messages: history,
        settings: conv.settings,
        userContent: content
      },
      (chunk) => {
        set((s) => ({ streamingText: { ...s.streamingText, [id]: (s.streamingText[id] ?? '') + chunk } }))
      },
      (saved) => {
        set((s) => ({
          messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), saved] },
          streamingText: { ...s.streamingText, [id]: '' },
          isStreaming: { ...s.isStreaming, [id]: false }
        }))
        if (conv.title === 'Nouvelle conversation') {
          const title = content.slice(0, 48)
          get().renameConversation(id, title)
        }
      },
      (errorMessage) => {
        const assistantMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Erreur : ${errorMessage}`,
          createdAt: Date.now()
        }
        set((s) => ({
          messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), assistantMsg] },
          streamingText: { ...s.streamingText, [id]: '' },
          isStreaming: { ...s.isStreaming, [id]: false }
        }))
      }
    )
  },

  stopStreaming: (conversationId: string) => {
    window.api.chat.cancel(conversationId)
    set((s) => ({ isStreaming: { ...s.isStreaming, [conversationId]: false } }))
  },

  setModelManagerOpen: (v: boolean) => set({ modelManagerOpen: v }),
  setSettingsOpen: (v: boolean) => set({ settingsOpen: v })
}))
