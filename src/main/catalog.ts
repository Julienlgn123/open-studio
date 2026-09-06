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
    owner: 'Julienlgn123',
    repo: 'cours-studio',
    fallbackEmoji: '🎓',
    accent: '#7c6ff7'
  },
  {
    id: 'stockage-studio',
    name: 'Drive Studio',
    productName: 'Drive Studio',
    debPackageName: 'gdrive-backup-manager',
    description:
      'Centralise plusieurs comptes Google Drive : distribution automatique des uploads, backup planifié, dashboard.',
    category: 'Stockage',
    owner: 'Julienlgn123',
    repo: 'drive-studio',
    fallbackEmoji: '☁️',
    accent: '#38bdf8'
  },
  {
    id: 'plan-studio',
    name: 'Plan Studio',
    productName: 'Plan Studio',
    debPackageName: 'plan-studio',
    description:
      'Planning personnel local : événements, tâches, objectifs et rappels au même endroit.',
    category: 'Productivité',
    owner: 'Julienlgn123',
    repo: 'plan-studio',
    fallbackEmoji: '📅',
    accent: '#f59e0b'
  },
  {
    id: 'pdf-studio',
    name: 'PDF Studio',
    productName: 'PDF Studio',
    debPackageName: 'pdf-studio',
    description:
      'Lecture, édition et organisation de PDF en local — fusion, découpe, réorganisation de pages.',
    category: 'Documents',
    owner: 'Julienlgn123',
    repo: 'pdf-studio',
    fallbackEmoji: '📄',
    accent: '#ef4444'
  }
]
