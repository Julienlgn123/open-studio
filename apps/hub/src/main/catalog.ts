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
  },
  {
    id: 'ent-studio',
    name: 'ENT Studio',
    productName: 'ENT Studio',
    debPackageName: 'ent-studio',
    description:
      "Suit ton emploi du temps ENT (flux ICS) et signale à l'ouverture ce qui a changé (cours déplacé, annulé, ajouté).",
    category: 'Productivité',
    owner: 'Julienlgn123',
    repo: 'ent-studio',
    fallbackEmoji: '🗓️',
    accent: '#3b82f6'
  },
  {
    id: 'local-ia-studio',
    name: 'Local IA Studio',
    productName: 'Local IA Studio',
    debPackageName: 'local-ia-studio',
    description:
      'Discute avec des modèles IA 100 % en local : Ollama ou modèles GGUF téléchargés depuis Hugging Face, images et fichiers joints.',
    category: 'IA',
    assetPrefix: 'Local-IA-Studio',
    fallbackEmoji: '✨',
    accent: '#7c5cff'
  }
]
