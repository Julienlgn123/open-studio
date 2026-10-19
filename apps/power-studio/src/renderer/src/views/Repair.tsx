import { Copy, Play, RotateCcw, ShieldCheck, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RepairResult, RepairTool } from '@shared/types'
import { useApp } from '../store/appStore'
import { Badge, InfoBox, Modal, PageHeader, Spinner } from '../components/ui'

export default function Repair(): JSX.Element {
  const toast = useApp((s) => s.toast)
  const [tools, setTools] = useState<RepairTool[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<RepairTool | null>(null)
  const [result, setResult] = useState<{ tool: RepairTool; r: RepairResult } | null>(null)
  useEffect(() => void window.api.repair.list().then(setTools), [])

  const run = async (t: RepairTool): Promise<void> => {
    setConfirm(null)
    setRunning(t.id)
    try {
      const r = await window.api.repair.run(t.id)
      if (r.adminDenied) toast('Droits administrateur refusés : rien n’a été fait.', 'error')
      else setResult({ tool: t, r })
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <PageHeader title="Dépannage" subtitle="Les réparations classiques de Windows en un clic : chacune lance l’outil officiel du système et te montre ce qu’il a fait." />
      <div className="grid gap-3 md:grid-cols-2">
        {tools.map((t) => (
          <div key={t.id} className="card flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2">
              <Wrench size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-base-50">{t.title}</div>
                <div className="text-[12.5px] text-base-300">{t.description}</div>
              </div>
            </div>
            <div className="text-[12px] text-base-400">
              <span className="text-base-300">Quand ?</span> {t.when}
            </div>
            <div className="mt-auto flex items-center gap-2 pt-1">
              {t.admin && <Badge color="amber">Admin</Badge>}
              {t.restart && <Badge color="violet">Redémarrage</Badge>}
              <span className="text-[11.5px] text-base-500">≈ {t.duration}</span>
              <button className="btn-ghost ml-auto !py-1.5" disabled={!!running} onClick={() => (t.admin || t.restart ? setConfirm(t) : void run(t))}>
                {running === t.id ? <Spinner /> : <Play size={13} />} {running === t.id ? 'En cours…' : 'Lancer'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <InfoBox>
          Ces outils ne suppriment aucun fichier personnel. Les plus longs (SFC, DISM) peuvent tourner 20 minutes : laisse Power Studio ouvert. Une fenêtre Windows te demandera
          l’autorisation pour ceux marqués « Admin ».
        </InfoBox>
      </div>

      {confirm && (
        <Modal onClose={() => setConfirm(null)} width={480}>
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={18} className="text-accent-400" />
            <h2 className="text-[16px] font-semibold text-base-50">{confirm.title}</h2>
            <button onClick={() => setConfirm(null)} className="ml-auto text-base-400 hover:text-base-100">
              <X size={18} />
            </button>
          </div>
          <p className="text-[13px] text-base-200">{confirm.description}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-base-300">
            {confirm.admin && <li>Windows va te demander l’autorisation administrateur.</li>}
            <li>Durée : environ {confirm.duration}.</li>
            {confirm.restart && <li>Un redémarrage sera nécessaire pour terminer (tu le fais quand tu veux).</li>}
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirm(null)}>
              Annuler
            </button>
            <button className="btn-primary" onClick={() => void run(confirm)}>
              <Play size={13} /> Lancer
            </button>
          </div>
        </Modal>
      )}

      {result && (
        <Modal onClose={() => setResult(null)} width={640}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-base-50">{result.tool.title}</h2>
            <Badge color={result.r.ok ? 'green' : 'red'}>{result.r.ok ? 'Terminé' : 'Échec'}</Badge>
            <button onClick={() => setResult(null)} className="ml-auto text-base-400 hover:text-base-100">
              <X size={18} />
            </button>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-base-800 bg-base-950 p-3 font-mono text-[12px] leading-5 text-base-200">{result.r.output}</pre>
          {result.tool.restart && result.r.ok && (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-amber-300">
              <RotateCcw size={14} /> Redémarre le PC pour terminer.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="btn-ghost"
              onClick={() => {
                void navigator.clipboard.writeText(result.r.output)
                toast('Résultat copié', 'ok')
              }}
            >
              <Copy size={13} /> Copier
            </button>
            <button className="btn-primary" onClick={() => setResult(null)}>
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
