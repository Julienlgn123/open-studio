export interface TourStep {
  // One or more elements to spotlight together (a whole toolbar group, say).
  // Selectors are tried in order; the step is skipped if none resolve (e.g. a
  // course-only button while no course exists yet).
  selectors: string[]
  title: string
  body: string
}

// The "chrome" that's always on screen (sidebar, top bar, home) — shown once on
// first launch, replayable anytime from Paramètres.
export const mainTourSteps: TourStep[] = [
  {
    selectors: ['[data-tour="nav-home"]'],
    title: 'Accueil',
    body: "Ta page d'accueil : tes cours récents, et une recherche dans tout leur contenu."
  },
  {
    selectors: ['[data-tooltip="Nouvelle matière"]'],
    title: 'Nouvelle matière',
    body: "Une matière (Maths, Histoire...) range tes cours. Clic droit dessus pour la renommer ou la supprimer — supprimer une matière supprime aussi tous ses cours."
  },
  {
    selectors: ['.sidebar-scroll'],
    title: 'Tes matières',
    body: 'Toutes tes matières apparaissent ici. Clique sur l\'une d\'elles pour voir la liste de ses cours.'
  },
  {
    selectors: ['[data-tour="home-search"]'],
    title: 'Recherche',
    body: 'Cherche dans le contenu de tous tes cours. Ouvrable de partout avec Ctrl+K (Cmd+K sur Mac).'
  },
  {
    selectors: ['[data-tour="new-course-btn"]'],
    title: 'Nouveau cours',
    body: "Démarre un nouveau cours vide, ou importe un PDF/Word/ODT déjà existant pour partir de son contenu."
  },
  {
    selectors: ['[data-tooltip="Flashcards"]'],
    title: 'Flashcards',
    body: 'Révise avec des flashcards — générées automatiquement à partir d\'un cours, ou créées à la main. Répétition espacée intégrée pour les faire revenir au bon moment.'
  },
  {
    selectors: ['[data-tooltip="Studio IA"]'],
    title: 'Studio IA',
    body: 'Demande à l\'IA de résumer, reformuler, vulgariser, fusionner ou compléter un ou plusieurs cours. Nécessite une clé API Mistral (gratuite) — à ajouter dans Paramètres.'
  },
  {
    selectors: ['[data-tooltip="Quiz IA"]'],
    title: 'Quiz IA',
    body: "Génère un questionnaire à choix multiples sur un sujet, un cours ou un document pour t'auto-évaluer avant un contrôle."
  },
  {
    selectors: ['[data-tooltip="Statistiques"]'],
    title: 'Statistiques',
    body: 'Ton temps d\'étude, le nombre de cours et tes derniers quiz, en un coup d\'œil.'
  },
  {
    selectors: ['[data-tooltip="Minuteur Pomodoro"]'],
    title: 'Minuteur Pomodoro',
    body: 'Un minuteur de concentration qui compte automatiquement ton temps de travail dans les statistiques.'
  },
  {
    selectors: ['[data-tooltip="Paramètres"]'],
    title: 'Paramètres',
    body: 'Ta clé API Mistral, le thème clair/sombre, les sauvegardes, les mises à jour — et un bouton pour revoir cette visite guidée quand tu veux.'
  }
]

