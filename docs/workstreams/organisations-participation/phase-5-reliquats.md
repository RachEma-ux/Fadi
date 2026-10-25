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

- ~~Pas d'invitation de projet du représentant mandaté depuis l'annuaire du projet~~ : livré, section suivante.
- L'accueil du projet (tableau de bord `DossierDashboard`, sans en-tête de projet) n'affiche pas la partie propriétaire :
  elle figure dans l'en-tête des modules du projet et dans Collaboration > Équipe et participants (mission : « et/ou »).

---

## Représentant mandaté → invitation de projet

Statut : **Implémenté**, **vérifié localement** (preuves § 4) ; DB-3 et CI : à relever ; non accepté.

### 1. Livré

Règle conservée : **un mandat ne donne aucun droit**. Il désigne la personne à inviter ; l'accès naît seulement de
l'acceptation, par l'identité visée, d'une invitation de projet ordinaire (parcours de la phase 3).

**API** (`apps/api/src/routes/members.ts`, propriétaire seulement — 403 avec motif sinon, 404 sans accès)

| Route | Effet |
| --- | --- |
| `POST /projects/:pid/members/mandates/:mandateId/preview` `{ role \| roles, accessExpiresAt?, invitationDays? }` | aperçu de la phase 3 (accès résultant, rôles par portée, échéances, invitation déjà en attente) ; `email: null` (adresse jamais montrée), `representative: { mandateId, name, organization }` ; rien n'est écrit |
| `POST /projects/:pid/members/mandates/:mandateId` (même corps) | 202 : invitation `project_participation` envoyée à l'adresse **du compte** du représentant (jamais saisie), portant `mandate_id` ; courriel et notification calculée habituels |

Refus (règle pure `mandateInvitationRefusal`, motif lisible dans `message`) : 404 `not_found` (mandat hors de ce projet) ;
409 `mandate_inactive` (proposé, refusé, annulé, terminé), `organization_not_party`, `organization_inactive`,
`membership_inactive`, `representative_without_account`, `already_participant`, `participation_suspended`,
`represents_other_organization` ; 422 `representative_is_owner`.

**Acceptation** (`lib/project-invitations-db.ts`) : revalidation — le mandat doit être encore `actif` et son organisation
partie au projet et active, sinon refus **`mandate_ended`** (409, nouveau `ParticipationRefusal`, par le lien comme par la
notification). L'activation pose `represented_organization_id` = l'organisation du mandat (sans écraser une autre partie
déjà enregistrée) et journalise **`participation.representation_recorded`** (nouvelle action ; libellé web + en.json).
`invitation.created` / `resent` portent `mandateId`, `representedOrganizationId`, `via: "mandat"` (aucune adresse).

**Annuaire du projet** (`GET /projects/:pid/participants`, `organizations.parties[]`) :
- `representatives[].projectSide` (propriétaire seul, `null` pour les autres lecteurs) : `non_invite` /
  `invitation_en_attente` / `participation_active` / `terminee` ; `invitable` (propriétaire, pas de participation active
  avec accès, organisation active, représentant ≠ propriétaire) ;
- `endedRepresentatives[]` (tout lecteur, nom seul) : participations en cours qui représentent l'organisation, dont la
  personne a eu un mandat de ce projet maintenant terminé et n'en a plus d'actif — `{ participationId, mandateId, name,
  endsOn, endReason }`. La participation **n'est jamais terminée d'office**.

**Espace d'organisation** (`GET /organizations/:orgId/projects`) : chaque mandat porte `projectSide` (administrateurs
seuls, `null` pour un membre), en lecture seule.

**Notification calculée** (`GET /notifications`, type `acces`, champ `mandate: { mandateId, participationId }`) : au
propriétaire du projet, pour un mandat terminé depuis 30 jours (fin, renonciation, remplacement, départ, clôture) dont
le représentant garde une participation qui représente l'organisation ; elle disparaît si un nouveau mandat actif le
reprend ou si la participation est terminée. Lien : Collaboration, carte « Organisations du projet ».

