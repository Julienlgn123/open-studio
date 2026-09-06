/**
 * 1 couleur = 1 profil (catégorie). Sert de contour au logo de chaque app
 * dans le catalogue, pour repérer d'un coup d'œil les outils qui vont
 * ensemble (ex : Cours Studio et Plan Studio sont tous les deux "Productivité").
 */
export const CATEGORY_COLORS: Record<string, string> = {
  Productivité: '#7c6ff7',
  Stockage: '#38bdf8',
  Documents: '#ef4444'
}

export const DEFAULT_CATEGORY_COLOR = '#8b8b93'

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR
}
