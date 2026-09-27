import { Brush, Gauge, LayoutDashboard, Moon, Package, Rocket, Settings, SlidersHorizontal, Sun, Wand2, Zap } from 'lucide-react'
import { useApp, type View } from '../store/appStore'

function TrafficLight({ color, title, onClick }: { color: string; title: string; onClick: () => void }): JSX.Element {
  return <button onClick={onClick} title={title} style={{ backgroundColor: color }} className="h-3 w-3 rounded-full transition-opacity hover:opacity-80" />
}

export function TitleBar(): JSX.Element {
  const theme = useApp((s) => s.settings.theme)
  const updateSettings = useApp((s) => s.updateSettings)
  return (
    <div className="drag relative z-40 flex h-11 shrink-0 items-center gap-2 border-b border-base-800 bg-base-900 px-3">
      <div className="no-drag flex items-center gap-1.5">
        <TrafficLight color="#ff5f57" title="Fermer" onClick={() => window.api.window.close()} />
        <TrafficLight color="#febc2e" title="Réduire" onClick={() => window.api.window.minimize()} />
        <TrafficLight color="#28c840" title="Agrandir" onClick={() => window.api.window.maximize()} />
      </div>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[13px] font-medium tracking-[0.02em] text-base-300">Power Studio</span>
      <div className="no-drag ml-auto">
        <button
          onClick={() => updateSettings({ theme: theme === 'light' ? 'dark' : 'light' })}
          title="Changer de thème"
          className="flex h-7 w-7 items-center justify-center rounded-[10px] text-base-300 hover:bg-base-100/[0.04] hover:text-base-100"
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  )
}

const NAV: { id: View; label: string; icon: typeof Gauge; windowsOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'profiles', label: 'Profils', icon: Zap },
  { id: 'auto', label: 'Automatique', icon: Wand2 },
  { id: 'tweaks', label: 'Optimisation', icon: SlidersHorizontal },
  { id: 'startup', label: 'Démarrage', icon: Rocket },
  { id: 'apps', label: 'Apps préinstallées', icon: Package, windowsOnly: true },
  { id: 'clean', label: 'Nettoyage', icon: Brush },
  { id: 'settings', label: 'Réglages', icon: Settings }
]

export function Sidebar(): JSX.Element {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const hw = useApp((s) => s.hardware)
  const active = useApp((s) => s.activeProfile)
  const profiles = useApp((s) => s.profiles)
  const current = profiles.find((p) => p.id === active)
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-base-800 bg-base-900 p-3">
      <div className="mb-4 flex items-center gap-2.5 px-2 pt-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-black shadow">
          <Zap size={19} strokeWidth={2.5} />
        </div>
        <div>
          <div className="text-[14px] font-semibold text-base-50">Power Studio</div>
          <div className="text-[11px] text-base-400">{hw ? (hw.laptop ? 'PC portable' : hw.os === 'mac' ? 'Mac' : 'PC fixe') : 'Analyse…'}</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.filter((n) => !n.windowsOnly || hw?.os === 'windows').map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition ${
              view === n.id ? 'bg-accent-500/15 font-medium text-accent-400' : 'text-base-300 hover:bg-base-100/[0.04] hover:text-base-100'
            }`}
          >
            <n.icon size={16} />
            {n.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-base-800 bg-base-850 p-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-base-500">Profil actif</div>
        <div className="mt-1 flex items-center gap-2 text-[13px] font-medium text-base-100">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: current?.color ?? '#71717a' }} />
          {current?.name ?? 'Aucun (réglages du système)'}
        </div>
      </div>
    </aside>
  )
}
