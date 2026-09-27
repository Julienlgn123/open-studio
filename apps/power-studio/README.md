# Power Studio

Profils d'alimentation calculés pour ton matériel et optimisation du système (Windows, macOS, Linux).

> ⚠️ **Power Studio modifie des réglages profonds du système.** Sauvegarde tes fichiers importants
> et crée un point de restauration avant toute optimisation. Chaque réglage est réversible depuis l'app,
> et une sauvegarde `.reg` est écrite dans `Documents\Power Studio\Sauvegardes` avant chaque modification.

- **Profils** : Performance max, Équilibré, Silencieux, Économie max — processeur, boost, cœurs,
  politique de refroidissement, périphériques et (en option) limite de puissance du GPU NVIDIA.
  Sous Windows, l'app crée ses propres plans d'alimentation et peut rétablir le plan d'origine.
- **Automatique** : bascule selon le jeu lancé ou le passage sur batterie.
- **Optimisation** : confidentialité (télémétrie, géolocalisation, pubs), performance, batterie,
  services inutiles — chaque réglage garde sa valeur d'origine et s'annule en un clic.
- **Démarrage**, **apps préinstallées** et **nettoyage** des fichiers temporaires.

```bash
npm install -w apps/power-studio
npm run dev -w apps/power-studio
```
