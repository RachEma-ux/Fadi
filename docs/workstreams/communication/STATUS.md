# Communication (COM) — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**Implémenté, vérifié et fusionné dans `main`** (PR #285, commit de fusion `173b9f1`, 2026-10-24, à la demande du maître
d'ouvrage) — CI verte sur `a5ef51b`. Décisions COM-D1 à COM-D14 **acceptées** (COM-A2). **Non déployé.**

**Lot COM-13 (photos et épingles, COM-A3) : implémenté et vérifié en local, PR à suivre ; non fusionné, non déployé.**

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
- Relecture du `.docx` de `main` : contenu identique au `.md` ; phase COM-5 bis ajoutée (activité, revues, panneaux
  Studio et Documents) et couverte par la recette (section 12 de `communication.mjs` : libellés distincts, heure de
  capture, filtres à traiter / questions ouvertes / auteur / étape, lecteur sans note interne, revues lisibles, fil sur
  une variante, document inconnu refusé) — recette rejouée : tout conforme.
- Recette `apps/web/e2e/interface-anglais.mjs` (page `/boite` ajoutée) : verte, aucun résidu français venant de COM.
- `check-fadi-isolation.mjs` : vert.

- Lot COM-13 (2026-10-24, local, PostGIS jetable) : `npm run typecheck` vert ; tests web 984 verts ; tests API purs
  verts (`com-images.test.ts` 5, matrice Studio régénérée, garde des volumes) et `check-api-tests-db3.mjs` conforme ;
  `npm run build` vert ; migration rejouée deux fois ; `communication.mjs` entièrement conforme (§ 13 : métadonnées
  retirées, 413 / 415 / 422, rejeu, photo non jointe réservée à l'auteur, épingle sur révision exacte, position
  geographic, photo d'un fil d'équipe refusée au lecteur, recopie au partage, observation reprenant la révision, photo
  d'un message retiré non servie ; § 11 : photo jointe et épingle posée depuis l'interface) ; `interface-anglais.mjs` vert.

## Points ouverts

- CI GitHub de `a5ef51b` : verte (validate, e2e parcours / complements / atelier / planche / p2, image, Studio V1, Project layout,
  Architecture native, Continuité, Isolation). Revue Codex : 4 remarques corrigées (`a5ef51b`), fils résolus.
- Déploiement (préproduction puis production) : sur accord explicite seulement.
- Reports déclarés : PLAN § 1 et TASKS COM-10 à COM-12.

## Liens de suivi

- Issue : https://github.com/RachEma-ux/Fadi/issues/280
- Branche de tâche : `ccr-a50667e3-fng2br`
- Pull Request : [#285](https://github.com/RachEma-ux/Fadi/pull/285), **fusionnée** (`173b9f1`).

## Préconditions de clôture

- CI verte ; décisions COM-D1 à COM-D14 acceptées ; HANDOFF.md à jour.
