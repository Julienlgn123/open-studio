import { Check, FolderOpen, History, Lock, RefreshCw, RotateCw, Sparkles, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { TweakCategory, TweakInfo } from '@shared/types'
import { useApp } from '../store/appStore'
import { Badge, Checkbox, ConfirmDanger, DangerBanner, PageHeader, Spinner, WarnBox } from '../components/ui'

const CATEGORIES: { id: TweakCategory; label: string; hint: string }[] = [
  { id: 'privacy', label: 'Confidentialité', hint: 'Télémétrie, géolocalisation, pubs, suivi.' },
  { id: 'performance', label: 'Performance', hint: 'Jeux, réactivité, ressources en arrière-plan.' },
  { id: 'battery', label: 'Batterie', hint: 'Ce qui consomme sans servir.' },
  { id: 'interface', label: 'Interface', hint: 'Animations, menus, widgets.' },
  { id: 'services', label: 'Services inutiles', hint: 'Services système qui tournent pour rien.' }
]

export default function Tweaks(): JSX.Element {
  const hw = useApp((s) => s.hardware)
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [tweaks, setTweaks] = useState<TweakInfo[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'apply' | { revert: string[] } | null>(null)
  const [restorePoint, setRestorePoint] = useState(true)

  const load = async (): Promise<void> => {
    setTweaks(null)
    setTweaks(await window.api.tweaks.list())
  }
  useEffect(() => {
    void load()
  }, [])

  const pending = useMemo(() => (tweaks ?? []).filter((t) => selected.has(t.id) && !t.applied), [tweaks, selected])
  const applied = (tweaks ?? []).filter((t) => t.applied)

  const selectRecommended = (): void => setSelected(new Set((tweaks ?? []).filter((t) => t.recommended && !t.applied).map((t) => t.id)))

  const doApply = async (): Promise<void> => {
    setConfirm(null)
    if (hw?.os === 'windows' && restorePoint) {
      setBusy('Création du point de restauration…')
      const rp = await window.api.tweaks.restorePoint()
      if (!rp.ok) {
        setBusy(null)
        toast(
          rp.adminDenied
            ? 'Point de restauration refusé : aucune optimisation appliquée.'
            : `Point de restauration impossible (${rp.error}). Rien n’a été modifié : décoche l’option pour continuer sans.`,
          'error'
        )
        return
      }
      toast('Point de restauration créé', 'ok')
    }
    setBusy('Sauvegarde puis application…')
    const r = await window.api.tweaks.apply(pending.map((t) => t.id))
    setBusy(null)
    setSelected(new Set())
    if (r.done.length) toast(`${r.done.length} optimisation(s) appliquée(s). Sauvegarde : ${r.backupDir}`, 'ok')
    if (r.adminDenied) toast('Droits administrateur refusés : les réglages système n’ont pas été modifiés.', 'error')
    else if (r.failed.length) toast(`${r.failed.length} en échec : ${r.failed[0].error}`, 'error')
    if (r.restartNeeded) toast('Certains réglages prendront effet après un redémarrage.', 'info')
    await load()
  }

  const doRevert = async (ids: string[]): Promise<void> => {
    setConfirm(null)
    setBusy('Annulation…')
    const r = await window.api.tweaks.revert(ids)
    setBusy(null)
    if (r.done.length) toast(`${r.done.length} réglage(s) remis comme avant`, 'ok')
    if (r.adminDenied) toast('Droits administrateur refusés.', 'error')
    else if (r.failed.length) toast(`Échec : ${r.failed[0].error}`, 'error')
    await load()
  }

  const firstTime = !settings.restorePointDone

  return (
    <>
      <PageHeader title="Optimisation" subtitle="Désactive ce qui ne sert à rien ou consomme pour rien. Chaque réglage garde sa valeur d’origine et s’annule en un clic.">
        <button className="btn-ghost" onClick={() => window.api.tweaks.openBackups()}>
          <FolderOpen size={14} /> Sauvegardes
        </button>
        <button className="btn-ghost" onClick={load} disabled={!tweaks}>
          <RefreshCw size={14} />
        </button>
      </PageHeader>

      <DangerBanner title="Attention : modifications du système — sauvegarde d’abord !">
        <p>
          Ces réglages modifient le <b>registre</b> et les <b>services</b> de ton système. Ils sont testés et réversibles, mais un réglage peut casser une fonction
          dont tu as besoin (impression, Xbox, recherche…). <b>Lis la ligne « ⚠ » de chaque réglage avant de le cocher.</b>
        </p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          <li>
            <b>Sauvegarde tes fichiers importants</b> (disque externe, cloud) avant de commencer.
          </li>
          {hw?.os === 'windows' && <li>Garde l’option « Créer un point de restauration » cochée : c’est ta roue de secours si Windows devient instable.</li>}
          <li>Avance par petites étapes : applique quelques réglages, utilise ton PC, puis continue.</li>
        </ul>
      </DangerBanner>

      {!tweaks ? (
        <div className="flex items-center gap-2 text-base-300">
          <Spinner /> Lecture de l’état actuel de ton système…
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-2 mb-5 flex items-center gap-2 rounded-2xl border border-base-800 bg-base-950/90 px-3 py-2.5 backdrop-blur">
            <button className="btn-ghost" onClick={selectRecommended}>
              <Sparkles size={14} /> Sélectionner les recommandés
            </button>
            {selected.size > 0 && (
              <button className="btn-ghost" onClick={() => setSelected(new Set())}>
                Tout décocher
              </button>
            )}
            <span className="ml-2 text-[12px] text-base-400">
              {applied.length} / {tweaks.length} déjà en place
            </span>
            {busy ? (
              <span className="ml-auto flex items-center gap-2 text-[13px] text-base-200">
                <Spinner /> {busy}
              </span>
            ) : (
              <button className="btn-primary ml-auto" disabled={!pending.length} onClick={() => setConfirm('apply')}>
                <Check size={15} /> Appliquer la sélection ({pending.length})
              </button>
            )}
          </div>

          {CATEGORIES.map((cat) => {
            const items = tweaks.filter((t) => t.category === cat.id)
            if (!items.length) return null
            return (
              <section key={cat.id} className="mb-6">
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-[15px] font-semibold text-base-50">{cat.label}</h2>
                  <span className="text-[12px] text-base-500">{cat.hint}</span>
                </div>
                <div className="card divide-y divide-base-800">
                  {items.map((t) => (
                    <div key={t.id} className={`flex gap-3 p-4 ${t.applied ? 'bg-emerald-500/[0.03]' : ''}`}>
                      <div className="pt-0.5">
                        {t.applied ? (
                          <div className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : (
                          <Checkbox
                            checked={selected.has(t.id)}
                            disabled={!!busy}
                            onChange={(v) => {
                              const next = new Set(selected)
                              if (v) next.add(t.id)
                              else next.delete(t.id)
                              setSelected(next)
                            }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13.5px] font-medium text-base-50">{t.title}</span>
                          {t.recommended && !t.applied && <Badge color="green">Recommandé</Badge>}
                          {t.applied && <Badge color="green">En place</Badge>}
                          {t.risk === 'moderate' && <Badge color="amber">Risque modéré</Badge>}
                          {t.admin && (
                            <Badge color="gray">
                              <Lock size={9} /> Admin
                            </Badge>
                          )}
                          {t.restart && (
                            <Badge color="blue">
                              <RotateCw size={9} /> Redémarrage
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-5 text-base-300">{t.description}</p>
                        {t.tradeoff && <p className={`mt-1 text-[12px] leading-5 ${t.risk === 'moderate' ? 'text-amber-300' : 'text-base-400'}`}>⚠ {t.tradeoff}</p>}
                      </div>
                      {t.applied && (
                        <button className="btn-ghost h-8 shrink-0 self-center px-2.5 text-[12px]" disabled={!!busy} onClick={() => setConfirm({ revert: [t.id] })}>
                          <Undo2 size={13} /> Annuler
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          {applied.length > 0 && (
            <button className="btn-ghost" disabled={!!busy} onClick={() => setConfirm({ revert: applied.map((t) => t.id) })}>
              <History size={14} /> Tout annuler ({applied.length})
            </button>
          )}
        </>
      )}

      {confirm === 'apply' && (
        <ConfirmDanger
          title={`Appliquer ${pending.length} optimisation(s) ?`}
          confirmLabel="Appliquer"
          delay={firstTime ? 5 : 3}
          onClose={() => setConfirm(null)}
          onConfirm={doApply}
        >
          <p>Ces réglages vont être modifiés :</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-base-700 bg-base-850 p-3 text-[12.5px]">
            {pending.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="text-base-100">{t.title}</span>
                {t.risk === 'moderate' && <Badge color="amber">Risque modéré</Badge>}
                {t.admin && <Lock size={11} className="text-amber-400" />}
              </li>
            ))}
          </ul>
          {pending.some((t) => t.risk === 'moderate') && (
            <WarnBox>
              Tu as coché des réglages à <b>risque modéré</b> : relis leur ligne « ⚠ », ils peuvent désactiver une fonction que tu utilises.
            </WarnBox>
          )}
          <p className="text-[12.5px] text-base-300">
            Avant de toucher à quoi que ce soit, Power Studio enregistre une sauvegarde (.reg + journal d’annulation) dans <b>Documents\Power Studio\Sauvegardes</b>.
            {pending.some((t) => t.admin) && ' Windows va te demander les droits administrateur.'}
          </p>
          {hw?.os === 'windows' && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] p-3 text-[12.5px] text-base-100">
              <Checkbox checked={restorePoint} onChange={setRestorePoint} />
              <span onClick={() => setRestorePoint(!restorePoint)}>
                <b>Créer d’abord un point de restauration Windows</b> (fortement recommandé{firstTime ? ', surtout la première fois' : ''}). Demande les droits administrateur.
              </span>
            </label>
          )}
        </ConfirmDanger>
      )}
      {confirm && confirm !== 'apply' && (
        <ConfirmDanger
          title={confirm.revert.length > 1 ? `Annuler ${confirm.revert.length} optimisations ?` : 'Annuler cette optimisation ?'}
          confirmLabel="Remettre comme avant"
          ack="Je veux remettre ces réglages à leur valeur d’avant."
          delay={0}
          onClose={() => setConfirm(null)}
          onConfirm={() => doRevert(confirm.revert)}
        >
          <p>
            Power Studio remet la valeur qu’avait chaque réglage avant d’être modifié (ou la valeur d’usine de Windows s’il avait été changé par un autre outil).
          </p>
        </ConfirmDanger>
      )}
    </>
  )
}
