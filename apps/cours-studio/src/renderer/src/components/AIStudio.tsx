import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, ArrowLeft, BookOpen, CheckCircle, Circle, AlertCircle, MessageSquare, ImagePlus, FileUp, X } from 'lucide-react'
import { useStore } from '../store'
import type { AIMessage, AIAction } from '../../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

// Free-tier Mistral models are text-only — screenshots/photos need a vision model
const VISION_MODEL = 'pixtral-12b-2409'

interface ImageAttachment { fileName: string; dataUrl: string }
interface DocAttachment { fileName: string; text: string }

const AI_ACTIONS: { action: AIAction; icon: string; title: string; desc: string }[] = [
  { action: 'revision_sheet', icon: '📋', title: 'Fiche de révision', desc: 'Synthèse structurée d\'une page' },
  { action: 'cleanup',    icon: '🧹', title: 'Mettre au propre', desc: 'Notes en vrac → texte clair' },
  { action: 'gaps',       icon: '🕳️', title: 'Trous à combler', desc: 'Notions citées mais pas expliquées' },
  { action: 'simplify',   icon: '🎈', title: 'Vulgariser',   desc: 'Expliqué comme si tu avais 15 ans' },
  { action: 'exam_plan',  icon: '📅', title: 'Planning de révision', desc: 'Calendrier avant un examen' },
  { action: 'improve',    icon: '✨', title: 'Améliorer',   desc: 'Reformule et enrichit le cours' },
  { action: 'summarize',  icon: '📝', title: 'Résumer',     desc: 'Crée un résumé concis' },
  { action: 'explain',    icon: '🧠', title: 'Expliquer',   desc: 'Clarifie les notions complexes' },
  { action: 'reorganize', icon: '🔄', title: 'Réorganiser', desc: 'Restructure et corrige' },
  { action: 'merge',      icon: '📚', title: 'Fusionner',   desc: 'Combine plusieurs cours' },
  { action: 'chat',       icon: '💬', title: 'Chat libre',  desc: 'Dialogue ouvert avec l\'IA' }
]

const STRICT_SUFFIX = `\n\nRÈGLES ABSOLUES : commence DIRECTEMENT par le contenu, sans phrase d'introduction, sans "Voici", sans "---" de séparation décoratif, sans note finale, sans commentaire. Juste le contenu demandé.`

