# Gestion des comptes (Users Management) — Reprise de session

Mis à jour : 2026-10-22 (UTC).

## Point de reprise

- Chantier : users-management
- Issue : [#253](https://github.com/RachEma-ux/Fadi/issues/253)
- Branche / PR actives : `ccr-266c1e83-7780ml` ; [PR #255](https://github.com/RachEma-ux/Fadi/pull/255) vers `main` (prête pour revue depuis le 2026-10-22, non fusionnée).
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Phases 0 à 6 et amendement D-7 implémentés ; vérifiés localement sur PostGIS 16 réel et Mailpit (voir STATUS.md :
  31 + 109 + 48 contrôles, 229 tests purs API, tests web, typecheck, build).
- `accueils-design.mjs` : retrait de l'interception par `page.unrouteAll({ behavior: "wait" })` (l'appel de `361c7bd` ne retirait
  rien) et attente de l'accueil de B avant le contrôle « 21 étapes » ; 15/15 exécutions vertes en local sur base neuve.
- Constats de la revue Codex (UM-21 à UM-23) vérifiés en CI sur `24ed965` (563 tests API, dont 116 dans les 12 suites).
- Correctifs de sécurité de la revue de `c7dbc92` vérifiés en CI sur `873f740` (DB-3 : 561 tests API, dont 114 dans
  les 12 suites ; `comptes-securite.mjs` vert).
- CI de la PR #255 verte sur `81af007` ; sur `570d248`, DB-3 actif : 12 suites (105 tests) vertes sur base jetable attestée, 515 tests API (STATUS.md) ; revérifier le HEAD courant à la reprise.

## Prochaine action

- Vérifier la CI sur le HEAD : étape DB-3 (dont le bloc « correctifs de sécurité » de `app.test.ts`) et la recette
  `comptes-securite.mjs` (tranche `complements`).
- Revue humaine (🛑 phases 2, 3, 4, D7-final) puis décision de fusion par le maître d'ouvrage ; aucun déploiement sans
  accord explicite (RUNBOOK.md pour la suite).

## Tests et preuves

- `DATABASE_URL=… node scripts/validation/users-migration-check.mjs` (base locale jetable, super-utilisateur).
- `BASE_URL=… DATABASE_URL=<fadi_app> MAILPIT_URL=… MAIL_DAILY_LIMIT=… node apps/web/e2e/comptes-api.mjs`.
- `BASE_URL=… MAILPIT_URL=… MAIL_RECIPIENT_HOURLY_LIMIT=… node apps/web/e2e/comptes-admin.mjs` (API servant `WEB_DIST` ; 50 contrôles, passe anglaise comprise).
- `BASE_URL=… DATABASE_URL=<base vierge> COMPTES_SECURITE_BASE_VIERGE=1 node apps/web/e2e/comptes-securite.mjs`
  (correctifs de sécurité ; sans la variable, les courses du dernier administrateur sont déclarées non exécutées).
- `npx --workspace=@fadi/api vitest run src/lib` ; `npm run typecheck` ; `npm run build`.

## Risques et blocages

- Déploiement après fusion : nouveau service `migrate` (usage unique) dans `docker-compose.yml` ; l'API ne reçoit plus
  `DATABASE_MIGRATION_URL` et refuse de démarrer en production s'il lui est donné (RUNBOOK §4).

- Déploiement après fusion : la colonne `sessions.mfa_verified_at` est ajoutée ; les administrateurs déjà connectés
  doivent se reconnecter avec leur code (403 `mfa_session_required`), voir RUNBOOK §4 bis.

- DB-3 (UM-17) : vert sur `570d248` ; une PR de fork n'a pas le secret, les suites y sont déclarées non exécutées.
- Déploiement suivant la fusion : `FADI_APP_DB_PASSWORD` obligatoire, l'API refuse de démarrer en production avec un
  rôle privilégié (UM-15) — procédure et retour arrière dans RUNBOOK.md.
- Organisations hors périmètre (UM-1), à confirmer par le maître d'ouvrage.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
