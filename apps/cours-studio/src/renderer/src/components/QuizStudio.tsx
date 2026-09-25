import { useState, useEffect } from 'react'
import { HelpCircle, ArrowLeft, BookOpen, Upload, X, CheckCircle2, XCircle, RotateCcw, FileText, History } from 'lucide-react'
import { useStore } from '../store'
import type { QuizQuestion, QuizResult } from '../../../shared/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

type Difficulty = 'facile' | 'moyen' | 'difficile'

export default function QuizStudio() {
  const { courses, subjects, settings, setView, showToast } = useStore()

  const [topic, setTopic] = useState('')
  const [instructions, setInstructions] = useState('')
  const [questionCount, setQuestionCount] = useState(8)
  const [difficulty, setDifficulty] = useState<Difficulty>('moyen')
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [docText, setDocText] = useState('')
  const [docName, setDocName] = useState('')
  const [importing, setImporting] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [revealed, setRevealed] = useState<boolean[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<QuizResult[]>([])

  useEscapeToClose(showHistory ? () => setShowHistory(false) : undefined)

  function toggleCourse(id: string) {
    setSelectedCourseIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function buildCoursesContext(): string {
    return selectedCourseIds.map((id) => {
      const course = courses.find((c) => c.id === id)
      if (!course) return ''
      const text = course.content.replace(/<[^>]+>/g, '').trim()
      return `=== ${course.title} ===\n${text}`
    }).filter(Boolean).join('\n\n')
  }

  async function importDocument() {
    setImporting(true)
    try {
      const result = await api.documents.import()
      if (result) {
        setDocText(result.text)
        setDocName(result.fileName)
        showToast(`Document importé : ${result.fileName}`, 'success')
      }
    } catch (err) {
      showToast('Erreur d\'import : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setImporting(false)
    }
  }

  async function generateQuiz() {
    if (!settings.mistralApiKey) { showToast('Configure ta clé API Mistral dans les paramètres', 'error'); return }
    if (!topic.trim() && selectedCourseIds.length === 0 && !docText.trim()) {
      showToast('Indique un sujet, sélectionne un cours ou importe un document', 'error')
      return
    }

    setGenerating(true)
    setQuiz(null)

    const coursesContext = buildCoursesContext()
    const parts: string[] = []
    if (topic.trim()) parts.push(`Sujet du quiz : ${topic.trim()}`)
    if (instructions.trim()) parts.push(`Consignes/explications supplémentaires : ${instructions.trim()}`)
    if (coursesContext) parts.push(`Contenu des cours sélectionnés :\n${coursesContext}`)
    if (docText.trim()) parts.push(`Contenu du document fourni (${docName || 'document'}) :\n${docText.trim()}`)

    const systemPrompt = `Tu es un générateur de quiz pédagogique. Génère un QCM en te basant strictement sur les informations fournies par l'utilisateur (sujet, consignes, cours, document).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme exacte :
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}
Règles :
- Génère exactement ${questionCount} questions.
- Difficulté : ${difficulty}.
- Chaque question a 4 options plausibles, une seule correcte (correctIndex = index 0-3).
- "explanation" justifie brièvement pourquoi la réponse est correcte.
- Questions en français, claires et sans ambiguïté.`

    try {
      const raw = await api.ai.complete({
        apiKey: settings.mistralApiKey,
        model: settings.mistralModel || 'open-mistral-7b',
        json: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: parts.join('\n\n') || 'Génère un quiz de culture générale.' }
        ]
      })
      const parsed = JSON.parse(raw) as { questions: QuizQuestion[] }
      if (!parsed.questions?.length) throw new Error('Réponse vide de l\'IA')
      setQuiz(parsed.questions)
      setAnswers(new Array(parsed.questions.length).fill(null))
      setRevealed(new Array(parsed.questions.length).fill(false))
    } catch (err) {
      showToast('Erreur de génération : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setGenerating(false)
    }
  }

  function selectAnswer(qIndex: number, optIndex: number) {
    if (revealed[qIndex]) return
    setAnswers((prev) => { const c = [...prev]; c[qIndex] = optIndex; return c })
  }

  function validateAnswer(qIndex: number) {
    if (answers[qIndex] === null) return
    setRevealed((prev) => { const c = [...prev]; c[qIndex] = true; return c })
  }

  function reset() {
    setQuiz(null)
    setAnswers([])
    setRevealed([])
  }

  const score = quiz && revealed.every(Boolean)
    ? quiz.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)
    : null

  useEffect(() => {
    if (score === null || !quiz) return
    const courseNames = selectedCourseIds.map((id) => courses.find((c) => c.id === id)?.title).filter(Boolean)
    const resultTopic = topic.trim() || courseNames.join(', ') || 'Quiz'
    api.quizResults.create({ courseId: selectedCourseIds[0], topic: resultTopic, score, total: quiz.length })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score])

  async function openHistory() {
    setHistory(await api.quizResults.get())
    setShowHistory(true)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <HelpCircle size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Quiz IA</h1>
          <span style={{ fontSize: 12, background: 'var(--accent-dim)', color: 'var(--accent-light)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
            Mistral
          </span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={openHistory}>
          <History size={13} /> Historique
        </button>
      </div>

      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal fade-in" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Historique des quiz</span>
              <button className="icon-btn" onClick={() => setShowHistory(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
              {history.length === 0 && (
                <div className="empty-state" style={{ padding: 20 }}>
                  <div style={{ fontSize: 12 }}>Aucun quiz fait pour l'instant</div>
                </div>
              )}
              {history.map((h) => {
                const pct = Math.round((h.score / h.total) * 100)
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{h.topic}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {format(new Date(h.createdAt), 'dd MMM yyyy · HH:mm', { locale: fr })}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)' }}>
                      {h.score}/{h.total}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!quiz && (
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Sur quoi porte le quiz ?
            </label>
            <textarea
              className="field-input"
              style={{ width: '100%', marginTop: 6, minHeight: 60, resize: 'vertical' }}
              placeholder='Ex : "La Révolution française, causes et conséquences" ou "Les fonctions en JavaScript"'
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Explications / consignes supplémentaires (optionnel)
            </label>
            <textarea
              className="field-input"
              style={{ width: '100%', marginTop: 6, minHeight: 60, resize: 'vertical' }}
              placeholder='Ex : "Insiste sur les dates clés", "Niveau lycée", "Évite les questions sur la partie 3"'
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Nombre de questions
              </label>
              <input
                type="number" min={3} max={20}
                className="field-input" style={{ width: '100%', marginTop: 6 }}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.min(20, Math.max(3, Number(e.target.value) || 8)))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Difficulté
              </label>
              <select
                className="field-input" style={{ width: '100%', marginTop: 6 }}
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option value="facile">Facile</option>
                <option value="moyen">Moyen</option>
                <option value="difficile">Difficile</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Document source (PDF, Word, ODT, TXT) — optionnel
            </label>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={importDocument} disabled={importing}>
                {importing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Upload size={14} />}
                Importer un fichier
              </button>
              {docName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-light)', background: 'var(--accent-dim)', padding: '4px 10px', borderRadius: 'var(--radius-full)' }}>
                  <FileText size={12} /> {docName} ({docText.length.toLocaleString()} car.)
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setDocText(''); setDocName('') }} />
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Cours existants à inclure (optionnel)
            </label>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {subjects.flatMap((subject) => courses.filter((c) => c.subjectId === subject.id)).map((course) => {
                const isSelected = selectedCourseIds.includes(course.id)
                return (
                  <button
                    key={course.id}
                    onClick={() => toggleCourse(course.id)}
                    className="btn btn-sm"
                    style={{
                      background: isSelected ? 'var(--accent-dim)' : 'var(--bg-overlay)',
                      color: isSelected ? 'var(--accent-light)' : 'var(--text-secondary)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`
                    }}
                  >
                    {course.emoji ?? '📝'} {course.title}
                  </button>
                )
              })}
              {courses.length === 0 && (
                <div className="empty-state" style={{ padding: 12 }}>
                  <BookOpen size={18} style={{ opacity: 0.3 }} />
                  <div style={{ fontSize: 12 }}>Aucun cours</div>
                </div>
              )}
            </div>
          </div>

          <button className="btn btn-primary" onClick={generateQuiz} disabled={generating} style={{ width: '100%', justifyContent: 'center' }}>
            {generating ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Génération du quiz...</> : <>✨ Générer le quiz</>}
          </button>
        </div>
      )}

      {quiz && (
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {score !== null
                ? `Résultat : ${score} / ${quiz.length} bonnes réponses`
                : `${quiz.length} questions`}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              <RotateCcw size={13} /> Nouveau quiz
            </button>
          </div>

          {quiz.map((q, qIndex) => (
            <div key={qIndex} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                {qIndex + 1}. {q.question}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {q.options.map((opt, optIndex) => {
                  const isSelected = answers[qIndex] === optIndex
                  const isRevealed = revealed[qIndex]
                  const isCorrect = optIndex === q.correctIndex
                  let bg = 'var(--bg-overlay)'
                  let border = 'var(--border)'
                  if (isRevealed && isCorrect) { bg = 'rgba(74, 222, 128, 0.12)'; border = 'var(--success, #4ade80)' }
                  else if (isRevealed && isSelected && !isCorrect) { bg = 'var(--danger-dim)'; border = 'var(--danger)' }
                  else if (!isRevealed && isSelected) { bg = 'var(--accent-dim)'; border = 'var(--accent)' }
                  return (
                    <div
                      key={optIndex}
                      onClick={() => selectAnswer(qIndex, optIndex)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                        background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-md)',
                        cursor: isRevealed ? 'default' : 'pointer', fontSize: 13
                      }}
                    >
                      {isRevealed && isCorrect && <CheckCircle2 size={14} style={{ color: 'var(--success, #4ade80)' }} />}
                      {isRevealed && isSelected && !isCorrect && <XCircle size={14} style={{ color: 'var(--danger)' }} />}
                      <span>{opt}</span>
                    </div>
                  )
                })}
              </div>
              {!revealed[qIndex] ? (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => validateAnswer(qIndex)}
                  disabled={answers[qIndex] === null}
                >
                  Valider
                </button>
              ) : (
                <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-overlay)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
                  💡 {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
