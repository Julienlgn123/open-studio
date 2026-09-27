import { Check, Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { ProfileId } from '@shared/types'
import { useApp } from '../store/appStore'
import { ConfirmDanger, DangerBanner, InfoBox, PageHeader, Spinner } from '../components/ui'

export default function Profiles(): JSX.Element {
  const hw = useApp((s) => s.hardware)
  const profiles = useApp((s) => s.profiles)
  const active = useApp((s) => s.activeProfile)
  const applying = useApp((s) => s.applying)
  const applyProfile = useApp((s) => s.applyProfile)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const refreshProfiles = useApp((s) => s.refreshProfiles)
  const [confirm, setConfirm] = useState<ProfileId | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const choose = (id: ProfileId): void => {
    // La performance max pousse le matériel : confirmation explicite.
    if (id === 'performance') setConfirm(id)
    else void applyProfile(id)
  }

  const restore = async (): Promise<void> => {
    setConfirmRestore(false)
    setRestoring(true)
    const r = await window.api.profiles.restore()
    setRestoring(false)
    await refreshProfiles()
    toast(r.ok ? "Réglages d'alimentation d'origine rétablis" : `Échec : ${r.error}`, r.ok ? 'ok' : 'error')
  }

  return (
    <>
      <PageHeader title="Profils" subtitle="Chaque profil est calculé pour ton matériel. Tes plans d'alimentation existants ne sont jamais modifiés : Power Studio crée ses propres plans.">
        <button className="btn-ghost" disabled={restoring} onClick={() => setConfirmRestore(true)}>
          {restoring ? <Spinner /> : <RotateCcw size={14} />} Rétablir les réglages d’origine
        </button>
      </PageHeader>

      <DangerBanner title="Performance max = plus de chaleur et de consommation">
        Ce profil garde le processeur à sa fréquence maximale en permanence. Power Studio ne touche <b>jamais</b> à la tension, à la puissance (W) ni aux
        ventilateurs : il ne change que les réglages d’alimentation de ton système. Sur un <b>portable</b>, surveille la chaleur ; au moindre doute, repasse en
        « Équilibré » ou clique sur « Rétablir les réglages d’origine ».
      </DangerBanner>

      <div className="grid grid-cols-2 gap-4">
        {profiles.map((p) => (
          <div key={p.id} className="card flex flex-col p-5" style={active === p.id ? { borderColor: p.color } : undefined}>
            <div className="mb-1 flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              <h2 className="text-[16px] font-semibold text-base-50">{p.name}</h2>
              {active === p.id && (
                <span className="ml-auto flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: p.color }}>
                  <Check size={13} /> Actif
                </span>
              )}
            </div>
            <p className="mb-4 text-[12.5px] text-base-400">{p.tagline}</p>
            <ul className="mb-5 space-y-2.5">
              {p.actions.map((a) => (
                <li key={a.id} className={`text-[12.5px] ${a.unavailable ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base-200">{a.label}</span>
                    {a.admin && !a.unavailable && <Lock size={11} className="text-amber-400" />}
                    <span className="ml-auto text-right font-medium text-base-50">{a.value}</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-4 text-base-500">{a.unavailable ? `${a.unavailable}. ${a.why}` : a.why}</div>
                </li>
              ))}
            </ul>
            <button
              className="btn mt-auto text-black"
              style={{ backgroundColor: p.color }}
              disabled={!!applying}
              onClick={() => choose(p.id)}
            >
              {applying === p.id ? <Spinner /> : <ShieldCheck size={15} />} {active === p.id ? 'Réappliquer' : `Activer « ${p.name} »`}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        <InfoBox>
          <Lock size={11} className="mr-1 inline text-amber-400" /> = demande les droits administrateur (une fenêtre de confirmation du système s’affiche).
        </InfoBox>
      </div>

      {confirm && (
        <PerfConfirm
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void applyProfile('performance')
          }}
        />
      )}
      {confirmRestore && (
        <ConfirmDanger
          title="Rétablir les réglages d’origine ?"
          confirmLabel="Rétablir"
          ack="Je veux revenir au plan d’alimentation que j’avais avant Power Studio."
          delay={0}
          onClose={() => setConfirmRestore(false)}
          onConfirm={restore}
        >
          <p>Ton plan d’alimentation d’avant est réactivé et les plans créés par Power Studio sont supprimés.</p>
          <p>Les optimisations de la page « Optimisation » ne sont pas touchées : annule-les depuis cette page.</p>
        </ConfirmDanger>
      )}
    </>
  )
}

/** Confirmation obligatoire avant « Performance max » (page Profils, tableau de bord, …). */
export function PerfConfirm({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }): JSX.Element {
  const hw = useApp((s) => s.hardware)
  return (
    <ConfirmDanger
      title="Activer « Performance max » ?"
      confirmLabel="Activer Performance max"
      ack="Je surveille les températures et je sais revenir en arrière (« Équilibré » ou « Rétablir les réglages d’origine »)."
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <p>
        Ton processeur restera à sa fréquence maximale en permanence (aucune mise en veille, turbo agressif).
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Plus de chaleur, facture d’électricité un peu plus élevée.</li>
        <li>Tension, puissance (W) et ventilateurs ne sont pas modifiés : seuls les réglages d’alimentation du système changent.</li>
        {hw?.laptop && <li className="font-semibold text-red-300">Portable : la batterie se videra très vite et l’appareil peut devenir très chaud. Garde-le sur une surface dure.</li>}
        <li>Un matériel mal refroidi (poussière, pâte thermique ancienne) peut devenir instable.</li>
      </ul>
    </ConfirmDanger>
  )
}
