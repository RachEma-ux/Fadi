# Lot OP-PONT — retrait du pont `op_sync_access` : compte rendu

> Issue #262. Autorisé par le maître d'ouvrage le 2026-10-25 (mission transmise par le chef de projet). Évaluation du pont
> et écritures historiques restantes : [phase-2.md](phase-2.md) (§ 2, décision 1) et [phase-3.md](phase-3.md) (§ 3,
> décision 1). Base : `main` à `0ff0638` (PR #290 fusionnée).
> État : **Implémenté**, vérifié localement (preuves § 4) ; DB-3 et CI **non exécutés** ici (§ 5) ; non accepté.
> Aucun déploiement.

## 1. Livré

| Livrable | Réalisation |
| --- | --- |
| 1. Écritures | Toutes les écritures du partage passent par les participations et les rôles, **dans la transaction de l'action**, avec le journal existant (inchangé) : `lib/project-access-db.ts`. Plus aucune écriture applicative dans `project_members` (test pur qui relit tout le code serveur, `project-access.test.ts`). |
| 2. `project_members` | **Vue de compatibilité en lecture**, mêmes colonnes (`project_id`, `user_id`, `role` lecteur / editeur, `invited_by`, `created_at`, `can_export`), dérivée des participations. Migration additive et idempotente : reprise finale, preuve d'égalité dans la migration, déclencheurs et fonctions du miroir supprimés, table remplacée par la vue (`init.sql`, bloc « lot OP-PONT »). |
| 3. Droits, runbook, migration | D-7 : `fadi_app` n'a que SELECT sur la vue (`REVOKE INSERT, UPDATE, DELETE`). `RUNBOOK-deploiement.md` § 9 (étapes, contrôle avant / après, retour arrière) et §§ 2, 3, 5, 6, 8 mis à jour. R-MEMBRES re-sourcée (`init.sql` `access_granted_by`, `project-access-db.ts` `grantShare`). `participations-migration-check.mjs` réécrit (section 1 : retrait du pont sur base antérieure simulée). |
| 4. Tests | Règles pures + garde « aucune écriture » ; DB-3 adaptés (aides `partagerEnBase`, `retirerPartageEnBase`, `exportAccordeEnBase` de `test-helpers/partage.ts`), cas DB-3 nouveau « aucune perte d'accès après retrait » ; recettes relancées (§ 4). |

### Chemins d'écriture repris (ancien miroir → appel explicite)

| Chemin | Avant (pont) | Après (lot OP-PONT) |
| --- | --- | --- |
| Changement de rôle / d'export (`PATCH /members/:userId`, `POST /members` d'un membre existant) | `UPDATE project_members` | `grantShare(mode "set")` : rôle `acces` remplacé, `can_export` |
| Retrait, départ (`DELETE /members/:userId`) | `DELETE project_members` → miroir : participation terminée | `revokeShare` : participation terminée et datée |
| Transfert de propriété | 3 écritures `project_members` + `projects.owner_id` (déclencheurs) | `projects.owner_id` + `ensureOwnerParticipation` (nouveau propriétaire, rôle de partage retiré) + `grantShare` (ancien propriétaire éditeur) — mêmes participations, sans interruption |
| Invitation acceptée (`activateProjectParticipation`) | `INSERT … ON CONFLICT` (rôle le plus large) | `grantShare(mode "merge")` |
| Fin de participation (`applyStatusChange`) | `DELETE project_members` | supprimé (la participation terminée sort de la vue) |
| Anonymisation (`anonymiseAccountIn`) | `DELETE` / `UPDATE invited_by` | `revokeSharesOfUser`, `relabelShareInviter` (seules lignes changées dans `account-jobs.ts`) |
| Restauration d'archive Studio | `INSERT … jsonb_populate_recordset` | `grantShare(mode "if-absent")` par membre retrouvé (export d'archive NULL = TRUE, invitant et date conservés) |
| Création, import d'exemple, import / copie d'archive de projet | déclencheur `projects_op_owner_mirror` | `ensureOwnerParticipation` (`routes/projects.ts`, `routes/examples.ts`, `lib/project-archive.ts`) |
| Verrou d'accès Studio (`lockAccessRows`) | FOR SHARE sur la ligne de partage + participations | FOR SHARE sur les participations (que tout changement de partage verrouille FOR UPDATE) |
| Recette `comptes-securite.mjs`, jeu synthétique de migration | `INSERT/DELETE project_members` | participations (`apps/web/e2e/lib-partage-sql.mjs`, `jeu-synthetique.mjs`) |

