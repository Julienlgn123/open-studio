import { create } from 'zustand'
import type {
  AppPreferences,
  ApprovalDecision,
  ToolApproval,
  Attachment,
  ChatMessage,
  ChatStreamRequest,
  Conversation,
  EngineKind,
  EngineStatus,
  HfDownloadProgress,
  LlamaModelEntry,
  MistralModel,
  MistralStatus,
  ModelInfo
} from '@shared/types'
import { DEFAULT_PREFERENCES, DEFAULT_TITLE, autoTitle } from '@shared/types'
import { mentionsWorkspacePath } from '@shared/attachments'

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  messages: Record<string, ChatMessage[]>
  streamingText: Record<string, string>
  /** Actions du modèle pendant la génération en cours (fichiers lus…). */
  streamingTools: Record<string, string[]>
  /** Modification de fichier qui attend l'accord de l'utilisateur, par conversation. */
  pendingApprovals: Record<string, ToolApproval | null>
  answerApproval: (conversationId: string, decision: ApprovalDecision) => void
  /** Accès aux fichiers pour la prochaine conversation (écran d'accueil). */
  draftFileAccess: boolean
  isStreaming: Record<string, boolean>
  /** Dernière erreur de génération par conversation (affichée avec un bouton « Réessayer »). */
  errors: Record<string, string | null>
  engineStatus: EngineStatus | null
  ollamaModels: ModelInfo[]
  llamaModels: LlamaModelEntry[]
  /** Téléchargements Hugging Face en cours ou terminés en erreur, par `repo/fichier`. */
  hfDownloads: Record<string, HfDownloadProgress>
  mistral: MistralStatus | null
  mistralModels: MistralModel[]
  /** Préférences chargées depuis la base (sinon l'écran de bienvenue clignoterait au démarrage). */
  preferencesLoaded: boolean
  /** Téléchargement Ollama demandé depuis ailleurs (conseiller) : repris par la fenêtre Modèles. */
  pendingPull: string | null
  preferences: AppPreferences
  modelManagerOpen: boolean
  settingsOpen: boolean
  preferencesOpen: boolean
  /** Modèle choisi sur l'écran d'accueil (nouvelle conversation pas encore créée). */
  draft: { engine: EngineKind; model: string } | null
  sidebarOpen: boolean
  theme: Theme

  loadInitial: () => Promise<void>
  refreshEngines: () => Promise<void>
  refreshOllamaModels: () => Promise<void>
  refreshLlamaModels: () => Promise<void>
  refreshMistral: () => Promise<void>
  requestPull: (name: string) => void
  consumePendingPull: () => string | null
  finishOnboarding: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  /** Affiche l'écran d'accueil : la conversation n'est créée qu'au premier message. */
  newConversation: () => void
  setDraftModel: (engine: EngineKind, model: string) => void
  setDraftFileAccess: (v: boolean) => void
  /** Modèle utilisé pour une nouvelle conversation : choix de l'accueil, sinon préférences, sinon premier disponible. */
  draftModel: () => { engine: EngineKind; model: string } | null
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  togglePinned: (id: string) => Promise<void>
  setHiddenTags: (tags: string[]) => Promise<void>
  updateConversationSettings: (id: string, settings: Conversation['settings']) => Promise<void>
  switchModel: (id: string, engine: EngineKind, model: string) => Promise<void>
  savePreferences: (prefs: AppPreferences) => Promise<void>
  startHfDownload: (repo: string, file: string) => void
  cancelHfDownload: (key: string) => void
  dismissHfDownload: (key: string) => void
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>
  regenerate: (assistantMessageId: string) => Promise<void>
  editMessage: (userMessageId: string, content: string) => Promise<void>
  retry: (conversationId: string) => Promise<void>
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>
  stopStreaming: (conversationId: string) => void
  setModelManagerOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setPreferencesOpen: (v: boolean) => void
  toggleSidebar: () => void
  setTheme: (t: Theme) => void
}

export type Theme = 'dark' | 'light'

function initialTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
}
applyTheme(initialTheme())

function toModelMessages(conv: Conversation, msgs: ChatMessage[]): ChatStreamRequest['messages'] {
  const history: ChatStreamRequest['messages'] = msgs.map((m) => ({
    role: m.role,
    content: m.content,
    attachments: m.attachments
  }))
  if (conv.settings.systemPrompt.trim()) history.unshift({ role: 'system', content: conv.settings.systemPrompt })
  return history
}

