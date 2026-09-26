import { useEffect } from 'react'
import { useChatStore } from './store/chatStore'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import ModelManagerModal from './components/ModelManagerModal'
import PreferencesPanel from './components/PreferencesPanel'
import OnboardingModal from './components/OnboardingModal'

export default function App(): JSX.Element {
  const loadInitial = useChatStore((s) => s.loadInitial)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

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
      <PreferencesPanel />
      <OnboardingModal />
    </div>
  )
}
