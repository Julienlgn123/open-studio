import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  initDb,
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  addMessage,
  deleteMessagesFrom,
  listLlamaCppModels,
  addLlamaCppModel,
  removeLlamaCppModel
} from './db'
import { checkOllama, listOllamaModels, deleteOllamaModel, pullOllamaModel, streamOllamaChat } from './providers/ollama'
import { isLlamaCppAvailable, fileToModelInfo, streamLlamaCppChat, unloadLlamaCppModel } from './providers/llamacpp'
import { installOllama } from './providers/ollamaInstaller'
import type { ChatStreamRequest, ConversationSettings, EngineKind } from '@shared/types'

let mainWindow: BrowserWindow
const activeStreams = new Map<string, AbortController>()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 880,
    minHeight: 560,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0d',
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
    const [ollama, llamacppAvailable] = await Promise.all([checkOllama(), isLlamaCppAvailable()])
    return { ollama, llamacpp: { available: llamacppAvailable } }
  })

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
  ipcMain.handle('llamacpp:list', () => listLlamaCppModels())
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
  ipcMain.handle('llamacpp:remove', (_, path: string) => removeLlamaCppModel(path))

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

  // --- Chat streaming ---
  ipcMain.handle('chat:send', async (event, req: ChatStreamRequest & { userContent: string }) => {
    const streamKey = `chat:${req.conversationId}`
    const controller = new AbortController()
    activeStreams.set(streamKey, controller)

    addMessage(req.conversationId, 'user', req.userContent)
    const fullMessages = [...req.messages, { role: 'user' as const, content: req.userContent }]

    let full = ''
    try {
      const onToken = (chunk: string): void => {
        full += chunk
        event.sender.send(`chat:chunk:${req.conversationId}`, chunk)
      }
      if (req.engine === 'ollama') {
        await streamOllamaChat(req.model, fullMessages, req.settings, onToken, controller.signal)
      } else {
        await streamLlamaCppChat(req.model, fullMessages, req.settings, onToken, controller.signal)
      }
      const saved = addMessage(req.conversationId, 'assistant', full)
      event.sender.send(`chat:done:${req.conversationId}`, saved)
    } catch (err) {
      if (full.trim()) addMessage(req.conversationId, 'assistant', full)
      const message = err instanceof Error ? err.message : String(err)
      event.sender.send(`chat:error:${req.conversationId}`, message)
    } finally {
      activeStreams.delete(streamKey)
    }
  })

  ipcMain.handle('chat:cancel', (_, conversationId: string) => {
    activeStreams.get(`chat:${conversationId}`)?.abort()
    activeStreams.delete(`chat:${conversationId}`)
  })

  ipcMain.handle('messages:deleteFrom', (_, conversationId: string, fromMessageId: string) => {
    deleteMessagesFrom(conversationId, fromMessageId)
    return true
  })
}