export const useChatStore = create<ChatState>((set, get) => {
  const patchConv = (id: string, patch: Partial<Conversation>): void =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  /**
   * Lance une génération. `base` = messages déjà présents (côté UI et base) avant la réponse ;
   * `userContent` = nouveau message à enregistrer, absent pour une régénération.
   */
  const generate = async (
    conv: Conversation,
    base: ChatMessage[],
    userContent?: string,
    userAttachments?: Attachment[]
  ): Promise<void> => {
    const id = conv.id
    const attachments = userAttachments?.length ? userAttachments : undefined
    const pendingUser: ChatMessage | null =
      userContent !== undefined
        ? { id: `pending-${Date.now()}`, role: 'user', content: userContent, attachments, createdAt: Date.now() }
        : null

    set((s) => ({
      messages: { ...s.messages, [id]: pendingUser ? [...base, pendingUser] : base },
      streamingText: { ...s.streamingText, [id]: '' },
      streamingTools: { ...s.streamingTools, [id]: [] },
      isStreaming: { ...s.isStreaming, [id]: true },
      errors: { ...s.errors, [id]: null }
    }))
    // Titre affiché tout de suite ; le main process fait le même calcul et l'enregistre.
    if (userContent !== undefined && conv.title === DEFAULT_TITLE) patchConv(id, { title: autoTitle(userContent) })

    const result = await window.api.chat
      .send(
        {
          conversationId: id,
          engine: conv.engine,
          model: conv.model,
          messages: toModelMessages(conv, base),
          settings: conv.settings,
          userContent,
          userAttachments: attachments
        },
        (chunk) => set((s) => ({ streamingText: { ...s.streamingText, [id]: (s.streamingText[id] ?? '') + chunk } })),
        (label) =>
          set((s) => {
            const list = s.streamingTools[id] ?? []
            // « … — refusé » remplace la ligne de l'action correspondante.
            const refused = label.endsWith(' — refusé') && list[list.length - 1] === label.slice(0, -' — refusé'.length)
            return { streamingTools: { ...s.streamingTools, [id]: refused ? [...list.slice(0, -1), label] : [...list, label] } }
          }),
        (approval) => set((s) => ({ pendingApprovals: { ...s.pendingApprovals, [id]: approval } }))
      )
      .catch((err: unknown) => ({
        user: null,
        assistant: null,
        stopped: false,
        error: err instanceof Error ? err.message : String(err),
        title: null,
        fallback: null
      }))

    set((s) => {
      // Le message utilisateur provisoire est remplacé par celui enregistré (vrai id en base).
      let list = (s.messages[id] ?? []).map((m) => (pendingUser && m.id === pendingUser.id && result.user ? result.user : m))
      if (result.assistant) list = [...list, result.assistant]
      return {
        messages: { ...s.messages, [id]: list },
        streamingText: { ...s.streamingText, [id]: '' },
        pendingApprovals: { ...s.pendingApprovals, [id]: null },
        isStreaming: { ...s.isStreaming, [id]: false },
        errors: { ...s.errors, [id]: result.error }
      }
    })
    if (result.title) patchConv(id, { title: result.title })
    patchConv(id, { updatedAt: Date.now() })
    set((s) => ({ conversations: [...s.conversations].sort((a, b) => b.updatedAt - a.updatedAt) }))
  }

  const activeConv = (id: string): Conversation | null =>
    get().isStreaming[id] ? null : (get().conversations.find((c) => c.id === id) ?? null)

  return {
    conversations: [],
    activeId: null,
    messages: {},
    streamingText: {},
    streamingTools: {},
    pendingApprovals: {},
    draftFileAccess: false,
    isStreaming: {},
    errors: {},
    engineStatus: null,
    ollamaModels: [],
    llamaModels: [],
    hfDownloads: {},
    mistral: null,
    mistralModels: [],
    preferencesLoaded: false,
    pendingPull: null,
    preferences: DEFAULT_PREFERENCES,
    modelManagerOpen: false,
    settingsOpen: false,
    preferencesOpen: false,
    draft: null,
    sidebarOpen: true,
    theme: initialTheme(),

    loadInitial: async () => {
      const [conversations, engineStatus, preferences] = await Promise.all([
        window.api.conversations.list(),
        window.api.engines.status(),
        window.api.preferences.get()
      ])
      // Comme Claude/Codex : on démarre sur l'écran d'accueil, l'historique est dans la barre latérale.
      set({ conversations, engineStatus, preferences, preferencesLoaded: true, draftFileAccess: preferences.defaultSettings.fileAccess })
      get().refreshOllamaModels()
      get().refreshMistral()
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

    refreshMistral: async () => {
      const mistral = await window.api.mistral.status()
      set({ mistral })
      set({ mistralModels: mistral.configured ? await window.api.mistral.models().catch(() => []) : [] })
    },

    requestPull: (name) => set({ pendingPull: name, modelManagerOpen: true }),

    consumePendingPull: () => {
      const name = get().pendingPull
      if (name) set({ pendingPull: null })
      return name
    },

    finishOnboarding: async () => {
      await get().savePreferences({ ...get().preferences, onboardingDone: true })
    },

    selectConversation: async (id: string) => {
      set({ activeId: id })
      if (!get().messages[id]) {
        const msgs = await window.api.conversations.messages(id)
        set((s) => ({ messages: { ...s.messages, [id]: msgs } }))
      }
    },

    newConversation: () =>
      set((s) => ({ activeId: null, draft: null, settingsOpen: false, draftFileAccess: s.preferences.defaultSettings.fileAccess })),

    setDraftFileAccess: (v) => set({ draftFileAccess: v }),

    setDraftModel: (engine, model) => set({ draft: { engine, model } }),

    draftModel: () => {
      const { draft, preferences, ollamaModels, llamaModels, mistral, mistralModels } = get()
      const exists = (engine: EngineKind, model: string): boolean =>
        engine === 'ollama'
          ? ollamaModels.some((m) => m.id === model)
          : engine === 'llamacpp'
            ? llamaModels.some((m) => m.path === model)
            : !!mistral?.configured && (mistralModels.length === 0 || mistralModels.some((m) => m.id === model))
      if (draft && exists(draft.engine, draft.model)) return draft
      if (preferences.defaultEngine && preferences.defaultModel && exists(preferences.defaultEngine, preferences.defaultModel)) {
        return { engine: preferences.defaultEngine, model: preferences.defaultModel }
      }
      if (ollamaModels.length) return { engine: 'ollama', model: ollamaModels[0].id }
      if (llamaModels.length) return { engine: 'llamacpp', model: llamaModels[0].path }
      // Aucun modèle local : Mistral sert d'IA par défaut si une clé est enregistrée.
      if (mistral?.configured) return { engine: 'mistral', model: mistralModels[0]?.id ?? 'mistral-small-latest' }
      return null
    },

    deleteConversation: async (id: string) => {
      if (get().isStreaming[id]) await window.api.chat.cancel(id)
      await window.api.conversations.delete(id)
      set((s) => {
        const conversations = s.conversations.filter((c) => c.id !== id)
        const activeId = s.activeId === id ? null : s.activeId
        const messages = { ...s.messages }
        delete messages[id]
        return { conversations, activeId, messages }
      })
      const next = get().activeId
      if (next) await get().selectConversation(next)
    },

    renameConversation: async (id: string, title: string) => {
      await window.api.conversations.update(id, { title })
      patchConv(id, { title })
    },

    answerApproval: (conversationId, decision) => {
      const approval = get().pendingApprovals[conversationId]
      if (!approval) return
      set((s) => ({ pendingApprovals: { ...s.pendingApprovals, [conversationId]: null } }))
      void window.api.chat.approve(approval.id, decision)
    },

    togglePinned: async (id: string) => {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      await window.api.conversations.setPinned(id, !conv.pinned)
      patchConv(id, { pinned: !conv.pinned })
    },

    setHiddenTags: async (hiddenTags) => {
      const preferences = { ...get().preferences, hiddenTags }
      set({ preferences })
      await window.api.preferences.set(preferences)
    },

    updateConversationSettings: async (id: string, settings) => {
      patchConv(id, { settings })
      await window.api.conversations.update(id, { settings })
    },

    switchModel: async (id: string, engine, model) => {
      await window.api.conversations.update(id, { engine, model })
      patchConv(id, { engine, model })
    },

    savePreferences: async (preferences) => {
      set({ preferences })
      await window.api.preferences.set(preferences)
    },

    startHfDownload: (repo, file) => {
      const key = `${repo}/${file}`
      if (get().hfDownloads[key] && !get().hfDownloads[key].done) return
      const setProgress = (p: HfDownloadProgress): void => set((s) => ({ hfDownloads: { ...s.hfDownloads, [key]: p } }))
      setProgress({ key, repo, file, received: 0, total: null, done: false, error: null, cancelled: false })
      let last: HfDownloadProgress | null = null
      window.api.hf
        .download(repo, file, (p) => {
          last = p
          setProgress(p)
        })
        .catch((err: unknown) => {
          last = { key, repo, file, received: 0, total: null, done: true, cancelled: false, error: String(err) }
          setProgress(last)
        })
        .finally(() => {
          get().refreshLlamaModels()
          // Réussite ou annulation : la ligne disparaît ; une erreur reste affichée.
          if (!last?.error) get().dismissHfDownload(key)
        })
    },

    cancelHfDownload: (key) => {
      const d = get().hfDownloads[key]
      if (d) window.api.hf.cancel(d.repo, d.file)
    },

    dismissHfDownload: (key) =>
      set((s) => {
        const hfDownloads = { ...s.hfDownloads }
        delete hfDownloads[key]
        return { hfDownloads }
      }),

    sendMessage: async (content: string, attachments?: Attachment[]) => {
      let id = get().activeId
      if (!id) {
        // Premier message depuis l'accueil : la conversation est créée maintenant.
        const target = get().draftModel()
        if (!target) {
          set({ modelManagerOpen: true })
          return
        }
        let created = await window.api.conversations.create(target.engine, target.model)
        if (created.settings.fileAccess !== get().draftFileAccess) {
          created = { ...created, settings: { ...created.settings, fileAccess: get().draftFileAccess } }
          await window.api.conversations.update(created.id, { settings: created.settings })
        }
        set((s) => ({
          conversations: [created, ...s.conversations],
          messages: { ...s.messages, [created.id]: [] },
          activeId: created.id,
          draft: null
        }))
        id = created.id
      }
      let conv = activeConv(id)
      if (!conv) return
      // « Crée-moi un site dans C:\…\Dev\canapé » : chemin d'un dossier autorisé → accès aux fichiers activé.
      if (!conv.settings.fileAccess && mentionsWorkspacePath(content, get().preferences.workspaceRoots)) {
        const settings = { ...conv.settings, fileAccess: true }
        await get().updateConversationSettings(conv.id, settings)
        conv = { ...conv, settings }
      }
      await generate(conv, get().messages[conv.id] ?? [], content, attachments)
    },

    regenerate: async (assistantMessageId: string) => {
      const id = get().activeId
      const conv = id ? activeConv(id) : null
      if (!conv) return
      const msgs = get().messages[conv.id] ?? []
      const index = msgs.findIndex((m) => m.id === assistantMessageId)
      if (index < 1) return
      await window.api.messages.deleteFrom(conv.id, assistantMessageId)
      await generate(conv, msgs.slice(0, index))
    },

    editMessage: async (userMessageId: string, content: string) => {
      const id = get().activeId
      const conv = id ? activeConv(id) : null
      if (!conv || !content.trim()) return
      const msgs = get().messages[conv.id] ?? []
      const index = msgs.findIndex((m) => m.id === userMessageId)
      if (index < 0) return
      await window.api.messages.deleteFrom(conv.id, userMessageId)
      await generate(conv, msgs.slice(0, index), content.trim(), msgs[index].attachments)
    },

    retry: async (conversationId: string) => {
      const conv = activeConv(conversationId)
      if (!conv) return
      const msgs = get().messages[conversationId] ?? []
      if (msgs[msgs.length - 1]?.role !== 'user') return
      await generate(conv, msgs)
    },

    deleteMessage: async (conversationId: string, messageId: string) => {
      if (get().isStreaming[conversationId]) return
      await window.api.messages.delete(messageId)
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.id !== messageId)
        },
        errors: { ...s.errors, [conversationId]: null }
      }))
    },

    stopStreaming: (conversationId: string) => {
      // La réponse partielle arrive avec le résultat de chat.send (stopped: true).
      window.api.chat.cancel(conversationId)
    },

    setModelManagerOpen: (v: boolean) => set({ modelManagerOpen: v }),
    setSettingsOpen: (v: boolean) => set({ settingsOpen: v }),
    setPreferencesOpen: (v: boolean) => set({ preferencesOpen: v }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setTheme: (theme) => {
      try {
        localStorage.setItem('theme', theme)
      } catch {
        /* préférence locale seulement */
      }
      applyTheme(theme)
      set({ theme })
    }
  }
})
