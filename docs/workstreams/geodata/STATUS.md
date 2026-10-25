# GeoData — Statut

Mis à jour : 2026-10-25 (UTC).

## État

**Implémenté et vérifié** (tests et recette locale, CI à relire sur le HEAD de la PR) pour GeoData V1 sous délégation totale (ADR-GEODATA-02, Issue #299). **Non accepté** en production : la mise en production reste la Release du maître d'ouvrage.

## Faits vérifiés

Relevés le 25 octobre 2026 sur une base PostGIS 16 jetable locale.

- Base : `main@0ff0638` ; branche `ccr-e71fe633-hjxnjf`.
- `npm run typecheck` : succès ; tests des paquets et du web : succès (dont `@parcours/geodata-model` 18 tests, module web GeoData 11 tests) ; `npm run test:db-guard` : succès ; `check-api-tests-db3` : seule la liste DB-3 (avec `geodata.test.ts`) est refusée sans attestation ; `npm run build` : succès, découpage conforme (famille `maplibre` hors du bundle initial).
- Suite API GeoData sur PostGIS réel (garde DB-3 contournée localement, non commité) : 21 tests sur 21 (GEO 01, 03, 05–10, 13, rôles, immuabilité, recherche, GeoPackage, audit GEO 04).
- `init.sql` rejoué deux fois sans erreur.
- Recette navigateur `apps/web/e2e/geodata.mjs` contre l'API qui sert le build : **tout conforme** (GEO 01, 02, 05, 06, 07, 08, 09, 11, 12, 13, axe-core sans violation critique ou sérieuse, interface anglaise sans résidu).
- Données réelles : geoBoundaries MAR ADM1 (12 régions, SHA-256 `6c4e3e25…129f`) et ADM2 (75 unités, `5b3f09cb…1714`) importées et publiées par la chaîne administrative sur la base locale ; empreintes conformes aux objets LFS publiés.

## Points ouverts

Recette sur appareils physiques et validation d'usage ; Release de production ; qualification des droits HCP ; extensions V1.1.

## Liens de suivi

- Issue de réalisation : https://github.com/RachEma-ux/Fadi/issues/299 ; cadrage : #243 (PR #245 fusionnée).
- Branche : https://github.com/RachEma-ux/Fadi/tree/ccr-e71fe633-hjxnjf.

## Préconditions de clôture

CI verte sur le HEAD de la PR, fusion, puis Release de production et recette d'usage par le maître d'ouvrage.
