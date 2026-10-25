# Phase 3 — Invitations acceptées liées à une participation : compte rendu

> Issue #262, [PLAN.md](PLAN.md) phase 3 (tâches 1 à 5). Décision appliquée : **OP-D2 (a)** — invitation acceptée pour
> tous, **fin de l'ajout direct d'un compte existant** (UM-8), notification dans l'application en plus du courriel.
> Concept normatif : `docs/workstreams/users-management/concept.md` (partie 3, v2.2 « An invitation is a proposal, not a
> grant »). Base : `ccr-3b26a9f6-z073dc` (phases 1, 2, 3 bis, 5, Communication, phase 4, reliquats de la phase 5 et
> portées étroites), fusionnée à chaque avancée jusqu'à `d6bb1cb`.
> État : **Implémenté**, vérifié localement (preuves § 5) ; DB-3 et CI **non exécutés** ici ; non accepté.

## 1. Livré

| Tâche | Réalisation |
| --- | --- |
| 1. Invitation liée à une participation | `auth.invitations.participation_id` et `proposed_roles` (additifs). L'envoi trouve la participation visée — fiche choisie dans l'annuaire, participation en cours du compte de l'adresse, contact du projet portant cette adresse professionnelle — ou **crée la fiche** (`contact`, sans droit) : la personne du compte pour un compte existant, un contact sans compte (nom saisi, sinon l'adresse) sinon. Rôles **par portée** (au moins un de portée projet ; Lecteur / Concepteur de base, Relecteur, Coordinateur, Approbateur, Diffuseur en complément ; portées étroites enregistrées sans droit, comme en phase 2). Échéance d'invitation (1 à 30 j, 7 par défaut) et **échéance d'accès** indépendantes. |
| 1 bis. Échéance d'accès appliquée | `project_participations.access_expires_at` (additif), recopiée de l'invitation à l'acceptation ; la vue `project_effective_access` exclut une participation dont l'échéance est passée (`deriveAccess` aussi : même règle, test pur). Le propriétaire la prolonge ou la retire (`PATCH /members/:userId { accessExpiresAt }`). La liste des membres affiche « accès jusqu'au … » / « accès expiré le … ». |
| 2. Aperçu | `POST /projects/:id/members/preview` (propriétaire) : fiche visée, compte existant ou non, **invitation déjà en attente (elle sera renvoyée, jamais un doublon)**, rôles proposés, accès résultant (rôle, export, approbation, diffusion — même règle que la vue), portées sans droit, échéances, remarques, motif bloquant. Rien n'est écrit. L'interface n'active « Envoyer l'invitation » qu'après un aperçu des valeurs saisies ; les invitations en attente sont affichées **avant** le formulaire. |
| 3. Acceptation | Liaison du compte vérifié à la fiche visée (contact sans compte lié au compte s'il n'a pas encore de personne ; sinon la participation rejoint la personne du compte ; s'il en a déjà une en cours dans le projet, celle-ci est gardée et la fiche de l'invitation close « remplacée »). Revalidation : refus communs (expirée, annulée, déclinée, déjà acceptée, lien transféré = `wrong_account`, invitant plus habilité, compte inactif) **plus** `wrong_person` (fiche liée à un autre compte), `participation_unavailable` (suspendue / terminée depuis l'envoi), `access_expired`, `roles_invalid`. Activation idempotente (participation `active`, rôle de base par le pont, rôles complémentaires `attribution` attribués par l'invitant, `ON CONFLICT DO NOTHING`) ; reprise après interruption : transaction unique ; double soumission (séquentielle ou simultanée, verrou `FOR UPDATE`) : même résultat, `replay: true`, aucun nouvel effet. |
| 4. Comptes existants | `POST /projects/:id/members` ne fait plus jamais d'ajout direct : **202** (invitation) pour toute adresse, **200** seulement pour un compte **déjà membre** (changement de rôle, seule écriture directe qui reste avec le transfert de propriété). Notification calculée « invitation en attente » (type `acces`, champ `invitation`) pour le compte visé ; liste et acceptation depuis l'application : `GET /notifications/invitations`, `POST /notifications/invitations/:id/accept|decline`. |
| 5. Bon espace | L'acceptation rend `projectId`, `participationId` et `pendingWork` (observations Studio dont le compte est responsable, tâches à faire) ; le web entre dans le projet avec un message (« Travail en attente : … »). Phase 4 : une invitation `review_package` mène toujours à `/revues/:id`. |
| 6. Journal | `invitation.created / resent / accepted / declined / cancelled / refused` (métadonnées : rôles proposés, échéances, participation, sans adresse) ; `participation.created` (fiche à l'envoi), `participation.linked` (fiche liée au compte), `participation.activated`, `participation.role_assigned` (via invitation), `participation.access_expiry_changed`, `person.contact_created` ; `project.member.added` (voie `invitation`) écrit **à l'acceptation, par le compte qui accepte**. Libellés web + `en.json`. |
| 6 bis. Règle d'or | Trois commandes nouvelles, chacune son icône, sa barre et son raccourci (Ctrl+Alt+Maj, seules touches restées libres après Participants, Communication et la revue externe) : **Aperçu de l'accès** Ctrl+Alt+Maj+' (formulaire d'invitation), **Accepter l'invitation** Ctrl+Alt+Maj+\ et **Décliner** Ctrl+Alt+Maj+` (carte d'une invitation reçue). Test `commandes-collaboration.test.ts`. |

