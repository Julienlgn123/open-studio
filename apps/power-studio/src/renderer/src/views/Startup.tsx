import { Lock, RefreshCw, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { StartupItem } from '@shared/types'
import { useApp } from '../store/appStore'
import { Badge, ConfirmDanger, InfoBox, PageHeader, Spinner, Toggle } from '../components/ui'

const IMPACT = { high: ['red', 'Impact élevé'], medium: ['amber', 'Impact moyen'], low: ['gray', 'Impact faible'], unknown: ['gray', '?'] } as const

export default function Startup(): JSX.Element {
  const toast = useApp((s) => s.toast)
  const [items, setItems] = useState<StartupItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<StartupItem | null>(null)

  const load = async (): Promise<void> => {
    setItems(await window.api.startup.list().catch(() => []))
  }
  useEffect(() => {
    void load()
  }, [])

  const toggle = async (item: StartupItem, enable: boolean): Promise<void> => {
    setConfirm(null)
    setBusy(item.id)
    const r = await window.api.startup.set(item.id, enable)
    setBusy(null)
    if (!r.ok) toast(r.adminDenied ? 'Droits administrateur refusés.' : `Échec : ${r.error}`, 'error')
    await load()
  }

  const active = items?.filter((i) => i.enabled).length ?? 0

  return (
    <>
      <PageHeader title="Démarrage" subtitle="Programmes lancés à chaque démarrage. En désactiver accélère le démarrage et libère de la mémoire : ils restent installés et tu peux toujours les ouvrir à la main.">
        <button className="btn-ghost" onClick={() => void load()}>
          <RefreshCw size={14} />
        </button>
      </PageHeader>
      <div className="mb-4">
        <InfoBox>
          Même méthode que le Gestionnaire des tâches de Windows : rien n’est supprimé, un simple interrupteur suffit pour réactiver. Ne désactive pas ce que tu ne reconnais pas
          (pilotes audio, souris, antivirus…) : ils sont marqués « Système ».
        </InfoBox>
      </div>
      {!items ? (
        <div className="flex items-center gap-2 text-base-300">
          <Spinner /> Lecture des programmes au démarrage…
        </div>
      ) : items.length === 0 ? (
        <p className="text-base-400">Aucun programme au démarrage.</p>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-base-400">
            {active} actif(s) sur {items.length}
          </p>
          <div className="card divide-y divide-base-800">
            {items.map((i) => (
              <div key={i.id} className={`flex items-center gap-3 px-4 py-3 ${i.enabled ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-medium text-base-50">{i.name}</span>
                    <Badge color={IMPACT[i.impact][0]}>{IMPACT[i.impact][1]}</Badge>
                    {i.essential && (
                      <Badge color="violet">
                        <ShieldAlert size={9} /> Système
                      </Badge>
                    )}
                    {i.admin && (
                      <Badge color="gray">
                        <Lock size={9} /> Admin
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-base-500" title={i.command}>
                    {i.location} · {i.command}
                  </div>
                </div>
                {busy === i.id ? <Spinner /> : <Toggle checked={i.enabled} disabled={!!busy} onChange={(v) => (i.essential && !v ? setConfirm(i) : void toggle(i, v))} />}
              </div>
            ))}
          </div>
        </>
      )}
      {confirm && (
        <ConfirmDanger
          title={`Désactiver « ${confirm.name} » ?`}
          confirmLabel="Désactiver quand même"
          ack="Je sais à quoi sert ce programme et je peux le réactiver ici."
          onClose={() => setConfirm(null)}
          onConfirm={() => toggle(confirm, false)}
        >
          <p>Ce programme ressemble à un composant du système (pilote, audio, sécurité…). Le désactiver peut faire perdre une fonction : son, touches spéciales, antivirus…</p>
        </ConfirmDanger>
      )}
    </>
  )
}
