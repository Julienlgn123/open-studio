import type {
  ChatMessage,
  ChatStreamRequest,
  Conversation,
  EngineKind,
  EngineStatus,
  InstallProgress,
  LocalModelFile,
  ModelInfo,
  PullProgress
} from './types'

export interface Api {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
  engines: {
    status: () => Promise<EngineStatus>
  }
  ollama: {
    list: () => Promise<ModelInfo[]>
    delete: (name: string) => Promise<void>
    pull: (name: string, onProgress: (p: PullProgress) => void) => () => void
    install: (onProgress: (p: InstallProgress) => void) => () => void
  }
  llamacpp: {
    list: () => Promise<{ path: string; name: string; addedAt: number }[]>
    add: () => Promise<LocalModelFile | null>
    remove: (path: string) => Promise<void>
  }
  conversations: {
    list: () => Promise<Conversation[]>
    create: (engine: EngineKind, model: string) => Promise<Conversation>
    update: (id: string, patch: Partial<Pick<Conversation, 'title' | 'engine' | 'model' | 'settings'>>) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    messages: (id: string) => Promise<ChatMessage[]>
  }
  messages: {
    deleteFrom: (conversationId: string, fromMessageId: string) => Promise<boolean>
  }
  chat: {
    send: (
      req: ChatStreamRequest & { userContent: string },
      onChunk: (chunk: string) => void,
      onDone: (saved: ChatMessage) => void,
      onError: (message: string) => void
    ) => () => void
    cancel: (conversationId: string) => Promise<void>
  }
}
