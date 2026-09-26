/**
 * `mistral` = API Mistral (cloud), utilisable dès qu'une clé est enregistrée.
 * `lmstudio` = serveur local de LM Studio (modèles MLX sur Mac Apple Silicon, ou GGUF).
 */
export type EngineKind = 'ollama' | 'llamacpp' | 'mistral' | 'lmstudio'

export const ENGINE_LABELS: Record<EngineKind, string> = {
  ollama: 'Ollama',
  llamacpp: 'Embarqué',
  mistral: 'Mistral · cloud',
  lmstudio: 'LM Studio'
}

/** Modèle téléchargé dans LM Studio. */
export interface LmStudioModel {
  id: string
  name: string
  /** `mlx` (Apple Silicon) ou `gguf`. */
  format: string | null
  vision: boolean
  loaded: boolean
  maxContext: number | null
  quant: string | null
}

export interface ModelInfo {
  engine: EngineKind
  id: string
  name: string
  sizeBytes: number | null
  paramsLabel: string | null
  quant: string | null
  modifiedAt: string | null
}

export interface LocalModelFile {
  path: string
  name: string
  sizeBytes: number
}

/** Pièce jointe d'un message : image (modèles vision d'Ollama) ou fichier texte inséré dans le prompt. */
export type Attachment =
  | { kind: 'image'; name: string; mime: string; /** base64 sans préfixe data: */ data: string }
  | { kind: 'text'; name: string; content: string }

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  /** Actions faites par le modèle pour cette réponse (fichiers lus, recherches…). */
  tools?: string[]
  /** Remarque affichée sous la réponse (ex. bascule automatique vers un autre modèle). */
  notice?: string
  createdAt: number
}

/** Modèle GGUF enregistré pour le moteur embarqué. */
export interface LlamaModelEntry {
  path: string
  name: string
  addedAt: number
  /** Téléchargé par l'app (dans son dossier de modèles) : le fichier est supprimé avec l'entrée. */
  downloaded: boolean
}

export interface HfModel {
  id: string
  downloads: number
  likes: number
}

export interface HfFile {
  name: string
  sizeBytes: number
  quant: string | null
  recommended: boolean
}

export interface HfDownloadProgress {
  key: string
  repo: string
  file: string
  received: number
  total: number | null
  done: boolean
  error: string | null
  cancelled: boolean
}

export interface ConversationSettings {
  systemPrompt: string
  temperature: number
  topP: number
  contextLength: number
  maxTokens: number
  /** Le modèle peut lire les dossiers autorisés et retrouver les anciennes conversations (outils). */
  fileAccess: boolean
}

export const DEFAULT_SETTINGS: ConversationSettings = {
  systemPrompt: '',
  temperature: 0.7,
  topP: 0.9,
  contextLength: 4096,
  maxTokens: 2048,
  fileAccess: false
}

/** Contexte minimal quand l'accès aux fichiers est actif : le contenu lu doit tenir dans la fenêtre. */
export const FILE_ACCESS_MIN_CONTEXT = 16384

export const DEFAULT_TITLE = 'Nouvelle conversation'

/** Titre automatique tiré du premier message. */
export function autoTitle(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > 48 ? `${flat.slice(0, 47).trimEnd()}…` : flat || DEFAULT_TITLE
}

export interface Conversation {
  id: string
  title: string
  engine: EngineKind
  model: string
  settings: ConversationSettings
  /** Conversation importée (Claude, ChatGPT, Codex) ; null si créée dans l'app. */
  source: ConversationSource | null
  /** Épinglée : toujours affichée en haut de la barre latérale, quels que soient les filtres. */
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type ConversationSource = 'claude-code' | 'claude-ai' | 'chatgpt' | 'codex'

export const SOURCE_LABELS: Record<ConversationSource, string> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'claude.ai',
  chatgpt: 'ChatGPT',
  codex: 'Codex'
}

/** Étiquette d'une conversation : origine si importée, sinon famille du modèle (QWEN, MISTRAL…). */
export function conversationTag(conv: Pick<Conversation, 'source' | 'engine' | 'model'>): string {
  if (conv.source === 'claude-code' || conv.source === 'claude-ai') return 'CLAUDE'
  if (conv.source === 'chatgpt') return 'CHATGPT'
  if (conv.source === 'codex') return 'CODEX'
  if (conv.engine === 'mistral') return 'MISTRAL'
  const name = (conv.model.split(/[\\/]/).pop() ?? conv.model).toLowerCase()
  const families: [RegExp, string][] = [
    [/qwen|qwq/, 'QWEN'],
    [/mistral|ministral|mixtral|codestral|nemo/, 'MISTRAL'],
    [/llama|llava/, 'LLAMA'],
    [/gemma/, 'GEMMA'],
    [/deepseek/, 'DEEPSEEK'],
    [/phi/, 'PHI']
  ]
  return families.find(([re]) => re.test(name))?.[1] ?? (conv.engine === 'llamacpp' ? 'GGUF' : 'OLLAMA')
}

export const TAG_COLORS: Record<string, string> = {
  CLAUDE: '#d97757',
  CHATGPT: '#10a37f',
  CODEX: '#8b8b93',
  QWEN: '#7c6ff7',
  MISTRAL: '#fa7a18',
  LLAMA: '#3b82f6',
  GEMMA: '#38bdf8',
  DEEPSEEK: '#4d6bfe',
  PHI: '#22c55e',
  OLLAMA: '#a1a1aa',
  GGUF: '#a1a1aa'
}

