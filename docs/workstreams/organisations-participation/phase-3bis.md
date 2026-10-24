# Phase 3 bis — Journal d'activité et historique : compte rendu

Issue #262, [PLAN.md](PLAN.md) phase 3 bis (tâches 1 à 4), lecteurs selon OP-D13 (a) (OP-1), exécution sans arrêt (OP-3).
Base de départ : `main` (`2577e25`) + `9e72c4a` (règle commune `lib/project-responsables.ts`, branche du chef de projet).
État : **Implémenté** et vérifié localement (preuves ci-dessous) ; DB-3 et CI **non exécutés** ici (voir « Ce qui n'a pas tourné »).

## Livré

| Tâche | Réalisation |
| --- | --- |
| 1. Administrateur | `GET /admin/audit` (lecture seule, `routes/admin/journal.ts`, monté dans `adminRouter` : 404 non-administrateur, 403 `mfa_required` / `mfa_session_required`, UM-18). Filtres `actor` (identifiant, ou adresse / nom recherchés dans `users`), `action` (exacte), `family` (préfixe), `targetType`, `targetId`, `from` / `to` (date ou date-heure ISO ; date seule = journée entière UTC), curseur `before`, `limit` 1–100 (50), tri récent d'abord. Écran `/admin/journal` (`routes/admin/AdminJournalPage.tsx`) avec navigation Utilisateurs / Journal d'activité (`AdminNav.tsx`, aussi sur `/admin/utilisateurs`). |
| 2. Utilisateur | `GET /auth/me/history` (voir écart 1) et section « Mon historique » de Mon compte (`routes/MonHistorique.tsx`, branchée dans `MonCompte.tsx`). |
| 3. Projet | `GET /projects/:projectId/journal` (`routes/project-journal.ts`) : 404 sans accès, 403 `{ error: "forbidden", motif: "responsable-requis" }` pour tout non-responsable (éditeur, lecteur, accès support), 200 pour `isProjectResponsible`. Filtre `family` (`project`, `invitation`, `comment`, `support`, `participation`, `person`, `review`), curseur `before`. Section « Historique » (`modules/collaboration/HistoriqueProjet.tsx`) branchée par **deux lignes** dans `CollaborationModule.tsx` (import + `<HistoriqueProjet />` après « Accès support ») ; absente (aucun rendu) sur 403 / 404. |
| 4. Règles | Règle d'audience pure `apps/api/src/lib/journal-audience.ts` (visibilité + projection) ; requêtes `apps/api/src/lib/journal.ts` qui restreignent en SQL **et** repassent chaque ligne par la règle pure (défense en profondeur). Journal inchangé, append-only ; aucune écriture, aucun nouveau droit. |

### Règle d'audience (contrat)

- **admin** : tout ; métadonnées scalaires complètes ; IP ; identité (adresse, nom) de l'acteur et des comptes cités, comme la fiche d'un compte de l'administration ; projet nommé (code, nom) sans lien (D-2).
- **utilisateur** : `actor_id = moi` OU (`target_type = 'user'` ET `target_id = moi`) OU (`support.*` sur un projet dont je suis **aujourd'hui** propriétaire). Acteur : « Vous », « Système », « Un administrateur de la plateforme » (sans nom), « Un autre compte » ; seul l'administrateur d'un accès support sur mon projet est nommé (déjà visible dans « Accès support »). Comptes cités nommés seulement pour mes propres gestes. Jamais d'IP. Projet nommé seulement s'il m'est encore ouvert (propriétaire ou membre).
- **projet** : action dans `PROJECT_ACTION_PREFIXES` (`project.member.`, `project.ownership.`, `invitation.`, `comment.audience_changed`, `support.`, `participation.`, `person.`, `review.`) ET rattachée au projet par la cible (`project` = ce projet), par `metadata.projectId`, ou par la cible `invitation` d'une invitation de ce projet (`auth.invitations.project_id` : couvre `invitation.declined` / `refused` et l'annulation par l'administration, qui ne portent pas `projectId`). Identité des comptes (responsables, OP-D9) ; chemin consulté d'un accès support ; jamais d'IP.
- Détails non administrateurs : liste blanche `SHARED_DETAIL_KEYS` (rôles, export, audience, durée, motif…) ; jamais `grantId`, `commentId`, `invitationId`, `variantId`, `emailHash`, `template`. Clés de compte (`memberId`, `adminId`, `fromOwnerId`, `toOwnerId`…) rendues en `subjects` résolus, jamais brutes.
- **Pour qu'une action d'une phase suivante apparaisse dans l'historique du projet sans changement de code** : la nommer `participation.*`, `person.*` ou `review.*` et lui donner la cible `{ type: "project", id }` ou `metadata.projectId`. Son libellé web retombe sur « Action non répertoriée : <code> » tant qu'il n'est pas ajouté à `ACTION_LABEL` (`apps/web/src/lib/journal-activite.ts`) et à `en.json` ; le test web l'exige pour toute autre famille.

## Fichiers

API : `src/lib/journal-audience.ts` (+ `.test.ts`, 7 tests), `src/lib/journal.ts`, `src/routes/admin/journal.ts`,
`src/routes/project-journal.ts` (nouveaux) ; `src/routes/admin/index.ts` (montage), `src/app.ts` (`/admin/audit` dans
l'aiguillage `/admin` et `API_PREFIX`), `src/routes/auth.ts` (`/me/history`), `src/routes/projects.ts` (montage),
`src/db/init.sql` (deux index additifs), `src/db/schema.ts` (commentaire), `src/app.test.ts` (bloc DB-3 « 7. journal
d'activité », 4 cas).
Web : `src/lib/journal-activite.ts` (+ `.test.ts`, 4 tests), `src/components/journal/TableJournal.tsx`,
`src/routes/admin/AdminJournalPage.tsx`, `src/routes/admin/AdminNav.tsx`, `src/routes/MonHistorique.tsx`,
`src/modules/collaboration/HistoriqueProjet.tsx` (nouveaux) ; `src/App.tsx` (route `/admin/journal`),
`src/routes/admin/AdminUsersPage.tsx` (export de `MfaRequired` / `MfaSessionRequired`, `<AdminNav />`),
`src/routes/MonCompte.tsx`, `src/modules/collaboration/CollaborationModule.tsx` (2 lignes), `src/lib/api.ts`
(`export { request as apiRequest }`), `src/lib/query-persister.ts` (`journal-projet` non persisté),
`src/components/comptes/comptes.css`, `src/lib/i18n/en.json` (bloc de 127 clés en fin de fichier).
Recette : `apps/web/e2e/journal-activite.mjs` ; CI : `.github/workflows/ci.yml` (étape après `comptes-admin.mjs`, shard
`complements`).

## Décisions d'implémentation

1. **Aucun export** du journal : UM-20 ne définit la capacité `export` que pour le contenu d'un projet (`ProjectNeed`) ;
   aucune capacité d'export d'administration n'existe. Rien n'est livré, la réponse le déclare
   (`export: { available: false, reason }`) et l'écran l'affiche (« Export non disponible : … »).
2. Index additifs et rejouables : `audit_log_project_meta_idx ((metadata->>'projectId'), id) WHERE metadata ? 'projectId'`
   et `audit_log_action_idx (action text_pattern_ops, id)`, placés à la fin de la section organisations-participation,
   avant le bloc D-7 (aucune table nouvelle : les droits existants couvrent tout).
3. `fadi_app` sans UPDATE ni DELETE sur le journal : **déjà couvert** par `scripts/validation/users-migration-check.mjs`
   (« fadi_app : UPDATE / DELETE du journal d'audit — refusé ») ; non dupliqué. Le bloc DB-3 ajoute la même assertion par
   `has_table_privilege` quand le rôle existe, et le refus des déclencheurs append-only.
4. Pas de nouvelle suite DB-3 : les cas sont dans `app.test.ts` (bloc « gestion des comptes », helpers TOTP existants) ;
   `DB3_PENDING_SUITES` inchangé.
5. Accès support : un administrateur ayant un accès support lit le projet mais **pas** son historique de participation
   (403) — il n'est pas responsable du projet.
6. Aucune commande de collaboration nouvelle : les filtres par famille sont des bascules d'affichage (comme le filtre du
   journal des révisions) et « Afficher plus » une pagination ; la règle d'or et `commandes-collaboration.ts` ne sont pas
   touchées.
7. Lectures jamais conservées hors ligne : clés `admin`, `account` (déjà exclues) et `journal-projet` (ajoutée à
   `NON_PERSISTED_QUERIES`).

## Écarts au plan / au brief

1. **Route utilisateur `GET /auth/me/history`** au lieu de `GET /account/history` : toutes les routes du compte vivent
   sous `/auth/me/*` (`sessions`, `mfa`, `export`) avec la même limite ; aucun routeur `/account` n'existe. Contrat
   identique.
2. **Invité externe (phase 4)** : il voit dans « Mon historique » ses propres actions **et** les actions qui visent son
   compte (par exemple une suspension par l'administration, acteur anonymisé en « Un administrateur »). Le plan dit « rien
   d'autre que ses propres actions » ; les actions sur son propre compte relèvent de ses données (D-5, export du compte) —
   à confirmer par le chef de projet ; restreindre = retirer la seconde condition de `visibleToUser`.
3. Identité des comptes dans l'historique du projet (adresse et nom) : visible des responsables, au titre d'OP-D9
   (coordonnées visibles des seuls responsables) et du module Collaboration qui affiche déjà les adresses des membres.

## Preuves (exécutées le 2026-10-24 sur ce poste)

- `npm run db:migrate` ×2 sur `fadi_p3b` : « Schema applied » deux fois (idempotent, index compris).
- `node scripts/validation/users-migration-check.mjs` : ✅ (dont « fadi_app : UPDATE / DELETE du journal d'audit — refusé ») ;
  `participations-migration-check.mjs` : ✅.
- `npm run typecheck` : vert.
- `npm test` : tous les paquets verts ; API 34 suites passées, 12 refusées par la garde DB-3 (attendu localement) ;
  `node scripts/check-api-tests-db3.mjs` sur le rapport JSON : « ✓ seules les suites de la liste DB-3 sont refusées, et
  uniquement par la garde » ; web 124 fichiers, 970 tests.
- `npm run build` : vert.
- API construite sur le port 3021 (`WEB_DIST` copié hors du dossier `.claude` : `send` refuse les chemins à point —
  artefact du poste, sans effet en CI), puis :
  - `apps/web/e2e/journal-activite.mjs` : ✅ 50 contrôles (API des trois audiences, coordinateur, support, navigateur bureau
    et téléphone, axe-core sans violation critique ni sérieuse sur chaque écran, passe anglaise), deux exécutions ;
  - `collaboration-audience.mjs` : « tout est vert » (45 ✓) ; `interface-anglais.mjs` : « tout est vert » ;
    `comptes-admin.mjs` : ✅ 82 ✓ (avec `MAIL_TRANSPORT=console`, `MAIL_RECIPIENT_HOURLY_LIMIT=50`).

## Ce qui n'a pas tourné

- **DB-3** (`app.test.ts`, bloc « 7. journal d'activité ») : garde fermée hors CI — non exécuté ; à vérifier en CI.
- **CI GitHub** : rien n'est poussé (consigne) ; l'étape `journal-activite.mjs` n'a donc pas tourné en CI.
- API locale connectée en super-utilisateur `fadi` (le mot de passe du rôle partagé `fadi_app` n'est pas celui de la CI sur ce
  poste et n'a pas été modifié pour ne pas gêner les autres agents) ; le moindre privilège est vérifié par
  `users-migration-check.mjs`.

## Limites

- L'administration reste sous la limite `authLimiter` des routes `/admin/*` (20 requêtes / 15 min en production) : une
  consultation longue du journal (pages successives) peut l'atteindre — même règle que le reste de l'administration.
- Filtre « acteur » par adresse ou nom : il ne retrouve pas les entrées d'un compte anonymisé (adresse effacée, D-5) ; son
  identifiant reste utilisable.
- `support.accessed` est écrit à chaque lecture du support : l'historique du projet peut en compter beaucoup (filtre
  « Accès support » disponible).
