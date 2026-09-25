import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  subjects: {
    get: () => ipcRenderer.invoke('subjects:get'),
    create: (data: unknown) => ipcRenderer.invoke('subjects:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('subjects:update', id, data),
    reorder: (ids: string[]) => ipcRenderer.invoke('subjects:reorder', ids),
    delete: (id: string) => ipcRenderer.invoke('subjects:delete', id)
  },
  courses: {
    bySubject: (subjectId: string) => ipcRenderer.invoke('courses:bySubject', subjectId),
    get: (id: string) => ipcRenderer.invoke('courses:get', id),
    create: (data: unknown) => ipcRenderer.invoke('courses:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('courses:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('courses:delete', id),
    all: () => ipcRenderer.invoke('courses:all')
  },
  versions: {
    get: (courseId: string) => ipcRenderer.invoke('versions:get', courseId),
    create: (data: unknown) => ipcRenderer.invoke('versions:create', data)
  },
  tags: {
    get: () => ipcRenderer.invoke('tags:get'),
    create: (data: unknown) => ipcRenderer.invoke('tags:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('tags:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('tags:delete', id),
    setForCourse: (courseId: string, tagIds: string[]) => ipcRenderer.invoke('courses:setTags', courseId, tagIds)
  },
  attachments: {
    get: (courseId: string) => ipcRenderer.invoke('attachments:get', courseId),
    add: (data: { courseId: string; sourcePath: string }) => ipcRenderer.invoke('attachments:add', data),
    delete: (id: string) => ipcRenderer.invoke('attachments:delete', id),
    reveal: (filePath: string) => ipcRenderer.invoke('attachments:reveal', filePath),
    open: (filePath: string) => ipcRenderer.invoke('attachments:open', filePath),
    // Resolves the real filesystem path of a File dropped onto the window
    getPathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  exportPdf: (data: { title: string; html: string }): Promise<string | null> => ipcRenderer.invoke('export:pdf', data),
  exportMarkdown: (data: { title: string; html: string }): Promise<string | null> => ipcRenderer.invoke('export:markdown', data),
  backup: {
    export: (): Promise<string | null> => ipcRenderer.invoke('backup:export'),
    import: (): Promise<boolean> => ipcRenderer.invoke('backup:import'),
    openFolder: (): Promise<boolean> => ipcRenderer.invoke('backup:openFolder'),
    latest: (): Promise<{ name: string; at: number } | null> => ipcRenderer.invoke('backup:latest'),
    resetAll: (): Promise<boolean> => ipcRenderer.invoke('backup:resetAll'),
    chooseAutoFolder: (): Promise<string | null> => ipcRenderer.invoke('backup:chooseAutoFolder')
  },
  quizResults: {
    get: () => ipcRenderer.invoke('quizResults:get'),
    create: (data: unknown) => ipcRenderer.invoke('quizResults:create', data)
  },
  flashcards: {
    get: (courseId: string) => ipcRenderer.invoke('flashcards:get', courseId),
    due: (courseId: string) => ipcRenderer.invoke('flashcards:due', courseId),
    dueAll: () => ipcRenderer.invoke('flashcards:dueAll'),
    dueByTag: (tagId: string) => ipcRenderer.invoke('flashcards:dueByTag', tagId),
    forecast: (): Promise<{ fresh: number; learning: number; mature: number; avgEase: number; dueByDay: Array<{ day: string; count: number }> }> => ipcRenderer.invoke('flashcards:forecast'),
    create: (courseId: string, cards: { front: string; back: string }[]) => ipcRenderer.invoke('flashcards:create', courseId, cards),
    review: (id: string, grade: 0 | 1 | 2 | 3) => ipcRenderer.invoke('flashcards:review', id, grade),
    delete: (id: string) => ipcRenderer.invoke('flashcards:delete', id),
    exportAnki: (courseId?: string): Promise<{ filePath: string; count: number } | null> => ipcRenderer.invoke('flashcards:exportAnki', courseId),
    importText: (courseId: string): Promise<{ count: number } | null> => ipcRenderer.invoke('flashcards:importText', courseId)
  },
  review: {
    stats: (): Promise<{ streak: number; today: number; total: number; last14: Array<{ day: string; count: number }> }> => ipcRenderer.invoke('review:stats')
  },
  trash: {
    subjects: () => ipcRenderer.invoke('trash:subjects'),
    courses: () => ipcRenderer.invoke('trash:courses'),
    restoreSubject: (id: string) => ipcRenderer.invoke('trash:restoreSubject', id),
    restoreCourse: (id: string) => ipcRenderer.invoke('trash:restoreCourse', id),
    purgeSubject: (id: string) => ipcRenderer.invoke('trash:purgeSubject', id),
    purgeCourse: (id: string) => ipcRenderer.invoke('trash:purgeCourse', id),
    empty: () => ipcRenderer.invoke('trash:empty')
  },
  transcribe: (data: { apiKey: string; filePath: string }): Promise<string> => ipcRenderer.invoke('ai:transcribe', data),
  recording: {
    getSources: () => ipcRenderer.invoke('recording:getSources'),
    save: (data: { subjectName: string; courseName: string; type: 'audio' | 'video'; buffer: number[] }) => ipcRenderer.invoke('recording:save', data),
    reveal: (filePath: string) => ipcRenderer.invoke('recording:reveal', filePath)
  },
  media: {
    url: (filePath: string): Promise<string> => ipcRenderer.invoke('media:url', filePath)
  },
  ai: {
    // Streaming: returns a cleanup function
    stream: (
      data: unknown,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (err: string) => void
    ): (() => void) => {
      const handleChunk = (_: unknown, chunk: string) => onChunk(chunk)
      const handleDone = () => onDone()
      const handleError = (_: unknown, err: string) => onError(err)

      ipcRenderer.on('ai:chunk', handleChunk)
      ipcRenderer.on('ai:done', handleDone)
      ipcRenderer.on('ai:error', handleError)

      ipcRenderer.invoke('ai:stream', data)

      return () => {
        ipcRenderer.removeListener('ai:chunk', handleChunk)
        ipcRenderer.removeListener('ai:done', handleDone)
        ipcRenderer.removeListener('ai:error', handleError)
      }
    },
    // Non-streaming completion, used by the quiz generator to get a single JSON response
    complete: (data: unknown): Promise<string> => ipcRenderer.invoke('ai:complete', data)
  },
  documents: {
    // Opens a native file picker (pdf/docx/odt/txt) and returns the extracted plain text
    import: (): Promise<{ fileName: string; text: string } | null> => ipcRenderer.invoke('documents:import'),
    // Fetches a web page and returns its readable text
    importUrl: (url: string): Promise<{ fileName: string; text: string }> => ipcRenderer.invoke('documents:importUrl', url)
  },
  study: {
    log: (subjectId: string | null, seconds: number): Promise<boolean> => ipcRenderer.invoke('study:log', subjectId, seconds),
    stats: (): Promise<{
      total: number; week: number; today: number
      bySubject: Array<{ subjectId: string | null; seconds: number }>
      byDay: Array<{ day: string; seconds: number }>
    }> => ipcRenderer.invoke('study:stats'),
    streak: (): Promise<{ current: number; longest: number }> => ipcRenderer.invoke('study:streak')
  },
  images: {
    // Opens a native file picker for images and returns base64 data URLs
    pick: (): Promise<{ fileName: string; dataUrl: string }[]> => ipcRenderer.invoke('images:pick')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (data: unknown) => ipcRenderer.invoke('settings:set', data)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    // Fired when the user clicks the "flashcards due" system notification
    onReviewAll: (cb: () => void) => {
      ipcRenderer.on('open-review-all', cb)
      return () => ipcRenderer.removeListener('open-review-all', cb)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