### Contrats publics

- `lib/project-access.ts` (pur) : `ShareRole`, `shareBusinessRole`, `shareRoleFromRoles`, `shareExportFlag`,
  `shareExports`, `mergedShareRole`, `archivedShareRole`.
- `lib/project-access-db.ts` : `shareOf(q, projectId, userId, { lock })` → `ShareRow` (colonnes de l'ancienne ligne +
  `participationId`, `status`) ; `grantShare(tx, { projectId, userId, role, canExport?, invitedBy, grantedBy?, grantedAt?,
  mode })` → `{ before, after }` ; `revokeShare(tx, projectId, userId)` ; `revokeSharesOfUser(tx, userId)` ;
  `relabelShareInviter(tx, before, after)` ; `ensureOwnerParticipation(tx, projectId, ownerId)`.
- Schéma : `project_participations.access_granted_by text`, `access_granted_at timestamptz` ; vue `project_members`.
- Aides de test : `test-helpers/partage.ts` (`partagerEnBase`, `retirerPartageEnBase`, `exportAccordeEnBase`) ;
  recettes : `apps/web/e2e/lib-partage-sql.mjs` (`partagerEnBase`, `retirerPartagesEnBase`).

## 2. Choix (au plus prudent, à relire)

1. **Origine du rôle de partage : `acces` conservée**, avec un sens précisé — « accès de base du partage » (Lecteur ou
   Concepteur, un seul par participation, portée projet), désormais écrit par l'application au lieu du miroir.
   Raisons : aucune conversion de données (les rôles `acces` existants restent tels quels, l'égalité des accès est donc
   immédiate), l'interface les affiche déjà « du partage » et refuse de les retirer depuis « Équipe et participants »
   (422), et `attribution` garde son sens d'affectation explicite. Une origine dédiée nouvelle n'apportait rien.
2. **Vue de compatibilité plutôt que table en lecture seule.** Une table figée deviendrait fausse dès le premier
   partage ; la vue est toujours exacte, sans écriture double, et ses mêmes colonnes servent toutes les lectures
   restantes sans les toucher (`listMembers`, exports de données personnelles `auth.ts`, administration, archives
   Studio et comparaison de restauration, migration R-MEMBRES, notifications, journal, commentaires Studio,
   Communication). Elle n'est pas modifiable (jointures) et `fadi_app` n'y a que SELECT : une écriture oubliée échoue
   (échec fermé) au lieu de se perdre. Comme l'ancienne table, elle liste aussi un partage suspendu ou échu (la
   décision reste `project_effective_access`).
