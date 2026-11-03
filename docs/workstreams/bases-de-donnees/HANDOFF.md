# Bases de données — Reprise de session

Mis à jour : 2026-11-03 (UTC).

## Point de reprise

- Issue #379 ; plan `PLAN.md` ; branche `ccr-e71fe633-hjxnjf` (PR unique).

## Dernier état vérifié

- PR implémentée et vérifiée en local (voir STATUS.md) ; CI de la PR à constater.

## Prochaine action

- BD-7 : après la Release, l'administrateur lance `sudo bash installer-bases.sh <commit>` ; lire ensuite
  `/mnt/data/fadi/pitr/derniere-verification.json` (durée de remise en service mesurée).
- BD-9 : relever `node apps/api/dist/atelier-mesures.js 28` dans le conteneur de l'application après 2 à 4 semaines.

- BD-3b et BD-4b après mesure. Après déploiement : `SELECT * FROM admin.schema_applications ORDER BY id DESC LIMIT 5` et
  `node apps/api/dist/verifier-contraintes.js` (rôle propriétaire) en préproduction.

## Tests et preuves

- `apps/api/src/db/pool-options.test.ts` ; étape CI « Base — seconde migration journalisée et contraintes NOT VALID
  respectées » ; essais manuels décrits dans STATUS.md.

## Risques et blocages

- `pg_stat_statements` ne prend effet en production qu'au redémarrage du conteneur `db` (courte indisponibilité, avec
  le maître d'ouvrage).
- `statement_timeout` 120 s : une requête plus longue est interrompue (réglable `DB_STATEMENT_TIMEOUT_MS`).
- BD-7 à BD-9 attendent le maître d'ouvrage.

## Arrêt sûr

- Aucun changement en production ; tout passe par PR, CI et Release du maître d'ouvrage.
