export interface CourseTemplate {
  id: string
  emoji: string
  label: string
  html: string
}

export const COURSE_TEMPLATES: CourseTemplate[] = [
  {
    id: 'revision-sheet',
    emoji: '📋',
    label: 'Fiche de révision',
    html: '<h2>Résumé</h2><p></p><h2>Points clés</h2><ul><li></li><li></li><li></li></ul><h2>À retenir pour l\'examen</h2><p></p>'
  },
  {
    id: 'cornell',
    emoji: '🗂️',
    label: 'Plan Cornell',
    html: '<h2>Questions / mots-clés</h2><p></p><h2>Notes</h2><p></p><h2>Résumé</h2><p></p>'
  },
  {
    id: 'lecture-recap',
    emoji: '🎓',
    label: 'Compte-rendu de cours',
    html: '<h2>Contexte</h2><p></p><h2>Notes</h2><p></p><h2>Questions en suspens</h2><p></p>'
  }
]
