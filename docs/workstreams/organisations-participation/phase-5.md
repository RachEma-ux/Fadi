# Phase 5 — Organisations (concept, partie 5) : cadrage et compte rendu

Chantier organisations-participation, [Issue #262](https://github.com/RachEma-ux/Fadi/issues/262). Phase enchaînée sous
OP-3 (exécution de bout en bout) ; décisions appliquées : **OP-D1 (a)** organisation propriétaire facultative, **OP-D4 (b)**
listes métier en saisie libre déclarée, **OP-D10 (a)** partie 5 après la revue externe. Source normative :
[`concept.md`](../users-management/concept.md), partie 5 et section v2.2 ; le concept prime sur le plan, chaque écart est
déclaré ci-dessous (§ 4). Statut : **Implémenté** et **vérifié localement** (§ 5) ; CI et acceptation : à relever.

---

## 1. Cadrage

Le plan ne donne qu'une ligne (« espace d'organisation, adhésions, groupes sans droit implicite, administration déléguée,
gabarits versionnés, annuaire interne distinct, départ et remplacement de représentant par mandat explicite »). Cadrage tiré
de la partie 5 du concept (tableau « Required behavior », « Groups and project access », « Onboarding and organizational
change », « Shared templates and directory visibility », critères d'acceptation) et de v2.2 (finalité d'invitation
« organization membership ») :

| Exigence du concept | Livré dans cette phase |
| --- | --- |
| *Organization record* : identité, coordonnées, administrateurs, statut | Fiche (nom, type déclaré libre, coordonnées libres), administrateurs listés, statut `active` / `suspendue` / `close` |
| *Internal membership* : affiliation, rôle, dates, statut, contre la personne vérifiée | `organization_memberships` : personne liée à un compte (jamais par ressemblance), rôle `administrateur` / `membre`, fonction libre, période, statut `active` / `suspendue` / `terminee` |
| *Working groups* sans accès automatique | `organization_groups` + membres ; chaque réponse et l'écran disent « aucun accès de projet » |
| *Delegated administration* | Les administrateurs actifs d'une organisation active gèrent ; rien d'autre (rôle plateforme compris) |
| *Shared resources* : gabarits versionnés avec propriétaire | Gabarits d'équipe, versions immuables (déclencheur), application avec aperçu, jamais rétroactive |
| *Project assignments* (vue transversale filtrée) | Onglet Projets : partie propriétaire / participante, représentants ; nom masqué sans accès au projet |
| Annuaire interne ≠ annuaire du projet ≠ profil | `/organizations/:id/directory`, réservé aux membres actifs ; adresses aux seuls administrateurs |
| Départ : retrait des droits dérivés, revue des tâches / représentations | Groupes quittés et mandats terminés (déclencheur), conséquences affichées avant confirmation, participations de projet intactes |
| Nouveau représentant par mandat explicite | `organization_mandates` : proposé par un administrateur, accepté par le représentant ; remplacement = nouveau mandat accepté |
| Suspension / clôture de l'organisation | Suspension : tout refusé sauf réactivation et clôture ; clôture définitive (adhésions et mandats terminés), historique et participations conservés |
| v2.2 : finalité d'invitation *organization membership* | `auth.invitations.purpose = 'organization_membership'`, l'adhésion naît de l'acceptation par l'identité visée |
| OP-D1 (a) : organisation propriétaire facultative | `projects.organization_id` (colonne D-3) reçoit sa clé étrangère et une logique minimale : déclaration par le propriétaire du projet, administrateur de l'organisation ; **aucun droit ne change** |

Hors périmètre (concept : « more detailed capacity planning and organizational reporting require a defined operational
need ») : planification de charge, rapports, droits de projet accordés par un groupe, références partagées autres que les
gabarits.

---

## 2. Livré

### Base (`apps/api/src/db/init.sql`, bloc « phase 5 », additif et idempotent ; `schema.ts`)

- `organizations` : colonnes `details`, `creation_key` (+ index unique `(created_by, creation_key)`).
- `organization_memberships` (statuts, fin datée, une adhésion courante par personne et organisation, `UNIQUE (id, organization_id)`).
- `organization_groups` (nom actif unique, statut `active` / `archive`) et `organization_group_members` (clés étrangères
  composées : groupe et adhésion de la **même** organisation).