const ACTION_PROMPTS: Record<AIAction, string> = {
  improve:    `Tu es un assistant pédagogique. Améliore ce cours : rends-le plus clair et mieux structuré. Sois CONCIS — ne gonfle pas le contenu. Utilise markdown simple : ## pour sections, ### pour sous-sections, **gras** pour termes clés, - pour listes. Pas de HTML.${STRICT_SUFFIX}`,
  summarize:  `Tu es un assistant pédagogique. Fais un résumé très court de ce cours. Maximum 150 mots. Uniquement les points essentiels. Markdown simple (##, -, **).${STRICT_SUFFIX}`,
  explain:    `Tu es un assistant pédagogique. Identifie les 2-3 notions les plus complexes et explique chacune en 2-3 phrases avec un exemple concret. Bref et direct. Markdown simple.${STRICT_SUFFIX}`,
  reorganize: `Tu es un assistant pédagogique. Réorganise ce cours de façon logique. Corrige les fautes. Garde le même contenu sans l'allonger. Markdown simple (##, ###, -, **).${STRICT_SUFFIX}`,
  merge:      `Tu es un assistant pédagogique. Fusionne ces cours en un seul cohérent. Évite les répétitions. Sois concis. Markdown simple.${STRICT_SUFFIX}`,
  chat:       '',
  revision_sheet: `Tu es un assistant pédagogique. Produis une FICHE DE RÉVISION d'une page à partir de ce cours, prête à mémoriser avant un contrôle. Structure : un titre ##, puis des sections ### thématiques. Pour chaque section : les définitions clés en **gras**, les formules/dates/faits à retenir en liste -, et si utile un "⚠️ Piège :" ou "💡 À retenir :". Va à l'essentiel, rien de superflu. Markdown simple, pas de HTML.${STRICT_SUFFIX}`,
  cleanup:    `Tu es un assistant pédagogique. Ces notes ont été prises à la volée (abréviations, phrases coupées, fautes). Réécris-les en phrases complètes et correctes, en gardant EXACTEMENT les mêmes informations et le même ordre — ne rajoute rien, ne développe pas. Corrige l'orthographe et la grammaire. Markdown simple (##, ###, -, **).${STRICT_SUFFIX}`,
  gaps:       `Tu es un assistant pédagogique exigeant. Analyse ces notes et liste les notions, termes ou concepts qui sont MENTIONNÉS mais jamais définis ni expliqués — les trous qu'un étudiant devrait combler avant l'examen. Pour chacun : le terme en **gras**, puis une phrase disant ce qui manque. Termine par 2-3 questions que le prof pourrait poser sur ces zones floues. Si les notes sont complètes, dis-le franchement. Markdown simple.${STRICT_SUFFIX}`,
  simplify:   `Tu es un excellent vulgarisateur. Ré-explique ce cours comme si tu parlais à un élève de 15 ans intelligent mais qui découvre le sujet : phrases courtes, analogies du quotidien, zéro jargon non expliqué. Garde toutes les idées importantes. Markdown simple (##, -, **).${STRICT_SUFFIX}`,
  exam_plan:  `Tu es un coach de révision. À partir des cours fournis et des contraintes de l'étudiant (date d'examen, temps disponible par jour), construis un PLANNING DE RÉVISION jour par jour jusqu'à l'examen. Pour chaque jour : la date, les cours/chapitres à travailler, le type de travail (lecture active, flashcards, exercices, quiz), et une durée. Répartis la charge, garde le dernier jour pour une révision générale légère, prévois des pauses. Markdown simple : ### par jour, - pour les tâches.${STRICT_SUFFIX}`
}

function markdownToHtml(md: string): string {
  // Strip common Mistral intro/outro patterns
  let text = md
    .replace(/^(Voici[^:\n]*:?\n+)/i, '')
    .replace(/^(---+\n)/gm, '')
    .replace(/(\n---+\s*$)/gm, '')
    .replace(/(\n\*Note[^*]*\*\s*$)/is, '')
    .replace(/(\n_Note[^_]*_\s*$)/is, '')
    .trim()

  // Markdown → TipTap-compatible HTML
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li><p>$1</p></li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith('<h') || block.startsWith('<ul')) return block
      if (block.trim()) return `<p>${block.replace(/\n/g, '<br>')}</p>`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

type Step = { id: string; label: string; status: 'pending' | 'active' | 'done' | 'error'; detail?: string }

