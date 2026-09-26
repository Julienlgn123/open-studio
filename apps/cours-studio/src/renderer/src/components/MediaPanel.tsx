import { useState } from 'react'
import { Mic, Monitor, FolderOpen, Captions } from 'lucide-react'
import type { Course } from '../../../shared/types'
import MediaPlayer from './MediaPlayer'
import { useStore, aiReady } from '../store'
import { markdownToHtml, textToHtml } from '../utils/text'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Props {
  course: Course
}

export default function MediaPanel({ course }: Props) {
  const { settings, updateCourse, showToast } = useStore()
  const [transcribing, setTranscribing] = useState(false)
  const [step, setStep] = useState('')
  // Résumé + fiches générés automatiquement après la transcription (réglage mémorisé).
  const autoStudy = settings.autoStudyFromTranscript !== false
  const hasAudio = !!course.audioPath
  const hasVideo = !!course.videoPath

  async function transcribeAudio() {
    if (!course.audioPath) return
    if (!settings.mistralApiKey) { showToast('La transcription utilise Mistral : ajoute ta clé API dans les paramètres', 'error'); return }
    setTranscribing(true)
    try {
      setStep('Transcription…')
      const text = await api.transcribe({ apiKey: settings.mistralApiKey, filePath: course.audioPath })
      if (!text.trim()) { showToast('Aucun texte détecté dans l\'audio', 'error'); return }
      let newContent = `${course.content ? `${course.content}\n` : ''}<h3>Transcription audio</h3>\n${textToHtml(text)}`
      await updateCourse(course.id, { content: newContent })

      if (!autoStudy || !aiReady(settings)) {
        showToast('Transcription ajoutée aux notes', 'success')
        return
      }
      const model = settings.mistralModel || 'open-mistral-7b'
      setStep('Résumé…')
      const summary: string = await api.ai.complete({
        apiKey: settings.mistralApiKey,
        model,
        messages: [
          {
            role: 'system',
            content:
              "Tu transformes la transcription brute d'un cours oral en notes de révision claires, en français, au format Markdown : titres ###, listes à puces, **termes clés** en gras, définitions et formules mises en avant. N'invente rien, supprime les hésitations et répétitions. Réponds uniquement avec les notes."
          },
          { role: 'user', content: `Cours : ${course.title}\n\nTranscription :\n${text}` }
        ]
      })
      newContent += `\n<h3>Résumé de l'enregistrement</h3>\n${markdownToHtml(summary)}`
      await updateCourse(course.id, { content: newContent })

      setStep('Fiches…')
      const raw: string = await api.ai.complete({
        apiKey: settings.mistralApiKey,
        model,
        json: true,
        messages: [
          {
            role: 'system',
            content:
              'À partir de la transcription d\'un cours, crée les flashcards qui valent la peine d\'être mémorisées (définitions, formules, dates, notions clés). Réponds UNIQUEMENT avec un JSON : {"cards":[{"front":"question précise","back":"réponse courte"}]} — 5 à 15 cartes selon la densité, en français.'
          },
          { role: 'user', content: `Cours : ${course.title}\n\n${text}` }
        ]
      })
      let count = 0
      try {
        const parsed = JSON.parse(raw) as { cards?: { front: string; back: string }[] }
        const cards = (parsed.cards ?? []).filter((c) => c.front?.trim() && c.back?.trim())
        if (cards.length) await api.flashcards.create(course.id, cards)
        count = cards.length
      } catch { /* réponse non JSON : pas de fiches, le résumé est déjà là */ }
      showToast(`Transcription, résumé${count ? ` et ${count} fiches` : ''} ajoutés au cours`, 'success')
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setTranscribing(false)
      setStep('')
    }
  }

  if (!hasAudio && !hasVideo) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎙️</div>
        <div className="empty-state-title">Aucun enregistrement</div>
        <div className="empty-state-desc">Lance un enregistrement audio ou vidéo via le bouton 🎤 en haut.</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Enregistrements de ce cours
        </div>

        {hasAudio && course.audioPath && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={13} /> Audio
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, textTransform: 'none' }}
                onClick={transcribeAudio}
                disabled={transcribing}
              >
                {transcribing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Captions size={12} />}
                {transcribing ? step || 'Transcription…' : autoStudy ? 'Transcrire + résumé + fiches' : 'Transcrire en texte'}
              </button>
            </div>
            <MediaPlayer type="audio" filePath={course.audioPath} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoStudy}
                onChange={(e) => useStore.getState().saveSettings({ ...settings, autoStudyFromTranscript: e.target.checked })}
              />
              Après la transcription, résumer et créer des flashcards automatiquement
            </label>
          </div>
        )}

        {hasVideo && course.videoPath && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Monitor size={13} /> Enregistrement écran
            </div>
            <MediaPlayer type="video" filePath={course.videoPath} />
          </div>
        )}

        <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpen size={13} />
          Les fichiers sont conservés localement et ne seront jamais effacés automatiquement.
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', fontSize: 11 }}
            onClick={() => api.recording.reveal(course.audioPath ?? course.videoPath)}
          >
            Ouvrir le dossier
          </button>
        </div>
      </div>
    </div>
  )
}
