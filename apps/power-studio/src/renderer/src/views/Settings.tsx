import { FolderOpen, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../store/appStore'
import { PageHeader, Toggle } from '../components/ui'

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
  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

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
    </>
  )
}
