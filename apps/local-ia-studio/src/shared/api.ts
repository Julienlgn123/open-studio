import type {
  AppPreferences,
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
} from './types'

export interface Api {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
  engines: {
    status: () => Promise<EngineStatus>
    /** Contexte maximal supporté par le modèle (null si inconnu). */
    contextMax: (engine: EngineKind, model: string) => Promise<number | null>
  }
  ollama: {
    list: () => Promise<ModelInfo[]>
    delete: (name: string) => Promise<void>
    pull: (name: string, onProgress: (p: PullProgress) => void) => () => void
    install: (onProgress: (p: InstallProgress) => void) => () => void
  }
  llamacpp: {
    list: () => Promise<LlamaModelEntry[]>
    add: () => Promise<LocalModelFile | null>
    /** Retire le modèle de la liste ; supprime aussi le fichier s'il a été téléchargé par l'app. */
    remove: (path: string) => Promise<void>
  }
  hf: {
    search: (query: string) => Promise<HfModel[]>
    files: (repo: string) => Promise<HfFile[]>
    /** Se résout une fois le fichier téléchargé et ajouté aux modèles locaux (ou annulé / en échec). */
    download: (repo: string, file: string, onProgress: (p: HfDownloadProgress) => void) => Promise<void>
    cancel: (repo: string, file: string) => Promise<void>
  }
  mistral: {
    status: () => Promise<MistralStatus>
    /** Vérifie la clé auprès de Mistral puis l'enregistre chiffrée ; rejette si elle est invalide. */
    setKey: (key: string) => Promise<MistralStatus>
    clearKey: () => Promise<MistralStatus>
    models: () => Promise<MistralModel[]>
  }
  hardware: {
    info: () => Promise<HardwareInfo>
  }
  advisor: {
    /** Demande à Mistral le meilleur modèle pour cette tâche, selon le matériel et les modèles installés. */
    recommend: (task: string) => Promise<ModelAdvice>
  }
  workspace: {
    /** Ouvre un sélecteur de dossier et l'ajoute aux dossiers lisibles par le modèle. */
    addRoot: () => Promise<AppPreferences>
    removeRoot: (root: string) => Promise<AppPreferences>
  }
  imports: {
    claudeCodeCount: () => Promise<number>
    claudeCode: (target: { engine: EngineKind; model: string }) => Promise<ImportResult>
    /** Sélecteur de fichier (.zip / conversations.json) ; null si annulé. */
    claudeAi: (target: { engine: EngineKind; model: string }) => Promise<ImportResult | null>
    chatgpt: (target: { engine: EngineKind; model: string }) => Promise<ImportResult | null>
    codexCount: () => Promise<number>
    codex: (target: { engine: EngineKind; model: string }) => Promise<ImportResult>
  }
  preferences: {
    get: () => Promise<AppPreferences>
    set: (prefs: AppPreferences) => Promise<void>
  }
  conversations: {
    list: () => Promise<Conversation[]>
    create: (engine: EngineKind, model: string) => Promise<Conversation>
    update: (id: string, patch: Partial<Pick<Conversation, 'title' | 'engine' | 'model' | 'settings'>>) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    messages: (id: string) => Promise<ChatMessage[]>
    search: (query: string) => Promise<SearchHit[]>
    setPinned: (id: string, pinned: boolean) => Promise<boolean>
    /** Ouvre une boîte « Enregistrer sous » ; renvoie le chemin écrit ou null si annulé. */
    export: (id: string, format: ExportFormat) => Promise<string | null>
  }
  messages: {
    deleteFrom: (conversationId: string, fromMessageId: string) => Promise<boolean>
    delete: (messageId: string) => Promise<boolean>
  }
  servers: {
    list: () => Promise<RunningProcess[]>
    stop: (id: string) => Promise<string>
    open: (url: string) => Promise<string>
    onChanged: (cb: (list: RunningProcess[]) => void) => () => void
  }
  chat: {
    send: (
      req: ChatStreamRequest,
      onChunk: (chunk: string) => void,
      onTool: (label: string) => void,
      onApproval: (req: ToolApproval) => void
    ) => Promise<ChatSendResult>
    approve: (id: string, decision: ApprovalDecision) => Promise<void>
    cancel: (conversationId: string) => Promise<void>
  }
}