### Interface (`apps/web`)

- `modules/collaboration/InvitationProjet.tsx` : formulaire (adresse, rôle Lecteur / Concepteur, rôles complémentaires,
  fiche de l'annuaire facultative, nom d'une fiche nouvelle, validité de l'invitation, accès jusqu'au), **aperçu**, envoi.
- `CollaborationModule.tsx` (MembersPanel) : invitations en attente avant le formulaire, état distinct
  « En attente d'acceptation » / « En attente de création du compte » (`data-invitation-etat`), rôles et échéances ;
  échéance d'accès des membres.
- `modules/collaboration/InvitationsRecues.tsx`, monté dans **Mes projets** (`#invitations-recues`) ; la notification
  y mène. Accepter / décliner, message d'entrée dans le projet. Adresse non vérifiée : boutons inactifs et explication.
- `routes/ComptePages.tsx` (page d'invitation existante) : rôles par portée, échéance d'accès, entrée dans le projet avec
  le travail en attente.
- Styles : `style.css` (bloc « Invitations acceptées ») — formulaire et carte sans débordement à 390 px.

## 2. Contrats publics (pour les autres phases)

| Élément | Contrat |
| --- | --- |
| `POST /projects/:id/members` | corps `{ email, role? \| roles?: [{ role, scopeType?, scopeId? }], participationId?, displayName?, accessExpiresAt?, invitationDays? }` ; 202 `{ invitation, resent, accountExists, participationId, mail }` ; 200 membre existant (rôle changé) ; 400 / 404 / 409 `invitation_rule` / 422 |
| `POST /projects/:id/members/preview` | même corps → `{ preview: InvitationPreview }` (aucune écriture) |
| `PATCH /projects/:id/members/:userId` | `{ role?, canExport?, accessExpiresAt? }` (null = sans échéance) |
| `GET /projects/:id/members` | membres + `accessExpiresAt`, `accessExpired` ; invitations (propriétaire) + `roles`, `participationId`, `awaiting` |
| `GET /notifications/invitations` | `{ invitations: ReceivedInvitation[], emailVerified }` |
| `POST /notifications/invitations/:id/accept` | `{ accepted, projectId, participationId, pendingWork, replay }` ; 403 `email_unverified` / `wrong_person` ; 404 autre adresse ; 409 sinon |
| `POST /notifications/invitations/:id/decline` | `{ declined: true }` ; 403 `email_unverified` ; 404 |
| `POST /auth/invitations/accept` | réponse + `pendingWork` (projet) |
| `lib/project-invitations.ts` (pur) | `proposedRolesFrom`, `proposedRolesValid`, `projectRoleFor`, `rolesToAttribute`, `resultingAccess`, `invitationExpiry`, `parseAccessExpiry`, `targetRefusal`, `previewWarnings` |
| `lib/project-invitations-db.ts` | `resolveInvitationTarget`, `previewProjectInvitation`, `createProjectInvitation`, `projectParticipationRefusal`, `activateProjectParticipation`, `pendingProjectInvitationsFor`, `acceptInvitationById`, `declineInvitationById`, `pendingWorkFor`, `rolesOf` |
| `lib/security/invitation-rules.ts` | `participationRefusal` ; refus `wrong_person`, `participation_unavailable`, `access_expired`, `roles_invalid`, `email_unverified` (à côté de `identity_conflict`, phase 4) |
| Schéma | `auth.invitations.participation_id`, `proposed_roles` (+ contraintes `invitations_participation_check`, `invitations_proposed_roles_check`, index) ; `project_participations.access_expires_at` ; vue `project_effective_access` (échéance) |
| Tests | `apps/api/src/test-helpers/partage.ts` : `partager(agent, pid, email, role)` (invitation + acceptation par la logique serveur, forme de l'ancien 201), `accepterEnBase(invitationId)` ; recettes : `apps/web/e2e/lib-invitations.mjs` (`inviterEtAccepter`, `accepterInvitation`, `verifierAdresse`, `jetonDuCourriel`, `appelPlaywright`) |

## 3. Décisions d'implémentation (au plus prudent, à relire)

1. **Pont conservé** (`op_sync_access`, miroir `acces`) — évalué et **non retiré**. Raisons : (a) l'accès de base reste
   inscrit dans `project_members` par le partage, l'acceptation, le transfert, l'anonymisation (`account-jobs.ts`), la
   **restauration d'archive Studio** (le manifeste et `studio-archive.ts` portent la table `project_members`) et les
   scripts de migration / jeu synthétique ; (b) une quinzaine de suites DB-3 (Atelier, Studio, permissions, base simulée
   `studio-base-simulee.ts`) donnent l'accès en insérant `project_members`, et ne tournent qu'en CI — les réécrire sans
   pouvoir les exécuter ferait courir un risque de perte d'accès non vérifiable ; (c) `op_sync_access` termine une
   participation sans ligne de partage : retirer les déclencheurs exige de déplacer cette sémantique (départ, retrait,
   transfert) sur les participations dans le même lot. Aucune écriture de l'application n'**ajoute** plus un membre sans
   invitation acceptée ; la décision d'accès n'a toujours qu'une source (la vue). Retrait à faire dans un lot dédié,
   vérifié en CI (DB-3 + `studio-restauration.mjs`), en remplaçant `project_members` par une vue de compatibilité.
2. **Acceptation depuis la notification** : exige une **adresse vérifiée** (`email_unverified`, 403) — sans le lien du
   courriel, rien ne prouve que la personne connectée détient la boîte invitée (un compte non vérifié pourrait sinon
   « squatter » une adresse). Le lien du courriel, lui, vérifie l'adresse (comportement UM-3 inchangé). Le refus par
   identifiant suit la même règle.
3. **Fiche d'un compte existant** : la participation `contact` est créée à l'envoi sur la personne du compte (créée au
   besoin, comme le miroir) ; elle ne donne rien avant l'acceptation. Une adresse sans compte reçoit un contact sans
   compte, jamais rapproché d'une fiche d'un autre projet (aucune fusion, phase 2).
4. **Membre existant** : `POST /members` change son rôle de partage directement (200), sans invitation ; les rôles
   complémentaires se gèrent dans « Équipe et participants ». Un compte déjà membre qui accepte une invitation garde le
   rôle le plus large et son échéance d'accès.
5. **Participation active sans rôle de projet** (revue externe, phase 4) : reste sans accès ; une invitation de projet la
   vise, et seule son acceptation pose un rôle de projet (arrivée journalisée, échéance recopiée).
6. **Portées étroites** (reliquat de la phase 2 fusionné : `porteeInconnue`, `porteeAllows`) : proposées par l'API,
   l'élément désigné doit exister dans le projet — refus 422 `scope_rule` à l'envoi, motif bloquant dans l'aperçu ; elles ne
   valent que pour l'élément désigné, jamais pour le projet entier (l'aperçu le dit). Une invitation de projet exige au
   moins un rôle de portée projet. L'interface ne propose que la portée projet.
7. **Revalidation de la portée** : à l'acceptation, rôles et portées sont revalidés (règle pure + existence de l'élément
   désigné) ; un élément supprimé depuis l'envoi refuse l'acceptation (`roles_invalid`).
