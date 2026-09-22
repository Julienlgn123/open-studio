import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import HomeView from './components/HomeView'
import SubjectView from './components/SubjectView'
import EditorView from './components/EditorView'
import AIStudio from './components/AIStudio'
import QuizStudio from './components/QuizStudio'
import FlashcardStudio from './components/FlashcardStudio'
import StatsView from './components/StatsView'
import Toast from './components/Toast'
import AIBanner from './components/AIBanner'
import ErrorBoundary from './components/ErrorBoundary'
import PomodoroWidget from './components/PomodoroWidget'
import UpdatePromptModal from './components/UpdatePromptModal'
import GlobalSearchModal from './components/GlobalSearchModal'
import TourOverlay from './tour/TourOverlay'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

export default function App() {
  const { view, toast, loadSubjects, loadSettings, loadTags, settings, openGlobalReview, setView, focusMode, setFocusMode, startTour } = useStore()
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    loadSubjects()
    loadTags()
    loadSettings().then(() => {
      // Small delay so the tour's spotlight appears after the initial view has
      // settled in, not layered under its own fade-in animation.
      if (!useStore.getState().settings.tourCompleted) {
        setTimeout(() => startTour('main'), 700)
      }
    })
  }, [])

  useEffect(() => {
    const cleanup = api.app.onReviewAll(() => openGlobalReview())
    return cleanup
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark')
  }, [settings.theme])

  // Focus mode only makes sense in the editor
  useEffect(() => {
    if (view !== 'editor' && focusMode) setFocusMode(false)
  }, [view, focusMode, setFocusMode])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowSearch((s) => !s)
      }
    }
    function onOpenSearch() { setShowSearch(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-global-search', onOpenSearch)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-global-search', onOpenSearch)
    }
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <AIBanner />
      <div className="app-body">
        {!focusMode && <Sidebar />}
        <main className="main">
         <ErrorBoundary resetKey={view} onReset={() => setView('home')}>
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div key="home" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <HomeView />
              </motion.div>
            )}
            {view === 'subject' && (
              <motion.div key="subject" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <SubjectView />
              </motion.div>
            )}
            {view === 'editor' && (
              <motion.div key="editor" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <EditorView />
              </motion.div>
            )}
            {view === 'ai' && (
              <motion.div key="ai" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <AIStudio />
              </motion.div>
            )}
            {view === 'quiz' && (
              <motion.div key="quiz" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <QuizStudio />
              </motion.div>
            )}
            {view === 'flashcards' && (
              <motion.div key="flashcards" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <FlashcardStudio />
              </motion.div>
            )}
            {view === 'stats' && (
              <motion.div key="stats" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <StatsView />
              </motion.div>
            )}
          </AnimatePresence>
         </ErrorBoundary>
        </main>
      </div>
      <AnimatePresence>
        {toast && <Toast key="toast" />}
      </AnimatePresence>
      <UpdatePromptModal />
      <PomodoroWidget />
      {showSearch && <GlobalSearchModal onClose={() => setShowSearch(false)} />}
      <TourOverlay />
    </div>
  )
}
