import { Brush, Lock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CleanTarget } from '@shared/types'
import { formatBytes, useApp } from '../store/appStore'
import { Badge, Checkbox, ConfirmDanger, PageHeader, Spinner, WarnBox } from '../components/ui'

export default function Clean(): JSX.Element {
  const toast = useApp((s) => s.toast)
  const [targets, setTargets] = useState<CleanTarget[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const load = async (): Promise<void> => {
    setTargets(null)
    const t = await window.api.clean.list()
    setTargets(t)
    // Pré-coché : seulement ce qui est sans conséquence (pas la corbeille).
    setSelected(new Set(t.filter((x) => x.bytes > 0 && !x.admin && !/trash|recycle/.test(x.id)).map((x) => x.id)))
  }
  useEffect(() => {
    void load()
  }, [])

  const total = (targets ?? []).filter((t) => selected.has(t.id)).reduce((s, t) => s + t.bytes, 0)
  const withTrash = [...selected].some((id) => /trash|recycle/.test(id))

  const run = async (): Promise<void> => {
    setConfirm(false)
    setBusy(true)
    const r = await window.api.clean.run([...selected])
    setBusy(false)
    toast(`${formatBytes(r.freedBytes)} libérés`, 'ok')
    if (r.adminDenied) toast('Droits administrateur refusés : les dossiers système n’ont pas été nettoyés.', 'error')
    else if (r.failed.length) toast(`Échec : ${r.failed[0].error}`, 'error')
    await load()
  }

  return (
    <>
      <PageHeader title="Nettoyage" subtitle="Libère de l’espace disque en supprimant des fichiers que le système recrée tout seul. Les fichiers en cours d’utilisation sont ignorés.">
        <button className="btn-ghost" onClick={() => void load()} disabled={!targets}>
          <RefreshCw size={14} />
        </button>
        <button className="btn-primary" disabled={!selected.size || busy || !targets} onClick={() => setConfirm(true)}>
          {busy ? <Spinner /> : <Brush size={14} />} Nettoyer {total > 0 ? formatBytes(total) : ''}
        </button>
      </PageHeader>
      <div className="mb-4">
        <WarnBox>
          <b>La suppression est définitive</b> (pas de passage par la corbeille). Tes documents, photos et jeux ne sont jamais touchés : seulement les dossiers listés ci-dessous.
        </WarnBox>
      </div>
      {!targets ? (
        <div className="flex items-center gap-2 text-base-300">
          <Spinner /> Calcul de l’espace récupérable…
        </div>
      ) : (
        <div className="card divide-y divide-base-800">
          {targets.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <Checkbox
                checked={selected.has(t.id)}
                onChange={(v) => {
                  const next = new Set(selected)
                  if (v) next.add(t.id)
                  else next.delete(t.id)
                  setSelected(next)
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-medium text-base-50">{t.name}</span>
                  {t.admin && (
                    <Badge color="gray">
                      <Lock size={9} /> Admin
                    </Badge>
                  )}
                </div>
                <div className="text-[12px] text-base-400">{t.description}</div>
              </div>
              <span className="font-mono text-[13px] text-base-100">{t.id === 'journal' ? '—' : formatBytes(t.bytes)}</span>
            </label>
          ))}
        </div>
      )}
      {confirm && (
        <ConfirmDanger
          title="Supprimer définitivement ces fichiers ?"
          confirmLabel="Nettoyer"
          ack="Je comprends que ces fichiers seront supprimés définitivement."
          delay={withTrash ? 3 : 1}
          onClose={() => setConfirm(false)}
          onConfirm={run}
        >
          <p>
            Environ <b>{formatBytes(total)}</b> vont être supprimés.
          </p>
          {withTrash && <p className="font-semibold text-red-300">La corbeille est incluse : vérifie qu’elle ne contient rien que tu veux récupérer.</p>}
        </ConfirmDanger>
      )}
    </>
  )
}
