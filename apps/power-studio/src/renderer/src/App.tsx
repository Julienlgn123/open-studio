import { useEffect } from 'react'
import { useApp } from './store/appStore'
import { Sidebar, TitleBar } from './components/Frame'
import Disclaimer from './components/Disclaimer'
import { Toasts } from './components/ui'
import Dashboard from './views/Dashboard'
import Profiles from './views/Profiles'
import Tweaks from './views/Tweaks'
import Startup from './views/Startup'
import Bloat from './views/Bloat'
import Clean from './views/Clean'
import Auto from './views/Auto'
import SettingsView from './views/Settings'

export default function App(): JSX.Element {
  const load = useApp((s) => s.load)
  const loaded = useApp((s) => s.loaded)
  const accepted = useApp((s) => s.settings.disclaimerAccepted)
  const view = useApp((s) => s.view)

  useEffect(() => {
    void load()
    const off = window.api.profiles.onChanged((r) => {
      void useApp.getState().refreshProfiles()
      if (r.ok) useApp.getState().toast(`Profil changé automatiquement`, 'info')
    })
    return off
  }, [load])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base-950">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1080px] px-8 py-7">
            {view === 'dashboard' && <Dashboard />}
            {view === 'profiles' && <Profiles />}
            {view === 'tweaks' && <Tweaks />}
            {view === 'startup' && <Startup />}
            {view === 'apps' && <Bloat />}
            {view === 'clean' && <Clean />}
            {view === 'auto' && <Auto />}
            {view === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>
      {loaded && !accepted && <Disclaimer />}
      <Toasts />
    </div>
  )
}
