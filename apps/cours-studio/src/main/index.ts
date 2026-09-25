import { app, BrowserWindow, shell, ipcMain, desktopCapturer, protocol, net, dialog, Notification, Menu, MenuItem } from 'electron'
import { join, extname, dirname } from 'path'
import { pathToFileURL } from 'url'
import { tmpdir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb, getSubjects, createSubject, updateSubject, reorderSubjects,
  softDeleteSubject, restoreSubject, getTrashedSubjects, permanentlyDeleteSubject,
  getCoursesBySubject, getCourse, createCourse, updateCourse,
  softDeleteCourse, restoreCourse, getTrashedCourses, permanentlyDeleteCourse,
  emptyTrash, purgeOldTrash,
  getAllCourses, getVersions, createVersion,
  getTags, createTag, updateTag, deleteTag, setCourseTags,
  getAttachments, createAttachment, deleteAttachment,
  getQuizResults, createQuizResult,
  getFlashcards, getDueFlashcards, getAllDueFlashcards, countAllDueFlashcards,
  getFlashcardsForExport, createFlashcards, reviewFlashcard, deleteFlashcard,
  logStudySession, getStudyStats, getStudyStreak } from './db'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync, chmodSync, copyFileSync, statSync, rmSync } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { pickAndExtractDocument, extractArticleFromUrl } from './documents'
import { exportBackup, importBackup, autoBackup, openBackupsFolder, latestBackupInfo, resetAllData, chooseAutoBackupFolder, runAutoBackupToFolder } from './backup'
import { htmlToMarkdown } from './markdown'

// Cross-platform ffmpeg binary name
const ffmpegBin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath: string = require('ffmpeg-static')

if (app.isPackaged) {
  // electron-builder unpacks native modules into app.asar.unpacked
  const unpacked = ffmpegPath.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep)
  if (existsSync(unpacked)) {
    ffmpegPath = unpacked
  } else {
    // extraResources fallback (set in electron-builder config)
    ffmpegPath = join(process.resourcesPath, 'ffmpeg', ffmpegBin)
  }
}

// Ensure executable on Unix
if (process.platform !== 'win32' && existsSync(ffmpegPath)) {
  try { chmodSync(ffmpegPath, 0o755) } catch { /* ok */ }
}

ffmpeg.setFfmpegPath(ffmpegPath)

let mainWindow: BrowserWindow

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true } }
])

function sanitize(str: string): string {
  return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'sans-titre'
}

function convertToMp3(input: string, output: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .format('mp3')
      .on('end', () => { try { unlinkSync(input) } catch { /* ok */ }; resolve(output) })
      .on('error', (err) => reject(err))
      .save(output)
  })
}

function convertToMp4(input: string, output: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
      .format('mp4')
      .on('end', () => { try { unlinkSync(input) } catch { /* ok */ }; resolve(output) })
      .on('error', (err) => reject(err))
      .save(output)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    show: false, frame: false, titleBarStyle: 'hidden', backgroundColor: '#0d0d0f',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, plugins: true, spellcheck: true }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())

  // French (+ English) spell checking with a right-click correction menu
  try {
    const ses = mainWindow.webContents.session
    // macOS uses the OS spellchecker and ignores this; Windows/Linux need it set
    if (process.platform !== 'darwin') {
      const avail = ses.availableSpellCheckerLanguages
      const langs = ['fr', 'en-US'].filter((l) => avail.includes(l))
      if (langs.length) ses.setSpellCheckerLanguages(langs)
    }
  } catch { /* spellcheck is best-effort */ }

  mainWindow.webContents.on('context-menu', (_e, params) => {
    if (!params.misspelledWord && !params.isEditable) return
    const menu = new Menu()
    for (const s of params.dictionarySuggestions) {
      menu.append(new MenuItem({ label: s, click: () => mainWindow.webContents.replaceMisspelling(s) }))
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length) menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({
        label: 'Ajouter au dictionnaire',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }))
      menu.append(new MenuItem({ type: 'separator' }))
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'cut' }))
      menu.append(new MenuItem({ role: 'copy' }))
      menu.append(new MenuItem({ role: 'paste' }))
    } else if (params.selectionText) {
      menu.append(new MenuItem({ role: 'copy' }))
    }
    if (menu.items.length) menu.popup()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cours-studio')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  protocol.handle('media', (request) => {
    const path = request.url.slice('media://'.length)
    return net.fetch(`file://${path}`)
  })

  initDb()
  autoBackup()
  // Anything trashed more than TRASH_RETENTION_MS ago is gone for good now — the DB rows
  // are already removed by purgeOldTrash(), this just mops up the files that go with them.
  for (const course of purgeOldTrash()) deleteCourseFiles(course)
  try {
    const settingsPath = join(app.getPath('userData'), 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    if (settings.autoBackupFolder) runAutoBackupToFolder(settings.autoBackupFolder)
  } catch { /* no settings file yet, or it's unreadable — nothing to back up to */ }
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

  // Nudge the user if flashcards are waiting to be reviewed
  try {
    const due = countAllDueFlashcards()
    if (due > 0 && Notification.isSupported()) {
      const n = new Notification({
        title: 'Cours Studio — révisions',
        body: `${due} flashcard${due > 1 ? 's' : ''} à réviser aujourd'hui.`
      })
      n.on('click', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.webContents.send('open-review-all') }
      })
      n.show()
    }
  } catch { /* notifications are best-effort */ }
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