3. **Les participations décident à la reprise.** Depuis la phase 2 elles décident seules de l'accès ; le retrait ne
   modifie donc jamais une participation en cours (une suspension reste, un export reste, un rôle de partage retiré
   par une écriture SQL directe n'est pas rendu). La table ne reste source que d'un partage qu'aucun miroir n'a repris
   (base de production d'avant le chantier) : il reçoit exactement ce que l'ancien miroir lui aurait donné.
4. **Preuve dans la migration.** Le bloc relève les accès effectifs, reprend, puis exige (a) que chacun soit encore là,
   identique, et (b) que chaque partage tenu se retrouve identique dans la vue (rôle, export effectif, invitant, date) ;
   sinon `RAISE EXCEPTION` et la migration entière (transaction unique) est annulée — rien n'est supprimé. Les écarts
   sans effet sur l'accès (dérive, ligne « owner », rôle inconnu) sont signalés par `NOTICE`.
5. **Invitant et date** : nouvelles colonnes `access_granted_by` (libellé historique : l'adresse de l'invitant, effacée
   à l'anonymisation comme avant) et `access_granted_at`. Seul le `can_export` d'un **éditeur** n'est pas repris : il
   n'était jamais consulté (un éditeur exporte toujours) et un éditeur rétrogradé reçoit déjà `false` explicitement.
6. **Participation du propriétaire** : écrite par l'application aux trois créations de projet et au transfert ; un
   projet créé hors de l'application (script, essai) est réparé au rejeu d'`init.sql` (personne + participation active,
   sans rôle de partage). Aucun déclencheur ne subsiste.
7. **Suites DB-3** : la liste des tables vidées entre les cas ne contient plus `project_members` (une vue ne se vide pas
   par `TRUNCATE` ; les participations partent en cascade avec `projects` et `users`). `RESET_TABLES` de la garde
   (`testing/guarded-test-pool.ts`) n'est **pas** modifiée (consigne : ne jamais toucher la garde) ; son entrée
   `project_members` devient inutilisée.
8. **`account-jobs.ts`** : seules les deux écritures des membres changent (coordination minimale avec le chef de projet,
   qui y ajoute l'interrupteur de la conservation).

## 3. Écarts

- Aucun écart au concept. Écart au plan de la phase 2 (« miroir retiré ») résorbé.
- Base de recette : une ligne de partage **en dérive** (rôle de projet retiré par SQL direct par `portees-etroites.mjs`)
  n'a d'accès ni avant ni après ; la vue ne la liste plus (seule différence de contenu constatée, § 4.2).
- Jeu synthétique de migration : ses lignes `project_members` de rôles « owner » / « editor » (qui ne donnaient aucun
  accès) deviennent une participation de propriétaire et un vrai partage éditeur de U2 sur SYNTH-1.

## 4. Preuves (exécutées le 2026-10-25, PostgreSQL 16 + PostGIS local)

### 4.1 Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run db:migrate` ×2, base neuve `fadi_pont` | « Schema applied » deux fois |
| `npm run db:migrate` ×2, base existante (copie de `fadi_pont_avant`, § 4.2) | « Schema applied » deux fois |
| `users-`, `participations-` (73 ✓), `organisations-` (44 ✓), `revues-migration-check.mjs` | ✅ sur base neuve ; `participations-` ✅ aussi sur la base existante migrée |
| `organisations-participation-post-deploiement.mjs --reference` (instantané `/2` pris AVANT, ancien code) | « conforme » : 48 accès effectifs identiques, 0 perte, pont retiré, 24 ✓ |
| `npm run typecheck` | vert |
| `npm test` (API) | 640 tests hors base verts ; 15 suites DB-3 refusées par la garde ; `check-api-tests-db3.mjs` : « ✓ seules les suites de la liste DB-3 sont refusées » |
| `node --test scripts/migration/migration-lib.test.mjs` | 27 pass (symboles R-MEMBRES présents) |
| `npm run build` | vert |
| Retour arrière § 9.4 du runbook (copie migrée → table recréée → `init.sql` d'avant le lot) puis nouveau retrait | relevés identiques à chaque étape ; déclencheurs recréés puis de nouveau supprimés |

### 4.2 Égalité des accès effectifs avant / après sur une base peuplée

- **Base des phases 1 à 6** (`fadi_pont_avant`) : migrée et peuplée par l'**ancien** code (`main` construit avant toute
  modification), recettes participants, invitations-participation, collaboration-audience, organisations, revue-externe,
  comptes-api, communication, portees-etroites, journal-activite, studio-publication, temps-reel-sessions,
  organisations-participation-final, plus des cas limites écrits à travers l'ancien miroir (lecteur sans export, lecteur
  d'archive NULL, éditeur, partage suspendu, partage échu, approbateur attribué, contact devenu membre, éditeur
  rétrogradé, transfert de propriété, retrait). Copie migrée par le nouveau code. Relevé trié avant / après
  (`project_effective_access`, partages, participations, rôles) : **48 accès effectifs identiques, 85 participations
  identiques, 61 rôles identiques**, 34 partages sur 35 identiques (rôle, export effectif, invitant, date) ; la 35ᵉ est la
  ligne en dérive du § 3 (aucun accès avant ni après). NOTICE : « 1 partage(s) dont la participation diffère… », « pont
  retiré ; 48 accès effectif(s) relevés avant, tous conservés ; 0 partage(s) repris ».
- **Base de production d'avant le chantier** (`init.sql` du commit précédant la phase 1, `5429a12~1` : ni
  participations, ni `can_export`) : 10 projets, 41 partages. Décision de l'ancienne application (propriétaire, sinon la
  ligne de partage, tout membre exporte) = **51 accès, identiques** à `project_effective_access` après migration ; 41
  partages identiques dans la vue. NOTICE : « 41 partage(s) repris, 41 accès complété(s) ».

### 4.3 Recettes (API construite, port 3101, connectée en `fadi_app`, base neuve migrée)

| Recette | Résultat |
| --- | --- |
| `participants.mjs` | 92 ✓, 0 ✗ |
| `invitations-participation.mjs` | 107 ✓, 0 ✗ |
| `organisations.mjs` | 182 ✓, 0 ✗ |
| `collaboration-audience.mjs` | 45 ✓, 0 ✗ |
| `comptes-api.mjs` | 119 ✓, 0 ✗ |
| `comptes-securite.mjs` (partage simulé par `lib-partage-sql.mjs` : « corbeille : projets partagés signalés », 409 `owns_shared_projects`) | 73 ✓, 0 ✗ (scénarios concurrents du dernier administrateur non exécutés : base partagée, comme toujours hors `COMPTES_SECURITE_BASE_VIERGE=1`) |
| `revue-externe.mjs` | 132 ✓, 0 ✗ |
| `organisations-participation-final.mjs` | 155 ✓, 0 ✗ |
| `communication.mjs` | 124 ✓, 0 ✗ |
| `temps-reel-sessions.mjs` (`FADI_TEMPS_REEL=1`) | 44 ✓, 0 ✗ |
| `studio-publication.mjs` | 129 ✓, 0 ✗ |
| `portees-etroites.mjs` | 87 ✓, 0 ✗ |
| `journal-activite.mjs` | 50 ✓, 0 ✗ |
| `notifications-preferences.mjs` | 32 ✓, 0 ✗ |
| `interface-anglais.mjs` | 7 ✓, vert |
| `studio-restauration.mjs` (seconde base `fadi_pont_restore`, API B sur 3102 ; membres restaurés par `grantShare`) + `studio-compare-lib.test.mjs` | 92 ✓, 0 ✗ ; vert |
| `parcours-scenario.mjs` | 338 ✓, 1 ✗ (deux exécutions) : toute la section partage verte (invitation, acceptation, lecteur, éditeur, notification « … vous a donné accès … », transfert de propriété, départ) ; l'échec est la relecture hors-ligne de l'étape 02 depuis le cache persistant, sans lien avec le partage, déjà signalée instable en phase 3 |
| Simulation de migration (`migration-lib.test.mjs` 27, `simulation-studio.test.mjs` 5, base `fadi_pont_mig` + `jeu-synthetique.mjs` + `recette-simulation.mjs`) | « Recette réussie : 21 vérifications » après correction de `lecture.mjs` (la vue n'était pas vue par `pg_tables`) |
| `npm run test:scripts` | 18 pass |

Recettes de référence avant le lot (ancien code, base `fadi_pont_avant`) : participants 77 ✓ (sans `DATABASE_URL`),
invitations-participation 107 ✓, collaboration-audience 43 ✓, organisations 164 ✓, revue-externe 127 ✓ / 1 ✗ (comptage
d'interface instable connu), communication 124 ✓, portees-etroites 87 ✓, journal-activite 50 ✓, studio-publication 129 ✓,
temps-reel-sessions 44 ✓, organisations-participation-final 155 ✓.

## 5. Ce qui n'a pas tourné

- **Suites DB-3** (`app.test.ts` dont le cas nouveau « lot OP-PONT : le partage s'écrit dans les participations… »,
  `organizations.test.ts`, suites Atelier) : refusées par la garde hors CI — à vérifier en CI (DB-3 actif).
- **CI GitHub** : rien n'est poussé.
- `parcours-scenario.mjs` : 1 ✗ sur la relecture hors-ligne de l'étape 02 (deux fois) ; non relancé sur l'ancien code
  pour comparaison — hors du périmètre du partage (section partage entièrement verte).
- `comptes-admin.mjs` (Mailpit absent de ce poste) et `studio-v1.mjs` (attestation requise) : non lancés.
- `npm test` complet : vert hors les 15 suites DB-3 refusées par la garde (attendu localement).

## 6. Retour arrière

Voir [RUNBOOK-deploiement.md](RUNBOOK-deploiement.md) § 9.4 (exercé localement, § 4.1) : recréer la table depuis la vue
(mêmes lignes), appliquer l'`init.sql` de la version visée (il recrée le miroir), redémarrer cette version ; les colonnes
`access_granted_by` / `access_granted_at` restent. En dernier recours, restauration du dump préalable.
