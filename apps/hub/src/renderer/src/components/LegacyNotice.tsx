import { useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { isInstalled, useStore } from '../store'

/**
 * Une ancienne app autonome est toujours installée alors que son module l'est aussi : on propose
 * de la désinstaller (le module utilise déjà ses données, qui ne sont pas touchées).
 */
export default function LegacyNotice(): JSX.Element | null {
  const { modules, removeLegacy, ask } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const list = modules.filter((m) => isInstalled(m) && m.legacy?.appInstalled)
  if (!list.length) return null

  return (
    <div className="callout">
      <PackageCheck size={16} />
      <div style={{ flex: 1 }}>
        <strong>Les anciennes apps ne sont plus utiles.</strong>
        <span> {list.map((m) => m.name).join(', ')} {list.length > 1 ? 'sont' : 'est'} maintenant dans Open Studio, avec les mêmes données. Tu peux désinstaller l’ancienne version.</span>
      </div>
      <div className="callout-actions">
        {list.map((m) => (
          <button
            key={m.id}
            className="btn btn-secondary btn-sm"
            disabled={!!busy}
            onClick={() =>
              ask({
                title: `Désinstaller l’ancienne app ${m.name} ?`,
                body: 'Seul le programme séparé est supprimé. Tes données restent là et le module continue de les utiliser.',
                confirmLabel: 'Désinstaller',
                onConfirm: () => {
                  setBusy(m.id)
                  void removeLegacy(m.id).finally(() => setBusy(null))
                }
              })
            }
          >
            {busy === m.id ? <span className="spinner" /> : null}
            Désinstaller {list.length > 1 ? m.name : 'l’ancienne app'}
          </button>
        ))}
      </div>
    </div>
  )
}