/** Conversations importées masquées par défaut : consultables (recherche, mémoire du modèle) sans encombrer la liste. */
export const DEFAULT_HIDDEN_TAGS = ['CLAUDE', 'CHATGPT', 'CODEX']

/** Préférences globales : modèle et réglages appliqués aux nouvelles conversations. */
export type WriteMode = 'read' | 'ask' | 'auto'

/** Modification de fichier demandée par le modèle, en attente de l'accord de l'utilisateur. */
export interface ToolApproval {
  id: string
  kind: 'write' | 'edit' | 'mkdir' | 'move' | 'delete'
  /** Phrase courte : « Créer le fichier », « Modifier »… */
  title: string
  path: string
  /** Aperçu (diff avec lignes « + » / « - », ou description). */
  preview: string
}

export type ApprovalDecision = 'allow' | 'allow-all' | 'deny'

/** Site servi sur localhost par le serveur intégré (outil serve_folder). */
export interface RunningProcess {
  id: string
  label: string
  cwd: string
  url: string | null
  running: boolean
  startedAt: number
}

export interface AppPreferences {
  /** Prénom affiché sur l'écran d'accueil (« Bonjour, … »). */
  userName: string
  /** Écran de bienvenue (clé Mistral) déjà vu. */
  onboardingDone: boolean
  /** Dossiers que le modèle peut lire quand l'accès aux fichiers est activé. */
  workspaceRoots: string[]
  /** Étiquettes masquées dans la barre latérale (les conversations restent cherchables). */
  hiddenTags: string[]
  /** Ce que le modèle peut faire dans ces dossiers : lire seulement, modifier après accord, ou tout seul. */
  writeMode: WriteMode
  defaultEngine: EngineKind | null
  defaultModel: string | null
  defaultSettings: ConversationSettings
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  userName: '',
  onboardingDone: false,
  workspaceRoots: [],
  hiddenTags: DEFAULT_HIDDEN_TAGS,
  writeMode: 'ask',
  defaultEngine: null,
  defaultModel: null,
  defaultSettings: { ...DEFAULT_SETTINGS }
}

export interface SearchHit {
  conversationId: string
  /** Extrait du message qui correspond, ou null si seul le titre correspond. */
  snippet: string | null
}

export type ExportFormat = 'markdown' | 'json'

export interface EngineStatus {
  ollama: { available: boolean; version: string | null; error: string | null }
  llamacpp: { available: boolean }
  lmstudio: { available: boolean }
}

export interface PullProgress {
  model: string
  status: string
  completed: number | null
  total: number | null
  done: boolean
  error: string | null
}

export interface InstallProgress {
  phase: 'downloading' | 'installing' | 'waiting' | 'done' | 'error' | 'cancelled'
  percent: number | null
  message: string
}

export interface ChatStreamRequest {
  conversationId: string
  engine: EngineKind
  model: string
  /** Historique envoyé au modèle (prompt système compris). */
  messages: ModelMessage[]
  settings: ConversationSettings
  /**
   * Nouveau message utilisateur à enregistrer puis envoyer. Absent pour une
   * régénération : le dernier message de `messages` est alors déjà le message utilisateur.
   */
  userContent?: string
  userAttachments?: Attachment[]
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
}

export interface ChatSendResult {
  /** Message utilisateur enregistré (null pour une régénération). */
  user: ChatMessage | null
  /** Réponse enregistrée, éventuellement partielle si la génération a été arrêtée. */
  assistant: ChatMessage | null
  stopped: boolean
  error: string | null
  /** Nouveau titre si la conversation vient d'être titrée automatiquement. */
  title: string | null
  /** Moteur/modèle réellement utilisés si une bascule automatique a eu lieu. */
  fallback: { engine: EngineKind; model: string } | null
}

export interface ImportResult {
  imported: number
  skipped: number
  messages: number
}

export interface MistralStatus {
  configured: boolean
  /** Chiffrement du système indisponible : la clé est alors gardée en clair dans la base locale. */
  encrypted: boolean
}

export interface MistralModel {
  id: string
  vision: boolean
}

export interface HardwareInfo {
  platform: string
  cpuModel: string
  cpuCores: number
  ramTotalGb: number
  ramFreeGb: number
  gpus: string[]
  /** Accélération utilisée par le moteur embarqué : cuda, vulkan, metal ou false (CPU). */
  gpuBackend: string | null
  vramTotalGb: number | null
  vramFreeGb: number | null
  /** Mémoire unifiée (Apple Silicon) : la RAM sert de VRAM. */
  unifiedMemory: boolean
}

export interface ModelAdviceDownload {
  engine: 'ollama'
  model: string
  sizeGb: number | null
  speed: 'rapide' | 'moyen' | 'lent'
  reason: string
}

export interface ModelAdvice {
  /** Modèle qui a répondu si ce n'est pas Mistral (bascule automatique), sinon null. */
  answeredBy: string | null
  summary: string
  bestInstalled: { engine: EngineKind; model: string; reason: string } | null
  toDownload: ModelAdviceDownload[]
  useCloud: boolean
  cloudReason: string | null
}
