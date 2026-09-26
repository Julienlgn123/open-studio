import { create } from 'zustand'
import type { Subject, Course, CourseVersion, Tag } from '../../../shared/types'
import { mainTourSteps, editorTourSteps } from '../tour/tourSteps'

// Kept outside the store state on purpose: showToast can be called again before an
// earlier toast's timer has fired (e.g. two validation errors in a row). Without
// clearing the previous timer, that stale timeout still hides the toast at its own
// 3s mark, cutting the newer message's display time short or hiding it immediately.
let toastTimer: ReturnType<typeof setTimeout> | null = null

export interface TrashedSubjectView extends Subject { courseCount: number }

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

export interface PairedDevice {
  id: string
  name: string
  online: boolean
  /** Nombre de cours à échanger avec ce PC (null = pas encore comparé). */
  pending: number | null
  lastSyncAt: number | null
}

interface AppStore {
  /** PC associés pour la synchro continue (voir main/peerSync.ts). */
  paired: PairedDevice[]
  setPaired: (p: PairedDevice[]) => void
  /** Cours modifiés par une synchro : l'éditeur recharge le cours ouvert s'il en fait partie. */
  externalUpdate: { ids: string[]; from: string; at: number } | null
  setExternalUpdate: (u: { ids: string[]; from: string }) => void
  subjects: Subject[]
  courses: Course[]
  tags: Tag[]
  activeCourseId: string | null
  activeSubjectId: string | null

  view: 'home' | 'subject' | 'editor' | 'ai' | 'quiz' | 'flashcards' | 'stats' | 'trash'
  sidebarCollapsed: boolean
  searchQuery: string
  // Multi-select for bulk actions (move/tag/delete several courses at once)
  selectedCourseIds: string[]

  trashedSubjects: TrashedSubjectView[]
  trashedCourses: Course[]

  streak: { current: number; longest: number }
  // When true, the Flashcards view opens straight into the global review session
  flashcardsWantAll: boolean
  pomodoroOpen: boolean
  focusMode: boolean
  settings: {
    mistralApiKey?: string
    mistralModel?: string
    theme?: 'dark' | 'light'
    numberedHeadings?: boolean
    tourCompleted?: boolean
    editorTourCompleted?: boolean
    autoBackupFolder?: string
  }

  toast: { message: string; type: 'success' | 'error' | 'info' } | null

  // Guided tour: which one is showing (if any) and which step it's on
  activeTour: 'main' | 'editor' | null
  tourStep: number

  // Global AI task banner
  aiTask: AITask | null

