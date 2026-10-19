import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import type { UpdateState } from '@shared/types'
import { useStore } from '../store'
import ProgressBar from './ProgressBar'

/** Bandeau des mises à jour automatiques : avancement, et Annuler à chaque étape. */
export default function UpdateBanner(): JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    void window.api.updates.state().then(setState)
    const offs = [
      window.api.updates.onState(setState),
      window.api.updates.onCancelled(() => useStore.getState().toast('Mise à jour annulée : elle sera reproposée au prochain lancement.', 'info'))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (!state || state.phase === 'idle') return null

  const cancel = (): void => {
    void window.api.updates.cancel()
    if (state.kind === 'app') useStore.getState().toast('Mise à jour annulée : elle sera reproposée au prochain lancement.', 'info')
  }

  return (
    <div className="update-banner" role="status">
      <div className="update-banner-main">
        {state.phase === 'ready' ? <RefreshCw size={15} /> : state.phase === 'available' ? <Download size={15} /> : <Loader2 size={15} className="spin-icon" />}
        <div className="update-banner-text">
          <span>{state.label}</span>
          {state.phase === 'ready' && <span className="update-banner-sub">Redémarrage dans {state.seconds ?? 0} s</span>}
          {state.phase === 'downloading' && <ProgressBar ratio={state.pct < 0 ? 0 : state.pct} indeterminate={state.pct < 0} />}
        </div>
      </div>
      <div className="update-banner-actions">
        {state.phase === 'available' && (
          <button className="btn btn-primary btn-sm" onClick={() => void window.api.updates.start()}>Installer</button>
        )}
        {state.phase === 'ready' && (
          <button className="btn btn-primary btn-sm" onClick={() => void window.api.updates.installNow()}>Redémarrer</button>
        )}
        {state.phase !== 'available' || state.kind === 'app' ? (
          <button className="btn btn-ghost btn-sm" onClick={cancel}>Annuler</button>
        ) : null}
      </div>
    </div>
  )
}
