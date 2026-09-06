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
    name: 'Drive Backup Manager',
    productName: 'Drive Backup Manager',
    debPackageName: 'gdrive-backup-manager',
    description:
      'Centralise plusieurs comptes Google Drive : distribution automatique des uploads, backup planifié, dashboard.',
    category: 'Stockage',
    owner: 'Julienlgn123',
    repo: 'stockage-studio',
    fallbackEmoji: '☁️',
    accent: '#38bdf8'
  }
]
