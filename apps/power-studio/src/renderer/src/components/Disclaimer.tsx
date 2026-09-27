import { HardDrive, LifeBuoy, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../store/appStore'
import { Checkbox } from './ui'

const CHECKS = [
  "J'ai fait une sauvegarde de mes fichiers importants (disque externe, cloud…) ou j'accepte de ne pas en avoir.",
  'Je comprends que Power Studio modifie des réglages profonds du système (alimentation, registre, services) et que ça peut causer des problèmes.',
  "Je comprends que la performance max fait chauffer et consommer davantage mon matériel, et que je suis responsable de l'utilisation que j'en fais.",
  "Je lis la description et les conséquences de chaque réglage avant de l'appliquer."
]

/** Écran bloquant au premier lancement : on ne peut rien faire avant d'avoir tout lu et coché. */
export default function Disclaimer({ onAccept }: { onAccept?: () => void }): JSX.Element {
  const updateSettings = useApp((s) => s.updateSettings)
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false))
  const [left, setLeft] = useState(10)

  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  const all = checked.every(Boolean)
  const accept = async (): Promise<void> => {
    await updateSettings({ disclaimerAccepted: true })
    onAccept?.()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-11 z-[70] flex items-center justify-center overflow-y-auto bg-base-950/95 p-6 backdrop-blur">
      <div className="animate-fade-up my-auto w-full max-w-[760px] rounded-3xl border-2 border-red-500/70 bg-base-900 p-8 shadow-panel">
        <div className="mb-5 flex items-center gap-4">
          <div className="animate-pulse-ring flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white">
            <ShieldAlert size={30} />
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-red-400">Avertissement important — à lire en entier</div>
            <h1 className="text-[24px] font-bold leading-tight text-base-50">Power Studio touche aux réglages profonds de ton ordinateur</h1>
          </div>
        </div>

        <div className="space-y-3 text-[13.5px] leading-6 text-base-200">
          <p>
            Cette app change des réglages que Windows, macOS ou Linux cachent normalement : <b>plans d’alimentation, registre, services système, programmes au démarrage,
            apps préinstallées, fichiers temporaires</b>. Elle ne touche <b>jamais</b> à la tension, à la puissance (W) ni aux ventilateurs.
          </p>
          <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.07] p-4">
            <div className="mb-2 font-bold uppercase tracking-wide text-red-400">Ce qui peut mal se passer</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>Une fonction de Windows qui ne marche plus (impression, Xbox / Game Pass, recherche, géolocalisation…) si tu désactives le service qui va avec.</li>
              <li>Un PC qui chauffe ou consomme un peu plus en « Performance max » — surtout un portable.</li>
              <li>Une batterie qui se vide plus vite, ou des performances réduites en « Économie max ».</li>
              <li>Des fichiers supprimés définitivement par le nettoyage (corbeille, temporaires).</li>
              <li>Dans le pire des cas, un système instable qu’il faudra restaurer.</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-base-700 bg-base-850 p-4">
              <div className="mb-1.5 flex items-center gap-2 font-semibold text-base-50">
                <HardDrive size={16} className="text-amber-400" /> Avant de commencer
              </div>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-base-300">
                <li><b className="text-base-100">Sauvegarde tes fichiers importants</b> sur un disque externe ou dans le cloud.</li>
                <li>Crée un <b className="text-base-100">point de restauration</b> (Power Studio te le propose avant la première optimisation).</li>
                <li>Ferme tes jeux et tes documents en cours.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-base-700 bg-base-850 p-4">
              <div className="mb-1.5 flex items-center gap-2 font-semibold text-base-50">
                <LifeBuoy size={16} className="text-emerald-400" /> Ce que Power Studio fait pour toi
              </div>
              <ul className="space-y-1 text-[12.5px] text-base-300">
                <li className="flex gap-1.5"><Undo2 size={14} className="mt-0.5 shrink-0" /> Chaque optimisation garde la valeur d’origine et s’annule en un clic.</li>
                <li className="flex gap-1.5"><HardDrive size={14} className="mt-0.5 shrink-0" /> Une sauvegarde (.reg) est écrite dans Documents avant chaque modification.</li>
                <li className="flex gap-1.5"><RotateCcw size={14} className="mt-0.5 shrink-0" /> « Rétablir les réglages d’origine » remet ton plan d’alimentation d’avant.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {CHECKS.map((text, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-3 rounded-xl border border-base-700 p-3 text-[13px] text-base-100 hover:bg-base-850">
              <Checkbox checked={checked[i]} onChange={(v) => setChecked(checked.map((c, j) => (j === i ? v : c)))} />
              <span onClick={() => setChecked(checked.map((c, j) => (j === i ? !c : c)))}>{text}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-[12px] text-base-400">Power Studio est fourni tel quel, sans garantie. Utilise-le à tes risques.</p>
          <button className="btn-danger px-5 py-2.5 text-[14px]" disabled={!all || left > 0} onClick={accept}>
            {left > 0 ? `Lis l’avertissement… (${left})` : "J'ai compris, continuer"}
          </button>
        </div>
      </div>
    </div>
  )
}
