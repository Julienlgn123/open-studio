import type { CatalogEntry } from '@shared/types'

// Catalogue statique des apps de la suite. Pour en ajouter une : un objet ici,
// le reste (détection d'install, téléchargement, lancement) est générique.
export const CATALOG: CatalogEntry[] = [
  {
    id: 'cours-studio',
    name: 'Cours Studio',
    productName: 'Cours Studio',
    debPackageName: 'cours-studio',
    description:
      "Prise et gestion de cours en local : éditeur riche, résumés/QCM par IA, enregistrement audio.",
    category: 'Productivité',
    assetPrefix: 'Cours-Studio',
    fallbackEmoji: '🎓',
    accent: '#7c6ff7'
  },
  {
    id: 'drive-studio',
    name: 'Drive Studio',
    productName: 'Drive Studio',
    debPackageName: 'gdrive-backup-manager',
    description:
      'Centralise plusieurs comptes Google Drive : distribution automatique des uploads, backup planifié, dashboard.',
    category: 'Stockage',
    assetPrefix: 'Drive-Studio',
    fallbackEmoji: '☁️',
    accent: '#38bdf8'
  }
]

// Local IA Studio est en pause pour l'instant (voir apps/local-ia-studio) —
// pas encore ajoutée au catalogue tant que son développement n'a pas repris.
