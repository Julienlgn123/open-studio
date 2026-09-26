import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppPreferences,
  LmStudioModel,
  RunningProcess,
  ApprovalDecision,
  ToolApproval,
  ChatMessage,
  ChatSendResult,
  ChatStreamRequest,
  Conversation,
  EngineKind,
  EngineStatus,
  ExportFormat,
  HfDownloadProgress,
  HfFile,
  HfModel,
  HardwareInfo,
  ImportResult,
  InstallProgress,
  LlamaModelEntry,
  LocalModelFile,
  MistralModel,
  MistralStatus,
  ModelAdvice,
  ModelInfo,
  PullProgress,
  SearchHit
} from '@shared/types'
import type { Api } from '@shared/api'

const api: Api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  engines: {
    status: (): Promise<EngineStatus> => ipcRenderer.invoke('engines:status'),
    contextMax: (engine: EngineKind, model: string): Promise<number | null> =>
      ipcRenderer.invoke('engines:contextMax', engine, model)
  },
  ollama: {
    list: (): Promise<ModelInfo[]> => ipcRenderer.invoke('ollama:list'),
    delete: (name: string): Promise<void> => ipcRenderer.invoke('ollama:delete', name),
    pull: (name: string, onProgress: (p: PullProgress) => void): (() => void) => {
      const handler = (_: unknown, p: PullProgress): void => {
        if (p.model === name) onProgress(p)
      }
      ipcRenderer.on('ollama:pull:progress', handler)
      ipcRenderer.invoke('ollama:pull', name).finally(() => ipcRenderer.removeListener('ollama:pull:progress', handler))
      return () => {
        ipcRenderer.invoke('ollama:pull:cancel', name)
        ipcRenderer.removeListener('ollama:pull:progress', handler)
      }
    },
    install: (onProgress: (p: InstallProgress) => void): (() => void) => {
      const handler = (_: unknown, p: InstallProgress): void => onProgress(p)
      ipcRenderer.on('ollama:install:progress', handler)
      ipcRenderer.invoke('ollama:install').finally(() => ipcRenderer.removeListener('ollama:install:progress', handler))
      return () => {
        ipcRenderer.invoke('ollama:install:cancel')
        ipcRenderer.removeListener('ollama:install:progress', handler)
      }
    }
  },
  llamacpp: {
    list: (): Promise<LlamaModelEntry[]> => ipcRenderer.invoke('llamacpp:list'),
    add: (): Promise<LocalModelFile | null> => ipcRenderer.invoke('llamacpp:add'),
    remove: (path: string): Promise<void> => ipcRenderer.invoke('llamacpp:remove', path)
  },
  hf: {
    search: (query: string): Promise<HfModel[]> => ipcRenderer.invoke('hf:search', query),
    files: (repo: string): Promise<HfFile[]> => ipcRenderer.invoke('hf:files', repo),
    download: async (repo: string, file: string, onProgress: (p: HfDownloadProgress) => void): Promise<void> => {
      const key = `${repo}/${file}`
      const handler = (_: unknown, p: HfDownloadProgress): void => {
        if (p.key === key) onProgress(p)
      }
      ipcRenderer.on('hf:download:progress', handler)
      try {
        await ipcRenderer.invoke('hf:download', repo, file)
      } finally {
        ipcRenderer.removeListener('hf:download:progress', handler)
      }
    },
    cancel: (repo: string, file: string): Promise<void> => ipcRenderer.invoke('hf:download:cancel', repo, file)
  },
  lmstudio: {
    models: (): Promise<LmStudioModel[]> => ipcRenderer.invoke('lmstudio:models')
  },
  mlx: {
    search: (query: string): Promise<HfModel[]> => ipcRenderer.invoke('mlx:search', query),
    size: (repo: string): Promise<number> => ipcRenderer.invoke('mlx:size', repo),
    download: async (repo: string, onProgress: (p: HfDownloadProgress) => void): Promise<void> => {
      const key = `mlx:${repo}`
      const handler = (_: unknown, p: HfDownloadProgress): void => {
        if (p.key === key) onProgress(p)
      }
      ipcRenderer.on('hf:download:progress', handler)
      try {
        await ipcRenderer.invoke('mlx:download', repo)
      } finally {
        ipcRenderer.removeListener('hf:download:progress', handler)
      }
    },
    cancel: (repo: string): Promise<void> => ipcRenderer.invoke('mlx:cancel', repo)
  },
  mistral: {
    status: (): Promise<MistralStatus> => ipcRenderer.invoke('mistral:status'),
    setKey: (key: string): Promise<MistralStatus> => ipcRenderer.invoke('mistral:setKey', key),
    clearKey: (): Promise<MistralStatus> => ipcRenderer.invoke('mistral:clearKey'),
    models: (): Promise<MistralModel[]> => ipcRenderer.invoke('mistral:models')
  },
  hardware: {
    info: (): Promise<HardwareInfo> => ipcRenderer.invoke('hardware:info')
  },
  advisor: {
    recommend: (task: string): Promise<ModelAdvice> => ipcRenderer.invoke('advisor:recommend', task)
  },
  workspace: {
    addRoot: (): Promise<AppPreferences> => ipcRenderer.invoke('workspace:addRoot'),
    removeRoot: (root: string): Promise<AppPreferences> => ipcRenderer.invoke('workspace:removeRoot', root)
  },
  imports: {
    claudeCodeCount: (): Promise<number> => ipcRenderer.invoke('import:claudeCodeCount'),
    claudeCode: (target: { engine: EngineKind; model: string }): Promise<ImportResult> =>
      ipcRenderer.invoke('import:claudeCode', target),
    claudeAi: (target: { engine: EngineKind; model: string }): Promise<ImportResult | null> =>
      ipcRenderer.invoke('import:claudeAi', target),
    chatgpt: (target: { engine: EngineKind; model: string }): Promise<ImportResult | null> =>
      ipcRenderer.invoke('import:chatgpt', target),
    codexCount: (): Promise<number> => ipcRenderer.invoke('import:codexCount'),
    codex: (target: { engine: EngineKind; model: string }): Promise<ImportResult> => ipcRenderer.invoke('import:codex', target)
  },
  preferences: {
    get: (): Promise<AppPreferences> => ipcRenderer.invoke('preferences:get'),
    set: (prefs: AppPreferences): Promise<void> => ipcRenderer.invoke('preferences:set', prefs)
  },
  conversations: {
    list: (): Promise<Conversation[]> => ipcRenderer.invoke('conversations:list'),
    create: (engine: EngineKind, model: string): Promise<Conversation> =>
      ipcRenderer.invoke('conversations:create', engine, model),
    update: (
      id: string,
      patch: Partial<Pick<Conversation, 'title' | 'engine' | 'model' | 'settings'>>
    ): Promise<boolean> => ipcRenderer.invoke('conversations:update', id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('conversations:delete', id),
    messages: (id: string): Promise<ChatMessage[]> => ipcRenderer.invoke('conversations:messages', id),
    search: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke('conversations:search', query),
    setPinned: (id: string, pinned: boolean): Promise<boolean> => ipcRenderer.invoke('conversations:setPinned', id, pinned),
    export: (id: string, format: ExportFormat): Promise<string | null> =>
      ipcRenderer.invoke('conversations:export', id, format)
  },
  messages: {
    deleteFrom: (conversationId: string, fromMessageId: string): Promise<boolean> =>
      ipcRenderer.invoke('messages:deleteFrom', conversationId, fromMessageId),
    delete: (messageId: string): Promise<boolean> => ipcRenderer.invoke('messages:delete', messageId)
  },
  servers: {
    list: (): Promise<RunningProcess[]> => ipcRenderer.invoke('servers:list'),
    stop: (id: string): Promise<string> => ipcRenderer.invoke('servers:stop', id),
    open: (url: string): Promise<string> => ipcRenderer.invoke('servers:open', url),
    onChanged: (cb: (list: RunningProcess[]) => void): (() => void) => {
      const handler = (_: unknown, list: RunningProcess[]): void => cb(list)
      ipcRenderer.on('servers:changed', handler)
      return () => ipcRenderer.removeListener('servers:changed', handler)
    }
  },
  chat: {
    send: async (
      req: ChatStreamRequest,
      onChunk: (chunk: string) => void,
      onTool: (label: string) => void,
      onApproval: (req: ToolApproval) => void
    ): Promise<ChatSendResult> => {
      const channel = `chat:chunk:${req.conversationId}`
      const toolChannel = `chat:tool:${req.conversationId}`
      const approvalChannel = `chat:approval:${req.conversationId}`
      const chunkHandler = (_: unknown, chunk: string): void => onChunk(chunk)
      const toolHandler = (_: unknown, label: string): void => onTool(label)
      const approvalHandler = (_: unknown, approval: ToolApproval): void => onApproval(approval)
      ipcRenderer.on(channel, chunkHandler)
      ipcRenderer.on(toolChannel, toolHandler)
      ipcRenderer.on(approvalChannel, approvalHandler)
      try {
        return await ipcRenderer.invoke('chat:send', req)
      } finally {
        ipcRenderer.removeListener(channel, chunkHandler)
        ipcRenderer.removeListener(toolChannel, toolHandler)
        ipcRenderer.removeListener(approvalChannel, approvalHandler)
      }
    },
    approve: (id: string, decision: ApprovalDecision): Promise<void> => ipcRenderer.invoke('chat:approve', id, decision),
    cancel: (conversationId: string): Promise<void> => ipcRenderer.invoke('chat:cancel', conversationId)
  }
}

contextBridge.exposeInMainWorld('api', api)
