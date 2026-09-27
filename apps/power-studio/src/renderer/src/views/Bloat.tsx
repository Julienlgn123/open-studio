import { Download, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BloatApp } from '@shared/types'
import { useApp } from '../store/appStore'
import { Checkbox, ConfirmDanger, InfoBox, PageHeader, Spinner } from '../components/ui'

export default function Bloat(): JSX.Element {
  const toast = useApp((s) => s.toast)
  const [apps, setApps] = useState<BloatApp[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const load = async (): Promise<void> => setApps(await window.api.bloat.list())
  useEffect(() => {
    void load()
  }, [])

  const installed = apps?.filter((a) => a.installed) ?? []
  const removed = apps?.filter((a) => !a.installed) ?? []

  const remove = async (): Promise<void> => {
    setConfirm(false)
    setBusy(true)
    const r = await window.api.bloat.remove([...selected])
    setBusy(false)
    setSelected(new Set())
    if (r.removed.length) toast(`${r.removed.length} app(s) désinstallée(s)`, 'ok')
    if (r.failed.length) toast(`${r.failed.length} en échec : ${r.failed[0].error}`, 'error')
    await load()
  }

  return (
    <>
      <PageHeader title="Apps préinstallées" subtitle="Apps installées d’office par Windows. Toutes se réinstallent gratuitement depuis le Microsoft Store.">
        <button className="btn-ghost" onClick={() => void load()}>
          <RefreshCw size={14} />
        </button>
        <button className="btn-danger" disabled={!selected.size || busy} onClick={() => setConfirm(true)}>
          {busy ? <Spinner /> : <Trash2 size={14} />} Désinstaller ({selected.size})
        </button>
      </PageHeader>
      <div className="mb-4">
        <InfoBox>Seules des apps Microsoft ou partenaires connues sont listées ici : les apps système indispensables (Paramètres, Store, Sécurité…) ne le sont jamais.</InfoBox>
      </div>
      {!apps ? (
        <div className="flex items-center gap-2 text-base-300">
          <Spinner /> Recherche des apps installées…
        </div>
      ) : (
        <>
          {installed.length === 0 ? (
            <p className="text-[13px] text-emerald-300">Aucune app préinstallée inutile trouvée : ton Windows est déjà propre.</p>
          ) : (
            <div className="card divide-y divide-base-800">
              {installed.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <Checkbox
                    checked={selected.has(a.id)}
                    onChange={(v) => {
                      const next = new Set(selected)
                      if (v) next.add(a.id)
                      else next.delete(a.id)
                      setSelected(next)
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-base-50">{a.name}</div>
                    <div className="text-[12px] text-base-400">{a.description}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
          {removed.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-[13px] text-base-300">Déjà absentes ({removed.length}) — réinstaller depuis le Store</summary>
              <div className="card mt-2 divide-y divide-base-800">
                {removed.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[13px] text-base-300">{a.name}</span>
                    <button className="btn-ghost ml-auto h-7 px-2.5 text-[12px]" onClick={() => window.api.bloat.reinstall(a.id)}>
                      <Download size={13} /> Store
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
      {confirm && (
        <ConfirmDanger title={`Désinstaller ${selected.size} app(s) ?`} confirmLabel="Désinstaller" onClose={() => setConfirm(false)} onConfirm={remove}>
          <p>Ces apps et leurs données locales (ex. favoris de l’app Cartes, listes To Do non synchronisées) seront supprimées pour ton compte :</p>
          <ul className="list-disc pl-5 text-[12.5px]">
            {installed.filter((a) => selected.has(a.id)).map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
          <p className="text-[12.5px] text-base-300">Pour en récupérer une : section « Déjà absentes » → Store.</p>
        </ConfirmDanger>
      )}
    </>
  )
}
