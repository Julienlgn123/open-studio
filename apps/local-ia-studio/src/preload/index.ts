import { contextBridge, ipcRenderer } from 'electron'
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
} from '@shared/types'
import type { Api } from '@shared/api'

const api: Api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  engines: {
    status: (): Promise<EngineStatus> => ipcRenderer.invoke('engines:status')
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
    list: (): Promise<{ path: string; name: string; addedAt: number }[]> => ipcRenderer.invoke('llamacpp:list'),
    add: (): Promise<LocalModelFile | null> => ipcRenderer.invoke('llamacpp:add'),
    remove: (path: string): Promise<void> => ipcRenderer.invoke('llamacpp:remove', path)
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
    messages: (id: string): Promise<ChatMessage[]> => ipcRenderer.invoke('conversations:messages', id)
  },
  messages: {
    deleteFrom: (conversationId: string, fromMessageId: string): Promise<boolean> =>
      ipcRenderer.invoke('messages:deleteFrom', conversationId, fromMessageId)
  },
  chat: {
    send: (
      req: ChatStreamRequest & { userContent: string },
      onChunk: (chunk: string) => void,
      onDone: (saved: ChatMessage) => void,
      onError: (message: string) => void
    ): (() => void) => {
      const chunkHandler = (_: unknown, chunk: string): void => onChunk(chunk)
      const doneHandler = (_: unknown, saved: ChatMessage): void => onDone(saved)
      const errorHandler = (_: unknown, message: string): void => onError(message)

      ipcRenderer.on(`chat:chunk:${req.conversationId}`, chunkHandler)
      ipcRenderer.once(`chat:done:${req.conversationId}`, (e, saved) => {
        doneHandler(e, saved)
        cleanup()
      })
      ipcRenderer.once(`chat:error:${req.conversationId}`, (e, message) => {
        errorHandler(e, message)
        cleanup()
      })

      function cleanup(): void {
        ipcRenderer.removeListener(`chat:chunk:${req.conversationId}`, chunkHandler)
      }

      ipcRenderer.invoke('chat:send', req)

      return () => {
        ipcRenderer.invoke('chat:cancel', req.conversationId)
        cleanup()
      }
    },
    cancel: (conversationId: string): Promise<void> => ipcRenderer.invoke('chat:cancel', conversationId)
  }
}

contextBridge.exposeInMainWorld('api', api)
