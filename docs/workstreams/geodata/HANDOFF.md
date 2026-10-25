# GeoData — Reprise de session

Mis à jour : 2026-10-25 (UTC).
État relevé après la fusion de la PR #301.

## Point de reprise

- Chantier : geodata. Délégation totale (ADR-GEODATA-02).
- Issue : https://github.com/RachEma-ux/Fadi/issues/299.
- Code fusionné dans `main` par la PR #301 (`1d92920`) ; aucune branche de réalisation ouverte.

## Dernier état vérifié

GeoData V1 implémenté : paquet `packages/geodata-model`, schéma `geodata_*` (`apps/api/src/db/init.sql`), API `apps/api/src/routes/geodata/`, page `apps/web/src/modules/geodata/`, CLI `geodata:import-reference` et `geodata:role`, recette `apps/web/e2e/geodata.mjs` (CI, tranche `complements`). Preuves dans `STATUS.md` et `VERIFICATION.md`.

## Dernier checkpoint

- PR #307 fusionnée (outils d'exploitation dans l'image, dossier `RELEASE-V1.md`).
- Préproduction : rôles et geoBoundaries ADM1/ADM2 importés le 25 octobre 2026 ; recette d'usage constatée par le maître
  d'ouvrage (carte, fiche, recherche, enregistrement, export).
- Style « une couleur par entité » (D-GD-11) : PR #314 (paquet pur, route `/couches/:id/categories`, panneau, légende,
  export, recette).

## Prochaine action

Suivre `RELEASE-V1.md` : vérifier le SHA en préproduction, y attribuer les rôles et importer geoBoundaries avec les outils
de l'image (`apps/api/dist/geodata-role.js`, `geodata-reference.js`), recette d'usage, puis production. **Attention :**
`fadi-prod-auto` (phase B du déploiement) n'existe pas encore ; une Release seule ne met rien en production.

## Tests et preuves

Voir `VERIFICATION.md`. La suite API `apps/api/src/routes/geodata.test.ts` ne tourne qu'avec la base attestée DB-3 de la CI.

## Risques et blocages

Aucun blocage technique. Droits des indicateurs officiels non qualifiés (aucun publié). Aucun fond externe ni géocodeur configuré par défaut.

## Arrêt sûr

Tables additives ; retour arrière par `GEODATA_ENABLED=false`, sans perte de cartes. Aucune migration destructive, aucune production touchée.