// The editor's own toolbar — only relevant once a course is open, so it's a
// separate tour offered the first time the editor opens, replayable from its
// own toolbar (icône clavier).
export const editorTourSteps: TourStep[] = [
  {
    selectors: ['[data-tooltip="Retour"]'],
    title: 'Retour',
    body: 'Retourne à la liste des cours de cette matière (ton texte est déjà sauvegardé).'
  },
  {
    selectors: ['[data-tooltip="Gras"]', '[data-tooltip="Italique"]', '[data-tooltip="Souligné"]', '[data-tooltip="Barré"]', '[data-tooltip="Surligner"]'],
    title: 'Mise en forme',
    body: 'Gras, italique, souligné, barré, surlignage — la mise en forme classique du texte sélectionné.'
  },
  {
    selectors: ['[data-tooltip="Titre 1"]', '[data-tooltip="Titre 2"]', '[data-tooltip="Titre 3"]'],
    title: 'Titres',
    body: 'Structurent ton cours en sections. Ils alimentent aussi le "Plan du cours" et la numérotation automatique.'
  },
  {
    selectors: ['[data-tooltip="Liste"]', '[data-tooltip="Liste numérotée"]', '[data-tooltip="Cases à cocher"]'],
    title: 'Listes',
    body: 'Liste à puces, liste numérotée, ou liste de cases à cocher.'
  },
  {
    selectors: ['[data-tooltip="Code inline"]', '[data-tooltip="Citation"]', '[data-tooltip="Séparateur"]'],
    title: 'Code, citation, séparateur',
    body: 'Du code en ligne, un bloc de citation, ou une ligne de séparation entre deux parties.'
  },
  {
    selectors: ['[data-tooltip="Aligner à gauche"]', '[data-tooltip="Centrer"]', '[data-tooltip="Aligner à droite"]', '[data-tooltip="Justifier"]'],
    title: 'Alignement du texte',
    body: 'Aligne le paragraphe sélectionné à gauche, au centre, à droite, ou justifié.'
  },
  {
    selectors: ['[data-tooltip="Lien"]', '[data-tooltip="Indice"]', '[data-tooltip="Exposant"]'],
    title: 'Lien, indice, exposant',
    body: 'Insère un lien, ou passe le texte sélectionné en indice (H₂O) ou en exposant (x²).'
  },
  {
    selectors: ['[data-tooltip="Formule LaTeX (mathbb, frac, sqrt...)"]'],
    title: 'Formules mathématiques',
    body: 'Écris une formule en LaTeX (fractions, racines, symboles...) — rendue proprement dans le cours.'
  },
  {
    selectors: ['[data-tooltip="Insérer un tableau"]'],
    title: 'Tableau',
    body: 'Insère un tableau éditable directement dans tes notes.'
  },
  {
    selectors: ['[data-tooltip="Insérer une capture d\'écran / image"]'],
    title: 'Image / capture',
    body: 'Ajoute une image depuis ton ordinateur, ou capture directement une portion de ton écran.'
  },
  {
    selectors: ['[data-tooltip="Dessiner un schéma"]'],
    title: 'Schéma',
    body: 'Dessine un petit schéma à main levée directement dans le cours.'
  },
  {
    selectors: ['[data-tooltip="Couleur du texte"]'],
    title: 'Couleur du texte',
    body: 'Change la couleur du texte sélectionné.'
  },
  {
    selectors: ['[data-tooltip="Créer une flashcard depuis la sélection"]'],
    title: 'Flashcard rapide',
    body: 'Sélectionne une réponse dans ton texte, clique ici, et écris la question : la flashcard part directement dans ta liste de révision.'
  },
  {
    selectors: ['[data-tooltip="Expliquer la sélection simplement (IA)"]'],
    title: 'Expliquer (IA)',
    body: "Sélectionne un passage obscur et demande à l'IA de te l'expliquer plus simplement, sans quitter tes notes."
  },
  {
    selectors: ['[data-tooltip="Annuler"]', '[data-tooltip="Rétablir"]'],
    title: 'Annuler / Rétablir',
    body: 'Annule ou rétablis tes dernières actions dans l\'éditeur.'
  },
  {
    selectors: ['[data-tooltip="Raccourcis clavier"]'],
    title: 'Raccourcis clavier',
    body: 'La liste complète des raccourcis clavier de l\'éditeur.'
  },
  {
    selectors: ['[data-tooltip="Importer le cours du professeur (PDF, Word, ODT...)"]'],
    title: 'Importer un document',
    body: 'Colle le contenu d\'un PDF/Word/ODT existant directement dans tes notes.'
  },
  {
    selectors: ['[data-tooltip="Enregistrement audio/vidéo"]'],
    title: 'Enregistrement',
    body: 'Enregistre le cours en direct (audio ou vidéo) pendant que tu prends tes notes.'
  },
  {
    selectors: ['[data-tooltip="Historique des versions"]'],
    title: 'Historique des versions',
    body: 'Chaque sauvegarde importante garde une version du cours — tu peux revenir en arrière à tout moment.'
  },
  {
    selectors: ['[data-tooltip="Plan du cours"]'],
    title: 'Plan du cours',
    body: 'Affiche la table des matières (tes titres) pour naviguer vite dans un cours long.'
  },
  {
    selectors: ['[data-tooltip="Afficher un PDF à côté des notes"]'],
    title: 'PDF à côté',
    body: 'Garde un PDF ouvert à côté de tes notes pendant que tu écris — pratique pour recopier un cours de prof.'
  },
  {
    selectors: ['[data-tooltip="Numéroter les titres"]'],
    title: 'Numéroter les titres',
    body: 'Numérote automatiquement tes titres (1, 1.1, 1.2...).'
  },
  {
    selectors: ['[data-tooltip="Mode focus (Ctrl+.)"]'],
    title: 'Mode focus',
    body: 'Masque tout le reste pour écrire sans distraction. Échap ou Ctrl+. pour en sortir.'
  },
  {
    selectors: ['[data-tooltip="Exporter en PDF"]', '[data-tooltip="Exporter en Markdown"]'],
    title: 'Exporter',
    body: 'Exporte ce cours en PDF ou en fichier Markdown (.md).'
  },
  {
    selectors: ['[data-tooltip="Supprimer ce cours"]'],
    title: 'Supprimer ce cours',
    body: 'Supprime définitivement ce cours (une confirmation te sera demandée).'
  }
]