**Interface**
- Carte « Organisations du projet » (`OrganisationsProjet.tsx`) : état côté projet de chaque représentant (propriétaire),
  volet de divulgation natif « Inviter au projet » / « Renvoyer l'invitation au projet » contenant **le formulaire de la
  phase 3** (`InvitationProjet` en mode `representative` : ni adresse, ni fiche, ni nom ; « Partie représentée » dans
  l'aperçu) ; liste « Mandats terminés, participation conservée » avec date et motif.
- Annuaire (`Participants.tsx`) : pastille « mandat terminé » sur la ligne du participant.
- Invitations en attente (`CollaborationModule.tsx`), invitations reçues (`InvitationsRecues.tsx`), page d'invitation
  (`ComptePages.tsx`) : « représentant de », « En tant que représentant de », « Partie représentée ».
- Espace d'organisation, onglet Projets : pastille « Côté projet : … ».
- `en.json` : 45 clés (un bloc, fin du fichier) ; styles `.projet-organisations-inviter`.

**Règle d'or** : aucune commande nouvelle. Toutes les touches Ctrl+Alt+Maj hors lettres sont prises (chiffres et
`` ` - = [ ] \ ; ' , . / `` dans `commandes-collaboration.ts` et `commandes-revue.ts`) ; l'invitation du représentant
réutilise donc la commande « Aperçu de l'accès » (icône, barre `membres`, Ctrl+Alt+Maj+') et l'envoi du formulaire
d'invitation existant. L'ouverture du volet est un `<details>` natif (divulgation, pas une commande).

**Base** (`init.sql`, bloc additif rejouable après le bloc de la phase 3 ; `schema.ts`) : `auth.invitations.mandate_id`
(FK `organization_mandates`, `ON DELETE SET NULL`), contrainte `invitations_mandate_check` (finalité
`project_participation` seule), index partiel `invitations_mandate_idx`. Droits `fadi_app` : bloc D-7 existant.

### 2. Fichiers

- Nouveaux : `apps/api/src/lib/mandate-invitations.ts` (pur), `mandate-invitations.test.ts`, `mandate-invitations-db.ts`.
- API : `db/init.sql`, `db/schema.ts`, `lib/audit.ts`, `lib/invitations.ts`, `lib/project-invitations-db.ts`,
  `lib/project-organizations.ts`, `lib/project-organizations-view.ts` (+ test), `lib/security/invitation-rules.ts`,
  `routes/auth.ts`, `routes/members.ts`, `routes/notifications.ts`, `routes/organizations.ts`, `routes/organizations.test.ts`.
- Web : `lib/api.ts`, `lib/i18n/en.json`, `lib/journal-activite.ts`, `components/NotificationBell.tsx`,
  `modules/collaboration/{CollaborationModule,InvitationProjet,InvitationsRecues,OrganisationsProjet,Participants}.tsx`,
  `participants-api.ts`, `routes/ComptePages.tsx`, `routes/organisations/OrganisationsPage.tsx`, `style.css`.
- Recette : `apps/web/e2e/organisations.mjs` (section « Représentant mandaté », déjà au job e2e — `ci.yml` inchangé) ;
  validation : `scripts/validation/organisations-migration-check.mjs` (3 contrôles `mandate_id`).

### 3. Décisions d'implémentation et écarts

1. **Adresse jamais montrée** au propriétaire avant l'envoi (l'annuaire de l'organisation la réserve à ses
   administrateurs) : la route la tire du compte du représentant. Après l'envoi, l'invitation en attente apparaît dans la
   liste du propriétaire avec son adresse, comme toute invitation (règle existante de la phase 3), et l'adresse d'un
   membre accepté reste listée comme pour tout membre — déclaré.
2. **Mandat revalidé à l'acceptation** (`mandate_ended`) : prudent, l'invitation n'a été envoyée qu'en raison du mandat.
   Une invitation ordinaire (par adresse) du même compte renouvelle l'invitation en attente **sans** mandat (choix
   explicite du propriétaire).
3. **« Participation active »** côté projet = participation `active` **avec accès** (vue `project_effective_access`) ; une
   participation active sans rôle de projet (revue externe) reste « non invité » et peut être invitée.
4. **Partie représentée** posée à l'acceptation seulement, jamais sur la fiche contact créée à l'envoi ; une fiche qui
   représente déjà une autre organisation bloque l'envoi (409) au lieu d'être écrasée.
5. **Marque « mandat terminé »** : aussi pour une fiche **contact** (sans accès) qui représente l'organisation (fiche
   posée par un gabarit, par exemple) — information seule, aucune action automatique. La notification ne vise que le
   propriétaire du projet (pas tous les responsables : choix prudent, c'est lui qui gère les participations).
6. **Type de notification** : `acces` existant (aucun nouveau type : préférences et recettes « dix types » inchangées).
7. **Organisation suspendue** : envoi refusé (`organization_inactive`) ; l'acceptation exige aussi une organisation active.

### 4. Preuves (2026-10-25, poste local, PostgreSQL 16 + PostGIS, base `fadi_mandat`, API construite sur le port 3081 en `fadi_app`, transport console)

Après fusion de `ccr-3b26a9f6-z073dc` (76e03e2, phase 6) :

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` ×2 (`fadi_mandat`, base neuve `fadi_mandat_val`) | « Schema applied » à chaque fois |
| `organisations-` (44, dont 3 nouveaux), `participations-` (63), `users-` (31), `revues-migration-check.mjs` (39), base neuve | ✅ |
| `npm run typecheck` | ✅ |
| `npm test` | vert hors DB-3 : API 599 tests, 15 suites refusées par la garde seule, `check-api-tests-db3.mjs` ✓ ; web 127 fichiers / 988 tests ; paquets verts. Nouveaux : `mandate-invitations.test.ts` (6), `project-organizations-view.test.ts` (+1) |
| `npm run build` | ✅ |
| `organisations.mjs` | ✅ 182/182 (139 + 43 nouveaux : 403 / 404 / 409 avec motif, aperçu sans adresse, volet du formulaire au raccourci, envoi, aucun accès avant acceptation, états côté projet (projet et organisation, administrateur seul), page d'invitation « Partie représentée », acceptation, `represented_organization_id`, seconde invitation refusée, remplacement → « mandat terminé » et notification au propriétaire seul, journal sans adresse, axe-core bureau ×3 et téléphone, carte sans débordement, passe anglaise) |
| `organisations-participation-final.mjs` | ✅ 155/155 |
| `invitations-participation.mjs` 107 ✓, `participants.mjs` 92 ✓, `notifications-preferences.mjs` 32 ✓, `journal-activite.mjs` 50 ✓, `interface-anglais.mjs` 7 ✓ | ✅ |

**Non exécuté localement** : les deux nouveaux cas DB-3 de `organizations.test.ts` (garde fermée hors CI ; mêmes
propriétés vérifiées par la recette sur l'API réelle) ; Mailpit (CI). CI GitHub : rien n'est poussé.

### 5. Limites

- Pas d'invitation groupée de plusieurs représentants ; pas de notification aux représentants eux-mêmes à la fin d'un
  mandat (leur espace d'organisation le montre déjà).
- La notification couvre 30 jours (fenêtre commune des notifications) ; au-delà, seule la marque de l'annuaire reste.