export default function AIStudio() {
  const { courses, subjects, settings, setView, showToast, startAITask, completeAITask, failAITask, aiTask } = useStore()
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [activeAction, setActiveAction] = useState<AIAction | null>(null)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')

  const [steps, setSteps] = useState<Step[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamDone, setStreamDone] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [refineInput, setRefineInput] = useState('')
  const [refining, setRefining] = useState(false)
  const [examDate, setExamDate] = useState('')
  const [examHours, setExamHours] = useState('2')
  const [examReady, setExamReady] = useState(false)
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [attachedDocs, setAttachedDocs] = useState<DocAttachment[]>([])
  const [attaching, setAttaching] = useState(false)

  const cleanupRef = useRef<(() => void) | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  // Is there already a task running? Lock if it concerns selected courses
  const taskRunning = aiTask?.status === 'running'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    streamRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamText])

  useEffect(() => () => { cleanupRef.current?.() }, [])

  function toggleCourse(id: string) {
    if (taskRunning) return
    setSelectedCourseIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function buildContext(): string {
    const courseText = selectedCourseIds.map((id) => {
      const course = courses.find((c) => c.id === id)
      if (!course) return ''
      const subject = subjects.find((s) => s.id === course.subjectId)
      const text = course.content.replace(/<[^>]+>/g, '').trim()
      return `=== ${course.emoji ?? '📝'} ${course.title} (${subject?.name ?? 'Sans matière'}) ===\n${text}`
    }).filter(Boolean).join('\n\n')
    const docsText = attachedDocs.map((d) => `=== Document fourni : ${d.fileName} ===\n${d.text}`).join('\n\n')
    return [courseText, docsText].filter(Boolean).join('\n\n')
  }

  // Wraps a plain-text user message into Mistral's multipart format when images
  // are attached (required for vision models), otherwise keeps it as plain text
  function buildUserContent(text: string): string | Array<{ type: string; text?: string; image_url?: string }> {
    if (attachedImages.length === 0) return text
    return [
      { type: 'text', text },
      ...attachedImages.map((img) => ({ type: 'image_url', image_url: img.dataUrl }))
    ]
  }

  function activeModel(): string {
    return attachedImages.length > 0 ? VISION_MODEL : (settings.mistralModel || 'open-mistral-7b')
  }

  async function pickImages() {
    setAttaching(true)
    try {
      const results = await api.images.pick()
      if (results.length > 0) {
        setAttachedImages((prev) => [...prev, ...results])
        showToast(`${results.length} image(s) ajoutée(s)`, 'success')
      }
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setAttaching(false)
    }
  }

  async function pickDoc() {
    setAttaching(true)
    try {
      const result = await api.documents.import()
      if (result) {
        setAttachedDocs((prev) => [...prev, result])
        showToast(`Document ajouté : ${result.fileName}`, 'success')
      }
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setAttaching(false)
    }
  }

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
  }

  async function runAction(action: AIAction, opts?: { skipExamGate?: boolean }) {
    if (!settings.mistralApiKey) { showToast('Configure ta clé API Mistral dans les paramètres', 'error'); return }
    const hasAttachments = attachedImages.length > 0 || attachedDocs.length > 0
    if (selectedCourseIds.length === 0 && !hasAttachments && action !== 'chat') {
      showToast('Sélectionne au moins un cours ou ajoute une pièce jointe', 'error')
      return
    }

    setActiveAction(action)
    setStreamText('')
    setStreamDone(false)
    setStreamError(null)

    if (action === 'chat') { setMessages([]); return }
    // Exam planner needs the date + daily hours first — show the form, run later
    if (action === 'exam_plan' && !opts?.skipExamGate) return

    const primaryCourse = courses.find((c) => c.id === selectedCourseIds[0])
    const actionInfo = AI_ACTIONS.find((a) => a.action === action)!

    // Register global banner task
    if (primaryCourse) {
      startAITask({
        courseId: primaryCourse.id,
        courseTitle: primaryCourse.title,
        courseEmoji: primaryCourse.emoji ?? '📝',
        action,
        actionLabel: actionInfo.title
      })
    }

    const courseNames = selectedCourseIds.map((id) => {
      const c = courses.find((x) => x.id === id)
      return c ? `${c.emoji ?? '📝'} ${c.title}` : id
    })

    const initialSteps: Step[] = [
      { id: 'context', label: 'Préparation du contexte', status: 'active', detail: `${selectedCourseIds.length} cours : ${courseNames.join(', ')}` },
      { id: 'send',    label: 'Envoi à Mistral',          status: 'pending' },
      { id: 'receive', label: 'Réception de la réponse',  status: 'pending' }
    ]
    setSteps(initialSteps)
    setStreaming(true)

    await delay(400)
    const context = buildContext()
    const attachNote = attachedImages.length > 0 ? ` + ${attachedImages.length} image(s)` : ''
    updateStep('context', { status: 'done', detail: `${context.length.toLocaleString()} caractères${attachNote} — ${courseNames.join(', ')}` })
    const model = activeModel()
    updateStep('send', { status: 'active', detail: `${model} · température 0.7` })

    const systemPrompt = ACTION_PROMPTS[action]
    const userMsg =
      action === 'merge' ? `Voici les cours à fusionner :\n\n${context}` :
      action === 'exam_plan' ? `Contraintes : examen le ${examDate}, environ ${examHours} h de révision disponibles par jour. Nous sommes aujourd'hui le ${new Date().toISOString().slice(0, 10)}.\n\nCours à réviser :\n\n${context}` :
      `Voici le cours :\n\n${context}`
    const msgs = [{ role: 'system', content: systemPrompt }, { role: 'user', content: buildUserContent(userMsg) }]

    await delay(200)
    updateStep('send', { status: 'done', detail: `Requête envoyée · ~${Math.round((systemPrompt.length + userMsg.length) / 4)} tokens estimés` })
    updateStep('receive', { status: 'active', detail: 'En attente du premier token...' })

    let tokenCount = 0
    let accumulated = ''
    let firstToken = true

    cleanupRef.current?.()
    cleanupRef.current = api.ai.stream(
      { apiKey: settings.mistralApiKey, messages: msgs, model },
      (chunk: string) => {
        tokenCount++
        accumulated += chunk
        if (firstToken) { firstToken = false; updateStep('receive', { detail: 'Streaming en cours...' }) }
        setStreamText(accumulated)
        if (tokenCount % 30 === 0) updateStep('receive', { detail: `~${tokenCount} tokens reçus...` })
      },
      () => {
        updateStep('receive', { status: 'done', detail: `~${tokenCount} tokens générés` })
        setStreamDone(true)
        setStreaming(false)
        // Signal banner: done
        completeAITask(accumulated)
      },
      (err: string) => {
        updateStep('receive', { status: 'error', detail: err })
        setStreamError(err)
        setStreaming(false)
        failAITask(err)
      }
    )
  }

  async function saveAsVersion() {
    if (!streamText || selectedCourseIds.length === 0) return
    const courseId = selectedCourseIds[0]
    await api.versions.create({
      courseId,
      content: markdownToHtml(streamText),
      label: `IA — ${AI_ACTIONS.find((a) => a.action === activeAction)?.title}`,
      source: 'ai',
      aiAction: activeAction
    })
    showToast('Version sauvegardée dans l\'historique du cours', 'success')
  }

  async function sendChat() {
    if (!input.trim() || streaming) return
    if (!settings.mistralApiKey) { showToast('Configure ta clé API Mistral', 'error'); return }

    const userMessage: AIMessage = { role: 'user', content: input.trim() }
    setInput('')
    setMessages((prev) => [...prev, userMessage])
    setStreaming(true)

    const context = selectedCourseIds.length > 0 ? buildContext() : ''
    const systemContent = context
      ? `Tu es un assistant pédagogique expert. Tu as accès aux cours suivants :\n\n${context}\n\nRéponds en français.`
      : `Tu es un assistant pédagogique expert. Réponds en français.`

    let reply = ''
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    const outgoingUserMessage = { role: 'user', content: buildUserContent(userMessage.content) }

    cleanupRef.current?.()
    cleanupRef.current = api.ai.stream(
      { apiKey: settings.mistralApiKey, messages: [{ role: 'system', content: systemContent }, ...messages, outgoingUserMessage], model: activeModel() },
      (chunk: string) => {
        reply += chunk
        setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { role: 'assistant', content: reply }; return c })
      },
      () => setStreaming(false),
      (err: string) => { showToast('Erreur : ' + err, 'error'); setStreaming(false) }
    )
  }

  async function sendRefinement() {
    if (!refineInput.trim() || refining || streaming) return
    if (!settings.mistralApiKey) return
    const instruction = refineInput.trim()
    setRefineInput('')
    setRefining(true)
    const prev = streamText
    let accumulated = ''
    cleanupRef.current?.()
    cleanupRef.current = api.ai.stream(
      {
        apiKey: settings.mistralApiKey,
        model: settings.mistralModel || 'open-mistral-7b',
        messages: [
          { role: 'system', content: `Tu es un assistant pédagogique. Réponds uniquement en texte brut avec markdown simple (##, ###, -, **). Pas de HTML.` },
          { role: 'user', content: `Voici le texte actuel :\n\n${prev}\n\nInstruction : ${instruction}` }
        ]
      },
      (chunk: string) => { accumulated += chunk; setStreamText(accumulated) },
      () => { setRefining(false); setStreamDone(true) },
      (err: string) => { showToast('Erreur : ' + err, 'error'); setRefining(false) }
    )
  }

  function reset() {
    cleanupRef.current?.()
    setActiveAction(null)
    setStreamText('')
    setStreamDone(false)
    setStreamError(null)
    setStreaming(false)
    setSteps([])
    setRefineInput('')
    setRefining(false)
    setExamReady(false)
  }

  const actionInfo = AI_ACTIONS.find((a) => a.action === activeAction)

  return (
    <div className="ai-studio">
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Studio IA</h1>
          <span style={{ fontSize: 12, background: 'var(--accent-dim)', color: 'var(--accent-light)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
            Mistral
          </span>
        </div>
        {taskRunning && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Circle size={11} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            Génération en cours — tu peux naviguer librement
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: course selection */}
        <div style={{ width: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Cours sélectionnés
            </div>
            <div style={{ fontSize: 12, color: selectedCourseIds.length ? 'var(--accent-light)' : 'var(--text-tertiary)' }}>
              {selectedCourseIds.length > 0 ? `${selectedCourseIds.length} cours` : 'Aucun'}
            </div>
            {taskRunning && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                Sélection verrouillée pendant la génération
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px' }}>
            {subjects.map((subject) => {
              const subjectCourses = courses.filter((c) => c.subjectId === subject.id)
              if (subjectCourses.length === 0) return null
              return (
                <div key={subject.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', fontSize: 11, fontWeight: 600, color: subject.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    <span>{subject.emoji}</span>
                    <span>{subject.name}</span>
                  </div>
                  {subjectCourses.map((course) => {
                    const isSelected = selectedCourseIds.includes(course.id)
                    return (
                      <div
                        key={course.id}
                        className={`sidebar-item ${isSelected ? 'active' : ''}`}
                        onClick={() => toggleCourse(course.id)}
                        style={{ opacity: taskRunning && !isSelected ? 0.4 : 1, cursor: taskRunning ? 'not-allowed' : 'pointer', paddingLeft: 18 }}
                      >
                        <span style={{ fontSize: 13 }}>{course.emoji ?? '📝'}</span>
                        <span className="sidebar-item-name" style={{ fontSize: 12.5 }}>{course.title}</span>
                        {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {courses.length === 0 && (
              <div className="empty-state" style={{ padding: 20 }}>
                <BookOpen size={24} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 12 }}>Aucun cours</div>
              </div>
            )}
          </div>

          {/* Attachments for the AI: screenshots and documents */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Fournir à l'IA
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={pickImages} disabled={taskRunning || attaching} style={{ flex: 1, fontSize: 11.5, padding: '5px 8px' }}>
                <ImagePlus size={12} /> Capture
              </button>
              <button className="btn btn-secondary btn-sm" onClick={pickDoc} disabled={taskRunning || attaching} style={{ flex: 1, fontSize: 11.5, padding: '5px 8px' }}>
                <FileUp size={12} /> Fichier
              </button>
            </div>
            {(attachedImages.length > 0 || attachedDocs.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {attachedImages.map((img, i) => (
                  <div key={`img-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent-light)', background: 'var(--accent-dim)', padding: '3px 6px', borderRadius: 'var(--radius-sm)' }}>
                    <ImagePlus size={11} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.fileName}</span>
                    <X size={11} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => setAttachedImages((prev) => prev.filter((_, idx) => idx !== i))} />
                  </div>
                ))}
                {attachedDocs.map((doc, i) => (
                  <div key={`doc-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-overlay)', padding: '3px 6px', borderRadius: 'var(--radius-sm)' }}>
                    <FileUp size={11} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fileName}</span>
                    <X size={11} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => setAttachedDocs((prev) => prev.filter((_, idx) => idx !== i))} />
                  </div>
                ))}
              </div>
            )}
            {attachedImages.length > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Modèle vision utilisé automatiquement ({VISION_MODEL})
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Action grid */}
          {!activeAction && (
            <>
              <div style={{ padding: '16px 16px 8px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {selectedCourseIds.length > 0
                    ? `${selectedCourseIds.length} cours sélectionné${selectedCourseIds.length > 1 ? 's' : ''} — choisis une action`
                    : 'Sélectionne des cours à gauche, puis choisis une action'}
                </div>
              </div>
              <div className="ai-actions-grid">
                {AI_ACTIONS.map((a) => (
                  <button key={a.action} className="ai-action-card" onClick={() => runAction(a.action)}>
                    <span className="ai-action-icon">{a.icon}</span>
                    <span className="ai-action-title">{a.title}</span>
                    <span className="ai-action-desc">{a.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Chat */}
          {activeAction === 'chat' && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="icon-btn" onClick={reset}><ArrowLeft size={15} /></button>
                <span style={{ fontSize: 14, fontWeight: 500 }}>💬 Chat IA</span>
                {selectedCourseIds.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--accent-light)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                    {selectedCourseIds.length} cours en contexte
                  </span>
                )}
              </div>
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div className="empty-state" style={{ padding: 30 }}>
                    <div style={{ fontSize: 30 }}>💬</div>
                    <div className="empty-state-title">Chat avec Mistral</div>
                    <div className="empty-state-desc">
                      {selectedCourseIds.length > 0 ? 'L\'IA connaît tes cours sélectionnés.' : 'Pose n\'importe quelle question.'}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                    <div className={`chat-bubble chat-bubble-${m.role}`}>
                      {m.content || (streaming && i === messages.length - 1
                        ? <span style={{ display: 'inline-block', width: 2, height: 14, background: 'white', animation: 'blink 0.8s step-end infinite', verticalAlign: 'middle' }} />
                        : null
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="chat-input-row">
                <textarea
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pose ta question... (Entrée pour envoyer)"
                  rows={1}
                  disabled={streaming}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                />
                <button className="btn btn-primary" onClick={sendChat} disabled={streaming || !input.trim()} style={{ flexShrink: 0 }}>
                  <Send size={14} />
                </button>
              </div>
            </>
          )}

          {/* Action streaming result */}
          {activeAction && activeAction !== 'chat' && (
            <>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="icon-btn" onClick={reset} disabled={streaming}><ArrowLeft size={15} /></button>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{actionInfo?.icon} {actionInfo?.title}</span>
                {streamDone && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={saveAsVersion}>💾 Sauvegarder comme version</button>
                    <button className="btn btn-ghost btn-sm" onClick={reset}>Nouvelle action</button>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
                {activeAction === 'exam_plan' && !examReady && (
                  <div style={{ maxWidth: 380, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📅 Planning de révision</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
                      {selectedCourseIds.length} cours sélectionné{selectedCourseIds.length > 1 ? 's' : ''}. Donne la date de l'examen et ton temps dispo.
                    </div>
                    <div className="field">
                      <label className="field-label">Date de l'examen</label>
                      <input type="date" className="field-input" value={examDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExamDate(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="field-label">Heures de révision par jour</label>
                      <input type="number" className="field-input" value={examHours} min="0.5" max="12" step="0.5" onChange={(e) => setExamHours(e.target.value)} />
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: 8 }}
                      disabled={!examDate || selectedCourseIds.length === 0}
                      onClick={() => { setExamReady(true); runAction('exam_plan', { skipExamGate: true }) }}
                    >
                      Générer le planning
                    </button>
                  </div>
                )}

                {/* Steps */}
                {steps.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    {steps.map((step) => <StepRow key={step.id} step={step} />)}
                  </div>
                )}

                {streamError && (
                  <div style={{ padding: 16, background: 'var(--danger-dim)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-lg)', color: 'var(--danger)', fontSize: 13 }}>
                    <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
                    {streamError}
                  </div>
                )}

                {(streamText || streaming) && !streamError && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(streaming || refining)
                        ? <><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse-dot 1s ease infinite' }} /> {refining ? 'Réécriture...' : 'Génération en cours...'}</>
                        : <><CheckCircle size={12} style={{ color: 'var(--success)' }} /> Résultat</>
                      }
                    </div>
                    <MarkdownView text={streamText} streaming={streaming || refining} />
                    <div ref={streamRef} />
                  </div>
                )}

                {/* Refine chat — shown when result is ready */}
                {streamDone && !streaming && !streamError && (
                  <div style={{ marginTop: 16, background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MessageSquare size={13} /> Demande une modification à l'IA
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="field-input"
                        style={{ flex: 1, fontSize: 13 }}
                        placeholder='Ex : "Rends ça encore plus court", "Ajoute des exemples concrets"...'
                        value={refineInput}
                        disabled={refining}
                        onChange={(e) => setRefineInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendRefinement() }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={sendRefinement} disabled={refining || !refineInput.trim()}>
                        {refining ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Send size={13} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .md-result { font-size: 14px; line-height: 1.7; color: var(--text-primary); user-select: text; }
        .md-result h2 { font-size: 16px; font-weight: 700; margin: 18px 0 6px; color: var(--accent-light); }
        .md-result h3 { font-size: 14px; font-weight: 600; margin: 14px 0 4px; color: #5eead4; }
        .md-result p { margin: 6px 0; }
        .md-result ul { margin: 6px 0 6px 18px; padding: 0; }
        .md-result li { margin: 3px 0; }
        .md-result li::marker { color: var(--accent-light); }
        .md-result strong { font-weight: 700; color: #fbbf24; }
        .md-result em { font-style: italic; color: #93c5fd; opacity: 0.95; }
        .md-cursor { display: inline-block; width: 2px; height: 14px; background: var(--accent); animation: blink 0.8s step-end infinite; vertical-align: middle; margin-left: 2px; border-radius: 1px; }
      `}</style>
    </div>
  )
}

function MarkdownView({ text, streaming }: { text: string; streaming: boolean }) {
  // Simple markdown → HTML: ##, ###, **, -, newlines
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
  const cursor = streaming ? '<span class="md-cursor"></span>' : ''
  return (
    <div className="md-result" dangerouslySetInnerHTML={{ __html: `<p>${html}${cursor}</p>` }} />
  )
}

function StepRow({ step }: { step: Step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        {step.status === 'done'    && <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
        {step.status === 'active'  && <Circle size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />}
        {step.status === 'pending' && <Circle size={16} style={{ color: 'var(--text-tertiary)', opacity: 0.3 }} />}
        {step.status === 'error'   && <AlertCircle size={16} style={{ color: 'var(--danger)' }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: step.status === 'pending' ? 'var(--text-tertiary)' : step.status === 'error' ? 'var(--danger)' : 'var(--text-primary)' }}>
          {step.label}
        </div>
        {step.detail && (
          <div style={{ fontSize: 12, color: step.status === 'error' ? 'var(--danger)' : 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
            {step.detail}
          </div>
        )}
      </div>
    </div>
  )
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
