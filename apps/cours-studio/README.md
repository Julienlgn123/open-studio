<p align="center">
  <img src="https://raw.githubusercontent.com/Julienlgn123/cours-studio/main/banner.png" alt="Cours Studio" width="100%" />
</p>

<p align="center">Prise et gestion de cours en local : éditeur riche, résumés/QCM par IA, enregistrement audio.</p>

<p align="center">
  📦 Fait partie de la suite <a href="https://github.com/Julienlgn123/open-studio"><b>Open Studio</b></a> —
  pas besoin de télécharger l'installateur ici : installe Open Studio une seule fois, et Cours Studio
  (comme les autres outils de la suite) devient téléchargeable et lançable directement depuis son catalogue.
</p>

---

## Fonctionnalités

- Éditeur de cours riche (Tiptap) : mise en forme, tableaux, listes de tâches, formules mathématiques (KaTeX).
- Import de documents existants (Word, PDF) directement dans un cours.
- Enregistrement audio des cours (ffmpeg embarqué).
- Résumés et QCM générés à partir du contenu d'un cours.
- 100 % local : SQLite embarqué, aucune donnée envoyée à un serveur.

---

## Stack

| Couche | Techno |
|---|---|
| Desktop | Electron 35, electron-vite, electron-builder |
| UI | React 18, TypeScript, Zustand, Framer Motion, Lucide |
| Éditeur | Tiptap, KaTeX |
| Données | better-sqlite3 (local) |
| Documents | mammoth (Word), pdf-parse (PDF), ffmpeg-static (audio) |

---

## Installation

Cours Studio s'installe et se met à jour directement depuis
[**Open Studio**](https://github.com/Julienlgn123/open-studio) : télécharge sa
dernière release, puis choisis Cours Studio dans son catalogue — téléchargement,
installation et mises à jour se font depuis là, en un clic.

> **App non signée** : sans certificat développeur (payant), macOS affichera un
> avertissement Gatekeeper et Windows un avertissement SmartScreen à la première
> ouverture. C'est normal pour un build indé.

### macOS : « Cours Studio est endommagée et ne peut pas être ouverte »

Cours Studio n'a pas de certificat Apple Developer payant : la build macOS
n'est signée qu'en *ad-hoc*. Une fois le `.dmg` téléchargé, macOS met l'app en
quarantaine et Gatekeeper refuse de l'ouvrir en affichant **« Cours Studio est
endommagée et ne peut pas être ouverte »** — le classique clic droit → **Ouvrir**
ne suffit pas ici, contrairement à une app juste non-notariée (avec un vrai
certificat Developer ID).

Pour la débloquer (gratuit, à faire une seule fois) :

1. Glisse `Cours Studio.app` dans `/Applications` (obligatoire : impossible de
   modifier l'app tant qu'elle est encore dans le `.dmg`, en lecture seule).
2. Retire l'attribut de quarantaine, au choix :
   - double-clique `Fix-macOS-Signature.command` (fourni dans le `.dmg`), ou
   - ouvre Terminal et lance :
     ```bash
     xattr -cr "/Applications/Cours Studio.app"
     ```
3. Ouvre Cours Studio normalement.
