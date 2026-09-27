import { Battery, Cpu, HardDrive, MemoryStick, MonitorSmartphone, RefreshCw, Thermometer, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ActivityEntry, LiveStats } from '@shared/types'
import { useApp } from '../store/appStore'
import { PageHeader, Spinner } from '../components/ui'
import { PerfConfirm } from './Profiles'

function Meter({ label, value, max = 100, unit = '%', detail, color = '#f59e0b' }: { label: string; value: number | null; max?: number; unit?: string; detail?: string; color?: string }): JSX.Element {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  const warn = pct > 90 ? '#ef4444' : pct > 75 ? '#f97316' : color
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="text-base-300">{label}</span>
        <span className="font-mono text-[13px] text-base-100">
          {value === null ? '—' : `${Math.round(value)}${unit}`}
          {detail && <span className="ml-1 text-[11px] text-base-400">{detail}</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-base-800">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: warn }} />
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-800 text-base-300">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-base-500">{label}</div>
        <div className="truncate text-[13px] text-base-100" title={value}>
          {value}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard(): JSX.Element {
  const hw = useApp((s) => s.hardware)
  const profiles = useApp((s) => s.profiles)
  const active = useApp((s) => s.activeProfile)
  const applying = useApp((s) => s.applying)
  const applyProfile = useApp((s) => s.applyProfile)
  const setView = useApp((s) => s.setView)
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [confirmPerf, setConfirmPerf] = useState(false)

  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      try {
        const s = await window.api.hardware.stats()
        if (alive) setStats(s)
      } catch {
        // ignoré : prochain essai
      }
    }
    void tick()
    const t = setInterval(tick, 2000)
    void window.api.activity.list().then(setActivity)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [active])

  if (!hw) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-base-300">
        <Spinner size={22} />
        Analyse de ton matériel…
      </div>
    )
  }

  const gpu = hw.gpus.find((g) => !g.integrated) ?? hw.gpus[0]
  const g = stats?.gpu

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={hw.summary}>
        <button
          className="btn-ghost"
          onClick={async () => {
            useApp.setState({ hardware: null })
            useApp.setState({ hardware: await window.api.hardware.get(true) })
            await useApp.getState().refreshProfiles()
          }}
        >
          <RefreshCw size={14} /> Réanalyser
        </button>
      </PageHeader>

      <div className="mb-5 grid grid-cols-4 gap-3">
        {profiles.map((p) => (
          <button
            key={p.id}
            disabled={!!applying}
            onClick={() => (p.id === 'performance' ? setConfirmPerf(true) : void applyProfile(p.id))}
            className={`card group relative overflow-hidden p-4 text-left transition hover:border-base-600 ${active === p.id ? 'ring-2' : ''}`}
            style={active === p.id ? { borderColor: p.color, ['--tw-ring-color' as string]: `${p.color}55` } : undefined}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-[13.5px] font-semibold text-base-50">{p.name}</span>
              {applying === p.id && <Spinner size={12} />}
            </div>
            <p className="text-[12px] leading-[18px] text-base-400">{p.tagline}</p>
            {active === p.id && (
              <span className="absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: p.color }}>
                Actif
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-5">
        <div className="card col-span-3 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-base-50">En direct</h2>
            <span className="text-[11px] text-base-500">mis à jour toutes les 2 s</span>
          </div>
          <div className="space-y-4">
            <Meter label={`Processeur · ${hw.cpu.threads} threads`} value={stats?.cpuLoad ?? null} detail={stats?.cpuGhz ? `${stats.cpuGhz} GHz` : undefined} />
            {stats?.cpuTemp != null && <Meter label="Température processeur" value={stats.cpuTemp} unit="°C" max={100} color="#f97316" />}
            <Meter label="Mémoire vive" value={stats ? (stats.ramUsedGb / stats.ramTotalGb) * 100 : null} detail={stats ? `${stats.ramUsedGb} / ${stats.ramTotalGb} Go` : undefined} color="#3b82f6" />
            {g && (
              <>
                <Meter label={`Carte graphique · ${gpu?.model.replace(/^NVIDIA\s+/i, '')}`} value={g.load} color="#22c55e" detail={g.clockMhz ? `${g.clockMhz} MHz` : undefined} />
                <div className="grid grid-cols-2 gap-4">
                  <Meter label="Temp. GPU" value={g.temp} unit="°C" max={95} color="#f97316" />
                  <Meter label="Conso GPU (lecture)" value={g.powerW} unit=" W" max={350} color="#eab308" />
                </div>
              </>
            )}
            {stats?.battery && (
              <Meter
                label={`Batterie · ${stats.battery.charging ? 'en charge' : stats.battery.pluggedIn ? 'branchée' : 'sur batterie'}`}
                value={stats.battery.percent}
                color="#22c55e"
                detail={stats.battery.minutesLeft ? `${Math.floor(stats.battery.minutesLeft / 60)} h ${stats.battery.minutesLeft % 60} min` : undefined}
              />
            )}
            {!g && hw.os === 'windows' && <p className="text-[12px] text-base-500">Statistiques détaillées de la carte graphique disponibles avec une carte NVIDIA.</p>}
            {hw.os === 'windows' && <p className="text-[11.5px] text-base-500">La température du processeur n'est pas accessible sous Windows sans pilote spécial : utilise le logiciel de ta carte mère pour la surveiller.</p>}
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-5">
          <div className="card space-y-3.5 p-5">
            <h2 className="text-[14px] font-semibold text-base-50">Ton matériel</h2>
            <Stat icon={Cpu} label="Processeur" value={`${hw.cpu.brand} · ${hw.cpu.cores} cœurs / ${hw.cpu.threads} threads`} />
            {hw.gpus.map((gp) => (
              <Stat key={gp.model} icon={MonitorSmartphone} label={gp.integrated ? 'GPU intégré' : 'Carte graphique'} value={`${gp.model}${gp.vramMb ? ` · ${Math.round(gp.vramMb / 1024)} Go` : ''}`} />
            ))}
            <Stat icon={MemoryStick} label="Mémoire" value={`${hw.ramGb} Go`} />
            <Stat icon={HardDrive} label="Stockage" value={hw.disks.map((d) => `${d.type === 'nvme' ? 'NVMe' : d.type === 'ssd' ? 'SSD' : d.type === 'hdd' ? 'HDD' : 'Disque'} ${d.sizeGb >= 1000 ? `${(d.sizeGb / 1000).toFixed(1)} To` : `${d.sizeGb} Go`}`).join(' · ') || '—'} />
            {hw.hasBattery && <Stat icon={Battery} label="Batterie" value="Oui (portable)" />}
            <Stat icon={Zap} label="Système" value={hw.osLabel} />
          </div>

          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-base-50">Activité récente</h2>
              <button className="text-[12px] text-accent-400 hover:underline" onClick={() => setView('tweaks')}>
                Optimiser →
              </button>
            </div>
            {activity.length === 0 ? (
              <p className="text-[12.5px] text-base-400">Rien pour l’instant.</p>
            ) : (
              <ul className="space-y-1.5">
                {activity.slice(0, 6).map((a) => (
                  <li key={a.at} className="flex gap-2 text-[12px]">
                    <span className="shrink-0 font-mono text-base-500">{new Date(a.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={a.kind === 'error' ? 'text-red-300' : 'text-base-200'}>{a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {confirmPerf && (
        <PerfConfirm
          onClose={() => setConfirmPerf(false)}
          onConfirm={() => {
            setConfirmPerf(false)
            void applyProfile('performance')
          }}
        />
      )}
      <p className="mt-4 flex items-center gap-1.5 text-[11.5px] text-base-500">
        <Thermometer size={12} /> Surveille les températures après avoir activé « Performance max ».
      </p>
    </>
  )
}
