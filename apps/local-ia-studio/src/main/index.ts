import { randomUUID } from 'crypto'
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  initDb,
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  addMessage,
  deleteMessagesFrom,
  deleteMessage,
  searchConversations,
  setConversationPinned,
  getPreferences,
  setPreferences,
  listLlamaCppModels,
  addLlamaCppModel,
  removeLlamaCppModel
} from './db'
import {
  checkOllama,
  listOllamaModels,
  deleteOllamaModel,
  pullOllamaModel,
  getOllamaContextLength
} from './providers/ollama'
import {
  isLlamaCppAvailable,
  fileToModelInfo,
  unloadLlamaCppModel,
  getGgufContextLength
} from './providers/llamacpp'
import { installOllama } from './providers/ollamaInstaller'
import { downloadHfFile, isInModelsDir, listHfGgufFiles, searchHfModels } from './providers/huggingface'
import { conversationToJson, conversationToMarkdown, exportFileName } from './exporter'
import { clearMistralKey, getMistralKey, mistralStatus, setMistralKey } from './secrets'
import { completeMistralJson, DEFAULT_MISTRAL_MODEL, FALLBACK_MISTRAL_MODELS, listMistralModels } from './providers/mistral'
import { completeJsonOllama } from './providers/ollama'
import { completeJsonLlamaCpp } from './providers/llamacpp'
import { getHardwareInfo } from './hardware'
import { recommendModel, type InstalledModel, type JsonCompleter } from './advisor'
import { runAttempt } from './agent'
import { checkLmStudio, completeJsonLmStudio, downloadMlxRepo, getLmStudioContextLength, listLmStudioModels, mlxRepoSize, searchMlxModels } from './providers/lmstudio'
import { listServers, openInBrowser, stopAllServers, stopServer } from './webTools'
import {
  describeTarget,
  isRetryableCloudError,
  localFallback,
  otherMistralModels,
  rememberMistralModels,
  withMistralRetry,
  type Target
} from './fallback'
import {
  countClaudeCodeSessions,
  countCodexSessions,
  importChatGptExport,
  importClaudeAiExport,
  importClaudeCode,
  importCodex
} from './importer'
import type {
  AppPreferences,
  ApprovalDecision,
  ChatSendResult,
  ChatStreamRequest,
  ConversationSettings,
  EngineKind,
  ExportFormat,
  ToolApproval
} from '@shared/types'
import { DEFAULT_TITLE, autoTitle } from '@shared/types'

let mainWindow: BrowserWindow
const activeStreams = new Map<string, AbortController>()
/** Modifications de fichiers en attente de l'accord de l'utilisateur, par id. */
const pendingApprovals = new Map<string, (d: ApprovalDecision) => void>()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 880,
    minHeight: 560,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local-ia-studio')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  initDb()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllServers()
  unloadLlamaCppModel().catch(() => {})
})

