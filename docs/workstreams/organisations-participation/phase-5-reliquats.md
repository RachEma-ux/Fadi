# Phase 5 — reliquats : compte rendu

Chantier organisations-participation, [Issue #262](https://github.com/RachEma-ux/Fadi/issues/262). Reliquats listés au
§ 6 de [`phase-5.md`](phase-5.md). Décision appliquée : **OP-D1 (a)** — organisation propriétaire facultative, la personne
propriétaire reste le gardien du projet. Concept normatif : [`concept.md`](../users-management/concept.md), partie 5.
Statut : **Implémenté**, **vérifié localement** (preuves ci-dessous) ; CI et acceptation : à relever.

---

## Partie propriétaire côté projet

### 1. Livré

Avant : `projects.organization_id` était déclaré depuis l'espace d'organisation (`PUT /organizations/:orgId/projects/:pid/owner`)
mais n'apparaissait nulle part dans l'écran du projet.

**API (lecture seule, tout lecteur du projet, accès support compris)**

| Route | Ajout |
| --- | --- |
| `GET /projects/:projectId` | `owningOrganization: { id, name, kind, status, youAreMember } \| null` — en-tête du projet |
| `GET /projects/:projectId/participants` | `organizations: ProjectOrganizationsView` (ci-dessous) — Collaboration > Équipe et participants |

```ts
interface ProjectOrganizationsView {
  owner: null | { id; name; kind; status; youAreMember: boolean; isParty: boolean };  // partie propriétaire déclarée
  ownerPerson: { userId: string | null; name: string | null };                          // le droit reste à ce compte
  ownerGrantsAccess: false;                                                             // toujours : aucun droit
  parties: { id; name; kind; status; participationId; participationStatus; businessRole; responsibilities; startsOn;
             youAreMember; representatives: { mandateId; name; responsibilities; startsOn }[] }[];
}
```

- **Parties** : participations d'organisation non terminées du projet ; **représentants** : mandats `actif` (acceptés par
  le représentant) de cette participation — une proposition en attente, refusée, annulée ou terminée n'est pas listée.
- **Données exposées** : identité de l'organisation (`id`, `name`, `kind`, `status`) — jamais `details` (coordonnées,
  réservées à l'espace d'organisation) ; **nom d'affichage** du représentant (compte, sinon fiche) — jamais son adresse ;
  nom de la personne propriétaire (compte, sinon fiche). Conforme à la phase 2 (OP-D9 : coordonnées aux seuls
  responsables) : aucune coordonnée n'est ajoutée, même pour les responsables.
- **Statut** : une organisation `suspendue` ou `close` est rendue avec son statut, jamais masquée (la clôture termine les
  mandats : la partie reste listée, sans représentant).
- `youAreMember` : adhésion **non terminée** du lecteur → l'interface renvoie vers `/organisations/:id` ; sinon nom seul.
- Contrats : `apps/api/src/lib/project-organizations.ts` (`projectOrganizations(projectId, viewerId)`,
  `owningOrganizationOf(organizationId, viewerId?)`) ; mise en forme pure `apps/api/src/lib/project-organizations-view.ts`
  (`shapeProjectOrganizations`, types `ProjectOrganizationsView`, `OrganizationPartyView`, `RepresentativeView`).

**Interface**

- En-tête des modules du projet (`ProjectShell.tsx`) : « Partie propriétaire : <organisation> » (lien vers l'espace pour un membre,
  nom seul sinon ; « (suspendue) » / « (close) » ajouté), avec une infobulle rappelant que les droits restent au compte
  propriétaire. Absent quand rien n'est déclaré.
- Collaboration > Équipe et participants : carte « Organisations du projet » (`OrganisationsProjet.tsx`, insérée par une
  ligne dans `Participants.tsx`) — « Partie propriétaire » (ou « Aucune organisation déclarée »), « Personne
  propriétaire », phrase « Les droits du projet restent au compte de la personne propriétaire : déclarer une partie
  propriétaire ne donne ni accès ni rôle… », liste « Organisations parties » (statut, rôle métier, responsabilités,
  marque « partie propriétaire », « Représentants mandatés » ou « aucun mandat en cours »).
- `en.json` : 15 clés ajoutées en un bloc (fin du fichier) ; « Active », « Suspendue », « Close », « Partie propriétaire »
  existaient déjà. Styles : bloc `.projet-organisations*` et `.project-owner-org` dans `style.css`.

**Aucun droit changé** : aucune écriture ajoutée ; `loadProjectAccess` et `project_effective_access` ne lisent toujours
aucune table d'organisation. Aucune migration (aucun changement de schéma).

### 2. Fichiers

