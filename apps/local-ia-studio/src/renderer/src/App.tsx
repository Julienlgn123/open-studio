import { useEffect } from 'react'
import { useChatStore } from './store/chatStore'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import ModelManagerModal from './components/ModelManagerModal'
import CompareModal from './components/CompareModal'
import PreferencesPanel from './components/PreferencesPanel'
import OnboardingModal from './components/OnboardingModal'

export default function App(): JSX.Element {
  const loadInitial = useChatStore((s) => s.loadInitial)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // Ollama / LM Studio peuvent démarrer après l'app (démarrage du PC) ou être fermés en cours de
  // route : on revérifie régulièrement et au retour sur la fenêtre.
  useEffect(() => {
    const refresh = (): void => void useChatStore.getState().refreshEngines().catch(() => {})
    const timer = window.setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        useChatStore.getState().newConversation()
      } else if (key === 'b') {
        e.preventDefault()
        useChatStore.getState().toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base-950">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Sidebar />}
        <ChatView />
      </div>
      <SettingsPanel />
      <ModelManagerModal />
      <CompareModal />
      <PreferencesPanel />
      <OnboardingModal />
    </div>
  )
}
