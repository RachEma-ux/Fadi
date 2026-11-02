# Organisations, participation et revue externe — runbook de déploiement additif

Chantier organisations-participation ([Issue #262](https://github.com/RachEma-ux/Fadi/issues/262)), phase 6 du
[PLAN](PLAN.md). Ce document décrit, dans l'ordre, ce que l'exploitant fera **le jour où le maître d'ouvrage l'aura
décidé**. Il complète le runbook de la gestion des comptes
([`../users-management/RUNBOOK.md`](../users-management/RUNBOOK.md) : rôles D-7, courriel, administration), qui reste
la référence pour tout ce qui n'est pas propre à ce chantier.

> 🛑 **Aucun déploiement sans accord explicite du maître d'ouvrage.** Ni la préproduction ni la production ne sont
> touchées par le chantier. L'autorisation d'enchaîner les phases (OP-3) ne vaut **ni** déploiement, **ni** production
> (DECISIONS.md). Le point d'arrêt final de la phase 6 reste au maître d'ouvrage : ce runbook ne s'exécute qu'après sa
> décision, consignée dans `DECISIONS.md`, et sur un commit dont la CI complète est verte.

Rien de ce qui suit n'a été exécuté en préproduction ni en production. Les commandes SQL et le script de contrôle ont été
exécutés sur une base locale jetable (preuves : [phase-6.md](phase-6.md)).

Secrets : jamais dans le dépôt, un ticket, un journal ou une conversation ; seulement dans `.env.deploy` (production) ou
`/opt/fadi-preprod/env/.env.preprod` (préproduction, 0600).

---

## 1. Prérequis

| # | Prérequis | Vérification |
| --- | --- | --- |
| 1 | Décision du maître d'ouvrage autorisant le déploiement, avec le commit visé | entrée `OP-n` dans `DECISIONS.md` |
| 2 | Commit visé : CI complète verte, **suites DB-3 actives** (« ✓ DB-3 actif : toutes les suites API tournent sur la base attestée ») et tranche e2e `complements` verte (recettes du chantier, dont `organisations-participation-final.mjs`) | `gh run view <run> --json jobs` |
| 3 | Runbook de la gestion des comptes déjà appliqué (rôles D-7 `fadi_owner`, `fadi_app`… ; `FADI_APP_DB_PASSWORD` dans `.env.deploy`) | `SELECT rolname FROM pg_roles WHERE rolname LIKE 'fadi_%'` |
| 4 | **Courriel configuré** (`MAIL_TRANSPORT=smtp`, expéditeur vérifié) si la revue externe doit être ouverte en production (OP-D12, § 4.1) | journal de démarrage « Courriel : transport smtp » |
| 5 | Version actuellement servie notée (point de retour) | `curl -s https://<domaine>/version` |
| 6 | Fenêtre de maintenance annoncée (l'application est arrêtée pendant la migration, § 2.2) | — |

### 1.1 Sauvegarde préalable (obligatoire)

```sh
docker compose --env-file .env.deploy exec backup fadi-backup db fadi fadi /backups   # dump + définition des rôles
```

Copier le dump hors de la machine (`docs/deploiement.md`), noter son nom et la version (`/version`). Préproduction :
`sudo fadi-preprod backup` puis `sudo fadi-preprod restore-check`.

### 1.2 Instantané des accès actuels (lecture seule)

Avant toute migration, relever les accès existants (propriétaires et partages, **identifiants seulement**) pour prouver
après coup qu'aucun n'est perdu. Le script fonctionne aussi sur l'ancien schéma (il ne lit que `projects` et
`project_members`) et refuse toute écriture (transaction `READ ONLY`, sonde d'écriture refusée par PostgreSQL) :

```sh
mkdir -p op-controle
docker compose --env-file .env.deploy stop app          # plus aucune écriture jusqu'à la fin de la migration
docker compose --env-file .env.deploy run --rm --no-deps \
  -v "$PWD/scripts/validation:/app/scripts/validation:ro" -v "$PWD/op-controle:/out" \
  -e DATABASE_URL="postgresql://fadi_app:${FADI_APP_DB_PASSWORD}@db:5432/fadi" \
  app node scripts/validation/organisations-participation-post-deploiement.mjs --instantane /out/acces-avant.json
```

(`scripts/validation/` vient de la copie du dépôt au commit visé, l'image ne l'embarque pas ; `pg` est dans l'image.)
Attendu : `✓ transaction en lecture seule…` puis `✓ instantané écrit : N projets, M partages`.

---

## 2. Migration

### 2.1 Ce que fait la migration (`apps/api/src/db/init.sql`)

Elle est **additive et idempotente** (rejouée deux fois en CI et par les validations) :

- tables nouvelles : `people`, `organizations`, `project_participations`, `project_role_assignments` (phase 1) ;
  `organization_memberships`, `organization_groups`, `organization_group_members`, `organization_templates`,
  `organization_template_versions`, `organization_template_applications`, `organization_mandates` (phase 5) ;
  `review_packages`, `review_assignments`, `review_findings`, `review_package_notes` (phase 4) — `CREATE TABLE IF NOT EXISTS` ;
- colonnes ajoutées (`ADD COLUMN IF NOT EXISTS`) : `projects.closed_at`, `people.erased_at`,
  `project_participations.can_export` / `access_expires_at`, `organizations.details` / `creation_key`,
  `auth.invitations.participation_id` / `proposed_roles` / `organization_id` / `organization_role` /
  `organization_job_title` / `review_assignment_id`, `studio_comments.review_package_id` ; clé étrangère
  `projects_organization_fk` posée `NOT VALID` sur la colonne réservée D-3 ;
- vue `project_effective_access` (`CREATE OR REPLACE VIEW`) : **seule source** de la décision d'accès depuis la phase 2 ;
- **retrait du pont** (lot OP-PONT, § 9) : la fonction `op_sync_access` et ses déclencheurs `project_members_op_mirror`,
  `projects_op_owner_mirror` ne sont plus créés ; sur une base qui porte encore la table `project_members`, elle est
  reprise une dernière fois, puis remplacée par la **vue de compatibilité** `project_members` (lecture seule) ;
  colonnes `project_participations.access_granted_by` / `access_granted_at` ; déclencheurs de gel des paquets partagés, d'anti-suppression, de constats immuables, de versions de gabarit immuables,
  de départ et de clôture d'organisation ;
- contraintes et index rejouables (créés seulement s'ils manquent ; le bloc unique des finalités d'invitation
  `invitations_purpose_check` est remplacé une seule fois, détecté par sa définition) ; deux index de lecture du journal ;
- **reprise de l'existant** (bloc « retrait du pont », § 9.1) : chaque partage qu'aucun miroir n'a repris reçoit sa
  personne, une participation `active` datée de son partage, son export et son rôle de partage `acces` (`lecteur` →
  Lecteur, `editeur` → Concepteur) ; chaque propriétaire, sa participation active. Une participation déjà tenue n'est
  jamais modifiée. La migration **prouve** l'égalité des accès effectifs avant de supprimer la table (sinon exception,
  rien n'est supprimé). Rejouée sans effet ;
- bloc final D-7 : la propriété des objets nouveaux passe à `fadi_owner`, `fadi_app` reçoit lecture / écriture sans DDL
  ni UPDATE / DELETE du journal, et seulement **SELECT** sur la vue `project_members` (lot OP-PONT).

Aucune donnée existante n'est perdue : la table `project_members` est remplacée par une vue qui rend les mêmes lignes
(§ 9.2 : la seule exception est une ligne de partage sans aucun accès, avant comme après) ; les invitations existantes
restent lues.

### 2.2 Exécution : service de migration à usage unique (D-7)

`docker-compose.yml` sépare la migration de l'API : le service `migrate` (**`MIGRATE_ONLY=1`** ; `app` garde `MIGRATE_ON_START=0`)
applique `init.sql` et les mots de passe des rôles avec le compte d'administration de la base, puis s'arrête ; `app` ne
démarre qu'après sa réussite, en `fadi_app`, sans l'identifiant de migration (l'API refuse de démarrer en production si
`DATABASE_MIGRATION_URL` lui est donné).

```sh
git -C <copie du dépôt> checkout <commit visé>
docker compose --env-file .env.deploy up -d --build app            # lance d'abord `migrate`, puis `app`
docker compose --env-file .env.deploy logs migrate | grep -E "Schema applied|D-7|Migration terminée"
docker compose --env-file .env.deploy logs app | grep -E "Courriel|listening"
```

Attendu : `Schema applied (init.sql).`, `D-7 : mot de passe appliqué pour fadi_app`, `Migration terminée` (migrate),
puis `Courriel : transport smtp…` et `listening` (app). Préproduction : `sudo fadi-preprod build` puis
`sudo fadi-preprod migrate` (mêmes contrôles, et `fadi_app peut créer : false`).

Durée : la reprise parcourt une fois chaque partage non encore repris et compare les accès effectifs avant / après ;
elle est linéaire en nombre de partages. Un échec de `migrate` laisse `app` arrêtée et la base dans l'état de la dernière instruction validée (chaque
instruction de `init.sql` est rejouable) : corriger la cause, relancer la même commande.

---

## 3. Reprise de l'existant et contrôles de migration

### 3.1 Ce qui est repris

| Existant | Après migration | Droits |
| --- | --- | --- |
| `projects.owner_id` | personne liée au compte + participation `active` | accès `proprietaire` (vue), inchangé |
| `project_members (lecteur)` | personne + participation `active` + rôle `lecteur` origine `acces`, `can_export` recopié (NULL = TRUE), invitant et date sur la participation | lecteur, export si accordé (inchangé) |
| `project_members (editeur)` | personne + participation `active` + rôle `concepteur` origine `acces`, invitant et date | éditeur (inchangé) |
| table `project_members` | **vue de compatibilité** `project_members` (mêmes colonnes, lecture seule) | aucun : la décision reste `project_effective_access` |
| invitations en attente (`project_participation` sans `participation_id`) | inchangées | elles restent acceptables ; l'acceptation crée la fiche |
| `projects.organization_id` (réservé D-3) | clé étrangère `NOT VALID` | aucune logique de droit |

Le **pont** `op_sync_access` est **retiré** (lot OP-PONT, autorisé le 2026-10-25, § 9) : toutes les écritures du partage
(partage, changement de rôle ou d'export, retrait, départ, transfert de propriété, invitation acceptée, anonymisation,
restauration d'archive, création de projet) écrivent directement participations et rôles. La décision d'accès ne lit que
`project_effective_access`.

### 3.2 Contrôles de schéma (base **jetable** seulement)

Les scripts `scripts/validation/*-migration-check.mjs` **écrivent** (dans des transactions annulées) et **refusent une
base qui n'est pas locale** : ils ne se lancent **jamais** sur la production. Ils se lancent sur une copie restaurée du
dump de l'étape 1.1 (ou sur la préproduction restaurée), après `npm run db:migrate` deux fois :

```sh
DATABASE_URL=postgresql://fadi:…@localhost:5432/fadi_copie npm run db:migrate   # deux fois : idempotence
for s in users participations organisations revues; do DATABASE_URL=… node scripts/validation/$s-migration-check.mjs; done
```

| Script | Critère de réussite |
| --- | --- |
| `users-migration-check.mjs` | « ✅ », dont « fadi_app : UPDATE / DELETE du journal d'audit — refusé » |
| `participations-migration-check.mjs` | « ✅ » sections 1 à 7 : retrait du pont sur une base antérieure simulée (reprise sans perte, accès identiques, vue de compatibilité identique, plus aucun déclencheur), vue en lecture seule, contact / suspendue / terminée / sans rôle / portée étroite / non commencée / échéance passée **sans** droit, rejeu sans doublon, droits `fadi_app` |
| `organisations-migration-check.mjs` | « ✅ » 41 contrôles ; il compte les `project_members` de toute la base : sur une copie de production, deux écarts de comptage sont attendus et ne signalent rien (phase-5-reliquats.md § 4) — tout autre écart bloque |
| `revues-migration-check.mjs` | « ✅ » : paquet partagé figé, anti-suppression, constats immuables, finalité `review_package`, participation « revue seule » sans accès |

Tout ❌ (hors l'exception de comptage ci-dessus) **bloque** le déploiement.

---

## 4. Configuration requise

### 4.1 Courriels de la revue externe (OP-D12, révisée OP-2)

- **Production** (`NODE_ENV=production`) : sans `MAIL_TRANSPORT=smtp`, toute invitation de revue externe est **refusée**
  (503 `mail_required`, `lib/review-rules.ts` `reviewMailGate`) — la revue externe n'est donc ouverte que si l'envoi est
  configuré (variables du runbook des comptes, § 3 : `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM` = `SMTP_USER`, `MAIL_DAILY_LIMIT`). Les invitations de projet et d'organisation, elles, affichent le lien à
  transmettre quand aucun courriel ne part.
- **Préproduction** : envoie réellement (`PREPROD_MAIL_TRANSPORT=smtp`, `noreply@fadimmo.com`), jamais vers les domaines
  réservés aux essais (`example.com`, `*.test`, `*.invalid`…), pour lesquels le lien reste affiché (UM-28).
- `MAIL_ALLOW_RESERVED_DOMAINS=true` et `MAIL_TRANSPORT=console` sont refusés en production.

### 4.2 Tâche horaire de conservation des contacts (OP-D9, OP-2) et réserve juridique

- La tâche `runContactRetentionJob` tourne **dans l'API**, toutes les heures, avec les autres tâches de fond
  (`startAccountWorkers`), **seulement si `CONTACT_RETENTION_ENABLED=1`** (décision OP-4 du 2026-10-25 : désactivée par
  défaut tant que la réserve juridique d'OP-2 n'est pas levée ; la file des courriels et les suppressions de comptes
  continuent). **OP-5 (2026-10-25) : réserve levée par le maître d'ouvrage — poser `CONTACT_RETENTION_ENABLED=1` au déploiement.** Activée, elle efface un contact sans compte dont **tous** les projets sont clos
  depuis plus de deux ans (nom remplacé par « Contact effacé », coordonnées supprimées, `erased_at` posé, fiche et
  participations gardées comme trace sans donnée personnelle ; journal `person.contact_erased`).
- La clôture d'un projet (`projects.closed_at`, « Clore le projet ») est **nouvelle** : aucun projet existant n'est clos à
  la migration, donc **aucun effacement automatique ne peut avoir lieu avant deux ans** après la première clôture.
  L'effacement sur demande (`POST /projects/:id/participants/:pid/erase`) est, lui, immédiat.
- 🛑 **Réserve juridique d'OP-2** : d'éventuelles obligations légales de conservation (garantie décennale…) sont à
  vérifier par le conseil juridique du maître d'ouvrage. Tant qu'elle n'est pas levée : ne pas clore de projet dont les
  contacts devraient être conservés au-delà de deux ans, ou décider d'un interrupteur propre à cette tâche (il n'en existe
  pas : écart déclaré, § 8).
- Contrôle : le script du § 5 signale (⚠) les contacts dont l'effacement est dû et non fait.

### 4.3 Autres réglages

Aucune variable nouvelle n'est exigée par le chantier : `.env.deploy` existant reste valable. L'espace d'organisation
(`/organisations`), les revues (`/revues`) et le journal d'administration (`/admin/journal`, derrière
`FADI_ADMIN_ENABLED=true` et la double authentification) sont servis par la même API.

---

## 5. Contrôles après déploiement

### 5.1 Script en lecture seule

```sh
docker compose --env-file .env.deploy run --rm --no-deps \
  -v "$PWD/scripts/validation:/app/scripts/validation:ro" -v "$PWD/op-controle:/out" \
  -e DATABASE_URL="postgresql://fadi_app:${FADI_APP_DB_PASSWORD}@db:5432/fadi" \
  app node scripts/validation/organisations-participation-post-deploiement.mjs --reference /out/acces-avant.json
```

Une seule transaction `BEGIN TRANSACTION READ ONLY` (sonde : une écriture doit être refusée par PostgreSQL, code 25006,
sinon le script s'arrête sans rien lire), annulée à la fin ; aucun nom ni adresse affiché. Code de sortie 1 au moindre ❌.

| Contrôle | Critère |
| --- | --- |
| Schéma | 16 tables / vue, 12 colonnes, **pont retiré** (aucune fonction ni déclencheur du miroir, `project_members` vue), 4 index d'unicité présents |
| Reprise | chaque propriétaire : accès `proprietaire` et participation active ; chaque partage : participation non terminée et rôle de partage `acces` ; **aucun membre existant sans accès effectif** hors suspension, début futur ou échéance passée (comptés en ℹ) ; aucun éditeur réduit à la lecture |
| Instantané (`--reference`) | chaque accès relevé au § 1.2 existe encore (ou a été retiré par une décision tracée : suspension, fin, échéance, transfert) ; instantané `fadi-op-acces/2` (base où la vue existe déjà) : chaque **accès effectif** relevé est **identique** (rôle, export, approbation, diffusion) |
| Participations | aucune participation active, commencée, non expirée, portant un rôle de portée projet, **sans accès effectif** ; aucun rôle attribué à un contact sans compte ou à une organisation ; un destinataire de revue sans rôle de projet n'a **aucun** accès au projet |
| Revue externe | tout paquet non brouillon a sa copie figée complète ; toute affectation acceptée est liée à un compte |
| Organisations | organisation active avec membres = au moins un administrateur actif ; mandat actif = adhésion active |
| Journal | déclencheurs append-only présents ; **aucune adresse e-mail** dans les métadonnées des familles du chantier |
| D-7 | `fadi_app` sans DDL ni UPDATE / DELETE du journal ; lecture / écriture des tables du chantier |
| Conservation | ⚠ si des effacements de contacts sont dus et non faits |

### 5.2 Requêtes SQL de vérification (lecture seule)

À lancer avec `psql` dans une transaction en lecture seule (`BEGIN READ ONLY; … ROLLBACK;`). Chaque requête doit rendre
**0** (sauf mention).

```sql
-- Aucun membre existant sans accès effectif (hors suspension, début futur, échéance passée)
SELECT count(*) FROM project_members m JOIN projects p ON p.id = m.project_id AND p.owner_id <> m.user_id
  LEFT JOIN people pe ON pe.user_id = m.user_id
  LEFT JOIN project_participations pp ON pp.project_id = m.project_id AND pp.person_id = pe.id AND pp.status <> 'terminee'
 WHERE NOT EXISTS (SELECT 1 FROM project_effective_access v WHERE v.project_id = m.project_id AND v.user_id = m.user_id)
   AND (pp.id IS NULL OR (pp.status = 'active' AND (pp.starts_on IS NULL OR pp.starts_on <= current_date)
        AND (pp.access_expires_at IS NULL OR pp.access_expires_at > now())));

-- Aucun propriétaire sans participation active
SELECT count(*) FROM projects p WHERE NOT EXISTS (SELECT 1 FROM people pe JOIN project_participations pp ON pp.person_id = pe.id
  WHERE pe.user_id = p.owner_id AND pp.project_id = p.id AND pp.status = 'active');

-- Aucune participation active portant un rôle de projet sans accès effectif
SELECT count(*) FROM project_participations pp JOIN people pe ON pe.id = pp.person_id AND pe.user_id IS NOT NULL
 WHERE pp.status = 'active' AND (pp.starts_on IS NULL OR pp.starts_on <= current_date)
   AND (pp.access_expires_at IS NULL OR pp.access_expires_at > now())
   AND EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.scope_type = 'projet')
   AND NOT EXISTS (SELECT 1 FROM project_effective_access v WHERE v.project_id = pp.project_id AND v.user_id = pe.user_id);

-- Pont retiré : aucun déclencheur ni fonction du miroir, `project_members` est une vue (attendu : 0 | 0 | v)
SELECT (SELECT count(*) FROM pg_trigger WHERE tgname IN ('project_members_op_mirror', 'projects_op_owner_mirror')),
       (SELECT count(*) FROM pg_proc WHERE proname IN ('op_sync_access', 'op_project_members_mirror', 'op_projects_owner_mirror')),
       (SELECT relkind FROM pg_class WHERE oid = 'public.project_members'::regclass);

-- Vue de compatibilité : partage sans rôle de partage (attendu : 0 par construction)
SELECT count(*) FROM project_members m WHERE NOT EXISTS (SELECT 1 FROM people pe
  JOIN project_participations pp ON pp.person_id = pe.id AND pp.project_id = m.project_id AND pp.status <> 'terminee'
  JOIN project_role_assignments ra ON ra.participation_id = pp.id AND ra.origin = 'acces' AND ra.scope_type = 'projet'
   AND ra.role = CASE m.role WHEN 'editeur' THEN 'concepteur' ELSE 'lecteur' END WHERE pe.user_id = m.user_id);

-- Journal sans adresse en clair (familles du chantier)
SELECT count(*) FROM admin.audit_log WHERE (action LIKE 'participation.%' OR action LIKE 'person.%' OR action LIKE 'organization.%'
   OR action LIKE 'review.%' OR action LIKE 'invitation.%') AND metadata::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';

-- Droits D-7 (attendu : f | f | f)
SELECT has_schema_privilege('fadi_app','public','CREATE'), has_table_privilege('fadi_app','admin.audit_log','UPDATE'),
       has_table_privilege('fadi_app','admin.audit_log','DELETE');

-- Information : volumes repris (à comparer à l'instantané)
SELECT (SELECT count(*) FROM projects) AS projets, (SELECT count(*) FROM project_members) AS partages,
       (SELECT count(*) FROM project_participations WHERE status = 'active') AS participations_actives;
```

### 5.3 Recettes à rejouer

- **Préproduction** (base de recette, jamais la production) : `sudo fadi-preprod e2e organisations-participation-final
  participants invitations-participation portees-etroites revue-externe organisations journal-activite
  collaboration-audience interface-anglais` — toutes vertes ; `sudo fadi-preprod check` (typecheck, tests, garde DB-3).
- **Production** : aucune recette automatique (elles créent des comptes et des projets). Contrôle manuel avec deux
  comptes de test de l'exploitant : création d'une organisation et adhésion acceptée ; invitation d'un participant avec
  aperçu puis acceptation ; paquet de revue partagé à un compte de test (courriel reçu, lien transféré refusé) ; fin de
  participation (accès retiré) ; « Mon historique » et historique du projet. Supprimer ensuite les comptes de test
  (suppression programmée) ; les paquets partagés ne se suppriment pas : les **clore**.

### 5.4 Sauvegarde post-validation

Refaire l'étape 1.1 et conserver ce dump comme nouveau point de retour.

---

## 6. Retour arrière

### 6.1 Ce qui est réversible, et comment

| Élément | Retour | Effet |
| --- | --- | --- |
| Code | revenir à l'image de la version notée (§ 1, point 5) : `docker compose … up -d app` sur l'ancien commit **sans** relancer `migrate` | l'ancienne version ignore les tables, colonnes et la vue nouvelles |
| Schéma | **ne rien supprimer** des tables du chantier ; le lot OP-PONT a remplacé la table `project_members` par une vue de mêmes colonnes : une version antérieure au lot qui **écrit** le partage échouerait — retour arrière du pont au § 9.4 | une version antérieure au lot OP-PONT ne peut pas partager sans le § 9.4 |
| Invitations en attente des finalités nouvelles (`organization_membership`, `review_package`) | les annuler avant le retour si l'ancienne version ne les connaît pas (écran d'administration, ou par la version nouvelle avant bascule) | une ancienne version peut mal afficher une finalité inconnue (à vérifier sur la version visée) |
| Courriel de revue | retirer `MAIL_TRANSPORT` → la revue externe est refusée en production (503) | les liens déjà envoyés restent valides tant que l'invitation l'est : les annuler si nécessaire |
| Accès donnés par le chantier | révocation par les écrans (fin de participation, révocation d'un destinataire, retrait d'un rôle) avant le retour | journalisés |

**Attention — retour à une version antérieure à la bascule de l'accès (phase 2)** : l'accès redevient décidé par
`project_members` seul. Conséquences à examiner **avant** de revenir en arrière :

- une participation **suspendue** garde sa ligne de partage : l'ancienne version lui **rouvre** l'accès ;
- une **échéance d'accès** passée (portée par la participation) n'est plus appliquée ;
- les rôles Approbateur / Diffuseur et les portées étroites n'ont plus d'effet (approbation et diffusion de nouveau
  réservées au propriétaire) ; la revue externe n'existe plus (destinataires sans accès, ce qui est sûr).

Liste à examiner (lecture seule) :

```sql
SELECT m.project_id, m.user_id, pp.status, pp.access_expires_at FROM project_members m
  JOIN people pe ON pe.user_id = m.user_id
  JOIN project_participations pp ON pp.project_id = m.project_id AND pp.person_id = pe.id AND pp.status <> 'terminee'
 WHERE pp.status = 'suspendue' OR (pp.access_expires_at IS NOT NULL AND pp.access_expires_at <= now());
```

Retirer ces lignes de partage avant le retour est une **écriture** sur la base de production : décision du maître
d'ouvrage, exécutée par la version nouvelle (fin de participation) tant qu'elle tourne.

En dernier recours : restauration du dump de l'étape 1.1 (`scripts/restore.sh`), puis rejouer `init.sql` (droits D-7) —
**tout** ce qui a été fait depuis est perdu (comptes, projets, revues).

### 6.2 Ce qui n'est pas réversible

- **Journal append-only** (`admin.audit_log`) : les entrées écrites depuis le déploiement (participations, invitations,
  revues, organisations) ne s'effacent pas (déclencheurs, `fadi_app` sans UPDATE ni DELETE) ; seule la rétention
  (`fadi_retention`) anonymise des colonnes. Une restauration de dump les ferait disparaître : à éviter sauf décision.
- **Effacement de contacts** (sur demande ou par la tâche) : définitif. Une restauration d'un dump antérieur
  **ressusciterait** des données effacées : après une restauration, rejouer l'effacement des fiches dont le journal
  porte `person.contact_erased` (cible = projet ; la fiche est identifiée dans la trace), avant toute réouverture.
- **Paquets de revue partagés** : figés et non supprimables (déclencheur) ; un projet qui en contient ne se supprime pas
  (409 `revues_partagees`) — y compris par une ancienne version (erreur de suppression).
- **Courriels envoyés** : non rappelables (annuler l'invitation rend le lien inopérant).
- **Décisions Studio** prises par un approbateur externe et **diffusions** : historique conservé (une diffusion se
  retire, elle ne s'efface pas).
- **Clôture d'une organisation** : définitive (déclencheur) ; adhésions et mandats terminés.
- **Comptes créés par une invitation** : restent des comptes (suppression programmée UM, 30 jours).

---

## 7. Après le déploiement

- Consigner dans `DECISIONS.md` / `STATUS.md` (chef de projet) : commit déployé, run CI, sortie du script § 5.1, dump de
  référence.
- Surveiller : `contact_retention_job` et `mail_outbox` dans les journaux de l'API, 503 `mail_required` sur les
  invitations de revue, 409 `revues_partagees`.

## 8. Décisions encore ouvertes qui touchent le déploiement

Décidés : OP-4 (accès de revue 14 jours, portées étroites conservées) et OP-5 (périmètre accepté, réserve d'OP-2 levée —
`CONTACT_RETENTION_ENABLED=1` au déploiement —, saisie libre définitive des listes métier). Le retrait du pont
`op_sync_access` est décidé (2026-10-25) et livré par le lot OP-PONT (§ 9, [lot-pont.md](lot-pont.md)). Reste :
l'accord explicite de déploiement en production.

---

## 9. Retrait du pont `op_sync_access` (lot OP-PONT)

Autorisé par le maître d'ouvrage le 2026-10-25 ; compte rendu : [lot-pont.md](lot-pont.md). Le retrait fait partie de
`init.sql` : il s'exécute avec la migration du § 2.2, **dans sa transaction unique** (`pool.query(init.sql)`), sans
étape séparée. Les points ci-dessous en sont le détail et le contrôle.

### 9.1 Ce que fait la migration

Sur une base qui porte encore la **table** `project_members` (production d'avant le chantier, préproduction des phases
1 à 6, base neuve — table vide créée plus haut dans `init.sql`) :

1. les déclencheurs du miroir sont supprimés (plus aucune écriture par le pont pendant le retrait) ;
2. les accès effectifs (`project_effective_access`) sont relevés ;
3. **reprise** : un partage lecteur / éditeur (hors propriétaire) **sans** participation en cours reçoit personne,
   participation `active` (début = date du partage), export accordé (NULL d'archive = TRUE) et rôle `acces` — la règle
   exacte de l'ancien miroir. Une participation en cours n'est **jamais** modifiée : une suspension reste, une échéance
   reste, un rôle de partage retiré par une écriture SQL directe (dérive) n'est pas rendu ;
4. l'invitant (`invited_by`) et la date (`created_at`) de chaque partage passent sur sa participation
   (`access_granted_by`, `access_granted_at`) ;
5. **preuve** : (a) chaque accès effectif relevé en 2 existe encore, identique (rôle, export, approbation, diffusion) ;
   (b) chaque partage repris ou tenu se retrouve identique dans la vue de compatibilité (rôle, export effectif, invitant,
   date). Un écart ⇒ `RAISE EXCEPTION 'OP-PONT : …'`, **toute la migration est annulée**, rien n'est supprimé ;
6. la table est supprimée, la vue `project_members` créée, les fonctions du miroir supprimées ; `fadi_app` n'a que
   SELECT sur la vue (bloc D-7).

Avis émis (`NOTICE`, visibles avec `psql -f init.sql`, pas dans le journal de `migrate`) : nombre de partages repris,
d'accès complétés, de dérives conservées, de lignes sans accès de base (ligne du propriétaire, rôle inconnu). Rejouée, la
migration ne reprend ni ne supprime rien (seule la participation d'un propriétaire qui n'en a pas est réparée : projet
créé hors de l'application).

### 9.2 Contrôle avant / après

Avant la migration (application arrêtée, § 1.2), relever l'instantané **avec le script du commit visé** : sur une base
où la vue d'accès existe déjà (préproduction), il relève aussi les accès effectifs (`fadi-op-acces/2`) ; sur la
production d'avant le chantier, propriétaires et partages seulement (même format, `access: null`).

```sh
… organisations-participation-post-deploiement.mjs --instantane /out/acces-avant.json   # avant (§ 1.2)
… organisations-participation-post-deploiement.mjs --reference /out/acces-avant.json    # après (§ 5.1)
```

Attendu après : `✓ pont op_sync_access retiré : aucun déclencheur ni fonction du miroir, project_members est une vue`,
`✓ instantané … : chaque accès relevé avant le déploiement existe encore`, et avec les accès effectifs relevés
`✓ instantané : N accès effectifs relevés avant, identiques après`. Un partage déjà **sans** accès effectif avant
(suspension, échéance passée, dérive) est compté en ℹ (« déjà sans accès effectif avant »), jamais comme une perte.

À examiner **avant** la migration (lecture seule) — partages en dérive, que le retrait garde tels quels (sans accès) et
que la vue ne listera plus :

```sql
SELECT m.project_id, m.user_id, m.role FROM project_members m JOIN projects p ON p.id = m.project_id AND p.owner_id <> m.user_id
  JOIN people pe ON pe.user_id = m.user_id
  JOIN project_participations pp ON pp.project_id = m.project_id AND pp.person_id = pe.id AND pp.status <> 'terminee'
 WHERE m.role IN ('lecteur', 'editeur')
   AND NOT EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.origin = 'acces'
                    AND ra.role = CASE m.role WHEN 'editeur' THEN 'concepteur' ELSE 'lecteur' END);
```

(0 attendu en production ; sur une base de recette, des lignes peuvent venir d'écritures SQL directes des recettes —
exemple : `portees-etroites.mjs` retire par SQL le rôle de projet d'une participation.)

### 9.3 Contrôles de schéma (base jetable)

`participations-migration-check.mjs` (§ 3.2), section 1 : base antérieure simulée dans une transaction annulée (vue
remplacée par l'ancienne table, déclencheurs recréés, partages repris ou non, suspension, dérive, lignes « owner » /
« editor ») → reprise sans perte, accès identiques, vue identique, plus aucun déclencheur ni fonction, rejeu sans effet.

### 9.4 Retour arrière du retrait

Le retrait est **réversible sans perte** tant que les participations existent : la vue rend exactement les lignes de
l'ancienne table. Revenir à une version antérieure au lot OP-PONT (qui écrit `project_members`) exige de recréer la table
**et** le miroir ; à faire seulement sur décision, application arrêtée, après sauvegarde (§ 1.1) :

```sql
BEGIN;
CREATE TABLE project_members_retour AS SELECT project_id, user_id, role, invited_by, created_at, can_export FROM project_members;
DROP VIEW project_members;
ALTER TABLE project_members_retour RENAME TO project_members;
ALTER TABLE project_members ALTER COLUMN role SET NOT NULL, ALTER COLUMN invited_by SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN can_export SET DEFAULT false,
  ADD PRIMARY KEY (project_id, user_id),
  ADD FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  ADD FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX project_members_user_idx ON project_members (user_id);
COMMIT;
```

puis appliquer le **`init.sql` de la version visée** (il recrée `op_sync_access` et ses déclencheurs ; sa reprise est
sans effet sur des participations déjà tenues) et redémarrer cette version. Les colonnes `access_granted_by` /
`access_granted_at` restent (additives, ignorées par l'ancienne version). Ne **pas** rejouer ensuite l'`init.sql` du lot
OP-PONT sans vouloir refaire le retrait (il le referait, avec sa preuve). En dernier recours : restauration du dump du
§ 1.1.

## 10. Auto-contrôle (lot OP-AUTOCONTROLE, décision OP-6)

Migration **additive et idempotente**, appliquée par le même `npm run db:migrate` (`init.sql`, bloc « Lot
OP-AUTOCONTROLE ») ; aucune reprise de données, aucun droit nouveau (les droits D-7 sont donnés par table : `fadi_app`
lit et écrit déjà `users`, `studio_publications`, `studio_publication_events`) :

| Colonne | Effet |
| --- | --- |
| `users.self_control_allowed boolean NOT NULL DEFAULT true` | option « Auto-contrôle » ; tout compte existant la reçoit **activée** (comportement inchangé : rien n'est bloqué) |
| `studio_publications.approved_self_control boolean` | marque de l'approbation en vigueur ; **NULL** pour toute approbation antérieure (rien de rétroactif) |
| `studio_publication_events.self_control boolean` | marque figée de l'évènement `approuver` ; NULL ailleurs (journal append-only : seules les nouvelles lignes la portent) |

Contrôles après migration (lecture seule) :

```sql
SELECT count(*) FILTER (WHERE NOT self_control_allowed) AS desactives FROM users;            -- 0 juste après la migration
SELECT count(*) FROM studio_publications WHERE approved_by IS NOT NULL AND approved_self_control IS NOT NULL; -- 0 juste après
```

Manifeste, paquet et empreintes (`manifest_hash`, `approved_manifest_hash`, `package_hash`) ne sont pas touchés : la
marque est hors du manifeste et du paquet. Retour arrière : une version antérieure ignore ces colonnes (additives) ;
aucune suppression n'est nécessaire. Désactiver l'option d'un compte se fait dans l'administration (fiche du compte,
« Autorisations »), jamais par SQL.
