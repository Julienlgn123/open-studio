import { Gamepad2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AutoRules, ProfileId } from '@shared/types'
import { PROFILE_ORDER } from '@shared/types'
import { useApp } from '../store/appStore'
import { InfoBox, Modal, PageHeader, Spinner, Toggle } from '../components/ui'

function ProfileSelect({ value, onChange, allowNone }: { value: ProfileId | null; onChange: (v: ProfileId | null) => void; allowNone?: boolean }): JSX.Element {
  const profiles = useApp((s) => s.profiles)
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as ProfileId | null)}
      className="rounded-lg border border-base-700 bg-base-850 px-2.5 py-1.5 text-[13px] text-base-100 outline-none focus:border-accent-500"
    >
      {allowNone && <option value="">Ne rien changer</option>}
      {PROFILE_ORDER.map((id) => (
        <option key={id} value={id}>
          {profiles.find((p) => p.id === id)?.name ?? id}
        </option>
      ))}
    </select>
  )
}

export default function Auto(): JSX.Element {
  const settings = useApp((s) => s.settings)
  const hw = useApp((s) => s.hardware)
  const updateSettings = useApp((s) => s.updateSettings)
  const auto = settings.auto
  const [picker, setPicker] = useState<string[] | null>(null)
  const [loadingPicker, setLoadingPicker] = useState(false)
  const [manual, setManual] = useState('')

  const save = (patch: Partial<AutoRules>): Promise<void> => updateSettings({ auto: { ...auto, ...patch } })

  const openPicker = async (): Promise<void> => {
    setLoadingPicker(true)
    setPicker(await window.api.processes.list())
    setLoadingPicker(false)
  }
  const addApp = (process: string): void => {
    const p = process.trim().replace(/\.exe$/i, '')
    if (!p || auto.apps.some((a) => a.process.toLowerCase() === p.toLowerCase())) return
    void save({ apps: [...auto.apps, { process: p, profile: 'performance' }] })
  }

  return (
    <>
      <PageHeader title="Automatique" subtitle="Power Studio change de profil tout seul selon la situation : jeu lancé, PC branché ou sur batterie.">
        <div className="flex items-center gap-2.5 text-[13px] text-base-200">
          {auto.enabled ? 'Activé' : 'Désactivé'}
          <Toggle checked={auto.enabled} onChange={(v) => void save({ enabled: v })} />
        </div>
      </PageHeader>

      <div className={`space-y-5 ${auto.enabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-base-50">
            <Gamepad2 size={16} /> Quand un de ces programmes est ouvert
          </h2>
          <p className="mb-4 text-[12.5px] text-base-400">Idéal pour les jeux : « Performance max » pendant la partie, retour au profil normal à la fermeture.</p>
          {auto.apps.length > 0 && (
            <div className="mb-4 divide-y divide-base-800 rounded-xl border border-base-800">
              {auto.apps.map((a, i) => (
                <div key={a.process} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-[13px] text-base-100">{a.process}</span>
                  <span className="ml-auto text-[12px] text-base-400">→</span>
                  <ProfileSelect
                    value={a.profile}
                    onChange={(v) => v && void save({ apps: auto.apps.map((x, j) => (j === i ? { ...x, profile: v } : x)) })}
                  />
                  <button className="text-base-400 hover:text-red-400" onClick={() => void save({ apps: auto.apps.filter((_, j) => j !== i) })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={openPicker} disabled={loadingPicker}>
              {loadingPicker ? <Spinner /> : <Plus size={14} />} Choisir parmi les programmes ouverts
            </button>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addApp(manual)
                  setManual('')
                }
              }}
              placeholder="ou tape un nom (ex. RocketLeague)"
              className="flex-1 rounded-xl border border-base-700 bg-base-850 px-3 text-[13px] text-base-100 outline-none placeholder:text-base-500 focus:border-accent-500"
            />
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="text-[15px] font-semibold text-base-50">Alimentation</h2>
          {hw?.hasBattery ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[13.5px] text-base-100">Sur batterie</div>
                  <div className="text-[12px] text-base-400">Dès que tu débranches le chargeur.</div>
                </div>
                <ProfileSelect value={auto.onBattery} onChange={(v) => void save({ onBattery: v })} allowNone />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[13.5px] text-base-100">Sur secteur</div>
                  <div className="text-[12px] text-base-400">Dès que tu rebranches le chargeur.</div>
                </div>
                <ProfileSelect value={auto.onAc} onChange={(v) => void save({ onAc: v })} allowNone />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[13.5px] text-base-100">Quand aucun programme de la liste n’est ouvert</div>
                <div className="text-[12px] text-base-400">Profil de retour après un jeu (PC fixe, toujours sur secteur).</div>
              </div>
              <ProfileSelect value={auto.onAc} onChange={(v) => void save({ onAc: v })} allowNone />
            </div>
          )}
        </div>

        <InfoBox>
          Power Studio doit rester ouvert (dans la zone de notification) pour changer de profil tout seul. Il n’agit que quand la situation change : un profil choisi à la main reste
          en place jusque-là. La limite de la carte graphique n’est jamais changée automatiquement (elle demande les droits administrateur).
        </InfoBox>
      </div>

      {picker && (
        <Modal onClose={() => setPicker(null)} width={480}>
          <h2 className="mb-3 text-[16px] font-semibold text-base-50">Programmes ouverts</h2>
          <div className="max-h-[420px] divide-y divide-base-800 overflow-y-auto rounded-xl border border-base-800">
            {picker.map((p) => (
              <button
                key={p}
                className="flex w-full items-center px-3 py-2 text-left font-mono text-[13px] text-base-100 hover:bg-base-850"
                onClick={() => {
                  addApp(p)
                  setPicker(null)
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}