8. **Invitant habilité** : propriétaire actif du projet (règle existante) ; un transfert de propriété entre l'envoi et
   l'acceptation rend l'invitation inopérante (`inviter_not_authorized`).
9. **Suites DB-3** : les ajouts directs sont remplacés par `partager` (invitation par la route, acceptation par la logique
   du serveur, sans session ni boîte du destinataire) ; les attendus de journal qui supposaient l'ajout direct
   (« historique du projet », E3) sont mis à jour ; le partage lui-même est couvert par deux cas DB-3 nouveaux (HTTP).

## 4. Écarts au plan et au concept

- Plan, tâche 4 / brief « retirer le pont » : **non retiré** (décision 1).
- Concept « revalidation des restrictions » : il n'existe pas encore de restriction explicite modélisée (phase 2) ;
  seules la participation (statut), l'échéance d'accès et les rôles sont revalidés.
- Raccourcis : Ctrl+Alt+Maj+' \ ` (et non des chiffres) — les chiffres et `, . / ;` sont pris par la revue externe.
- Recette `communication.mjs`, `revue-externe.mjs`, `notifications-preferences.mjs` : ajustées (invitation acceptée ;
  dix types de notification depuis la phase 4).

## 5. Preuves (exécutées les 2026-10-24 et 25, base `fadi_p3`, API construite sur le port 3051, connectée en `fadi_app`)

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` ×2 (base neuve `fadi_p3v` et base `fadi_p3`) | « Schema applied » à chaque fois |
| `users-`, `participations-` (nouvelle section 7 : colonnes, contraintes, échéance appliquée par la vue, pont intact, rejeu), `organisations-`, `revues-migration-check.mjs` | ✅ sur base neuve |
| `npm run typecheck` | vert |
| `npm test` | vert hors suites DB-3 (14 refusées par la garde) ; `check-api-tests-db3.mjs` : « ✓ seules les suites de la liste DB-3 sont refusées » ; nouveau `project-invitations.test.ts` ; règle d'or ; web 127 fichiers |
| `migration-lib.test.mjs`, `simulation-studio.test.mjs`, `npm run test:scripts` | 27 / 5 / 18 pass |
| `npm run build` | vert |
| `invitations-participation.mjs` (nouvelle) | ✓ 107, 0 ✗ après la dernière fusion (portée étroite réelle, élément inconnu refusé) (API, refus v2.2, base à horloge simulée, navigateur, axe-core bureau et téléphone, passe anglaise) |
| `comptes-api.mjs` (section phase 3 ajoutée) | ✓ 119 avant la dernière fusion ; après : 118 ✓, 1 ✗ « journal : aucune adresse » dû à trois entrées écrites dans `fadi_p3` par une version antérieure de ma recette (séparateur `@` des rôles, corrigé en `/`), journal append-only donc non effaçable — non reproductible sur base neuve |
| `parcours-scenario.mjs` | « Scénario conforme » (339 ✓) ; deux exécutions précédentes avaient échoué sur la lecture hors-ligne de l'étape 02 (minutage, sans rapport) ; captures restaurées |
| `collaboration-audience` 45 ✓, `participants` 92 ✓, `journal-activite` 50 ✓, `interface-anglais` vert, `organisations` 139 ✓ (après la dernière fusion) ; `communication` 97 ✓, `notifications-preferences` 32 ✓, `interface-anglais` vert, `studio-publication` 129 ✓ (après fusion) ; `studio-observations` 71 ✓, `studio-persistance` 293 ✓, `studio-quantites` 29 ✓, `studio-dossier` 55 ✓, `studio-catalogue` 36 ✓, `studio-profils` 30 ✓, `studio-conflits` 27 ✓, `studio-espace` 44 ✓, `studio-navigation` 259 ✓, `studio-hors-ligne` 35 ✓ (2ᵉ essai), `atelier-automatisation` 18 ✓, `atelier-versions` 28 ✓, `comptes-securite` 73 ✓, `project-layout` 593/593, `comptes-admin` 82 ✓ (avant la dernière fusion) | verts |

## 6. Ce qui n'a pas tourné ou reste à surveiller

- **DB-3** (`app.test.ts` : partage par `partager`, deux cas nouveaux de la phase 3 ; `history`, `atelier-commands`,
  `atelier-automatisation-p2`) : garde fermée hors CI — non exécutés ; à vérifier en CI.
- **CI GitHub** : rien n'est poussé ; l'étape `invitations-participation.mjs` (tranche `complements`) n'a pas tourné en CI.
- `studio-restauration.mjs` et `studio-v1.mjs` (modifiés : invitation acceptée) : non lancés localement (seconde base et
  attestation requises).
- `revue-externe.mjs` (phase 4, seule la lectrice passe par l'invitation acceptée) : 131 ✓, 1 ✗ instable d'une exécution
  à l'autre sur un comptage d'interface immédiat (« liste des paquets », puis « panneau Revues externes ») — sans rapport
  avec la lectrice, à signaler à la phase 4.
- `comptes-admin.mjs` après la dernière fusion : la liste paginée de l'administration ne montre plus le compte recherché
  sur une base locale chargée de centaines de comptes de recette (vert auparavant ; environnement).
- Retrait du pont : lot à part (décision 1).