function getRecordingsDir(): string {
  const dir = join(app.getPath('userData'), 'recordings')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getAttachmentsDir(): string {
  const dir = join(app.getPath('userData'), 'attachments')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// The DB row for a course is gone by the time this runs — this only mops up what's left on disk
// (its recording and its whole attachments/<courseId> folder), so any failure here is harmless.
function deleteCourseFiles(course: { id: string; audioPath?: string; videoPath?: string }): void {
  if (course.audioPath) { try { unlinkSync(course.audioPath) } catch { /* already gone */ } }
  if (course.videoPath) { try { unlinkSync(course.videoPath) } catch { /* already gone */ } }
  try { rmSync(join(getAttachmentsDir(), course.id), { recursive: true, force: true }) } catch { /* already gone */ }
}

function registerIpc(): void {
  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximize', () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize() })
  ipcMain.handle('window:close', () => mainWindow.close())

  ipcMain.handle('subjects:get', () => getSubjects())
  ipcMain.handle('subjects:create', (_, d) => createSubject(d))
  ipcMain.handle('subjects:update', (_, id, d) => { updateSubject(id, d); return true })
  ipcMain.handle('subjects:reorder', (_, ids: string[]) => { reorderSubjects(ids); return true })
  // Moves to the trash — rows and files stay put until restored or purged (manually or
  // automatically after TRASH_RETENTION_MS).
  ipcMain.handle('subjects:delete', (_, id) => { softDeleteSubject(id); return true })

  ipcMain.handle('courses:bySubject', (_, id) => getCoursesBySubject(id))
  ipcMain.handle('courses:get', (_, id) => getCourse(id))
  ipcMain.handle('courses:create', (_, d) => createCourse(d))
  ipcMain.handle('courses:update', (_, id, d) => { updateCourse(id, d); return true })
  ipcMain.handle('courses:delete', (_, id) => { softDeleteCourse(id); return true })
  ipcMain.handle('courses:all', () => getAllCourses())

  // ─── Trash ───────────────────────────────────────────────────────────────
  ipcMain.handle('trash:subjects', () => getTrashedSubjects())
  ipcMain.handle('trash:courses', () => getTrashedCourses())
  ipcMain.handle('trash:restoreSubject', (_, id) => { restoreSubject(id); return true })
  ipcMain.handle('trash:restoreCourse', (_, id) => { restoreCourse(id); return true })
  ipcMain.handle('trash:purgeSubject', (_, id) => {
    for (const c of permanentlyDeleteSubject(id)) deleteCourseFiles(c)
    return true
  })
  ipcMain.handle('trash:purgeCourse', (_, id) => {
    const c = permanentlyDeleteCourse(id)
    if (c) deleteCourseFiles(c)
    return true
  })
  ipcMain.handle('trash:empty', () => {
    for (const c of emptyTrash()) deleteCourseFiles(c)
    return true
  })

  ipcMain.handle('study:streak', () => getStudyStreak())

  ipcMain.handle('versions:get', (_, id) => getVersions(id))
  ipcMain.handle('versions:create', (_, d) => createVersion(d))

  ipcMain.handle('tags:get', () => getTags())
  ipcMain.handle('tags:create', (_, d) => createTag(d))
  ipcMain.handle('tags:update', (_, id, d) => { updateTag(id, d); return true })
  ipcMain.handle('tags:delete', (_, id) => { deleteTag(id); return true })
  ipcMain.handle('courses:setTags', (_, courseId, tagIds) => { setCourseTags(courseId, tagIds); return true })

  // Attachments: copy a dropped/picked file into userData/attachments and register it
  ipcMain.handle('attachments:get', (_, courseId) => getAttachments(courseId))
  ipcMain.handle('attachments:add', (_, { courseId, sourcePath }: { courseId: string; sourcePath: string }) => {
    if (!existsSync(sourcePath)) throw new Error('Fichier introuvable : ' + sourcePath)
    const dir = join(getAttachmentsDir(), courseId)
    mkdirSync(dir, { recursive: true })
    const originalName = sourcePath.split(/[\\/]/).pop() ?? 'fichier'
    const ext = extname(originalName)
    const base = originalName.slice(0, originalName.length - ext.length)
    let destPath = join(dir, originalName)
    let n = 1
    while (existsSync(destPath)) { destPath = join(dir, `${base} (${n})${ext}`); n++ }
    copyFileSync(sourcePath, destPath)
    const size = statSync(destPath).size
    return createAttachment({ courseId, fileName: originalName, filePath: destPath, size })
  })
  ipcMain.handle('attachments:delete', (_, id) => {
    const attachment = deleteAttachment(id)
    if (attachment) { try { unlinkSync(attachment.filePath) } catch { /* already gone */ } }
    return true
  })
  ipcMain.handle('attachments:reveal', (_, filePath: string) => shell.showItemInFolder(filePath))
  ipcMain.handle('attachments:open', (_, filePath: string) => shell.openPath(filePath))

  ipcMain.handle('quizResults:get', () => getQuizResults())
  ipcMain.handle('quizResults:create', (_, d) => createQuizResult(d))

  ipcMain.handle('flashcards:get', (_, courseId) => getFlashcards(courseId))
  ipcMain.handle('flashcards:due', (_, courseId) => getDueFlashcards(courseId))
  ipcMain.handle('flashcards:dueAll', () => getAllDueFlashcards())
  ipcMain.handle('flashcards:create', (_, courseId, cards) => createFlashcards(courseId, cards))
  ipcMain.handle('flashcards:review', (_, id, grade) => { reviewFlashcard(id, grade); return true })
  ipcMain.handle('flashcards:delete', (_, id) => { deleteFlashcard(id); return true })

  // Export flashcards as an Anki-friendly file (tab-separated, HTML allowed)
  ipcMain.handle('flashcards:exportAnki', async (_, courseId?: string) => {
    const cards = getFlashcardsForExport(courseId)
    if (!cards.length) throw new Error('Aucune flashcard à exporter.')
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter vers Anki',
      defaultPath: `flashcards-cours-studio-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: 'Texte Anki', extensions: ['txt'] }]
    })
    if (canceled || !filePath) return null
    const esc = (s: string): string => s.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>').trim()
    const header = '#separator:tab\n#html:true\n#tags column:3\n'
    const body = cards
      .map((c) => `${esc(c.front)}\t${esc(c.back)}\t${esc(`${c.subjectName}::${c.courseTitle}`)}`)
      .join('\n')
    writeFileSync(filePath, header + body, 'utf-8')
    return { filePath, count: cards.length }
  })

  // Audio transcription via Mistral's Voxtral speech-to-text model
  ipcMain.handle('ai:transcribe', async (_, { apiKey, filePath }: { apiKey: string; filePath: string }) => {
    if (!existsSync(filePath)) throw new Error('Fichier audio introuvable')
    const buffer = readFileSync(filePath)
    const fileName = filePath.split(/[\\/]/).pop() ?? 'audio.mp3'
    const form = new FormData()
    form.append('model', 'voxtral-mini-latest')
    form.append('file', new Blob([buffer]), fileName)
    const response = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    })
    if (!response.ok) {
      let errText = await response.text()
      try {
        const parsed = JSON.parse(errText) as { message?: string }
        if (parsed.message) errText = parsed.message
      } catch { /* keep raw */ }
      throw new Error(errText)
    }
    const data = await response.json() as { text?: string }
    return data.text ?? ''
  })

  ipcMain.handle('recording:getSources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] })
    return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }))
  })

  // Save + convert to MP3 or MP4
  ipcMain.handle('recording:save', async (_, { subjectName, courseName, type, buffer }: {
    subjectName: string; courseName: string; type: 'audio' | 'video'; buffer: number[]
  }) => {
    const folderName = `${sanitize(subjectName)} - ${sanitize(courseName)}`
    const dir = join(getRecordingsDir(), folderName)
    mkdirSync(dir, { recursive: true })

    const date = new Date().toISOString().slice(0, 10)
    const ts = Date.now()

    // Write raw WebM first
    const rawPath = join(dir, `${type}-${date}-${ts}.webm`)
    writeFileSync(rawPath, Buffer.from(buffer))

    // Convert: audio → MP3, video → MP4
    if (type === 'audio') {
      const mp3Path = join(dir, `audio-${date}-${ts}.mp3`)
      try {
        return await convertToMp3(rawPath, mp3Path)
      } catch {
        // ffmpeg failed: keep the webm as fallback
        return rawPath
      }
    } else {
      const mp4Path = join(dir, `video-${date}-${ts}.mp4`)
      try {
        return await convertToMp4(rawPath, mp4Path)
      } catch {
        return rawPath
      }
    }
  })

  ipcMain.handle('media:url', (_, filePath: string) => {
    const normalized = filePath.split('\\').join('/')
    return `media://${normalized.startsWith('/') ? '' : '/'}${normalized}`
  })

  ipcMain.handle('recording:reveal', (_, filePath: string) => shell.showItemInFolder(filePath))

  // Mistral streaming — use model from settings or fallback to mistral-small-latest
  ipcMain.handle('ai:stream', async (event, { apiKey, messages, model }: {
    apiKey: string; messages: unknown[]; model?: string
  }) => {
    const selectedModel = model || 'open-mistral-7b'
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: selectedModel, messages, temperature: 0.7, max_tokens: 4096, stream: true })
      })

      if (!response.ok) {
        let errText = await response.text()
        // Try to extract friendly message
        try {
          const parsed = JSON.parse(errText) as { message?: string }
          if (parsed.message) errText = parsed.message
        } catch { /* keep raw */ }
        event.sender.send('ai:error', errText)
        return
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { event.sender.send('ai:done'); return }
          try {
            const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> }
            const delta = parsed.choices[0]?.delta?.content
            if (delta) event.sender.send('ai:chunk', delta)
          } catch { /* skip */ }
        }
      }
      event.sender.send('ai:done')
    } catch (err) {
      event.sender.send('ai:error', err instanceof Error ? err.message : String(err))
    }
  })

  // Non-streaming completion — used for the quiz generator, which needs a single JSON payload
  ipcMain.handle('ai:complete', async (_, { apiKey, messages, model, json }: {
    apiKey: string; messages: unknown[]; model?: string; json?: boolean
  }) => {
    const selectedModel = model || 'open-mistral-7b'
    const body: Record<string, unknown> = { model: selectedModel, messages, temperature: 0.5, max_tokens: 4096 }
    if (json) body.response_format = { type: 'json_object' }
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      let errText = await response.text()
      try {
        const parsed = JSON.parse(errText) as { message?: string }
        if (parsed.message) errText = parsed.message
      } catch { /* keep raw */ }
      throw new Error(errText)
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
  })

  // KaTeX bakes math into <span> soup that relies entirely on katex.min.css
  // for glyph positioning (fractions, radicals, sub/superscripts) — without
  // it, exported formulas render as unstyled, misplaced text. Read once and
  // cache: it's a static file bundled with the app, never changes at runtime.
  let katexCssForExport: string | null = null
  function getKatexCssForExport(): string {
    if (katexCssForExport !== null) return katexCssForExport
    try {
      const cssPath = require.resolve('katex/dist/katex.min.css')
      const fontsDir = pathToFileURL(join(dirname(cssPath), 'fonts') + '/').href
      // Font URLs are relative ("fonts/KaTeX_Main-Regular.woff2") in the
      // original file, which only resolves from katex's own dist/ folder.
      // Rewritten to absolute file:// URLs so they still work once this CSS
      // is inlined into a temp HTML page elsewhere on disk.
      katexCssForExport = readFileSync(cssPath, 'utf-8').replace(/url\(fonts\//g, `url(${fontsDir}`)
    } catch {
      katexCssForExport = '' // KaTeX not resolvable (shouldn't happen) — export still works, just unstyled math.
    }
    return katexCssForExport
  }

  // Export a course to PDF: render its HTML in a hidden window, then print to PDF
  ipcMain.handle('export:pdf', async (_, { title, html }: { title: string; html: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter en PDF',
      defaultPath: `${title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || 'cours'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null

    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
    const page = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        ${getKatexCssForExport()}
        body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #111; padding: 32px 40px; line-height: 1.6; }
        h1 { font-size: 22px; margin-bottom: 18px; }
        h2 { font-size: 17px; margin-top: 22px; }
        h3 { font-size: 14px; margin-top: 16px; }
        img { max-width: 100%; }
        pre { background: #f3f3f3; padding: 10px; border-radius: 6px; overflow: auto; }
        blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding-left: 12px; color: #444; }
        .katex-display { margin: 12px 0; }
      </style>
      </head><body><h1>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1>${html}</body></html>`
    // Loaded as a real file:// page (not a data: URL): the katex.min.css
    // above references its fonts via absolute file:// URLs, and a data:
    // document's opaque origin blocks those cross-origin font loads —
    // file:// to file:// subresource loads are unrestricted.
    const tempPath = join(tmpdir(), `cours-studio-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
    writeFileSync(tempPath, page, 'utf-8')
    try {
      await printWindow.loadFile(tempPath)
      const buffer = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      writeFileSync(filePath, buffer)
    } finally {
      printWindow.destroy()
      unlinkSync(tempPath)
    }
    return filePath
  })

  // Export a single course as a Markdown (.md) file
  ipcMain.handle('export:markdown', async (_, { title, html }: { title: string; html: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter en Markdown',
      defaultPath: `${(title || 'cours').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (canceled || !filePath) return null
    const md = `# ${title}\n\n${htmlToMarkdown(html)}\n`
    writeFileSync(filePath, md, 'utf-8')
    return filePath
  })

  // Backup / restore of the whole local data set
  ipcMain.handle('backup:export', () => exportBackup(mainWindow))
  ipcMain.handle('backup:import', () => importBackup(mainWindow))
  ipcMain.handle('backup:openFolder', () => { openBackupsFolder(); return true })
  ipcMain.handle('backup:latest', () => latestBackupInfo())
  ipcMain.handle('backup:resetAll', () => resetAllData(mainWindow))
  ipcMain.handle('backup:chooseAutoFolder', () => chooseAutoBackupFolder(mainWindow))

  // Document import: pick a file (pdf/docx/odt/txt) and extract its plain text
  ipcMain.handle('documents:import', async () => {
    try {
      return await pickAndExtractDocument(mainWindow)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  // Import readable text from a web page
  ipcMain.handle('documents:importUrl', async (_, url: string) => {
    try {
      return await extractArticleFromUrl(url)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })

  // Study sessions (Pomodoro)
  ipcMain.handle('study:log', (_, subjectId: string | null, seconds: number) => { logStudySession(subjectId, seconds); return true })
  ipcMain.handle('study:stats', () => getStudyStats())

  // Pick one or more images (screenshots, photos of handwritten notes...) and
  // return them as base64 data URLs, ready to send to a vision-capable model
  ipcMain.handle('images:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajouter des images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (canceled || filePaths.length === 0) return []
    return filePaths.map((filePath) => {
      const ext = extname(filePath).slice(1).toLowerCase()
      const mime = ext === 'jpg' ? 'jpeg' : ext
      const buffer = readFileSync(filePath)
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath
      return { fileName, dataUrl: `data:image/${mime};base64,${buffer.toString('base64')}` }
    })
  })

  const settingsPath = join(app.getPath('userData'), 'settings.json')
  ipcMain.handle('settings:get', () => { try { return JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { return {} } })
  ipcMain.handle('settings:set', (_, d) => { writeFileSync(settingsPath, JSON.stringify(d, null, 2)); return true })
  ipcMain.handle('app:version', () => app.getVersion())
}
