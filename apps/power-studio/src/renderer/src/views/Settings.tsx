import { FolderOpen, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../store/appStore'
import { ConfirmDanger, PageHeader, Toggle } from '../components/ui'

function Row({ title, desc, children }: { title: string; desc: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 p-4">
      <div>
        <div className="text-[13.5px] font-medium text-base-50">{title}</div>
        <div className="mt-0.5 text-[12px] leading-5 text-base-400">{desc}</div>
      </div>
      {children}
    </div>
  )
}

export default function SettingsView(): JSX.Element {
  const settings = useApp((s) => s.settings)
  const hw = useApp((s) => s.hardware)
  const updateSettings = useApp((s) => s.updateSettings)
  const [version, setVersion] = useState('')
  const [confirmGpu, setConfirmGpu] = useState(false)
  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])
  const gpu = hw?.gpus.find((g) => g.powerLimit)

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="card divide-y divide-base-800">
        <Row title="Rester dans la zone de notification" desc="Fermer la fenêtre garde Power Studio actif (nécessaire pour le mode automatique et le changement rapide de profil).">
          <Toggle checked={settings.runInTray} onChange={(v) => void updateSettings({ runInTray: v })} />
        </Row>
        {hw?.os !== 'linux' && (
          <Row title="Lancer au démarrage de l’ordinateur" desc="Démarre réduit dans la zone de notification.">
            <Toggle checked={settings.launchAtLogin} onChange={(v) => void updateSettings({ launchAtLogin: v })} />
          </Row>
        )}
        {gpu && (
          <Row
            title="Inclure la carte graphique dans les profils"
            desc={
              <>
                Change la limite de puissance de ta {gpu.model} ({gpu.powerLimit!.min}–{gpu.powerLimit!.max} W, {gpu.powerLimit!.default} W d’usine). Demande les droits administrateur
                à chaque changement de profil manuel ; revient à {gpu.powerLimit!.default} W au redémarrage.
              </>
            }
          >
            <Toggle checked={settings.gpuTuning} onChange={(v) => (v ? setConfirmGpu(true) : void updateSettings({ gpuTuning: false }))} />
          </Row>
        )}
        <Row title="Sauvegardes" desc="Exports .reg et journaux d’annulation créés avant chaque optimisation (Documents\Power Studio\Sauvegardes).">
          <button className="btn-ghost" onClick={() => window.api.tweaks.openBackups()}>
            <FolderOpen size={14} /> Ouvrir
          </button>
        </Row>
        <Row title="Relire l’avertissement de sécurité" desc="Réaffiche l’écran d’avertissement du premier lancement.">
          <button className="btn-ghost" onClick={() => void updateSettings({ disclaimerAccepted: false })}>
            <ShieldAlert size={14} /> Afficher
          </button>
        </Row>
      </div>
      <p className="mt-4 text-[12px] text-base-500">
        Power Studio {version} · {hw?.osLabel} · fourni sans garantie, utilise-le à tes risques.
      </p>
      {confirmGpu && gpu && (
        <ConfirmDanger
          title="Régler la puissance de la carte graphique ?"
          confirmLabel="Activer"
          ack="Je comprends que la carte graphique chauffera plus en Performance max."
          onClose={() => setConfirmGpu(false)}
          onConfirm={() => {
            setConfirmGpu(false)
            void updateSettings({ gpuTuning: true })
          }}
        >
          <p>
            En « Performance max », ta {gpu.model} pourra consommer jusqu’à <b>{gpu.powerLimit!.max} W</b> (au lieu de {gpu.powerLimit!.default} W) : plus de chaleur, plus de bruit,
            et ton alimentation doit suivre. En « Économie max », elle sera limitée à {gpu.powerLimit!.min} W.
          </p>
          <p>Les valeurs restent dans la plage autorisée par NVIDIA pour ta carte.</p>
        </ConfirmDanger>
      )}
    </>
  )
}
