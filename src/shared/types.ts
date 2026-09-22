export interface Subject {
  id: string
  name: string
  emoji: string
  color: string
  createdAt: number
  sortOrder: number
  deletedAt?: number
}

export interface CourseVersion {
  id: string
  courseId: string
  content: string
  label: string
  source: 'manual' | 'ai'
  aiAction?: string
  createdAt: number
}

export interface Course {
  id: string
  subjectId: string
  title: string
  emoji: string
  content: string
  audioPath?: string
  videoPath?: string
  tagIds: string[]
  versions: CourseVersion[]
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface Tag {
  id: string
  name: string
  emoji: string
  color: string
  createdAt: number
}

export interface Attachment {
  id: string
  courseId: string
  fileName: string
  filePath: string
  size: number
  createdAt: number
}

export interface QuizResult {
  id: string
  courseId?: string
  topic: string
  score: number
  total: number
  createdAt: number
}

export interface Flashcard {
  id: string
  courseId: string
  front: string
  back: string
  intervalDays: number
  ease: number
  dueAt: number
  reps: number
  createdAt: number
}

export interface Recording {
  type: 'audio' | 'video' | 'both'
  state: 'idle' | 'recording' | 'paused' | 'stopped'
  duration: number
  audioPath?: string
  videoPath?: string
}

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AIAction =
  | 'improve'
  | 'summarize'
  | 'explain'
  | 'reorganize'
  | 'merge'
  | 'chat'
  | 'revision_sheet'
  | 'gaps'
  | 'cleanup'
  | 'simplify'
  | 'exam_plan'

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}
