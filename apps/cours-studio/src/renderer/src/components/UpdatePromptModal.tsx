import { useEffect, useState } from 'react'
import { Download, Sparkles, CheckCircle } from 'lucide-react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

type Step = 'hidden' | 'prompt' | 'downloading' | 'downloaded' | 'error'

interface DownloadProgress { percent: number; transferred: number; total: number; bytesPerSecond: number }

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 Mo'
  const mb = bytes / (1024 * 1024)
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${mb.toFixed(1)} Mo`
}

export default function UpdatePromptModal() {
  const [step, setStep] = useState<Step>('hidden')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState<DownloadProgress>({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanups = [
      api.app.onUpdateAvailable(({ version }: { version: string }) => {
        setVersion(version)
        if (!dismissed) setStep('prompt')
      }),
      api.app.onUpdateProgress((p: DownloadProgress) => { setProgress(p); setStep('downloading') }),
      api.app.onUpdateDownloaded(() => setStep('downloaded')),
      api.app.onUpdateError((err: string) => { setError(err); setStep('error') })
    ]
    // Listeners are registered synchronously above — safe to tell main to check now
    api.app.notifyReady()
    return () => cleanups.forEach((c) => c())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isMac = api?.platform === 'darwin'

  function acceptUpdate() {
    if (isMac) {
      // No Developer ID signature → Squirrel can't self-apply. Manual download.
      api.app.openReleases()
      setDismissed(true)
      setStep('hidden')
      return
    }
    setStep('downloading')
    setProgress({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
    api.app.downloadUpdate()
  }

  function declineUpdate() {
    setDismissed(true)
    setStep('hidden')
  }

  useEscapeToClose(step === 'prompt' || step === 'downloaded' || step === 'error' ? declineUpdate : undefined)

  if (step === 'hidden') return null

  const pct = Math.min(100, Math.max(0, Math.round(progress.percent)))
  const remainingBytes = Math.max(0, progress.total - progress.transferred)
  const etaSeconds = progress.bytesPerSecond > 0 ? Math.round(remainingBytes / progress.bytesPerSecond) : null

  return (
    <div className="modal-overlay" onClick={step === 'prompt' ? declineUpdate : undefined}>
      <div className="modal fade-in" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop: 24, textAlign: 'center' }}>
          {step === 'prompt' && (
            <>
              <Sparkles size={28} style={{ color: 'var(--accent)', marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Nouvelle version disponible</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
                La version {version} de Cours Studio est prête à être installée.
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {isMac
                  ? 'Sur macOS, télécharge le nouveau .dmg et glisse l\'app dans Applications.'
                  : 'Tu veux la mettre à jour maintenant ?'}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={declineUpdate}>Non merci</button>
                <button className="btn btn-primary" onClick={acceptUpdate}>
                  <Download size={14} /> {isMac ? 'Ouvrir la page de téléchargement' : 'Mettre à jour'}
                </button>
              </div>
            </>
          )}

          {step === 'downloading' && (
            <>
              <div className="update-download-icon">
                <Download size={26} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Téléchargement de la mise à jour</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginBottom: 20 }}>
                Version {version} — reste sur cette fenêtre, ça ne prend que quelques instants.
              </div>

              <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
                {pct}<span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>%</span>
              </div>

              <div className="update-progress-track">
                <div className="update-progress-fill" style={{ width: `${pct}%` }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 8 }}>
                <span>{formatBytes(progress.transferred)} / {progress.total ? formatBytes(progress.total) : '…'}</span>
                <span>
                  {progress.bytesPerSecond > 0 ? `${formatBytes(progress.bytesPerSecond)}/s` : 'Démarrage...'}
                  {etaSeconds !== null && etaSeconds > 0 ? ` · ${etaSeconds} s restantes` : ''}
                </span>
              </div>
            </>
          )}

          {step === 'downloaded' && (
            <>
              <CheckCircle size={28} style={{ color: 'var(--success)', marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Mise à jour prête</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                L'application va redémarrer pour installer la version {version}.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={declineUpdate}>Plus tard</button>
                <button className="btn btn-primary" onClick={() => api.app.installUpdate()}>
                  Installer et redémarrer
                </button>
              </div>
            </>
          )}

          {step === 'error' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--danger)' }}>Échec de la mise à jour</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</div>
              <button className="btn btn-secondary" onClick={declineUpdate}>Fermer</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
