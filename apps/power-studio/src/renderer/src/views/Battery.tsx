import { BatteryCharging, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BatteryHealth } from '@shared/types'
import { InfoBox, PageHeader, Spinner, WarnBox } from '../components/ui'

const wh = (mwh: number | null): string => (mwh == null ? '—' : `${(mwh / 1000).toFixed(1)} Wh`)

function verdict(h: number): { label: string; color: string; text: string } {
  if (h >= 90) return { label: 'Excellente', color: '#34d399', text: 'Ta batterie a presque toute sa capacité d’origine.' }
  if (h >= 80) return { label: 'Bonne', color: '#a3e635', text: 'Usure normale : rien à faire.' }
  if (h >= 65) return { label: 'Usée', color: '#fbbf24', text: 'L’autonomie a nettement baissé. Évite de la laisser à 100 % branchée en permanence.' }
  return { label: 'Très usée', color: '#f87171', text: 'Moins des deux tiers de la capacité d’origine : un remplacement redonnerait de l’autonomie.' }
}

/** Petite courbe de l'évolution de la capacité (rapport Windows). */
function CapacityChart({ history }: { history: BatteryHealth['history'] }): JSX.Element | null {
  if (history.length < 2) return null
  const W = 640
  const H = 140
  const max = Math.max(...history.map((h) => h.designMwh))
  const min = Math.min(...history.map((h) => h.fullMwh)) * 0.9
  const x = (i: number): number => (i / (history.length - 1)) * W
  const y = (v: number): number => H - ((v - min) / (max - min || 1)) * (H - 10) - 5
  const line = history.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.fullMwh).toFixed(1)}`).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full" preserveAspectRatio="none">
        <line x1={0} x2={W} y1={y(max)} y2={y(max)} stroke="currentColor" strokeDasharray="4 4" className="text-base-600" />
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="#f59e0b22" />
        <path d={line} fill="none" stroke="#f59e0b" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-base-500">
        <span>{history[0].date}</span>
        <span>pointillés : capacité d’origine</span>
        <span>{history[history.length - 1].date}</span>
      </div>
    </div>
  )
}

export default function Battery(): JSX.Element {
  const [h, setH] = useState<BatteryHealth | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setH(await window.api.battery.health())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => void load(), [])

  const v = h?.healthPct != null ? verdict(h.healthPct) : null
  return (
    <>
      <PageHeader title="Santé de la batterie" subtitle="Capacité restante par rapport au neuf, nombre de cycles et évolution dans le temps.">
        <button className="btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw size={14} />} Actualiser
        </button>
        {h?.reportPath && (
          <button className="btn-ghost" onClick={() => void window.api.battery.openReport(h.reportPath!)}>
            <ExternalLink size={14} /> Rapport complet de Windows
          </button>
        )}
      </PageHeader>

      {h === undefined && (
        <div className="card flex items-center gap-3 p-6 text-[13px] text-base-300">
          <Spinner /> Lecture des informations de la batterie…
        </div>
      )}
      {h === null && <InfoBox>Aucune batterie détectée sur cet ordinateur.</InfoBox>}
      {h && (
        <div className="space-y-5">
          <div className="card flex flex-wrap items-center gap-8 p-6">
            <div className="relative h-[120px] w-[120px]">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3" className="text-base-800" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={v?.color ?? '#71717a'} strokeWidth="3" strokeDasharray={`${h.healthPct ?? 0} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[26px] font-semibold text-base-50">{h.healthPct != null ? `${Math.round(h.healthPct)} %` : '—'}</span>
                <span className="text-[11px] text-base-400">santé</span>
              </div>
            </div>
            <div className="min-w-[240px] flex-1">
              <div className="text-[18px] font-semibold" style={{ color: v?.color }}>
                {v?.label ?? 'Inconnue'}
              </div>
              <p className="mt-1 text-[13px] text-base-300">{v?.text ?? 'Le système ne donne pas la capacité d’origine de la batterie.'}</p>
              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-4">
                <Stat label="Capacité actuelle" value={wh(h.fullMwh)} />
                <Stat label="Capacité d’origine" value={wh(h.designMwh)} />
                <Stat label="Cycles" value={h.cycles != null ? String(h.cycles) : '—'} />
                <Stat label="Autonomie estimée" value={h.estimateMinutes ? `${Math.floor(h.estimateMinutes / 60)} h ${String(h.estimateMinutes % 60).padStart(2, '0')}` : '—'} />
              </div>
            </div>
          </div>

          {h.history.length > 1 && (
            <div className="card p-5">
              <h2 className="mb-3 text-[15px] font-semibold text-base-50">Évolution de la capacité</h2>
              <CapacityChart history={h.history} />
            </div>
          )}

          <div className="card p-5 text-[13px] text-base-300">
            <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-base-50">
              <BatteryCharging size={16} /> Pour la faire durer
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Évite de rester branché à 100 % toute la journée : si ton fabricant le propose (Lenovo Vantage, MyASUS, Dell Power Manager…), active la limite de charge à 80 %.</li>
              <li>La chaleur use la batterie : ne joue pas longtemps sur un lit ou un coussin.</li>
              <li>Pas besoin de la vider complètement : les batteries lithium préfèrent rester entre 20 et 80 %.</li>
            </ul>
          </div>
          {h.cycles != null && h.cycles > 800 && <WarnBox>Plus de 800 cycles : la plupart des batteries de portable sont prévues pour 500 à 1 000 cycles.</WarnBox>}
          <p className="text-[11.5px] text-base-500">
            {[h.manufacturer, h.model, h.chemistry].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-[11.5px] text-base-500">{label}</div>
      <div className="font-medium text-base-100">{value}</div>
    </div>
  )
}
