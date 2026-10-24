# Communication (COM) — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**Implémenté et vérifié localement** (phases COM-1 à COM-8 du [PLAN](PLAN.md)) — CI de la PR à relever ; **non accepté** :
les décisions COM-D1 à COM-D14 attendent le maître d'ouvrage. Aucun déploiement.

## Faits vérifiés

Le 2026-10-24, sur la branche `ccr-a50667e3-fng2br`, avec une base PostGIS locale jetable :


- `npm run typecheck` : vert (tous les espaces).
- Tests web (`vitest`) : verts, dont `communication/etats.test.ts` (7) et la règle d'or étendue
  `commandes-collaboration.test.ts` (16 commandes COM, icônes uniques, raccourcis sans collision, écrans branchés).
- Tests API purs : `lib/com-audience.test.ts` (18, audiences, mentions, empreintes, demandes) ; `notification-preferences.test.ts`
  (neuf types) ; matrice Studio `studio-permissions.test.ts` (route COM déclarée hors matrice, `PERMISSIONS.md` régénéré).
  `scripts/check-api-tests-db3.mjs` : seules les suites DB-3 de la liste sont refusées, uniquement par la garde (aucune
  base attestée en local ; les suites DB-3 tournent en CI).
- `npm run build` : vert.
- `npm run db:migrate` rejoué deux fois (idempotent) ; `users-migration-check.mjs` et `participations-migration-check.mjs` verts.
- Recette `apps/web/e2e/communication.mjs` contre l'API construite servant l'application : **tout conforme** (audiences
  sur toutes les routes, mentions, références, partage avec empreinte et aperçu périmé, changement d'audience, rejeu hors
  ligne, accusés, modification / retrait, demandes et actions liées dont l'observation Studio, historique reçu,
  révocation avant synchronisation, responsabilités, interface et clavier, « Ma boîte »).
- Recette `apps/web/e2e/interface-anglais.mjs` (page `/boite` ajoutée) : verte, aucun résidu français venant de COM.
- `check-fadi-isolation.mjs` : vert.

## Points ouverts

- CI GitHub de la PR (jobs `validate`, `e2e (complements)` qui joue `communication.mjs`, `studio-v1-validation`).
- Acceptation du maître d'ouvrage, dont la dérogation COM-D1 à l'ordre CR-D9.
- Reports déclarés : PLAN § 1 et TASKS COM-10 à COM-12.

## Liens de suivi

- Issue : https://github.com/RachEma-ux/Fadi/issues/280
- Branche de tâche : `ccr-a50667e3-fng2br`
- Pull Request : voir HANDOFF.md.

## Préconditions de clôture

- CI verte ; décisions COM-D1 à COM-D14 acceptées ; HANDOFF.md à jour.
