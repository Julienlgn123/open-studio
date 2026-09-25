import { useEffect, useState } from 'react'
import { Layers, ArrowLeft, BookOpen, Sparkles, RotateCcw, Download, Globe } from 'lucide-react'
import { useStore } from '../store'
import type { Flashcard } from '../../../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

const ALL = '__all__'

export default function FlashcardStudio() {
  const { courses, subjects, settings, setView, showToast, flashcardsWantAll, clearFlashcardsWantAll } = useStore()
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(flashcardsWantAll ? ALL : null)
  const [allCards, setAllCards] = useState<Flashcard[]>([])
  const [dueCards, setDueCards] = useState<Flashcard[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)

  const isAll = selectedCourseId === ALL
  const course = courses.find((c) => c.id === selectedCourseId)

  useEffect(() => {
    if (flashcardsWantAll) clearFlashcardsWantAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedCourseId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId])

  async function load() {
    if (!selectedCourseId) return
    setLoading(true)
    try {
      if (isAll) {
        const due = await api.flashcards.dueAll()
        setAllCards([])
        setDueCards(due)
      } else {
        const [all, due] = await Promise.all([
          api.flashcards.get(selectedCourseId),
          api.flashcards.due(selectedCourseId)
        ])
        setAllCards(all)
        setDueCards(due)
      }
      setIndex(0)
      setFlipped(false)
    } finally {
      setLoading(false)
    }
  }

  async function generate() {
    if (!course) return
    if (!settings.mistralApiKey) { showToast('Configure ta clé API Mistral dans les paramètres', 'error'); return }
    setGenerating(true)
    try {
      const text = course.content.replace(/<[^>]+>/g, '').trim()
      const raw = await api.ai.complete({
        apiKey: settings.mistralApiKey,
        model: settings.mistralModel || 'open-mistral-7b',
        json: true,
        messages: [
          {
            role: 'system',
            content: `Tu es un expert en répétition espacée. À partir d'un cours, tu crées UNIQUEMENT les flashcards qui valent vraiment la peine d'être mémorisées : définitions, formules, dates, causes/conséquences, distinctions entre notions proches. Ignore le superflu, les exemples, les transitions.
Réponds UNIQUEMENT avec un JSON valide : {"cards":[{"front":"question précise","back":"réponse courte"}]}
Règles : une seule idée testable par carte ; le recto est une vraie question (pas "Parle de X") ; le verso tient en 1-2 phrases ou une formule. Le NOMBRE de cartes dépend de la densité du cours (5 pour un cours léger, jusqu'à 20 pour un cours dense) — ne remplis pas pour atteindre un quota. Français.`
          },
          { role: 'user', content: `Cours : ${course.title}\n\n${text}` }
        ]
      })
      const parsed = JSON.parse(raw) as { cards: { front: string; back: string }[] }
      if (!parsed.cards?.length) throw new Error('Réponse vide de l\'IA')
      await api.flashcards.create(course.id, parsed.cards)
      showToast(`${parsed.cards.length} flashcards créées`, 'success')
      await load()
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function exportAnki() {
    try {
      const res = await api.flashcards.exportAnki(isAll ? undefined : selectedCourseId ?? undefined)
      if (res) showToast(`${res.count} flashcards exportées vers Anki`, 'success')
    } catch (err) {
      showToast('Erreur : ' + (err instanceof Error ? err.message : String(err)), 'error')
    }
  }

  async function grade(g: 0 | 1 | 2 | 3) {
    const card = dueCards[index]
    if (!card) return
    await api.flashcards.review(card.id, g)
    if (index + 1 < dueCards.length) {
      setIndex(index + 1)
      setFlipped(false)
    } else {
      await load()
    }
  }

  const currentCard = dueCards[index]
  const currentCourse = currentCard ? courses.find((c) => c.id === currentCard.courseId) : undefined
  const currentSubject = currentCourse ? subjects.find((s) => s.id === currentCourse.subjectId) : undefined

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="icon-btn" onClick={() => setView('home')}><ArrowLeft size={16} /></button>
          <Layers size={16} style={{ color: 'var(--accent)' }} />
          <h1 className="page-header-title">Flashcards</h1>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary btn-sm" onClick={exportAnki} data-tooltip="Exporter au format Anki" data-tooltip-dir="down">
            <Download size={13} /> Anki
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 220, borderRight: '1px solid var(--border)', overflow: 'auto', padding: '6px 8px' }}>
          <div
            className={`sidebar-item ${isAll ? 'active' : ''}`}
            onClick={() => setSelectedCourseId(ALL)}
            style={{ marginBottom: 8 }}
          >
            <Globe size={14} style={{ color: 'var(--accent)' }} />
            <span className="sidebar-item-name" style={{ fontSize: 12.5, fontWeight: 600 }}>Réviser tout</span>
          </div>

          {subjects.map((subject) => {
            const subjectCourses = courses.filter((c) => c.subjectId === subject.id)
            if (subjectCourses.length === 0) return null
            return (
              <div key={subject.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', fontSize: 11, fontWeight: 600, color: subject.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  <span>{subject.emoji}</span>
                  <span>{subject.name}</span>
                </div>
                {subjectCourses.map((c) => (
                  <div
                    key={c.id}
                    className={`sidebar-item ${selectedCourseId === c.id ? 'active' : ''}`}
                    onClick={() => setSelectedCourseId(c.id)}
                    style={{ paddingLeft: 18 }}
                  >
                    <span style={{ fontSize: 13 }}>{c.emoji ?? '📝'}</span>
                    <span className="sidebar-item-name" style={{ fontSize: 12.5 }}>{c.title}</span>
                  </div>
                ))}
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

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {!course && !isAll && (
            <div className="empty-state">
              <Layers size={28} style={{ opacity: 0.3 }} />
              <div className="empty-state-title">Choisis un cours</div>
              <div className="empty-state-desc">Sélectionne « Réviser tout » ou un cours à gauche pour réviser ou générer des flashcards.</div>
            </div>
          )}

          {isAll && !loading && dueCards.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 30 }}>🎉</div>
              <div className="empty-state-title">Tout est révisé</div>
              <div className="empty-state-desc">Aucune flashcard à réviser maintenant, toutes matières confondues. Reviens plus tard.</div>
            </div>
          )}

          {course && !isAll && !loading && allCards.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 30 }}>🗂️</div>
              <div className="empty-state-title">Aucune flashcard pour ce cours</div>
              <div className="empty-state-desc">L'IA peut en générer automatiquement à partir des notes.</div>
              <button className="btn btn-primary" onClick={generate} disabled={generating} style={{ marginTop: 12 }}>
                {generating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Sparkles size={14} />}
                Générer des flashcards
              </button>
            </div>
          )}

          {course && !isAll && allCards.length > 0 && dueCards.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 30 }}>✅</div>
              <div className="empty-state-title">Rien à réviser maintenant</div>
              <div className="empty-state-desc">{allCards.length} flashcard{allCards.length > 1 ? 's' : ''} au total pour ce cours — reviens plus tard.</div>
              <button className="btn btn-secondary btn-sm" onClick={generate} disabled={generating} style={{ marginTop: 12 }}>
                {generating ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Sparkles size={13} />}
                Générer d'autres flashcards
              </button>
            </div>
          )}

          {currentCard && (
            <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {isAll && currentCourse && (
                  <span style={{ color: currentSubject?.color ?? 'var(--accent)', fontWeight: 500 }}>
                    {currentSubject?.emoji} {currentCourse.title}
                  </span>
                )}
                <span>Carte {index + 1} / {dueCards.length}</span>
              </div>
              <div
                onClick={() => setFlipped(!flipped)}
                style={{
                  width: '100%', minHeight: 220, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 28, cursor: 'pointer', textAlign: 'center', fontSize: 16, lineHeight: 1.6
                }}
              >
                {flipped ? currentCard.back : currentCard.front}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Clique sur la carte pour {flipped ? 'revoir la question' : 'voir la réponse'}
              </div>

              {flipped && (
                <div style={{ display: 'flex', gap: 8, marginTop: 20, width: '100%' }}>
                  <button className="btn btn-sm" style={{ flex: 1, background: 'var(--danger-dim)', color: 'var(--danger)' }} onClick={() => grade(0)}>Encore</button>
                  <button className="btn btn-sm" style={{ flex: 1, background: 'var(--warning-dim)', color: 'var(--warning)' }} onClick={() => grade(1)}>Difficile</button>
                  <button className="btn btn-sm" style={{ flex: 1, background: 'var(--accent-dim)', color: 'var(--accent-light)' }} onClick={() => grade(2)}>Bien</button>
                  <button className="btn btn-sm" style={{ flex: 1, background: 'var(--success-dim)', color: 'var(--success)' }} onClick={() => grade(3)}>Facile</button>
                </div>
              )}
            </div>
          )}

          {((course && !isAll && allCards.length > 0) || (isAll && dueCards.length > 0)) && (
            <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginTop: 16 }}>
              <RotateCcw size={12} /> Rafraîchir
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
