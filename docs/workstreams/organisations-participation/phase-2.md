# Phase 2 — Participants et équipe : compte rendu

> Issue #262, [PLAN.md](PLAN.md) phase 2 (tâches 1 à 6) et tâche 5 reportée de la phase 1 (journal des écritures de
> participation). Décisions appliquées : OP-1 (OP-D3 c, OP-D4 b, OP-D9), OP-2 (conservation 2 ans après clôture), OP-3
> (enchaînement sans arrêt). Concept normatif : `docs/workstreams/users-management/concept.md`, parties 1 à 3.
> État : **Implémenté**, vérifié localement (preuves ci-dessous) ; non accepté. Aucun déploiement.

## 1. Livré

| Tâche du plan | Réalisation |
| --- | --- |
| 1. API | `apps/api/src/routes/participants.ts`, monté sous `/projects/:projectId/participants` (à côté de `members`, `routes/projects.ts`). Annuaire, vue Équipe, recherche d'existant, contacts, modification, rôles par portée, aperçu d'impact, suspendre / réactiver / terminer, retour, effacement, clôture. |
| 2. Droits | Écritures : **propriétaire seul** (règle actuelle du plan) ; effacement d'un contact : propriétaire **ou** responsable (`isProjectResponsible`). Lecture : tout lecteur du projet (accès support compris, lecture seule) ; `workEmail` / `workPhone` et invitations en attente pour les seuls responsables (OP-D9). |
| 3. Interface | `apps/web/src/modules/collaboration/Participants.tsx` (section « Équipe et participants », onglets **Participants** et **Équipe**), branchée par une seule ligne dans `CollaborationModule.tsx`. |
| 4. Retour | `POST …/:id/return` : même identité, nouvelle participation `contact`, sans responsabilité ni rôle ; l'accès revient seulement par le partage (ou une invitation acceptée en phase 3). |
| 5. Bascule de l'accès | Vue SQL `project_effective_access`, **seule source** de `loadProjectAccess` et des listes (projets partagés, historique, notifications, participants Studio, lecteurs des fils, garde support). Rôles Approbateur / Diffuseur ouvrent l'approbation et la diffusion Studio (besoins `approve` / `publish`). |
| 5 bis. Journal | `participation.created`, `participation.updated`, `participation.status_changed`, `participation.role_assigned`, `participation.role_removed`, `person.contact_created`, `person.contact_erased`, `organization.created`, `project.closed`, `project.reopened` — dans la transaction de l'action, cible = projet, aucune adresse ni coordonnée. |
| 6. Effacement | Sur demande (`POST …/:id/erase`) ; `projects.closed_at` + « Clore / Rouvrir le projet » (déclaratif) ; tâche horaire `runContactRetentionJob` (dans `startAccountWorkers`, et `npm run db:account-jobs [-- --now=… --contacts-seulement]`). |

### Routes (contrat public)

| Route | Droit | Effet |
| --- | --- | --- |
| `GET /projects/:pid/participants` | lecture | `{ project: { closedAt }, you: { role, responsible, canManage, canErase }, participants: ParticipantView[], invitations? }` |
| `GET …/team` | lecture | `{ team }` : participations non terminées portant au moins une responsabilité |
| `GET …/search?q=&email=` | propriétaire | personnes et organisations **visibles** (créées par lui ou présentes dans un de ses projets), compte par adresse exacte : `accountExists` seulement |
| `POST …/contacts` | propriétaire | `{ kind: "personne", displayName, jobTitle?, workEmail?, workPhone?, representedOrganizationId? \| representedOrganizationName?, businessRole?, responsibilities?, startsOn?, personId?, confirmDistinct? }` ou `{ kind: "organisation", name? \| organizationId?, orgKind?, … }` → 201 `contact` ; 409 `existing` (+ `matches`, `blocking`) |
| `PATCH …/:id` | propriétaire | rôle métier, partie représentée, responsabilités, début ; fiche d'un contact sans compte |
| `POST …/:id/roles`, `DELETE …/:id/roles/:roleId` | propriétaire | rôle par portée, origine `attribution` ; un rôle `acces` (pont du partage) ne se retire pas ici (422) |
| `GET …/:id/impact?change=` | propriétaire | droits effectifs, rôles, invitations en attente (annulées si fin), observations / tâches Studio ouvertes, réservation d'édition, responsabilités |
| `POST …/:id/status` `{ change: suspendre \| reactiver \| terminer, endsOn? }` | propriétaire | 409 pour le propriétaire du projet ou une transition interdite |
| `POST …/:id/return` | propriétaire | nouvelle participation `contact` |
| `POST …/:id/erase` | propriétaire ou responsable | effacement d'un contact sans compte |
| `PUT …/closure` `{ closed }` | propriétaire | `projects.closed_at` (aucun droit changé) |

### Schéma (additif, idempotent — `init.sql`, `schema.ts`)