function registerIpc(): void {
  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow.close())

  // --- Engine status ---
  ipcMain.handle('engines:status', async () => {
    const [ollama, lmstudio] = await Promise.all([checkOllama(), checkLmStudio()])
    return { ollama, llamacpp: { available: isLlamaCppAvailable() }, lmstudio }
  })
  ipcMain.handle('engines:contextMax', (_, engine: EngineKind, model: string) =>
    engine === 'ollama'
      ? getOllamaContextLength(model)
      : engine === 'llamacpp'
        ? getGgufContextLength(model)
        : engine === 'lmstudio'
          ? getLmStudioContextLength(model)
          : Promise.resolve(null)
  )

  // --- Mistral (cloud) : la clé reste dans le main process ---
  ipcMain.handle('mistral:status', () => mistralStatus())
  ipcMain.handle('mistral:setKey', async (_, key: string) => {
    const trimmed = key.trim()
    if (!trimmed) throw new Error('Clé vide.')
    await listMistralModels(trimmed) // vérifie la clé avant de l'enregistrer
    setMistralKey(trimmed)
    return mistralStatus()
  })
  ipcMain.handle('mistral:clearKey', () => {
    clearMistralKey()
    return mistralStatus()
  })
  ipcMain.handle('mistral:models', async () => {
    const key = getMistralKey()
    if (!key) return []
    const models = await listMistralModels(key).catch(() => FALLBACK_MISTRAL_MODELS)
    rememberMistralModels(models.map((m) => m.id))
    return models
  })

  // --- Matériel et conseiller de modèle ---
  ipcMain.handle('hardware:info', () => getHardwareInfo())
  ipcMain.handle('advisor:recommend', async (_, task: string) => {
    const key = getMistralKey()
    if (!key) throw new Error('Ajoute une clé Mistral dans les Préférences pour utiliser le conseiller.')
    const [hardware, ollama] = await Promise.all([getHardwareInfo(), checkOllama()])
    const installed: InstalledModel[] = [
      ...(ollama.available
        ? (await listOllamaModels().catch(() => [])).map((m) => ({
            engine: 'ollama' as const,
            id: m.id,
            name: m.name,
            sizeGb: m.sizeBytes ? Math.round((m.sizeBytes / 1024 ** 3) * 10) / 10 : null,
            params: m.paramsLabel
          }))
        : []),
      ...listLlamaCppModels().map((m) => {
        let sizeGb: number | null = null
        try {
          sizeGb = Math.round((fileToModelInfo(m.path).sizeBytes / 1024 ** 3) * 10) / 10
        } catch {
          /* fichier déplacé */
        }
        return { engine: 'llamacpp' as const, id: m.path, name: m.name, sizeGb, params: null }
      }),
      ...(await listLmStudioModels().catch(() => [])).map((m) => ({
        engine: 'lmstudio' as const,
        id: m.id,
        name: `${m.name}${m.format ? ` (${m.format.toUpperCase()})` : ''}`,
        sizeGb: null,
        params: m.quant
      }))
    ]
    return recommendModel(advisorCompleter(key), task, hardware, installed, ollama.available)
  })

  // --- Dossiers accessibles au modèle (lecture seule) ---
  ipcMain.handle('workspace:addRoot', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Autoriser la lecture d’un dossier',
      properties: ['openDirectory']
    })
    if (canceled || !filePaths.length) return getPreferences()
    const prefs = getPreferences()
    if (!prefs.workspaceRoots.includes(filePaths[0])) {
      setPreferences({ ...prefs, workspaceRoots: [...prefs.workspaceRoots, filePaths[0]] })
    }
    return getPreferences()
  })
  ipcMain.handle('workspace:removeRoot', (_, root: string) => {
    const prefs = getPreferences()
    setPreferences({ ...prefs, workspaceRoots: prefs.workspaceRoots.filter((r) => r !== root) })
    return getPreferences()
  })

  // --- Import des conversations Claude ---
  ipcMain.handle('import:claudeCodeCount', () => countClaudeCodeSessions())
  ipcMain.handle('import:claudeCode', (_, target: Target) => importClaudeCode(target))
  ipcMain.handle('import:claudeAi', async (_, target: Target) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir l’export claude.ai (.zip ou conversations.json)',
      properties: ['openFile'],
      filters: [{ name: 'Export Claude', extensions: ['zip', 'json'] }]
    })
    if (canceled || !filePaths.length) return null
    return importClaudeAiExport(filePaths[0], target)
  })
  ipcMain.handle('import:chatgpt', async (_, target: Target) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir l’export ChatGPT (.zip ou conversations.json)',
      properties: ['openFile'],
      filters: [{ name: 'Export ChatGPT', extensions: ['zip', 'json'] }]
    })
    if (canceled || !filePaths.length) return null
    return importChatGptExport(filePaths[0], target)
  })
  ipcMain.handle('import:codexCount', () => countCodexSessions())
  ipcMain.handle('import:codex', (_, target: Target) => importCodex(target))

  // --- Ollama models ---
  ipcMain.handle('ollama:list', () => listOllamaModels())
  ipcMain.handle('ollama:delete', (_, name: string) => deleteOllamaModel(name))
  ipcMain.handle('ollama:pull', (event, name: string) => {
    const controller = new AbortController()
    activeStreams.set(`pull:${name}`, controller)
    return pullOllamaModel(
      name,
      (progress) => event.sender.send('ollama:pull:progress', progress),
      controller.signal
    ).finally(() => activeStreams.delete(`pull:${name}`))
  })
  ipcMain.handle('ollama:pull:cancel', (_, name: string) => {
    activeStreams.get(`pull:${name}`)?.abort()
    activeStreams.delete(`pull:${name}`)
  })

  ipcMain.handle('ollama:install', (event) => {
    const controller = new AbortController()
    activeStreams.set('ollama:install', controller)
    return installOllama((progress) => event.sender.send('ollama:install:progress', progress), controller.signal).finally(
      () => activeStreams.delete('ollama:install')
    )
  })
  ipcMain.handle('ollama:install:cancel', () => {
    activeStreams.get('ollama:install')?.abort()
    activeStreams.delete('ollama:install')
  })

  // --- llama.cpp local models ---
  ipcMain.handle('llamacpp:list', () => listLlamaCppModels().map((m) => ({ ...m, downloaded: isInModelsDir(m.path) })))
  ipcMain.handle('llamacpp:add', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajouter un modèle GGUF',
      properties: ['openFile'],
      filters: [{ name: 'Modèles GGUF', extensions: ['gguf'] }]
    })
    if (canceled || !filePaths.length) return null
    const info = fileToModelInfo(filePaths[0])
    addLlamaCppModel(info.path, info.name)
    return info
  })
  ipcMain.handle('llamacpp:remove', async (_, path: string) => {
    removeLlamaCppModel(path)
    // Un modèle téléchargé par l'app est aussi supprimé du disque (déchargé d'abord : Windows verrouille le fichier).
    if (isInModelsDir(path)) {
      await unloadLlamaCppModel()
      rmSync(path, { force: true })
    }
  })

  // --- Hugging Face (téléchargement de GGUF) ---
  ipcMain.handle('hf:search', (_, query: string) => searchHfModels(query))
  ipcMain.handle('hf:files', (_, repo: string) => listHfGgufFiles(repo))
  ipcMain.handle('hf:download', async (event, repo: string, file: string) => {
    const key = `hf:${repo}/${file}`
    if (activeStreams.has(key)) return
    const controller = new AbortController()
    activeStreams.set(key, controller)
    try {
      const path = await downloadHfFile(
        repo,
        file,
        (p) => !event.sender.isDestroyed() && event.sender.send('hf:download:progress', p),
        controller.signal
      )
      if (path) addLlamaCppModel(path, basename(path))
    } finally {
      activeStreams.delete(key)
    }
  })
  ipcMain.handle('hf:download:cancel', (_, repo: string, file: string) => {
    activeStreams.get(`hf:${repo}/${file}`)?.abort()
  })

  // --- LM Studio (modèles MLX pour Mac Apple Silicon) ---
  ipcMain.handle('lmstudio:models', () => listLmStudioModels())
  ipcMain.handle('mlx:search', (_, query: string) => searchMlxModels(query))
  ipcMain.handle('mlx:size', (_, repo: string) => mlxRepoSize(repo))
  ipcMain.handle('mlx:download', async (event, repo: string) => {
    const key = `mlx:${repo}`
    if (activeStreams.has(key)) return
    const controller = new AbortController()
    activeStreams.set(key, controller)
    try {
      await downloadMlxRepo(repo, (p) => !event.sender.isDestroyed() && event.sender.send('hf:download:progress', p), controller.signal)
    } finally {
      activeStreams.delete(key)
    }
  })
  ipcMain.handle('mlx:cancel', (_, repo: string) => activeStreams.get(`mlx:${repo}`)?.abort())

  // --- Preferences ---
  ipcMain.handle('preferences:get', () => getPreferences())
  ipcMain.handle('preferences:set', (_, prefs: AppPreferences) => setPreferences(prefs))

  // --- Conversations ---
  ipcMain.handle('conversations:list', () => listConversations())
  ipcMain.handle('conversations:create', (_, engine: EngineKind, model: string) => createConversation(engine, model))
  ipcMain.handle(
    'conversations:update',
    (_, id: string, patch: { title?: string; engine?: EngineKind; model?: string; settings?: ConversationSettings }) => {
      updateConversation(id, patch)
      return true
    }
  )
  ipcMain.handle('conversations:delete', (_, id: string) => {
    deleteConversation(id)
    return true
  })
  ipcMain.handle('conversations:messages', (_, id: string) => getMessages(id))
  ipcMain.handle('conversations:search', (_, query: string) => searchConversations(query))
  ipcMain.handle('conversations:setPinned', (_, id: string, pinned: boolean) => {
    setConversationPinned(id, pinned)
    return true
  })
  ipcMain.handle('conversations:export', async (_, id: string, format: ExportFormat) => {
    const conv = getConversation(id)
    if (!conv) return null
    const messages = getMessages(id)
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter la conversation',
      defaultPath: exportFileName(conv.title, format),
      filters:
        format === 'markdown'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    writeFileSync(
      filePath,
      format === 'markdown' ? conversationToMarkdown(conv, messages) : conversationToJson(conv, messages),
      'utf-8'
    )
    return filePath
  })

  // --- Chat streaming ---
  // La promesse se résout avec le résultat final ; seuls les morceaux de texte passent
  // par des événements, ce qui évite de laisser traîner des écouteurs côté renderer.
  ipcMain.handle('chat:send', async (event, req: ChatStreamRequest): Promise<ChatSendResult> => {
    const streamKey = `chat:${req.conversationId}`
    activeStreams.get(streamKey)?.abort()
    const controller = new AbortController()
    activeStreams.set(streamKey, controller)

    const result: ChatSendResult = { user: null, assistant: null, stopped: false, error: null, title: null, fallback: null }
    let fullMessages = req.messages
    if (req.userContent !== undefined) {
      result.user = addMessage(req.conversationId, 'user', req.userContent, req.userAttachments)
      fullMessages = [...req.messages, { role: 'user', content: req.userContent, attachments: req.userAttachments }]
      const conv = getConversation(req.conversationId)
      if (conv && conv.title === DEFAULT_TITLE) {
        result.title = autoTitle(req.userContent)
        updateConversation(req.conversationId, { title: result.title })
      }
    }

    // Plan d'essais : le modèle choisi, puis (si Mistral est saturé) d'autres modèles Mistral,
    // puis un modèle local. On ne bascule que si rien n'a encore été affiché.
    const primary: Target = { engine: req.engine, model: req.model }
    const plan: Target[] = [primary]
    if (req.engine === 'mistral') {
      plan.push(...otherMistralModels(req.model, req.settings.fileAccess).map((model) => ({ engine: 'mistral' as const, model })))
      const local = await localFallback()
      if (local) plan.push(local)
    }

    let full = ''
    let tools: string[] = []
    let notice: string | null = null
    let firstError: string | null = null
    const onToken = (chunk: string): void => {
      full += chunk
      if (!event.sender.isDestroyed()) event.sender.send(`chat:chunk:${req.conversationId}`, chunk)
    }
    let toolCalls = 0
    const onTool = (label: string): void => {
      toolCalls++
      if (!event.sender.isDestroyed()) event.sender.send(`chat:tool:${req.conversationId}`, label)
    }
    // Demande d'accord pour une modification : attend la réponse du renderer (refus si arrêt).
    const onApproval = (approval: Omit<ToolApproval, 'id'>): Promise<ApprovalDecision> =>
      new Promise((resolveDecision) => {
        if (controller.signal.aborted || event.sender.isDestroyed()) return resolveDecision('deny')
        const id = randomUUID()
        const done = (d: ApprovalDecision): void => {
          pendingApprovals.delete(id)
          controller.signal.removeEventListener('abort', onAbort)
          resolveDecision(d)
        }
        const onAbort = (): void => done('deny')
        controller.signal.addEventListener('abort', onAbort)
        pendingApprovals.set(id, done)
        event.sender.send(`chat:approval:${req.conversationId}`, { ...approval, id })
      })
    const writeMode = getPreferences().writeMode

    try {
      for (let i = 0; i < plan.length; i++) {
        const target = plan[i]
        try {
          const attempt = (): ReturnType<typeof runAttempt> =>
            runAttempt(
              target.engine,
              target.model,
              fullMessages,
              req.settings,
              { onToken, onTool, onApproval },
              controller.signal,
              getMistralKey(),
              writeMode
            )
          // Pas de nouvel essai si du texte est affiché ou si des outils ont déjà tourné (écritures).
          const res = target.engine === 'mistral' ? await withMistralRetry(attempt, () => !full && !toolCalls) : await attempt()
          tools = res.tools
          notice = res.notice
          if (i > 0) {
            result.fallback = target
            notice = [`${firstError ?? 'Mistral indisponible'} → réponse générée par ${describeTarget(target)}.`, notice]
              .filter(Boolean)
              .join(' ')
          }
          break
        } catch (err) {
          const last = i === plan.length - 1
          if (controller.signal.aborted || full || toolCalls || last || !isRetryableCloudError(err)) throw err
          firstError ??= err instanceof Error ? err.message.replace(/, réessaie.*$/, '') : String(err)
        }
      }
      result.stopped = controller.signal.aborted
    } catch (err) {
      if (controller.signal.aborted) result.stopped = true
      else result.error = err instanceof Error ? err.message : String(err)
    } finally {
      if (activeStreams.get(streamKey) === controller) activeStreams.delete(streamKey)
    }
    // La conversation a pu être supprimée pendant la génération (clé étrangère).
    if (full.trim() && getConversation(req.conversationId)) {
      result.assistant = addMessage(req.conversationId, 'assistant', full, undefined, { tools, notice: notice ?? undefined })
    }
    return result
  })

  ipcMain.handle('servers:list', () => listServers())
  ipcMain.handle('servers:stop', (_, id: string) => stopServer(id))
  ipcMain.handle('servers:open', (_, url: string) => openInBrowser(url))

  ipcMain.handle('chat:approve', (_, id: string, decision: ApprovalDecision) => {
    pendingApprovals.get(id)?.(decision)
  })

  ipcMain.handle('chat:cancel', (_, conversationId: string) => {
    activeStreams.get(`chat:${conversationId}`)?.abort()
  })

  ipcMain.handle('messages:deleteFrom', (_, conversationId: string, fromMessageId: string) => {
    deleteMessagesFrom(conversationId, fromMessageId)
    return true
  })
  ipcMain.handle('messages:delete', (_, messageId: string) => {
    deleteMessage(messageId)
    return true
  })
}

/**
 * JSON pour le conseiller : Mistral (avec nouvel essai), puis d'autres modèles Mistral,
 * puis un modèle local en mode JSON si l'API reste saturée.
 */
function advisorCompleter(key: string): JsonCompleter {
  return async (system, user) => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
    let lastError: unknown = null
    for (const model of [DEFAULT_MISTRAL_MODEL, ...otherMistralModels(DEFAULT_MISTRAL_MODEL)]) {
      try {
        const json = await withMistralRetry(() => completeMistralJson<unknown>(key, model, messages))
        return { json: JSON.stringify(json), by: model === DEFAULT_MISTRAL_MODEL ? null : `${model} (Mistral)` }
      } catch (err) {
        lastError = err
        if (!isRetryableCloudError(err)) throw err
      }
    }
    const local = await localFallback()
    if (!local) throw lastError
    const json =
      local.engine === 'ollama'
        ? await completeJsonOllama(local.model, system, user)
        : local.engine === 'lmstudio'
          ? await completeJsonLmStudio(local.model, system, user)
          : await completeJsonLlamaCpp(local.model, system, user)
    return { json, by: `${describeTarget(local)} (local, Mistral saturé)` }
  }
}
