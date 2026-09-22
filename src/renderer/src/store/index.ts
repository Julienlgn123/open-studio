import { create } from 'zustand'
import type { Subject, Course, CourseVersion, Tag } from '../../../shared/types'

// Kept outside the store state on purpose: showToast can be called again before an
// earlier toast's timer has fired (e.g. two validation errors in a row). Without
// clearing the previous timer, that stale timeout still hides the toast at its own
// 3s mark, cutting the newer message's display time short or hiding it immediately.
let toastTimer: ReturnType<typeof setTimeout> | null = null

export interface AITask {
  courseId: string
  courseTitle: string
  courseEmoji: string
  action: string
  actionLabel: string
  status: 'running' | 'done' | 'error'
  result?: string
  error?: string
}

interface AppStore {
  subjects: Subject[]
  courses: Course[]
  tags: Tag[]
  activeCourseId: string | null
  activeSubjectId: string | null

  view: 'home' | 'subject' | 'editor' | 'ai' | 'quiz' | 'flashcards' | 'stats'
  sidebarCollapsed: boolean
  searchQuery: string
  // When true, the Flashcards view opens straight into the global review session
  flashcardsWantAll: boolean
  pomodoroOpen: boolean
  focusMode: boolean
  settings: { mistralApiKey?: string; mistralModel?: string; theme?: 'dark' | 'light'; numberedHeadings?: boolean }

  toast: { message: string; type: 'success' | 'error' | 'info' } | null

  // Global AI task banner
  aiTask: AITask | null

  loadSubjects: () => Promise<void>
  loadCourses: (subjectId?: string) => Promise<void>
  createSubject: (data: Omit<Subject, 'id' | 'createdAt'>) => Promise<Subject>
  updateSubject: (id: string, data: Partial<Omit<Subject, 'id' | 'createdAt'>>) => Promise<void>
  deleteSubject: (id: string) => Promise<void>
  createCourse: (data: { subjectId: string; title?: string; emoji?: string; content?: string; audioPath?: string; videoPath?: string }) => Promise<Course>
  updateCourse: (id: string, data: Partial<{ title: string; emoji: string; content: string; subjectId: string; audioPath: string; videoPath: string }>) => Promise<void>
  deleteCourse: (id: string) => Promise<void>
  loadTags: () => Promise<void>
  createTag: (data: { name: string; emoji: string; color: string }) => Promise<Tag>
  updateTag: (id: string, data: Partial<{ name: string; emoji: string; color: string }>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  setCourseTags: (courseId: string, tagIds: string[]) => Promise<void>
  setActiveCourse: (id: string | null) => void
  setActiveSubject: (id: string | null) => void
  setView: (view: AppStore['view']) => void
  setSearchQuery: (q: string) => void
  openGlobalReview: () => void
  clearFlashcardsWantAll: () => void
  togglePomodoro: () => void
  setFocusMode: (v: boolean) => void
  loadSettings: () => Promise<void>
  saveSettings: (s: AppStore['settings']) => Promise<void>
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  hideToast: () => void

  // AI task banner
  startAITask: (task: Omit<AITask, 'status'>) => void
  completeAITask: (result: string) => void
  failAITask: (error: string) => void
  dismissAITask: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export const useStore = create<AppStore>((set, get) => ({
  subjects: [],
  courses: [],
  tags: [],
  activeCourseId: null,
  activeSubjectId: null,
  view: 'home',
  sidebarCollapsed: false,
  searchQuery: '',
  flashcardsWantAll: false,
  pomodoroOpen: false,
  focusMode: false,
  settings: {},
  toast: null,
  aiTask: null,

  loadSubjects: async () => {
    const subjects = await api.subjects.get()
    set({ subjects })
    const courses = await api.courses.all()
    set({ courses })
  },

  loadCourses: async (subjectId?: string) => {
    const courses = subjectId ? await api.courses.bySubject(subjectId) : await api.courses.all()
    set({ courses })
  },

  createSubject: async (data) => {
    const subject = await api.subjects.create(data)
    set((s) => ({ subjects: [subject, ...s.subjects] }))
    return subject
  },

  updateSubject: async (id, data) => {
    await api.subjects.update(id, data)
    set((s) => ({ subjects: s.subjects.map((sub) => sub.id === id ? { ...sub, ...data } : sub) }))
  },

  deleteSubject: async (id) => {
    await api.subjects.delete(id)
    set((s) => ({
      subjects: s.subjects.filter((sub) => sub.id !== id),
      courses: s.courses.filter((c) => c.subjectId !== id),
      activeSubjectId: s.activeSubjectId === id ? null : s.activeSubjectId,
      view: s.activeSubjectId === id ? 'home' : s.view
    }))
  },

  createCourse: async (data) => {
    const course = await api.courses.create(data)
    set((s) => ({ courses: [course, ...s.courses] }))
    return course
  },

  updateCourse: async (id, data) => {
    await api.courses.update(id, data)
    set((s) => ({ courses: s.courses.map((c) => c.id === id ? { ...c, ...data, updatedAt: Date.now() } : c) }))
  },

  deleteCourse: async (id) => {
    await api.courses.delete(id)
    set((s) => ({ courses: s.courses.filter((c) => c.id !== id), activeCourseId: s.activeCourseId === id ? null : s.activeCourseId }))
  },

  loadTags: async () => { const tags = await api.tags.get(); set({ tags }) },

  createTag: async (data) => {
    const tag = await api.tags.create(data)
    set((s) => ({ tags: [...s.tags, tag].sort((a, b) => a.name.localeCompare(b.name)) }))
    return tag
  },

  updateTag: async (id, data) => {
    await api.tags.update(id, data)
    set((s) => ({ tags: s.tags.map((t) => t.id === id ? { ...t, ...data } : t) }))
  },

  deleteTag: async (id) => {
    await api.tags.delete(id)
    set((s) => ({
      tags: s.tags.filter((t) => t.id !== id),
      courses: s.courses.map((c) => ({ ...c, tagIds: c.tagIds.filter((tid) => tid !== id) }))
    }))
  },

  setCourseTags: async (courseId, tagIds) => {
    await api.tags.setForCourse(courseId, tagIds)
    set((s) => ({ courses: s.courses.map((c) => c.id === courseId ? { ...c, tagIds } : c) }))
  },

  setActiveCourse: (id) => set({ activeCourseId: id }),
  setActiveSubject: (id) => set({ activeSubjectId: id }),
  setView: (view) => set({ view }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  openGlobalReview: () => set({ flashcardsWantAll: true, view: 'flashcards' }),
  clearFlashcardsWantAll: () => set({ flashcardsWantAll: false }),
  togglePomodoro: () => set((s) => ({ pomodoroOpen: !s.pomodoroOpen })),
  setFocusMode: (v) => set({ focusMode: v }),

  loadSettings: async () => { const settings = await api.settings.get(); set({ settings }) },
  saveSettings: async (settings) => { await api.settings.set(settings); set({ settings }) },

  showToast: (message, type = 'info') => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { message, type } })
    toastTimer = setTimeout(() => get().hideToast(), 3000)
  },
  hideToast: () => { if (toastTimer) { clearTimeout(toastTimer); toastTimer = null }; set({ toast: null }) },

  startAITask: (task) => set({ aiTask: { ...task, status: 'running' } }),
  completeAITask: (result) => set((s) => s.aiTask ? { aiTask: { ...s.aiTask, status: 'done', result } } : {}),
  failAITask: (error) => set((s) => s.aiTask ? { aiTask: { ...s.aiTask, status: 'error', error } } : {}),
  dismissAITask: () => set({ aiTask: null })
}))
