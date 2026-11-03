# Bases de données — Statut

Mis à jour : 2026-11-02 (UTC).

## État

En cours : PR unique implémentée sur `ccr-e71fe633-hjxnjf` (BD-1 à BD-6, BD-10) ; BD-3b et BD-4b après mesure.

## Faits vérifiés

Base locale PostgreSQL 16.15 / PostGIS 3.4.2 avec les données GeoData réelles (1,1 Go) :
- migration rejouée, journal `admin.schema_applications` écrit (empreinte, durée, essais, rôle) ;
- verrou de table tenu par une autre session : « essai 1/5 … 2 essai(s) » ; avec 2 essais : échec franc `55P03`, rien
  d'appliqué ;
- `shared_preload_libraries=pg_stat_statements` : extension créée par la migration (« statistiques des requêtes active ») ;
- `db:verifier-contraintes` : 83 contraintes NOT VALID contrôlées, 83 respectées, rien modifié ;
- `npm run typecheck` et `npm run build` verts ; `pool-options.test.ts` 3/3, `client-integration.test.ts` 17/17 ; les
  suites de routes qui exigent la base de test attestée ne tournent qu'en CI (refus `TARGET_REQUIRED` en local).

## Points ouverts

- Préproduction et production non vérifiées (aucun accès depuis la session) ; BD-7 à BD-9 bloqués (voir TASKS.md).

## Liens de suivi

- Issue [#379](https://github.com/RachEma-ux/Fadi/issues/379) ; plan [PLAN.md](PLAN.md).

## Préconditions de clôture

- Critères de sortie de TASKS.md remplis et constatés.
