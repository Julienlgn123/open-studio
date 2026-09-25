# Contribuer à Open Studio

## Structure du monorepo

```
apps/
  hub/              — Open Studio lui-même (le launcher)
  cours-studio/     — au catalogue, buildée et publiée avec le hub
  drive-studio/     — au catalogue, buildée et publiée avec le hub
  local-ia-studio/  — en pause, pas encore au catalogue
```

Chaque app garde son propre `package.json`/`electron.vite.config.ts` et se
lance indépendamment (`npm run dev -w apps/cours-studio`). `npm install` à
la racine installe tout, via les [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces).

`cours-studio` et `drive-studio` ont été importées avec `git subtree` depuis
leurs anciens repos, historique de commits inclus.

## Ajouter une app au catalogue

Un seul endroit à toucher : [`apps/hub/src/main/catalog.ts`](apps/hub/src/main/catalog.ts).

- **App qui vit dans ce monorepo** (cas normal pour toute nouvelle app) : un
  dossier `apps/<id>`, et une entrée catalogue *sans* `owner`/`repo`, avec un
  `assetPrefix` qui correspond au préfixe de ses fichiers d'installateur
  (`build.*.artifactName` de son `package.json`, ex. `Local-IA-Studio`). Ses
  installateurs sont alors cherchés dans la release de *ce* repo, filtrés par
  ce préfixe — un seul tag `vX.Y.Z` ici publie toute la suite d'un coup.
- **App encore sur son propre repo** (legacy, en cours de migration) : garder
  `owner`/`repo` sur son entrée catalogue, comme avant.

Dans les deux cas, le nom du produit doit correspondre exactement à
`build.productName` du `package.json` de l'app, et son NSIS doit avoir
`createDesktopShortcut`/`createStartMenuShortcut` à `false` — Open Studio est
le seul à créer un raccourci.

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

## Limites connues

- **macOS / Linux** : le flux d'installation suit les conventions documentées
  d'electron-builder (montage `.dmg` + copie dans `/Applications`, `dpkg`/`pkexec`
  pour le `.deb`) mais n'a pas pu être testé sur du matériel réel dans cet
  environnement de développement (Windows uniquement). À vérifier sur un vrai
  Mac/Linux avant une confiance totale.
- L'installation du `.deb` sur Linux nécessite `pkexec` (présent par défaut sur
  la plupart des environnements de bureau GNOME/KDE) pour l'élévation de droits.