  loadSubjects: () => Promise<void>
  loadCourses: (subjectId?: string) => Promise<void>
  createSubject: (data: Omit<Subject, 'id' | 'createdAt' | 'sortOrder'>) => Promise<Subject>
  updateSubject: (id: string, data: Partial<Omit<Subject, 'id' | 'createdAt'>>) => Promise<void>
  deleteSubject: (id: string) => Promise<void>
  reorderSubjects: (ids: string[]) => Promise<void>
  createCourse: (data: { subjectId: string; title?: string; emoji?: string; content?: string; audioPath?: string; videoPath?: string }) => Promise<Course>
  updateCourse: (id: string, data: Partial<{ title: string; emoji: string; content: string; subjectId: string; audioPath: string; videoPath: string }>) => Promise<void>
  deleteCourse: (id: string) => Promise<void>
  loadTags: () => Promise<void>
  createTag: (data: { name: string; emoji: string; color: string }) => Promise<Tag>
  updateTag: (id: string, data: Partial<{ name: string; emoji: string; color: string }>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  setCourseTags: (courseId: string, tagIds: string[]) => Promise<void>

  // Trash
  loadTrash: () => Promise<void>
  restoreSubjectFromTrash: (id: string) => Promise<void>
  restoreCourseFromTrash: (id: string) => Promise<void>
  purgeSubjectForever: (id: string) => Promise<void>
  purgeCourseForever: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>

  loadStreak: () => Promise<void>

  // Bulk selection
  toggleCourseSelected: (id: string) => void
  selectCourses: (ids: string[]) => void
  clearCourseSelection: () => void
  bulkMoveCourses: (ids: string[], subjectId: string) => Promise<void>
  bulkDeleteCourses: (ids: string[]) => Promise<void>
  bulkAddTag: (ids: string[], tagId: string) => Promise<void>

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

  startTour: (name: 'main' | 'editor') => void
  nextTourStep: () => void
  prevTourStep: () => void
  // Any way of leaving the tour (Suivant on the last step, Passer, ✕, clicking the
  // backdrop) counts as "seen" — it won't auto-start again, but stays replayable
  // from Paramètres / the editor toolbar.
  closeTour: () => void

  // AI task banner
  startAITask: (task: Omit<AITask, 'status'>) => void
  completeAITask: (result: string) => void
  failAITask: (error: string) => void
  dismissAITask: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export const useStore = create<AppStore>((set, get) => ({
  paired: [],
  setPaired: (paired) => set({ paired }),
  externalUpdate: null,
  setExternalUpdate: (u) => set({ externalUpdate: { ...u, at: Date.now() } }),
  subjects: [],
  courses: [],
  tags: [],
  activeCourseId: null,
  activeSubjectId: null,
  view: 'home',
  sidebarCollapsed: false,
  searchQuery: '',
  selectedCourseIds: [],
  trashedSubjects: [],
  trashedCourses: [],
  streak: { current: 0, longest: 0 },
  flashcardsWantAll: false,
  pomodoroOpen: false,
  focusMode: false,
  settings: {},
  toast: null,
  aiTask: null,
  activeTour: null,
  tourStep: 0,

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

  // Applied optimistically — the sidebar hands back the full post-drop order, and
  // waiting on the round-trip before reflecting it would make the drag feel laggy.
  reorderSubjects: async (ids) => {
    set((s) => ({
      subjects: ids.map((id) => s.subjects.find((sub) => sub.id === id)).filter((s): s is Subject => !!s)
    }))
    await api.subjects.reorder(ids)
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

  loadTrash: async () => {
    const [trashedSubjects, trashedCourses] = await Promise.all([api.trash.subjects(), api.trash.courses()])
    set({ trashedSubjects, trashedCourses })
  },
  restoreSubjectFromTrash: async (id) => {
    await api.trash.restoreSubject(id)
    await Promise.all([get().loadTrash(), get().loadSubjects()])
  },
  restoreCourseFromTrash: async (id) => {
    await api.trash.restoreCourse(id)
    await Promise.all([get().loadTrash(), get().loadCourses(get().activeSubjectId ?? undefined)])
  },
  purgeSubjectForever: async (id) => {
    await api.trash.purgeSubject(id)
    set((s) => ({ trashedSubjects: s.trashedSubjects.filter((sub) => sub.id !== id) }))
  },
  purgeCourseForever: async (id) => {
    await api.trash.purgeCourse(id)
    set((s) => ({ trashedCourses: s.trashedCourses.filter((c) => c.id !== id) }))
  },
  emptyTrash: async () => {
    await api.trash.empty()
    set({ trashedSubjects: [], trashedCourses: [] })
  },

  loadStreak: async () => { const streak = await api.study.streak(); set({ streak }) },

  toggleCourseSelected: (id) => set((s) => ({
    selectedCourseIds: s.selectedCourseIds.includes(id)
      ? s.selectedCourseIds.filter((x) => x !== id)
      : [...s.selectedCourseIds, id]
  })),
  selectCourses: (ids) => set({ selectedCourseIds: ids }),
  clearCourseSelection: () => set({ selectedCourseIds: [] }),

  bulkMoveCourses: async (ids, subjectId) => {
    for (const id of ids) await api.courses.update(id, { subjectId })
    set((s) => ({
      courses: s.courses.map((c) => ids.includes(c.id) ? { ...c, subjectId, updatedAt: Date.now() } : c),
      selectedCourseIds: []
    }))
  },
  bulkDeleteCourses: async (ids) => {
    for (const id of ids) await api.courses.delete(id)
    set((s) => ({ courses: s.courses.filter((c) => !ids.includes(c.id)), selectedCourseIds: [] }))
  },
  bulkAddTag: async (ids, tagId) => {
    for (const id of ids) {
      const course = get().courses.find((c) => c.id === id)
      if (!course || course.tagIds.includes(tagId)) continue
      await api.tags.setForCourse(id, [...course.tagIds, tagId])
    }
    set((s) => ({
      courses: s.courses.map((c) => ids.includes(c.id) && !c.tagIds.includes(tagId) ? { ...c, tagIds: [...c.tagIds, tagId] } : c),
      selectedCourseIds: []
    }))
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

  // The main tour points at Home-only elements (search bar, "Nouveau cours") alongside
  // the always-visible sidebar/top bar, so it always starts from Home regardless of
  // which view it was triggered from (e.g. replayed from Paramètres mid-course).
  startTour: (name) => set({ activeTour: name, tourStep: 0, ...(name === 'main' ? { view: 'home' } : {}) }),
  nextTourStep: () => {
    const s = get()
    const steps = s.activeTour === 'editor' ? editorTourSteps : mainTourSteps
    if (s.tourStep + 1 >= steps.length) { get().closeTour(); return }
    set({ tourStep: s.tourStep + 1 })
  },
  prevTourStep: () => set((s) => ({ tourStep: Math.max(0, s.tourStep - 1) })),
  closeTour: () => {
    const s = get()
    if (s.activeTour) {
      const key = s.activeTour === 'editor' ? 'editorTourCompleted' : 'tourCompleted'
      if (!s.settings[key]) get().saveSettings({ ...s.settings, [key]: true })
    }
    set({ activeTour: null, tourStep: 0 })
  },

  startAITask: (task) => set({ aiTask: { ...task, status: 'running' } }),
  completeAITask: (result) => set((s) => s.aiTask ? { aiTask: { ...s.aiTask, status: 'done', result } } : {}),
  failAITask: (error) => set((s) => s.aiTask ? { aiTask: { ...s.aiTask, status: 'error', error } } : {}),
  dismissAITask: () => set({ aiTask: null })
}))
