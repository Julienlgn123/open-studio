import { useEffect } from 'react'
import { useChatStore } from './store/chatStore'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsPanel from './components/SettingsPanel'
import ModelManagerModal from './components/ModelManagerModal'

export default function App(): JSX.Element {
  const loadInitial = useChatStore((s) => s.loadInitial)

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base-950">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <ChatView />
      </div>
      <SettingsPanel />
      <ModelManagerModal />
    </div>
  )
}
