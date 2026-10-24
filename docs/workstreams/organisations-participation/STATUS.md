# Organisations, participation et revue externe — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**En cours — phase 1 fusionnée (PR #265) ; exécution de bout en bout autorisée (OP-3, 2026-10-24) ; phases 2 à 6 en cours
sur la branche `ccr-3b26a9f6-z073dc` (PR #281).**

## Faits vérifiés

- Ouverture du chantier confirmée par le maître d'ouvrage le 2026-10-23 (OP-0). Priorité : participants, invitations
  acceptées, revue externe.
- Audit de l'existant sur `main` = `516e2f7` ([PLAN.md](PLAN.md) § 1) :
  - `project_members` porte les rôles `lecteur` / `editeur`, et l'ajout direct d'un compte existant reste possible (UM-8) ;
  - `auth.invitations` gère deux finalités sur cinq, sans participation rattachée ;
  - les colonnes `organization_id` sont réservées, sans logique ;
  - les publications Studio ont un manifeste figé ;
  - les observations Studio ont une boucle de correction ;
  - l'approbation et la diffusion Studio sont réservées au propriétaire ;
  - `admin.audit_log` n'a aucun écran de consultation.
- Second cadrage de la session d'exploitation (`docs/organisations-participation-cadrage`, `fa98da4`) fondu dans le plan
  le 2026-10-23 sur décision du maître d'ouvrage : phase 3 bis, OP-D3 (c), OP-D12, OP-D13.
- Phase 1 (branche `feat/op-phase1-participations`) : tables `people`, `organizations`, `project_participations`,
  `project_role_assignments`, miroir des accès par déclencheurs (`op_sync_access`), reprise idempotente ; transfert de
  propriété réordonné pour garder les participations continues. Vérifié localement le 2026-10-23 sur PostgreSQL 16 +
  PostGIS réel : `participations-migration-check.mjs` 38/38 (dont concurrence réelle à deux connexions), `users-migration-check.mjs` vert,
  `participations.test.ts` 6/6, typecheck et build verts. Les 12 suites DB-3 (dont le contrôle ajouté au test de
  transfert dans `app.test.ts`) n'ont pas tourné localement (aucune base attestée) : elles tournent en CI.
- Écart déclaré au plan : la journalisation des écritures de participation (phase 1, tâche 5) passe en phase 2, avec
  l'API qui les crée.
- Concept de référence : `docs/workstreams/users-management/concept.md` v2.2, protégé par le test anti-dérive existant.

- Phase 3 bis livrée sur la branche (2026-10-24) : `GET /admin/audit`, `GET /auth/me/history`, `GET /projects/:id/journal`,
  écrans et recette `journal-activite.mjs` (50 contrôles verts en local, axe-core bureau et téléphone) ; DB-3 en CI. Écarts :
  route `/auth/me/history` (au lieu de `/account/history`), aucun export d'administration (UM-20 ne définit l'export que par
  projet) — [phase-3bis.md](phase-3bis.md).

## Points ouverts

- 🛑 final (phase 6) : acceptation du périmètre livré par le maître d'ouvrage.
- OP-D9 décidée le 2026-10-24 (OP-2 : projet + 2 ans après clôture, plus tôt sur demande) ; effacement à livrer en phase 2 ;
  réserve : obligations légales de conservation à vérifier par le conseil juridique du maître d'ouvrage.
- OP-D12 révisée le 2026-10-24 (OP-2) : envoi réel des courriels en préproduction, réalisé dans une PR distincte (UM-28).

## Liens de suivi

- Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche des phases 2 à 6 : `ccr-3b26a9f6-z073dc`, PR [#281](https://github.com/RachEma-ux/Fadi/pull/281). Cadrage : PR #263 ; phase 1 : PR #265 (fusionnées).
  Le commit était d'abord poussé sur la PR #259, fusionnée avec sa tête précédente sans lui : il est rebasé sur `main`.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