- `apps/api/src/lib/project-organizations.ts`, `project-organizations-view.ts`, `project-organizations-view.test.ts` (nouveaux)
- `apps/api/src/routes/participants.ts`, `apps/api/src/routes/projects.ts` (une ligne chacun + import)
- `apps/api/src/routes/organizations.test.ts` (DB-3 : nouveau cas, suite déjà listée dans `DB3_PENDING_SUITES`)
- `apps/web/src/modules/collaboration/OrganisationsProjet.tsx` (nouveau), `Participants.tsx`, `participants-api.ts`
- `apps/web/src/routes/ProjectShell.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/style.css`, `apps/web/src/lib/i18n/en.json`
- `apps/web/e2e/organisations.mjs` (section « Côté projet », 27 contrôles ; déjà au job e2e de la CI, aucun changement de `ci.yml`)

### 3. Décisions d'implémentation et écarts

1. **Lecture pour tout lecteur** (accès support compris : la route existante l'admet en lecture seule) ; l'identité d'une
   organisation et le nom des représentants ne sont pas des coordonnées. Choix prudent : **aucune** coordonnée
   d'organisation (`details`) n'est rendue côté projet, même aux responsables.
2. **Renvoi vers l'espace** seulement pour une adhésion non terminée (un ancien membre voit le nom seul ; son espace ne lui
   montrerait qu'un résumé).
3. **Parties terminées** : non listées dans la carte (elles restent dans l'annuaire Participants, historique). Une
   organisation close garde sa participation (phase 5) : elle est listée avec « Close ».
4. **Personne propriétaire** : nom d'affichage du compte, sinon de sa fiche, sinon le nom du participant propriétaire de
   l'annuaire ; jamais l'adresse dans cette carte (l'adresse du propriétaire reste affichée là où elle l'était déjà,
   carte « Accès » de Collaboration, inchangée).
5. **Règle d'or** : la carte et l'en-tête n'ajoutent **aucune commande** (lecture seule ; la déclaration reste dans
   l'espace d'organisation, onglet Projets) — rien à inscrire dans `commandes-collaboration.ts`.
6. Aucun bouton « déclarer / retirer » côté projet : hors de la mission (affichage), et la déclaration exige déjà
   d'être administrateur de l'organisation **et** propriétaire du projet (phase 5, décision 3).

### 4. Preuves (2026-10-24, poste local, PostgreSQL 16 + PostGIS, base jetable `fadi_orgproj`, API construite sur le port 3071, connectée en `fadi_app`)

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` deux fois | « Schema applied » deux fois (aucun changement de schéma) |
| `organisations-migration-check.mjs` sur base neuve (`fadi_orgproj_val`) | ✅ vérifié. Sur `fadi_orgproj` après les recettes : 2 ✗ attendus (le script compte les `project_members` de toute la base et exige une base sans données de recette) |
| `participations-migration-check.mjs`, `users-migration-check.mjs` | ✅ |
| `npm run typecheck` | ✅ |
| Tests purs API (`vitest run`, rapport JSON) | ✅ 569 tests (dont 3 nouveaux, `project-organizations-view.test.ts`) ; 14 suites DB-3 refusées par la garde seule ; `check-api-tests-db3.mjs` ✅ |
| Tests web | ✅ 127 fichiers, 988 tests |
| Tests des paquets (géométrie, domaine, atelier, planche, sandbox, noyau exact) | ✅ |
| `npm run build` | ✅ |
| `apps/web/e2e/organisations.mjs` | ✅ 139/139 (112 existants + 27 « côté projet » : API, accès et rôles comparés en base avant / après déclaration, aucune coordonnée, organisation close affichée, renvoi membre / nom seul, en-tête, axe-core bureau et téléphone, carte sans débordement, aucun défilement horizontal, passe anglaise) |
| `apps/web/e2e/participants.mjs` | ✅ 92/92 (non-régression) |
| `apps/web/e2e/interface-anglais.mjs` | ✅ vert, aucun résidu lié aux organisations |

**Non exécuté localement** : le nouveau cas DB-3 de `organizations.test.ts` (« déclarer la partie propriétaire ne change
ni l'accès ni les rôles… » : instantanés de `project_effective_access`, `project_role_assignments`, `project_members`
avant / après, lecteur sans coordonnées, organisation close) — garde DB-3 fermée hors CI ; les mêmes propriétés sont
vérifiées par la recette sur l'API réelle. Courriels : transport désactivé (liens rendus par l'API), pas de Mailpit.

### 5. Limites

- Pas d'invitation de projet du représentant mandaté depuis l'annuaire du projet (dépend de la phase 3, autre worktree).
- L'accueil du projet (tableau de bord `DossierDashboard`, sans en-tête de projet) n'affiche pas la partie propriétaire :
  elle figure dans l'en-tête des modules du projet et dans Collaboration > Équipe et participants (mission : « et/ou »).