- `project_participations.can_export boolean NOT NULL DEFAULT false` (export accordé, écart E2), placé juste après la table
  pour être disponible à la reprise ; `op_sync_access` le tient depuis `project_members.can_export` (NULL d'archive = TRUE).
- Vue `project_effective_access (project_id, user_id, role, can_export, can_approve, can_publish)`.
- `projects.closed_at timestamptz`, `people.erased_at timestamptz` ; index `people_contacts_retention_idx`,
  `project_participations_org_idx`, `project_participations_represented_idx`.
- Droits `fadi_app` : couverts par le bloc final D-7 (`ALL TABLES` couvre la vue) ; `fadi_app` lit la vue sans pouvoir la
  remplacer (contrôlé).

### Fonctions exportées utiles aux autres phases

- `lib/participants.ts` (pur) : `deriveAccess`, `ROLE_CAPABILITIES`, `contactProblems`, `contactDetailsFor`,
  `contactRetentionDue`, `participationImpact`, `statusChangeRefusal`, `roleAssignmentRefusal`, `normalizeName`,
  `ERASED_CONTACT_NAME`, `CONTACT_RETENTION_YEARS`.
- `lib/participants-db.ts` : `listParticipants`, `lockedParticipation`, `impactOf`, `applyStatusChange`, `eraseContactIn`,
  `runContactRetentionJob`, `visiblePeopleCondition`, `visibleOrganizationsCondition`.
- `lib/access-locks.ts` : `lockAccessRows(tx, projectId, userId)` (FOR SHARE sur la ligne de partage et les participations).
- `lib/owned-project.ts` : `ProjectNeed` gagne `approve` et `publish` ; `AccessibleProject` gagne `canApprove`, `canPublish`.
- Web : `participants-api.ts` (`participantsApi`), `request` désormais exporté par `lib/api.ts`.

## 2. Décisions d'implémentation (prises au plus prudent, à relire)

1. **Miroir conservé comme pont** (et non retiré, écart à la tâche 5 du plan « le miroir `acces` est alors retiré ») :
   partage, changement de rôle, retrait, départ, transfert, invitations acceptées, anonymisation et restauration écrivent
   toujours `project_members`, et la phase 3 (invitations) travaille en parallèle sur ces chemins. La **décision**, elle,
   n'a qu'une source : la vue. `loadProjectAccess` ne lit plus `project_members` (test pur qui relit le code). Le pont ne
   réactive jamais une participation suspendue (seul un `contact` devient `active` par un accès).
2. **Accès dérivé** : propriétaire (`projects.owner_id`, gardien) ; sinon participation `active`, commencée (`starts_on ≤
   aujourd'hui`), d'une personne liée à un compte, avec **au moins un rôle de portée `projet`** (précision du chef de
   projet : une participation « revue seule » sans rôle de projet ne donne rien). Concepteur → `editeur` ; Lecteur,
   Relecteur, Coordinateur, Approbateur, Diffuseur → `lecteur` (lire, commenter — un Relecteur consigne des constats
   Studio, qui exigent `comment`). Approbateur → `canApprove`, Diffuseur → `canPublish`. Export : Concepteur ou
   `can_export`.
3. **Portées plus étroites** (étude, variante, révision, documents) : enregistrées, affichées, **sans aucun droit**
   (échec fermé : aucune route ne les évalue encore). Limite déclarée dans l'interface.
4. **Studio** : `BESOIN_CAPACITE` approbation → `approve`, publication → `publish` ; la réservation d'édition (423)
   s'applique aussi à ces besoins, ce qui a permis de retirer le second `assertAccess(…, "write")` de la transition (un
   Approbateur lecteur approuve sans droit de modification ; le propriétaire et les éditeurs gardent exactement leurs
   droits).