- `organization_templates`, `organization_template_versions` (**immuables** : déclencheur `organization_template_versions_no_update`),
  `organization_template_applications` (une par version et projet).
- `organization_mandates` (participation de l'organisation dans le projet vérifiée par déclencheur ; un seul mandat actif
  par organisation et projet ; une proposition en attente par personne).
- Déclencheurs : départ (`op_org_membership_ended` : groupes retirés, mandats actifs terminés, propositions annulées),
  clôture (`op_org_status_change` : définitive, termine les adhésions), groupe refusé à une adhésion terminée.
- `projects.organization_id` : clé étrangère `projects_organization_fk` (NOT VALID, `ON DELETE SET NULL`).
- `auth.invitations` : colonnes `organization_id`, `organization_role`, `organization_job_title` ; contrainte des
  finalités étendue (remplacée une seule fois, détectée par sa définition) ; `invitations_organization_check` ; index des
  invitations en attente par `(adresse, finalité, projet, organisation)` (remplacé une seule fois).
- Droits `fadi_app` : couverts par le bloc D-7 final (tables du schéma `public`) ; vérifié par la validation.

### API (`apps/api/src/routes/organizations.ts`, monté sous `/organizations`, limite `API_RATE_LIMIT`)

Routes listées dans l'en-tête du fichier. Échec fermé : 404 sans adhésion (administrateur plateforme compris), 403 avec
motif (`not_admin`, `membership_suspended`, `membership_ended`, `organization_suspended`, `organization_closed`).
Journal : 20 actions `organization.*` (cible `organization`, jamais d'adresse) ; les invitations réutilisent
`invitation.created` / `resent` / `cancelled` / `accepted` avec `organizationId`.

### Règles pures (`apps/api/src/lib/organizations-rules.ts`) et accès (`apps/api/src/lib/organizations.ts`)

Machines d'états (adhésion, organisation, mandat), capacités d'après la seule adhésion, garde du dernier administrateur,
validation et plan d'application des gabarits, revalidation de l'acceptation d'un mandat, autorité de l'invitant.

### Invitations (finalité `organization_membership`)

`lib/invitations.ts` : deux branches d'une ligne (`inviterStillAuthorized` → `organizationInviterStillAuthorized` ;
`activateInvitation` → `activateOrganizationMembership`), vue enrichie (`organizationId`, `organizationName`,
`organizationRole`, `organizationJobTitle`). `routes/auth.ts` : nom de l'organisation dans la lecture, `organizationId`
rendu par l'acceptation et l'activation. Création et renvoi propres (`createOrRenewOrganizationInvitation`), sans toucher
à la création des invitations de projet. Courriel : modèle `invitation` avec `organizationName` (FR / EN). Page web
d'acceptation : organisation, rôle, fonction, mention « une adhésion n'ouvre aucun projet », entrée dans l'organisation.

### Web

- Écran **Organisations** (`/organisations`, `/organisations/:orgId`, chargé à la demande) : `apps/web/src/routes/organisations/`
  (`OrganisationsPage.tsx`, `libelles.ts`, `organisations.css`). Liste, mandats à accepter, création ; espace d'une
  organisation en cinq onglets (Fiche, Membres, Groupes, Gabarits, Projets ; flèches, Début, Fin au clavier).
