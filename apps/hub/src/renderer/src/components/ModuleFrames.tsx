import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { ModuleInfo } from '@shared/types'
import { useStore } from '../store'
import ModuleIcon from './ModuleIcon'

/**
 * Interfaces des modules ouverts : une <webview> chacune, gardée en vie quand on passe à autre
 * chose (une conversation en cours, un envoi vers Drive… continuent), seule l'active est visible.
 */
export default function ModuleFrames(): JSX.Element {
  const { modules, opened, view } = useStore()
  const activeId = view.kind === 'module' ? view.id : null
  return (
    <div className={`frames${activeId ? ' visible' : ''}`}>
      {opened.map((id) => {
        const m = modules.find((x) => x.id === id && x.entryUrl)
        return m ? <Frame key={`${m.id}@${m.installedVersion}`} module={m} active={m.id === activeId} /> : null
      })}
    </div>
  )
}

type WebviewEl = HTMLElement & { focus(): void; reload(): void }

function Frame({ module: m, active }: { module: ModuleInfo; active: boolean }): JSX.Element {
  const ref = useRef<WebviewEl>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onReady = (): void => setReady(true)
    const onFail = (e: Event): void => {
      const ev = e as Event & { errorDescription?: string; isMainFrame?: boolean }
      if (ev.isMainFrame !== false) setFailed(ev.errorDescription || 'Chargement impossible')
    }
    const onCrash = (): void => setFailed('L’interface du module s’est arrêtée.')
    el.addEventListener('dom-ready', onReady)
    el.addEventListener('did-fail-load', onFail)
    el.addEventListener('render-process-gone', onCrash)
    return () => {
      el.removeEventListener('dom-ready', onReady)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('render-process-gone', onCrash)
    }
  }, [])

  // Le clavier va directement au module affiché.
  useEffect(() => {
    if (active && ready) ref.current?.focus()
  }, [active, ready])

  const problem = m.error ?? failed
  return (
    <div className={`frame${active ? ' active' : ''}`}>
      {!problem && (
        <webview
          ref={ref}
          src={m.entryUrl ?? undefined}
          partition={`persist:module-${m.id}`}
          className={ready ? 'ready' : ''}
        />
      )}
      {!ready && !problem && (
        <div className="frame-loading">
          <ModuleIcon module={m} size={56} />
          <span className="spinner" />
        </div>
      )}
      {problem && (
        <div className="frame-loading">
          <TriangleAlert size={28} style={{ color: 'var(--danger)' }} />
          <div className="empty-title">{m.name} ne démarre pas</div>
          <div className="frame-error">{problem}</div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setFailed(null)
              setReady(false)
              void useStore.getState().install(m.id)
            }}
          >
            Réinstaller le module
          </button>
        </div>
      )}
    </div>
  )
}
