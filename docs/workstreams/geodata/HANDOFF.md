# GeoData — Reprise de session

Mis à jour : 2026-10-25 (UTC).
État relevé après la fusion de la PR #301.

## Point de reprise

- Chantier : geodata. Délégation totale (ADR-GEODATA-02).
- Issue : https://github.com/RachEma-ux/Fadi/issues/299.
- Code fusionné dans `main` par la PR #301 (`1d92920`) ; aucune branche de réalisation ouverte.

## Dernier état vérifié

GeoData V1 implémenté : paquet `packages/geodata-model`, schéma `geodata_*` (`apps/api/src/db/init.sql`), API `apps/api/src/routes/geodata/`, page `apps/web/src/modules/geodata/`, CLI `geodata:import-reference` et `geodata:role`, recette `apps/web/e2e/geodata.mjs` (CI, tranche `complements`). Preuves dans `STATUS.md` et `VERIFICATION.md`.

## Prochaine action

Maître d'ouvrage : vérifier la préproduction (`/geodata`), publier la Release de production, attribuer les rôles GeoData et importer les limites geoBoundaries sur l'environnement (`docs/geodata/README.md`), puis valider l'usage sur appareils. Ensuite seulement : extensions V1.1 (TASKS.md).

## Tests et preuves

Voir `VERIFICATION.md`. La suite API `apps/api/src/routes/geodata.test.ts` ne tourne qu'avec la base attestée DB-3 de la CI.

## Risques et blocages

Aucun blocage technique. Droits des indicateurs officiels non qualifiés (aucun publié). Aucun fond externe ni géocodeur configuré par défaut.

## Arrêt sûr

Tables additives ; retour arrière par `GEODATA_ENABLED=false`, sans perte de cartes. Aucune migration destructive, aucune production touchée.
