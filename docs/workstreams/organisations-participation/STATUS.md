# Organisations, participation et revue externe — Statut

Mis à jour : 2026-10-25 (UTC).

## État

**Implémenté — toutes les phases du plan.** Phases 1, 2, 3 bis et 5 fusionnées dans `main` (PR #265, #281). Phases 3, 4, 6 et
reliquats sur la PR #290 (branche `ccr-3b26a9f6-z073dc`), vérifiés en local ; CI de la PR à relever. Rien n'est accepté ni
déployé : 🛑 final au maître d'ouvrage.

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

- Phases 2 et 5 livrées sur la branche (2026-10-24) : [phase-2.md](phase-2.md) (vue `project_effective_access` source unique
  des droits, six rôles par portée, Approbateur / Diffuseur pour Studio, annuaire et équipe, effacement des contacts ; écart :
  miroir `op_sync_access` conservé comme pont) et [phase-5.md](phase-5.md) (espace d'organisation, adhésions par invitation
  acceptée, groupes et mandats sans droit, gabarits versionnés). **CI complète verte sur `9abca29`** (run 40137263799), suites
  DB-3 comprises.

- Phases 3, 4, 6 et reliquats (2026-10-25, PR #290), vérifiés en local : typecheck, tests (seules les suites DB-3 refusées
  par la garde), build, migrations ×2 sur base neuve et existante, contrôles `*-migration-check.mjs`, script
  post-déploiement « conforme » ; recettes `invitations-participation` 107, `revue-externe` 132, `portees-etroites` 87,
  `organisations` 182, `organisations-participation-final` 155, `participants` 92, `collaboration-support-telephone` 5.
  **DB-3 de ces lots : non exécutées localement (CI seulement).** Matrice des exigences : [recette-finale.md](recette-finale.md).
- Écarts déclarés : pont `op_sync_access` conservé (lot dédié OP-PONT) ; acceptation dans l'application réservée aux adresses
  vérifiées ; durée d'accès de revue par défaut 30 jours (valeur d'implémentation) ; séparation des responsabilités non
  modélisée ; raccourcis des Participants en Ctrl+Alt+Maj (Alt+Maj saturé).

## Points ouverts

- 🛑 final : acceptation du périmètre livré ; tout déploiement suit [RUNBOOK-deploiement.md](RUNBOOK-deploiement.md).
- À décider par le maître d'ouvrage : réserve juridique d'OP-2 (aucun interrupteur propre à la tâche de conservation hors
  `ACCOUNT_WORKERS=0`) ; listes métier OP-D4 ; durée d'accès de revue par défaut ; portées étroites (téléchargement par un
  Lecteur à portée documents, pas d'export pour un Concepteur d'étude) ; retrait du pont ; contenu de « Mon historique » d'un
  invité externe.

## Liens de suivi

- Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche : `ccr-3b26a9f6-z073dc`. PR #263 (cadrage), #265 (phase 1), #281 (phases 2, 3 bis, 5) fusionnées ; PR [#290](https://github.com/RachEma-ux/Fadi/pull/290) (phases 3, 4, 6, reliquats) ouverte.
  Le commit était d'abord poussé sur la PR #259, fusionnée avec sa tête précédente sans lui : il est rebasé sur `main`.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
