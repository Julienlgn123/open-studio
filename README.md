<p align="center">
  <img src="https://raw.githubusercontent.com/Julienlgn123/open-studio/main/banner.png" alt="Open Studio" width="100%" />
</p>

Le point d'entrée unique de la suite **Julien Studio** : un seul catalogue
pour installer, lancer et mettre à jour chaque app en un clic — plus besoin
de traquer des installateurs éparpillés sur dix repos.

## Installation

1. Télécharge la dernière release : [Releases](https://github.com/Julienlgn123/open-studio/releases/latest)
   (`Setup.exe` sur Windows, `.dmg` sur macOS, `.AppImage`/`.deb` sur Linux).
2. Installe-la et lance-la.
   - **macOS uniquement** : au premier lancement, macOS peut afficher
     « Open Studio est endommagée et ne peut pas être ouverte » (build sans
     certificat Apple Developer payant). Double-clique
     `Fix-macOS-Signature.command` fourni dans le `.dmg`, ou lance :
     ```bash
     xattr -cr "/Applications/Open Studio.app"
     ```
3. Depuis le catalogue, choisis les apps qui t'intéressent — Open Studio les
   télécharge, les installe et les lance à ta place.

## Apps de la suite

- **Cours Studio** — prise et gestion de cours en local.
- **Drive Studio** — gestionnaire multi-comptes Google Drive.
- **ENT Studio** — suit ton emploi du temps ENT et signale ce qui a changé.
- **Local IA Studio** *(bientôt)* — chat avec des modèles IA en local.

## Pourquoi Open Studio

- **Un seul endroit** pour installer et mettre à jour toute la suite — plus
  besoin d'aller chercher un `.exe` sur chaque repo séparément.
- **Tes données restent intactes** : chaque app garde son dossier habituel,
  exactement comme si tu l'avais installée toi-même.
- **100 % local** : aucun serveur, Open Studio ne fait qu'interroger l'API
  GitHub publique pour trouver les dernières versions.

---

Envie de contribuer ou de comprendre comment c'est fait sous le capot ?
Voir [CONTRIBUTING.md](CONTRIBUTING.md).