5. **Rôles attribuables** seulement à une personne liée à un compte, non propriétaire, participation non terminée ; jamais
   à un contact sans compte (aucune invitation implicite, et un rôle préattribué ne doit pas s'activer à l'acceptation
   d'une invitation de moindre portée) ni à une organisation (elle agit par ses représentants).
6. **Fin de participation** : statut `terminee` daté, ligne de partage supprimée (aucun pont ne rouvre l'accès),
   invitations en attente du projet pour l'adresse du compte ou l'e-mail du contact annulées, réservation d'édition
   libérée ; les rôles attribués restent dans l'historique de la participation terminée. Suspension : accès coupé,
   réservation libérée, invitations conservées (une acceptation ne réactive pas une participation suspendue).
7. **Recherche d'existant** : périmètre limité à ce que le propriétaire voit déjà (ses projets, ses fiches) — jamais
   l'annuaire d'une autre organisation ; un compte par adresse exacte n'est révélé que par `accountExists`. Doublons :
   même nom normalisé ou même adresse → 409 `existing` avec les fiches ; « fiche distincte » confirmable, sauf même
   adresse dans le même projet (409 bloquant). Aucune fusion.
8. **Effacement** : nom remplacé par « Contact effacé » (donnée ; l'interface l'affiche traduite), fonction et coordonnées
   supprimées, `erased_at` posé, participations en cours terminées ; fiche et participations gardées comme trace. Un
   contact sans participation (projet supprimé) est effacé par la tâche. Les fiches liées à un compte suivent
   l'anonymisation du compte (`anonymiseAccountIn` efface désormais aussi leur fonction et coordonnées).
9. **Clôture** : purement déclarative, propriétaire seul, journalisée ; aucun droit ne change.
10. **Réserve juridique d'OP-2** affichée dans l'interface (sous l'état clos / ouvert) et rappelée ici : d'éventuelles
    obligations légales de conservation (garantie décennale…) restent à vérifier par le conseil juridique du maître
    d'ouvrage avant toute mise en production de l'effacement automatique.
11. **Règle d'or** : 11 commandes dans `commandes-collaboration.ts`, chacune avec son icône, sa barre (`annuaire`,
    `participant`, `rôles`) et un raccourci : Alt+Maj+6 nouveau contact, 7 modifier, 8 attribuer un rôle, `[` retirer le
    rôle, 9 suspendre / réactiver (bascule), 0 terminer, `]` nouvelle participation, `-` effacer, `=` clore / rouvrir
    (bascule). Les chiffres 4 et 5 sont laissés aux autres phases. Le test de règle d'or accepte désormais plusieurs
    bascules (`BASCULES`).

## 3. Écarts au plan et au concept

- Plan, tâche 5 : miroir **conservé** comme pont (point 1 ci-dessus) — à retirer quand toutes les écritures (phase 3
  comprise) écriront les participations directement.
- Concept partie 2 « Effective access rules » : les restrictions explicites et la délégation ne sont pas modélisées (hors
  phase) ; les portées étroites ne donnent rien (point 3).
- Concept partie 3 « Assign work » : les affectations de travail générales n'existent pas ; l'aperçu d'impact recense les
  observations et tâches Studio ouvertes de la personne, seuls travaux affectés existants.
- Plan, tâche 2 : administration déléguée non décidée → écritures au propriétaire seul.

## 4. Preuves (exécutées le 2026-10-24, base jetable `fadi_p2`, API construite sur le port 3011)

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` deux fois | « Schema applied » deux fois, sans erreur |
| `node scripts/validation/participations-migration-check.mjs` | ✅ phases 1 et 2 (nouvelle section 6 : reprise sans perte, contact / suspendue / terminée / sans rôle / portée étroite / non commencée sans droit, pont, colonnes, rejeu, `fadi_app`) |
| `node scripts/validation/users-migration-check.mjs` | ✅ |
| `npm run typecheck` | vert |
| `npm test` | vert sauf `packages/*/src/revolution-l10d.test.ts` (géométrie Planche, sans rapport, vert relancé seul : 10/10) ; API : 489 tests hors base, 12 suites DB-3 refusées par la garde (normal localement) ; `node scripts/check-api-tests-db3.mjs` vert |
| `npm run build` | vert |
| `apps/web/e2e/participants.mjs` (nouvelle) | 92 ✓, 0 ✗ (API, interface, axe-core bureau et téléphone, passe anglaise, journal, conservation à horloge simulée) |
| `collaboration-audience.mjs`, `studio-publication.mjs`, `comptes-api.mjs` | 45 ✓, 129 ✓, 109 ✓ — aucune régression |
| `interface-anglais.mjs` | vert |
| `comptes-admin.mjs` | 75 ✓, 4 ✗ — les quatre sont des courriels lus dans Mailpit (absent de ce poste) : non imputables à la phase |
| Cohérence vue SQL / `deriveAccess` | 8 cas identiques (script local hors DB-3, transaction annulée) |

## 5. Ce qui n'a pas tourné localement

- **Tests DB-3** ajoutés à `apps/api/src/app.test.ts` (bloc « Équipe et participants — bascule de l'accès… », 3 cas :
  aucune perte d'accès et contact sans droit ; suspendre / terminer / sans rôle ; vue = règle pure) : refusés par la garde
  hors CI, comme toutes les suites DB-3 ; aucune nouvelle suite, `DB3_PENDING_SUITES` inchangée.
- CI GitHub : non lancée (aucun push).

## 6. Limites et suites

- Retirer le pont quand la phase 3 écrira les participations à l'acceptation d'une invitation.
- Évaluer les portées étroites route par route (étude, variante, révision, documents) avant de leur donner un droit.
- L'interface web n'expose pas encore `canApprove` / `canPublish` hors de l'annuaire ; les écrans Studio relisent les
  transitions permises du serveur.
- Observé hors périmètre : sur téléphone (390 px), le formulaire « Accès support » de Collaboration déborde de 17 px quand
  des administrateurs existent (non corrigé ici).
