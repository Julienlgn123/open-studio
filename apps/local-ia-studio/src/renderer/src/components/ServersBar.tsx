import { useEffect, useState } from 'react'
import { ExternalLink, Globe, Square } from 'lucide-react'
import type { RunningProcess } from '@shared/types'

/** Sites lancés par le modèle sur localhost : ouvrir dans Chrome ou arrêter. */
export default function ServersBar(): JSX.Element | null {
  const [servers, setServers] = useState<RunningProcess[]>([])

  useEffect(() => {
    window.api.servers.list().then(setServers).catch(() => {})
    return window.api.servers.onChanged(setServers)
  }, [])

  if (!servers.length) return null
  return (
    <div className="mb-1 space-y-1">
      {servers.map((s) => (
        <div key={s.id} className="flex items-center gap-2 rounded-[10px] bg-emerald-500/10 px-2.5 py-1.5 text-xs">
          <Globe size={13} className="shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1" title={s.cwd}>
            <div className="truncate text-base-100">{s.label}</div>
            <div className="truncate font-mono text-[10.5px] text-emerald-400">{s.url?.replace(/^http:\/\//, '')}</div>
          </div>
          {s.url && (
            <button
              onClick={() => window.api.servers.open(s.url!)}
              className="rounded p-1 text-base-400 hover:bg-base-800 hover:text-base-100"
              title="Ouvrir dans Chrome"
            >
              <ExternalLink size={13} />
            </button>
          )}
          <button
            onClick={() => window.api.servers.stop(s.id)}
            className="rounded p-1 text-base-400 hover:bg-base-800 hover:text-red-400"
            title="Arrêter le site"
          >
            <Square size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
