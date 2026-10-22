# Gestion des comptes (Users Management) — Reprise de session

Mis à jour : 2026-10-22 (UTC).

## Point de reprise

- Chantier : users-management
- Issue : [#253](https://github.com/RachEma-ux/Fadi/issues/253)
- Branche / PR actives : `ccr-266c1e83-7780ml` ; PR vers `main` ouverte en fin de session (non fusionnée).
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Phases 0 à 6 et amendement D-7 implémentés ; vérifiés localement sur PostGIS 16 réel et Mailpit (voir STATUS.md :
  31 + 109 + 48 contrôles, 229 tests purs API, tests web, typecheck, build).
- CI de la PR : **à constater** au début de la reprise.

## Prochaine action

- Lire la CI de la PR (jobs `validate`, `e2e (complements)` pour les recettes Comptes, `e2e (parcours)` pour la
  restauration, `image` pour le démarrage en `fadi_app`, `Studio V1` pour le profil jetable adapté à D-7) ; corriger
  tout échec.
- Revue humaine (🛑 phases 2, 3, 4, D7-final) puis décision de fusion par le maître d'ouvrage ; aucun déploiement sans
  accord explicite (RUNBOOK.md pour la suite).

## Tests et preuves

- `DATABASE_URL=… node scripts/validation/users-migration-check.mjs` (base locale jetable, super-utilisateur).
- `BASE_URL=… DATABASE_URL=<fadi_app> MAILPIT_URL=… MAIL_DAILY_LIMIT=… node apps/web/e2e/comptes-api.mjs`.
- `BASE_URL=… MAILPIT_URL=… MAIL_RECIPIENT_HOURLY_LIMIT=… node apps/web/e2e/comptes-admin.mjs` (API servant `WEB_DIST`).
- `npx --workspace=@fadi/api vitest run src/lib` ; `npm run typecheck` ; `npm run build`.

## Risques et blocages

- DB-3 bloqué (UM-11) : les 12 suites historiques restent « non exécutées » en CI.
- Déploiement suivant la fusion : `FADI_APP_DB_PASSWORD` obligatoire, l'API refuse de démarrer en production avec un
  rôle privilégié (UM-15) — procédure et retour arrière dans RUNBOOK.md.
- Organisations hors périmètre (UM-1), à confirmer par le maître d'ouvrage.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