- Entrée « Organisations » de la barre latérale (navigation secondaire), icône propre `organization` (`Icon.tsx`) ; test
  `AppShell-icones.test.ts` étendu (règle d'or : icône unique). `module-registry.ts` non modifié : l'espace d'organisation
  est un espace de compte transversal, pas un des modules du projet (`docs/architecture.md` inchangé).
- `api.ts` : `organizationsApi` et types ; finalité ajoutée à `InvitationView` ; `AdminUsersPage.tsx` : libellé
  « organisation » pour une invitation d'adhésion.
- `en.json` : 253 clés ajoutées (bloc d'interface et messages du serveur) ; aucune traduction existante modifiée.
- `vite.config.ts` : relais `/organizations` ; `app.ts` : préfixe d'API `organizations` (le repli SPA sert `/organisations`).

### Tests et recettes

- Purs : `apps/api/src/lib/organizations-rules.test.ts` (15 tests).
- DB-3 : `apps/api/src/routes/organizations.test.ts` (5 tests : adhésion + mandat + gabarit + partie propriétaire sans droit
  de projet ; groupe sans droit, départ sans toucher à un accès indépendant ; administrateur plateforme 404 ; 403 / 404 /
  dernier administrateur ; mauvais compte, invitant revalidé, création rejouée). Ajoutée à `DB3_PENDING_SUITES` (liste triée).
- Validation de migration : `scripts/validation/organisations-migration-check.mjs` (41 contrôles), CI job `validate`.
- Recette : `apps/web/e2e/organisations.mjs` (112 contrôles : API, navigateur, axe-core bureau et téléphone, défilement
  horizontal, passe anglaise), CI job e2e, tranche `complements`. `interface-anglais.mjs` relève aussi `/organisations`.

---

## 3. Contrats publics (pour les autres phases)

- Tables : `organization_memberships`, `organization_groups`, `organization_group_members`, `organization_templates`,
  `organization_template_versions`, `organization_template_applications`, `organization_mandates` ;
  `projects.organization_id` (partie propriétaire déclarée, aucun droit) ; `auth.invitations.organization_*`.
- Fonctions : `loadOrganizationAccess(orgId, userId)`, `membershipOf`, `ensurePersonForUser(tx, userId)`,
  `personIdOfUser`, `createOrRenewOrganizationInvitation`, `organizationInviterStillAuthorized`,
  `activateOrganizationMembership` (`lib/organizations.ts`) ; `organizationCapabilities`, `planTemplateApplication`,
  `mandateAcceptRefusal`, `removesLastOrganizationAdmin` (`lib/organizations-rules.ts`).
- Règle : aucune table de cette phase n'est lue par `loadProjectAccess` ; une phase qui voudrait accorder un droit de
  projet par un groupe ou un mandat doit le faire par une affectation explicite, auditée, revalidée (concept partie 5).

---

## 4. Décisions d'implémentation et écarts déclarés

1. **Mandat sans droit de projet.** Le mandat identifie le représentant et les responsabilités reprises ; l'accès du
   représentant reste une participation accordée par le projet (invitation de phase 3). Prudent et conforme à
   « membership ≠ participation » ; le concept dit « inherits assigned responsibilities », pas des permissions.
2. **Application d'un gabarit = fiches « contact »** pour les personnes choisies (membres actifs), avec rôle métier,
   responsabilités et partie représentée ; les **rôles proposés ne sont jamais accordés** (affichés « à accorder
   explicitement »). Une participation existante n'est jamais modifiée ; une version s'applique une fois par projet.
3. **Qui applique un gabarit / enregistre l'organisation comme partie / déclare la partie propriétaire** : administrateur
   de l'organisation **et propriétaire** du projet (règle actuelle de gestion des participants, PLAN phase 2 tâche 2) —
   pas les « responsables » au sens de `project-responsables.ts`, réservés aux lectures (OP-D9, OP-D13). Les autres cas
   passent par l'annuaire du projet (phase 2). Retirer la déclaration : propriétaire du projet seul.
4. **Partie propriétaire (OP-D1 a)** : visible et modifiable dans l'onglet Projets de l'organisation seulement ; l'écran du
   projet (phase 2, autre worktree) ne l'affiche pas encore. La personne propriétaire reste le gardien.
5. **Droits de projet par un groupe** (concept : « where a project explicitly grants rights through a group ») : **non
   livrés** — aucun moteur d'affectation par groupe ; un groupe n'ouvre rien, c'est dit à chaque action.
6. **Administration déléguée** : un seul rôle d'administrateur d'organisation ; la limitation à des fonctions
   administratives précises (« assigned organizational functions ») n'est pas livrée.
7. **Vue transversale** : projets, parties, représentants ; noms masqués sans accès. Charges, tâches et « work » associés aux
   membres : non livrés (aucun modèle d'affectation de travail général, hors priorité du plan).
8. **Organisations de la phase 1** créées comme contacts depuis un projet : sans membre, elles n'ont pas d'espace (404 pour
   tous) ; aucune revendication d'une fiche existante n'est livrée (risque de fusion par ressemblance, interdit).
9. **Adhésion suspendue** : aucune opération d'organisation ; mandats conservés, mais un mandat ne peut pas être accepté.
10. **Départ** : participations de projet inchangées (« à revoir » par chaque projet), mandats terminés, groupes quittés.
11. **Organisation suspendue** : aucune grâce dérivée n'existant, rien à désactiver ; toutes les écritures refusées sauf
    réactivation et clôture ; invitations en attente refusées à l'acceptation (invitant revalidé). **Clôture** :
    confirmation par le nom, invitations annulées, partie propriétaire conservée (décision de continuité explicite).
12. **Commandes et règle d'or** : l'écran n'entre dans aucun registre de commandes soumis à la règle d'or (Planche,
    commandes de collaboration) ; seule l'entrée de la barre latérale y est soumise (icône propre, testée). Aucun
    raccourci clavier propre n'est livré pour les actions de l'écran (déclaré).
13. **Fusion avec les autres phases** : la contrainte `invitations_purpose_check` et l'index `invitations_pending_unique`
    sont remplacés une fois (détection par définition) ; la phase 4 (`review_package`) devra fusionner la **liste des
    finalités** dans un seul remplacement. `activateInvitation` / `inviterStillAuthorized` : branches d'une ligne en tête.
14. **Dates** : `today()` côté API est la date UTC ; `current_date` côté SQL suit le fuseau du serveur (écart de quelques
    heures possible sur une date de fin).

---

## 5. Preuves (2026-10-24, poste local, PostgreSQL 16 + PostGIS, base jetable `fadi_p5`, API construite sur le port 3031)

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` deux fois (base neuve) | vert, idempotent |
| `scripts/validation/organisations-migration-check.mjs` | ✅ 41/41 (sections D-7 `fadi_app` comprises) |
| `participations-migration-check.mjs`, `users-migration-check.mjs` | ✅ verts (aucune régression) |
| `npm run typecheck` | ✅ |
| Tests purs + web (`npm run test` des paquets et de `@fadi/web`) | ✅ (web : 123 fichiers, 966 tests ; `AppShell-icones` compris) |
| Tests API (`vitest run` + `check-api-tests-db3.mjs`) | ✅ 34 suites, 507 tests ; 13 suites DB-3 refusées par la garde seule (dont `organizations.test.ts`), contrôle vert |
| `node --test scripts/check-api-tests-db3.test.mjs` | ✅ |
| `npm run build` | ✅ |
| `apps/web/e2e/organisations.mjs` | ✅ 112/112, deux fois : lien rendu par l'API (transport désactivé) et courriels en file (transport console, `MAIL_LOG`), base lue en `fadi_app` |
| `apps/web/e2e/interface-anglais.mjs` (écran `/organisations` ajouté) | ✅ vert, aucun résidu dans l'espace d'organisation |
| `apps/web/e2e/comptes-api.mjs` (non-régression des invitations) | ✅ 109/109 (`MAIL_DAILY_LIMIT=3000` comme en CI) |
| `apps/web/e2e/comptes-admin.mjs` (page d'invitation, administration) | ✅ 82/82 (limites de courriels de la CI ; API relancée : la limite `/auth` de 500 / 15 min était épuisée par les recettes précédentes) |

**Non exécuté localement** : la suite DB-3 `organizations.test.ts` (aucune base attestée, garde fermée — elle tourne en
CI avec la clé) ; les recettes avec Mailpit (CI) — localement, les courriels passent par le transport console.

Note d'environnement : le mot de passe local du rôle `fadi_app` a été posé à la valeur de la CI
(`fadi_app_ci_password`) sur le serveur PostgreSQL partagé du poste, pour lancer l'API en `fadi_app`.

## 6. Limites et suite

- Acceptation du maître d'ouvrage (🛑 final, phase 6) ; listes métier (types d'organisation, fonctions) à fournir (OP-D4).
- Affichage de la partie propriétaire dans l'écran du projet, et invitation de projet du représentant mandaté depuis
  l'annuaire du projet : à raccorder après fusion des phases 2 et 3.
- Droits par groupe, administration déléguée fine, vue de charge : sur besoin observé (concept partie 5, dernier alinéa).
