import { useEffect, useState } from 'react'
import { Download, Sparkles, CheckCircle } from 'lucide-react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

type Step = 'hidden' | 'prompt' | 'downloading' | 'downloaded' | 'error'
type ReleaseNotes = string | { version: string; note: string | null }[] | null

function notesToText(notes: ReleaseNotes): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  return notes.map((n) => n.note ? `${n.version} :\n${n.note}` : '').filter(Boolean).join('\n\n')
}

// Very small markdown → plain-ish HTML, just enough to make GitHub release notes readable
function notesToHtml(raw: string): string {
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/^#{1,6}\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*]\s+(.+)$/gm, '• $1')
    .replace(/\n/g, '<br>')
}

export default function UpdatePromptModal() {
  const [step, setStep] = useState<Step>('hidden')
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState<ReleaseNotes>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanups = [
      api.app.onUpdateAvailable(({ version, releaseNotes }: { version: string; releaseNotes: ReleaseNotes }) => {
        setVersion(version)
        setNotes(releaseNotes)
        if (!dismissed) setStep('prompt')
      }),
      api.app.onUpdateProgress((pct: number) => { setProgress(pct); setStep('downloading') }),
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
    setProgress(0)
    api.app.downloadUpdate()
  }

  function declineUpdate() {
    setDismissed(true)
    setStep('hidden')
  }

  useEscapeToClose(step === 'prompt' || step === 'downloaded' || step === 'error' ? declineUpdate : undefined)

  if (step === 'hidden') return null

  const notesText = notesToText(notes)

  return (
    <div className="modal-overlay" onClick={step === 'prompt' ? declineUpdate : undefined}>
      <div className="modal fade-in" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop: 24, textAlign: 'center' }}>
          {step === 'prompt' && (
            <>
              <Sparkles size={28} style={{ color: 'var(--accent)', marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Nouvelle version disponible</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                La version {version} de Cours Studio est prête à être installée.
              </div>

              {notesText && (
                <div style={{
                  textAlign: 'left', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', marginBottom: 18, maxHeight: 180, overflow: 'auto'
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Quoi de neuf
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: notesToHtml(notesText) }} />
                </div>
              )}

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
              <Download size={28} style={{ color: 'var(--accent)', marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Téléchargement...</div>
              <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{progress}%</div>
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
