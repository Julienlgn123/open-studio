<p align="center">
  <img src="https://raw.githubusercontent.com/Julienlgn123/open-studio/main/banner.png" alt="Open Studio" width="100%" />
</p>

Hub desktop (Electron + React + TypeScript) qui rassemble les apps de la suite
« Julien Studio » en un seul endroit — vue catalogue, installation/mise à jour
et lancement en un clic, comme Adobe Creative Cloud mais pour mes propres apps.

## Installation

1. Télécharge la dernière release d'**Open Studio** : [Releases](https://github.com/Julienlgn123/open-studio/releases/latest)
   (`Setup.exe` sur Windows, `.dmg` sur macOS, `.AppImage`/`.deb` sur Linux).
2. Installe-le et lance-le.
3. Depuis son catalogue, choisis les outils qui t'intéressent — Open Studio les
   télécharge, les installe et les lance à ta place.

➡️ **Pas besoin d'aller télécharger un `.exe` sur chaque repo séparément** : une
fois Open Studio installé, tous les autres outils de la suite (Cours Studio,
Drive Studio, Plan Studio, PDF Studio…) sont disponibles directement depuis
son catalogue.

Apps actuellement au catalogue :

- **[Cours Studio](https://github.com/Julienlgn123/cours-studio)** — prise et gestion de cours en local.
- **[Drive Studio](https://github.com/Julienlgn123/drive-studio)** — gestionnaire multi-comptes Google Drive.
- **[Plan Studio](https://github.com/Julienlgn123/plan-studio)** — planning personnel local (événements, tâches, objectifs).
- **[PDF Studio](https://github.com/Julienlgn123/pdf-studio)** — lecture, édition et organisation de PDF en local.

100 % local, aucun serveur : Open Studio ne fait qu'interroger l'API GitHub
publique (releases) et gérer les fichiers déjà publiés par chaque app.

---

## Comment ça marche

Pour chaque app du catalogue, Open Studio :

1. Interroge la dernière **GitHub Release** du repo de l'app.
2. Télécharge l'installateur adapté à l'OS courant (Setup `.exe` / `.dmg` / `.deb`).
3. L'installe **pour de vrai** (vrai installateur natif, pas un simple "portable
   caché") — sur un emplacement propre à Open Studio, sans jamais toucher aux
   données de l'app (chaque app garde son dossier `%APPDATA%`/`~/Library`
   habituel, exactement comme si tu l'avais installée toi-même).
4. Si l'app est déjà installée par ailleurs (avant qu'Open Studio existe, ou
   installée manuellement), Open Studio la détecte et propose direct
   « Lancer » sans réinstaller.

Aucune donnée des apps gérées n'est stockée par Open Studio — seul son propre
suivi (quelle app est installée, quelle version) vit dans son dossier à lui.

---

## Ajouter une app au catalogue

Un seul endroit à toucher : [`src/main/catalog.ts`](src/main/catalog.ts). Chaque
entrée décrit le repo GitHub cible (le nom du produit doit correspondre
exactement à `build.productName` de son `package.json`) — le reste (détection
d'install, téléchargement, installation, lancement) est générique.

## Limites connues

- **macOS / Linux** : le flux d'installation suit les conventions documentées
  d'electron-builder (montage `.dmg` + copie dans `/Applications`, `dpkg`/`pkexec`
  pour le `.deb`) mais n'a pas pu être testé sur du matériel réel dans cet
  environnement de développement (Windows uniquement). À vérifier sur un vrai
  Mac/Linux avant une confiance totale.
- L'installation du `.deb` sur Linux nécessite `pkexec` (présent par défaut sur
  la plupart des environnements de bureau GNOME/KDE) pour l'élévation de droits.
