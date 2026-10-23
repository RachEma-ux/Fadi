# Organisations, participation et revue externe — Statut

Mis à jour : 2026-10-23 (UTC).

## État

**En cours — plan validé (🛑 0, OP-1) ; phase 1 implémentée sur la branche `feat/op-phase1-participations`, en attente de
la revue 🛑 1.**

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
  PostGIS réel : `participations-migration-check.mjs` 36/36 (6 exécutions), `users-migration-check.mjs` vert,
  `participations.test.ts` 6/6, typecheck et build verts. Les 12 suites DB-3 (dont le contrôle ajouté au test de
  transfert dans `app.test.ts`) n'ont pas tourné localement (aucune base attestée) : elles tournent en CI.
- Écart déclaré au plan : la journalisation des écritures de participation (phase 1, tâche 5) passe en phase 2, avec
  l'API qui les crée.
- Concept de référence : `docs/workstreams/users-management/concept.md` v2.2, protégé par le test anti-dérive existant.

## Points ouverts

- Revue 🛑 1 de la phase 1 (modèle et migration) par le maître d'ouvrage.
- OP-D9 : durée de conservation des contacts sans compte, à fixer.

## Liens de suivi

- Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche : `ccr-266c1e83-7780ml`, imposée par la session. PR de cadrage : [#263](https://github.com/RachEma-ux/Fadi/pull/263).
  Le commit était d'abord poussé sur la PR #259, fusionnée avec sa tête précédente sans lui : il est rebasé sur `main`.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
