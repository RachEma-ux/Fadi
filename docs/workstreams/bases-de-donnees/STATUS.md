# Bases de données — Statut

Mis à jour : 2026-11-03 (UTC).

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

## Faits vérifiés le 2026-11-03 (BD-7, BD-8, BD-9, base locale)

- Migration sous `fadi_migrator` : base existante « rôle fadi_migrator », aucun objet hors `fadi_owner` ; base neuve :
  repli administrateur signalé puis `fadi_migrator` au passage suivant.
- `pg_dump --role=fadi_backup` de la base complète (155 Mo) : réussi.
- `ops/pitr/tests/run.sh` : 27 réussis, 0 échec (archivage, base, rétention locale, restauration complète et à un instant).
- Outils de production (`deploy/prod/tests/run.sh`, hors root) : 123 réussis, 0 échec.
- Mesure du verrou : deux écritures d'essai consignées (valide, refusée), rapport relu.

## Points ouverts

- Préproduction et production non vérifiées (aucun accès depuis la session) ; mise en service BD-7 par l'administrateur
  (installer-bases.sh) ; envoi vers Swiss Backup et restauration depuis ce dépôt non essayés hors du VPS.

## Liens de suivi

- Issue [#379](https://github.com/RachEma-ux/Fadi/issues/379) ; plan [PLAN.md](PLAN.md).

## Préconditions de clôture

- Critères de sortie de TASKS.md remplis et constatés.
