# Audit Fadi — 01 · Schéma & index (PostgreSQL 16 + PostGIS 3.4)

Périmètre : `apps/api/src/db/init.sql` (4046 l.) et `apps/api/src/db/schema.ts` (2091 l.), HEAD `b9d9897` (2026-11-02). Audit en lecture seule : aucun fichier du dépôt n'a été modifié.
Référentiel appliqué : skill *expert-bases-de-donnees*, `references/schema-indexation.md` (§2 règles d'index, §4 PK, §7 RLS/contraintes, §8 checklist) et `scripts/pg_diagnostics.sql` (sections 5, 6b, 6c, 6d).

## 0. Méthode et preuves empiriques

- **Banc d'essai** : PostgreSQL **16.15** (Ubuntu 24.04) + `postgresql-16-postgis-3` **3.4.2** installés par apt. Cluster jetable, `init.sql` appliqué en **superutilisateur** (`psql -1 -v ON_ERROR_STOP=1 -f init.sql`, une seule transaction comme `pool.query(sql)` dans `migrate.ts:20`).
  - 1er passage (base vide) : **exit 0, 1,66 s**.
  - 2e passage (idempotence) : **exit 0, 0,22 s**, uniquement des NOTICE `already exists, skipping` → **idempotence vérifiée**.
  - Le cluster a été arrêté et supprimé à la fin. Note : le bac à sable a réinitialisé les droits de `/tmp/claude-0` en cours de route et fait tomber le premier serveur ; un second cluster jetable (hors scratchpad) a servi aux dernières requêtes puis a été supprimé lui aussi.
- **Drift** : `schema.ts` a été chargé avec `drizzle-orm@0.45.3` + `tsx` dans un répertoire temporaire (`getTableConfig()` sur chaque `pgTable`), puis comparé au catalogue réel (`pg_attribute`, `pg_index`, `pg_constraint`) de la base issue de `init.sql`.
- **Requêtes applicatives** : `grep` dans `apps/api/src` (Drizzle et SQL brut).
- Ce qui n'a pas pu être vérifié (aucune donnée, aucun `pg_stat_statements`) est marqué **[hypothèse]**.

## 1. Synthèse

| Indicateur (catalogue mesuré) | Valeur |
|---|---|
| Tables | **152** (public 147, auth 3, admin 2) + 2 vues applicatives (`project_effective_access`, `project_members`) |
| Index | **349** (dont 5 GiST/GIN) |
| Contraintes | PK 151 · FK 356 · UNIQUE 27 · CHECK 349 · **83 NOT VALID** (65 CHECK + 18 FK) |
| Types PK (mono-colonne) | `text` **105** · `bigint` (bigserial) 13 · PK composites 33 · **1 table sans PK** |
| Colonnes | text 1057 · timestamptz 233 · **jsonb 137** · integer 88 · bytea 6 · géométrie 7 |
| `json`, `timestamp` sans fuseau, `varchar(n)`, `money` | **0** (conforme) |
| FK sans index de support (requête §5 de pg_diagnostics) | **213 / 356** ; 77 hors `users` sans même un index commençant par la 1re colonne |
| Index dupliqués / redondants | 1 doublon exact + 2 redondants par préfixe |
| Index invalides | 0 |
| RLS / policies | 0 / 0 |
| Fonctions SECURITY DEFINER | 0 (34 fonctions de déclencheur, toutes INVOKER, propriétaire `fadi_owner`) |
| Drift `init.sql` ↔ `schema.ts` | 47 tables absentes de Drizzle, 73 index et 52 FK absents de Drizzle, **0 CHECK** déclaré côté Drizzle, 1 vue déclarée comme table |

**Points forts constatés** : tout en `timestamptz` et `jsonb` ; mots de passe argon2id (`lib/auth.ts:1`), secret TOTP chiffré (`users.totp_secret_enc`, AES-256-GCM, `init.sql:1648`), codes de secours, jetons de session, de compte et d'invitation **hachés** (`sessions.token_hash`, `auth.*.token_hash`, `studio_agent_tokens.key_digest`) ; FK composites « même variante » (bon pattern multi-tenant) ; journaux append-only protégés par déclencheurs ; idempotence réelle ; rôles distincts propriétaire/migrateur/app sans BYPASSRLS ni superuser.

**Top 5**
1. **Élevée** : la migration reprend `AccessExclusiveLock` sur **52 tables** à chaque démarrage (DROP/ADD CONSTRAINT … NOT VALID), sans `lock_timeout`. Les 83 contraintes recréées ne sont **jamais validées**.
2. **Élevée** : `fadi_app` peut **DELETE** dans au moins 13 journaux « append-only » (seul l'UPDATE est bloqué) et lit/écrit en clair `archive_signing_keys.secret`. Il a aussi INSERT/UPDATE/DELETE sur `spatial_ref_sys`.
3. **Élevée** : le drift Drizzle est structurel (47 tables geodata en SQL brut, 0 CHECK, 52 FK composites et 73 index absents, `project_members` déclarée table alors que c'est une vue). Tout `drizzle-kit push/generate`, annoncé en tête d'`init.sql:6-7`, serait destructeur.
4. **Moyenne** : 11 FK `ON DELETE CASCADE` vers `projects` (et 6 vers `studio_studies`, 5 vers `studio_variants`, 6 vers `studio_revisions`) sans index côté enfant. La suppression de projet (`routes/projects.ts:286`, `lib/account-jobs.ts:45`) les parcourt en seq scan.
5. **Moyenne** : `users_email_unique` est sensible à la casse (`init.sql:53`) alors qu'une partie du code cherche par `lower(email)`. Ces recherches n'utilisent pas l'index et rien n'empêche deux comptes qui ne diffèrent que par la casse.

## 2. Inventaire

### 2.1 Par domaine (152 tables)

| Domaine (préfixe) | Nb | Rôle | PK | Particularités |
|---|---|---|---|---|
| Comptes : `users`, `sessions` (public) ; `auth.user_recovery_codes`, `auth.invitations`, `auth.account_tokens` | 5 | identité, sessions, 2FA, invitations, jetons | text (`newId(prefix)` = `prefix_` + UUIDv4, `lib/ids.ts:3`) | secrets hachés/chiffrés ; `users` est anonymisé, **jamais supprimé** (`lib/account-jobs.ts:61`) |
| `admin.audit_log`, `admin.mail_outbox` | 2 | audit append-only, file de courriels | bigserial / text | audit : déclencheurs no_update/no_delete, UPDATE de colonnes accordé à `fadi_retention` |
| Projet / Parcours : `projects`, `project_steps`, `project_plans`, `project_plan_baselines`, `programme_*`, `parcels`, `step_files`, `drawing_exports`, `produced_documents`, `project_comments`, `project_support_grants`, `volumes` | 13 | cœur projet, 21 étapes | text ou composite `(project_id, …)` | `projects` porte **7 colonnes jsonb** et la seule `geography(Polygon,4326)` (`parcel_footprint`, sans GiST, aucune requête spatiale dessus) ; bytea en ligne (`step_files`, `drawing_exports`, `volumes`) |
| Atelier `atelier_*` | 18 | modèle typé, commandes, outbox, versions, verrous, scripts | composite `(project_id, id)` ou text | jsonb `params`, `commands/inverse/effets/reponse`, `modele` (instantané complet) |
| Studio `studio_*` | ~45 | études → variantes → révisions immuables, commentaires, observations, publications, exigences, métrés, feuilles, agents | text | `studio_revisions.document` jsonb avec CHECK de schéma ; FK composites `(variant_id, id)` ; 18 tables à déclencheur d'immuabilité |
| Organisations / participation / revue : `people`, `organizations`, `organization_*`, `project_participations`, `project_role_assignments`, `review_*` | 17 | multi-acteurs, rôles par portée, revue externe | text | décision d'accès = vue `project_effective_access` (`init.sql:2427`) ; `project_members` = vue de compatibilité (`init.sql:2642`) |
| Communication / temps réel : `com_*`, `collab_*`, `rt_*` | 14 | messagerie, demandes, sessions live, annotations | text / bigserial (évènements) | `com_messages.mentions` text[] + GIN ; `com_pieces.content` bytea ≤ 2 Mo (CHECK) |
| GeoData `geodata_*` (dont `geodata_prix_*`) | 46 | module autonome données territoriales et prix | text, bigserial, composites | 6 colonnes `geometry(…,4326)` ; GiST sur `geodata_objets.geom`, `geodata_zones.geom`, `geodata_territoires.geom`, `geodata_prix_zones.geom` ; **aucune table déclarée dans schema.ts** |
| `sandbox_tool_preferences`, `studio_tool_preferences`, `archive_signing_keys` | 3 | préférences d'outils, clé HMAC locale | text | `archive_signing_keys.secret` en clair (`init.sql:1061`) |

### 2.2 Caractéristiques transverses (mesurées)

- **PK** : 105 PK `text` au format `prefix_<uuid v4>`, soit environ 40 octets au lieu de 16 (`uuid`) ou 8 (`bigint`). L'insertion est aléatoire dans le B-tree. 13 `bigserial` (journaux) et non `GENERATED … AS IDENTITY`. **Table sans PK : `studio_study_steps`** (`init.sql:797`, seulement `UNIQUE(study_id, step_number)` sur colonnes NOT NULL).
- **ON DELETE** des 356 FK : CASCADE 217, RESTRICT 69, SET NULL 46, NO ACTION 24. 128 FK pointent vers `users` ; 53 FK vers `projects`, **toutes CASCADE**. 4 FK `DEFERRABLE INITIALLY DEFERRED` (cycle étude ↔ variante ↔ révision).
- **Horodatages** : 233 `timestamptz`, aucun `timestamp`. Nommage hétérogène (`created_at`, `at`, `le`, `cree_le`, `added_at`, `produced_at`). Aucun déclencheur `updated_at` : la valeur est tenue par l'application.
- **Soft delete** : ponctuel (`users.deleted_at` + `status`, `studio_comments.deleted_at`, `archived_at` sur études/variantes, `people.erased_at`). L'immuabilité passe par des déclencheurs (pattern « journal append-only »), ce qui est cohérent avec la référence §7.
- **jsonb** : 137 colonnes. Contenus typiques : documents métier complets (`studio_revisions.document`, `atelier_versions.modele`, `projects.harmony/programme_state`), charges de commande (`atelier_commands.*`), listes d'identifiants (`studio_comments.object_ids`, `studio_dossiers.sheet_ids`), réglages (`*_tool_preferences`). Nombre d'entre elles portent des CHECK `jsonb_typeof`, ce qui est une bonne pratique.
- **Nommage** : snake_case partout, mais mélange FR/EN au niveau tables et colonnes (`atelier_objets.classe`, `geodata_versions.preparee_par` / `studio_*.created_by`). Préfixes de module cohérents.

## 3. Constats

### F1 — La migration verrouille 52 tables en exclusif à chaque démarrage, sans `lock_timeout`, et 83 contraintes ne sont jamais validées
- **Gravité** : Élevée
- **Constat** : `init.sql` recrée à chaque passage ses contraintes par `ALTER TABLE … DROP CONSTRAINT IF EXISTS …, ADD CONSTRAINT … NOT VALID`, par exemple `init.sql:574-582`, `822-843`, `917-946`, `1007-1031`, `1084-1091`. Il fait aussi des `CREATE OR REPLACE TRIGGER` et `CREATE OR REPLACE VIEW`.
  - Mesure sur le 2e passage, dans la transaction, avant ROLLBACK (`pg_locks` de la session) : **AccessExclusiveLock 52**, ShareRowExclusiveLock 49, ShareLock 101. Les tables en verrou exclusif comprennent `users`, `sessions`, `projects`, `studio_revisions`, `studio_publications`, `project_participations`, `auth.invitations`, `com_messages`, etc. (52 au total).
  - `migrate.ts:20` exécute le fichier en une seule requête, sans `SET lock_timeout` ni `statement_timeout` (`grep lock_timeout` : aucune occurrence).
  - Catalogue : **83 contraintes `convalidated = false`** (65 CHECK, 18 FK, liste dans `pg_constraint`). Elles sont supprimées et recréées NOT VALID à chaque passage, donc **ne sont jamais validées**. Une FK héritée de `projects_organization_fk` est elle aussi NOT VALID.
- **Impact** : si l'API ou un job tient une transaction longue (export, archive, `SELECT … FOR UPDATE`), la migration attend son verrou exclusif. Pendant ce temps, **toutes les requêtes** sur ces 52 tables (connexion incluse, `users` et `sessions`) s'empilent derrière elle : on obtient une indisponibilité pendant le déploiement. Le passage dure 0,22 s à vide **[hypothèse : beaucoup plus avec des données, à cause des `UPDATE` de reprise, par ex. `init.sql:94`, et du balayage de la vue]**. Les lignes antérieures à une contrainte ne sont jamais contrôlées, et l'état réel de la base dépend de l'histoire de chaque instance.
- **Recommandation** :
  1. Ne recréer une contrainte que si elle est absente ou si sa définition a changé (comparaison `pg_get_constraintdef`), sur le modèle de `init.sql:1655-1665` (`IF NOT EXISTS … pg_constraint`).
  2. Ajouter en tête de migration :
  ```sql
  SET lock_timeout = '3s';          -- échoue vite au lieu de bloquer le trafic ; relancer le déploiement
  SET statement_timeout = '5min';
  ```
  3. Valider une fois, hors pic, les contraintes NOT VALID (le `VALIDATE` ne prend que `ShareUpdateExclusiveLock` et ne bloque ni lectures ni écritures) :
  ```sql
  SET lock_timeout = '3s';
  DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT conrelid::regclass AS t, conname FROM pg_constraint WHERE NOT convalidated LOOP
      EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', r.t, r.conname);
    END LOOP; END $$;
  ```
  (Corriger d'abord les lignes en échec : un `VALIDATE` qui échoue indique une donnée historique non conforme.)
  4. À terme, passer à des migrations versionnées (le commentaire `init.sql:5-7` le prévoit déjà).
- **Effort** : M (refactorisation des blocs DROP/ADD : environ 80 occurrences).

### F2 — Droits de `fadi_app` trop larges : journaux supprimables, secret de signature, `spatial_ref_sys`
- **Gravité** : Élevée
- **Constat** (catalogue, `information_schema.role_table_grants`) :
  - `fadi_app` a **SELECT/INSERT/UPDATE/DELETE sur 155 relations**, INSERT/SELECT sur `admin.audit_log`, SELECT sur `project_members` (`init.sql:4032-4037`).
  - Au moins 13 tables de journal (relevé par nom `*_events|journal|_versions`, liste non exhaustive : `studio_observation_decisions`, `studio_requirement_sets`… suivent le même modèle) ont un déclencheur `*_no_update` mais **pas de garde DELETE**, et `fadi_app` y garde DELETE : `studio_access_events`, `studio_agent_events`, `studio_revision_events`, `studio_observation_events`, `studio_observation_task_events`, `studio_external_model_events`, `studio_approval_delegation_events`, `com_events`, `com_message_versions`, `collab_demande_events`, `rt_session_events`, `organization_template_versions`, etc. `geodata_journal` (`init.sql:3181`) et `atelier_lock_events` n'ont **aucun** déclencheur. Seuls `admin.audit_log`, `studio_publication_events` et `studio_publications` refusent le DELETE direct.
  - `archive_signing_keys.secret` (clé HMAC des archives, `init.sql:1059-1063`, `lib/archive-signing-key.ts:20-27`) est stockée **en clair**. `fadi_app` a UPDATE/DELETE dessus et `fadi_backup` SELECT (vérifié par `has_table_privilege` : `t|t|t`).
  - `has_table_privilege('fadi_app','public.spatial_ref_sys','INSERT,UPDATE,DELETE') = true`. `GRANT … ON ALL TABLES IN SCHEMA public`, exécuté par le superutilisateur, inclut la table de l'extension PostGIS.
  - `fadi_app` a `TEMP` sur la base (droit PUBLIC par défaut).
- **Impact** : une injection SQL ou un bug applicatif peut effacer des traces que le produit présente comme immuables (accès, actions d'agent, passages d'observation) ou altérer les définitions de SRID et fausser toutes les transformations PostGIS. La fuite d'un dump (rôle backup) livre aussi la clé de signature, ce qui permet de forger des archives « signées ».
- **Recommandation** :
  ```sql
  -- Journaux : ajout seul pour l'application (la cascade depuis le parent reste possible : elle s'exécute avec les droits du propriétaire de la FK)
  REVOKE UPDATE, DELETE ON studio_access_events, studio_agent_events, studio_revision_events, studio_observation_events,
    studio_observation_task_events, studio_external_model_events, studio_approval_delegation_events, com_events,
    com_message_versions, collab_demande_events, rt_session_events, geodata_journal, atelier_lock_events FROM fadi_app;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM fadi_app;
  REVOKE UPDATE, DELETE ON public.archive_signing_keys FROM fadi_app;
  REVOKE TEMP ON DATABASE fadi FROM PUBLIC;  -- si aucune requête n'utilise de table temporaire
  ```
  **[À vérifier avant]** : la purge (`studio_access_purges`, rétention) passe-t-elle par `fadi_app` ? Si oui, la confier à `fadi_retention` avec un GRANT ciblé. Pour `archive_signing_keys`, préférer `ARCHIVE_SIGNING_KEY` en variable d'environnement ou chiffrer le secret comme `totp_secret_enc`, et exclure la table de `fadi_backup` (`REVOKE SELECT ON archive_signing_keys FROM fadi_backup`) si la restauration régénère une clé.
  Ajouter dans `init.sql`, après les GRANT globaux, ces REVOKE pour qu'ils soient rejoués.
- **Effort** : S.

### F3 — Drift structurel `schema.ts` ↔ `init.sql` : Drizzle ne décrit qu'une partie de la base
- **Gravité** : Élevée (risque latent : destructeur si un outil Drizzle Kit est branché)
- **Constat** (comparaison `getTableConfig` ↔ catalogue réel) :
  - **47 tables présentes en base, absentes de `schema.ts`** : les 46 `geodata_*` (accédées en SQL brut via `pg.Pool`, par ex. `routes/geodata/*.ts`, `lib/geodata/*.ts`) et `archive_signing_keys` (SQL brut `lib/archive-signing-key.ts:20`).
  - **`project_members` est une VUE** (`init.sql:2623` `DROP TABLE project_members` puis `init.sql:2642` `CREATE OR REPLACE VIEW`), mais elle est déclarée `pgTable` dans `schema.ts:462-469`, avec PK composite, `notNull`, 2 FK et l'index `project_members_user_idx`, qui n'existent pas en base.
  - **CHECK** : 349 en base, **0** déclaré dans `schema.ts` (aucun `check()`).
  - **52 FK présentes en base, absentes de Drizzle** : toutes les FK composites « même variante / même étude » (`studio_revisions_parent_same_variant`, `studio_*_revision_of_variant`, `studio_*_variant_of_study`, `rt_sessions_revision_fk`…), les auto-références (`project_comments_parent_id_fkey` `init.sql:225`, `com_messages_reply_to_id_fkey`, `organization_mandates_replaces_mandate_id_fkey`) et `projects_organization_fk`.
  - **73 index présents en base, absents de Drizzle** : tous les index partiels `*_request_unique`, les index d'expression (`atelier_versions_nom_unique` sur `lower(nom)` `init.sql:427`, `audit_log_project_meta_idx`, `invitations_pending_email_idx`), `users_platform_role_idx`, `users_deletion_requested_idx`, `mail_outbox_*`, etc.
  - **Index déclarés dans Drizzle, absents en base** : `project_steps_project_id_step_number_unique` (`schema.ts:256`, redondant avec la PK `init.sql:102`) et `project_members_user_idx` (vue).
  - **Colonnes** (nullabilité/défaut) :
    | Colonne | init.sql | schema.ts |
    |---|---|---|
    | `studio_revision_events.xact_id` | `text NOT NULL DEFAULT txid_current()::text` (`init.sql:3479`) | `text("xact_id")` nullable, sans défaut (`schema.ts:1740`) |
    | `project_steps.content` | `DEFAULT '{}'` (`init.sql:101`) | sans défaut (`schema.ts:254`) |
    | `project_plans.steps` | `DEFAULT '{}'` (`init.sql:110`) | sans défaut (`schema.ts:273`) |
    | `programme_repartitions.custom` / `components` | défauts `'{}'` / `'[]'` (`init.sql:136-137`) | sans défaut (`schema.ts:305-306`) |
    | `studio_dossiers.sheet_ids` | `DEFAULT '[]'` (`init.sql:1241`) | sans défaut (`schema.ts:1548`) |
    | `studio_bascules.history` | `DEFAULT '[]'` (`init.sql:3532`) | sans défaut (`schema.ts:1778`) |
    | `organization_template_applications.plan` | `DEFAULT '[]'` (`init.sql:2047`) | sans défaut (`schema.ts:651`) |
    | `project_members.*` | vue : colonnes nullables, sans défaut | `notNull` + défauts (`schema.ts:462-469`) |
  - Aucun écart de **type** réel : `bigserial` côté Drizzle et `bigint` + séquence côté catalogue sont équivalents (faux positif écarté).
- **Impact** : `init.sql:1-7` présente Drizzle Kit comme le futur outil de migration. Un `drizzle-kit generate/push` construit sur ce `schema.ts` **supprimerait** les 47 tables geodata (ou les ignorerait selon le filtre), les 73 index (dont ceux d'unicité idempotente `*_request_unique`) et les 52 FK d'intégrité inter-variantes. Il tenterait aussi de **créer une table `project_members`** sur une vue. Les types inférés par Drizzle sont faux pour `xact_id` (on lit `string | null` alors que la colonne est toujours renseignée).
- **Recommandation** : décider d'une seule source de vérité. Pour garder `init.sql`, retirer la phrase sur Drizzle Kit et ajouter un test CI qui compare le catalogue à `schema.ts` (le script de ce rapport, `getTableConfig` contre `pg_catalog`, suffit). À défaut, compléter `schema.ts` : `pgView("project_members", …).existing()`, `check()`, FK composites via `foreignKey({ columns, foreignColumns })`, index partiels `.where(sql\`…\`)`, `xactId: text("xact_id").notNull().default(sql\`txid_current()::text\`)`. Supprimer l'index fantôme `project_steps_project_id_step_number_unique` de `schema.ts:256`.
- **Effort** : M (test CI : S ; alignement complet : M/L).

### F4 — FK de cascade sans index côté enfant (suppression de projet, d'étude ou de variante)
- **Gravité** : Moyenne
- **Constat** : la requête §5 de `pg_diagnostics.sql` remonte **213 FK sans index dont les premières colonnes sont exactement celles de la FK**. Après tri :
  - 128 FK pointent vers `users`. Or `users` n'est **jamais supprimé** (anonymisation, `lib/account-jobs.ts:61-65`) et sa PK ne change pas. **Impact quasi nul** : ne pas créer ces 87 index.
  - **77 FK hors `users` n'ont même pas d'index commençant par leur 1re colonne**, notamment des CASCADE parcourues par la suppression d'un projet (`routes/projects.ts:286`, `lib/account-jobs.ts:45`) :
    - → `projects(id)` (11) : `auth.invitations.project_id`, `organization_template_applications.project_id`, `organization_mandates.project_id`, `review_assignments.project_id`, `com_pieces.project_id`, `com_links.project_id`, `rt_annotations.project_id`, `studio_study_contexts.project_id`, `studio_jobs.project_id`, `studio_revision_events.project_id`, `studio_migrations.project_id`.
    - → `studio_studies(id)` (6) : `studio_requirement_checks`, `studio_external_models`, `studio_illustrations`, `studio_agent_proposals`, `studio_revision_events`, `studio_bascules` (`.study_id`).
    - → `studio_variants` (5) : `studio_requirement_checks`, `studio_external_models`, `studio_illustrations`, `rt_sessions` (`(study_id, variant_id)` : l'index existant ne commence pas ainsi) et `studio_jobs.variant_id`.
    - → `studio_revisions` (6) : `studio_sheets`, `studio_dossiers`, `studio_section_views`, `rt_sessions` (`(variant_id, revision_id)`), `studio_document_migrations.revision_id`, `studio_variants.derived_from_*`.
    - → `com_messages` : `com_message_versions.message_id` (aucun index en dehors de la PK alors que `routes/com.ts:208` filtre `inArray(messageId)`), `com_messages.reply_to_id`, `collab_demandes.source_message_id`.
    - → `project_comments.parent_id` (auto-référence CASCADE, `init.sql:225`).
    - GeoData : `geodata_sources/versions/collections/zones/exports.espace_id`, `geodata_territoires.version_id`, `geodata_indicateurs.couche_id`, `geodata_prix_lots.edition_id/source_cle`, `geodata_prix_observations.lot_id`, `geodata_prix_valeurs_officielles.(edition_id, zone_id, lot_id)`.
- **Impact** : supprimer un projet (ou anonymiser un compte propriétaire) déclenche, pour chaque FK non indexée, un **seq scan de la table enfant**, et cela récursivement (projet → études → variantes → révisions → feuilles/dossiers…). Les verrous restent posés tout ce temps. Il en va de même pour les lectures applicatives par `project_id` (`lib/participants-db.ts:80,129` sur `auth.invitations.project_id`). **[hypothèse : coût négligeable aujourd'hui, la volumétrie de production étant inconnue]**.
- **Recommandation** (hors transaction, une par une) :
  ```sql
  SET lock_timeout = '3s';
  CREATE INDEX CONCURRENTLY IF NOT EXISTS invitations_project_idx ON auth.invitations (project_id) WHERE project_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY IF NOT EXISTS review_assignments_project_idx ON review_assignments (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS organization_mandates_project_idx ON organization_mandates (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS organization_template_applications_project_idx ON organization_template_applications (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS com_pieces_project_idx ON com_pieces (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS com_links_project_idx ON com_links (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS rt_annotations_project_idx ON rt_annotations (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_study_contexts_project_idx ON studio_study_contexts (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_jobs_project_idx ON studio_jobs (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_jobs_variant_idx ON studio_jobs (variant_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_revision_events_project_idx ON studio_revision_events (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_revision_events_study_idx ON studio_revision_events (study_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_migrations_project_idx ON studio_migrations (project_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_requirement_checks_study_variant_idx ON studio_requirement_checks (study_id, variant_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_external_models_study_variant_idx ON studio_external_models (study_id, variant_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_illustrations_study_variant_idx ON studio_illustrations (study_id, variant_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_agent_proposals_study_idx ON studio_agent_proposals (study_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_bascules_study_idx ON studio_bascules (study_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_sheets_variant_revision_idx ON studio_sheets (variant_id, revision_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_section_views_variant_revision_idx ON studio_section_views (variant_id, revision_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_dossiers_quantities_idx ON studio_dossiers (quantities_variant_id, quantities_revision_id) WHERE quantities_variant_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY IF NOT EXISTS rt_sessions_variant_revision_idx ON rt_sessions (variant_id, revision_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_document_migrations_revision_idx ON studio_document_migrations (revision_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS com_message_versions_message_idx ON com_message_versions (message_id);
  CREATE INDEX CONCURRENTLY IF NOT EXISTS project_comments_parent_idx ON project_comments (parent_id) WHERE parent_id IS NOT NULL;
  CREATE INDEX CONCURRENTLY IF NOT EXISTS com_messages_reply_to_idx ON com_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
  -- GeoData : espace_id / version_id / couche_id / lot_id selon volumétrie (tables de référence surtout en lecture)
  ```
  Puis contrôler les index invalides : `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`. **Ne pas** indexer les 128 FK vers `users`.
  Note : `init.sql` s'exécute dans une transaction (`pool.query` multi-instruction), donc `CONCURRENTLY` y est **impossible**. Lancer ces créations par un script de maintenance séparé, puis ajouter `CREATE INDEX IF NOT EXISTS` équivalent dans `init.sql` (no-op une fois l'index présent).
- **Effort** : S (script) + M (vérification par EXPLAIN sur données réalistes).

### F5 — Unicité de l'adresse e-mail sensible à la casse ; recherches `lower(email)` sans index
- **Gravité** : Moyenne
- **Constat** : `CREATE UNIQUE INDEX users_email_unique ON users (email)` (`init.sql:53`). L'API normalise en minuscules à l'entrée (`routes/auth.ts:63` `z.string().trim().toLowerCase()`) puis cherche par `eq(users.email, email)` (`routes/auth.ts:135,168,574`), ce qui est cohérent. En revanche : `lib/studio-archive.ts:183` (`WHERE lower(email) IN (…)`), `db/geodata-role.ts` (`WHERE lower(email) = lower($1)`), `lib/project-invitations-db.ts:181` (`lower(invitations.email)`, couvert par l'index d'expression `init.sql:2480`) et `lib/studio-archive-manifest.ts:582`.
- **Impact** : `lower(email)` sur `users` part en seq scan (index inutilisable). Rien ne garantit en base l'absence de doublons `A@x` / `a@x` : un compte créé avant la normalisation ou par un autre chemin (script `create-admin.mjs`, restauration d'archive) casserait la recherche exacte **[hypothèse : aucun doublon constaté, la base de test étant vide]**.
- **Recommandation** :
  ```sql
  -- 1) vérifier
  SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
  -- 2) si vide
  SET lock_timeout = '3s';
  CREATE UNIQUE INDEX CONCURRENTLY users_email_lower_unique ON users (lower(email));
  -- 3) puis, après bascule des requêtes sur lower(email) ou vérification que tout est normalisé :
  DROP INDEX CONCURRENTLY users_email_unique;
  ```
  Ajouter `CHECK (email = lower(btrim(email))) NOT VALID` puis `VALIDATE` pour figer la normalisation.
- **Effort** : S.

### F6 — Index dupliqués ou redondants
- **Gravité** : Faible
- **Constat** (sections 6b/6c de pg_diagnostics) :
  - Doublon exact : `project_plan_baselines_project_idx (project_id, version)` (`init.sql:126-127`) est identique à la PK `(project_id, version)` (`init.sql:124`).
  - Préfixe redondant : `project_steps_project_id_idx (project_id)` (`init.sql:104`) est couvert par la PK `(project_id, step_number)` ; `studio_observations_variant_idx (variant_id)` (`init.sql:655`) est couvert par `studio_observations_variant_comment_unique (variant_id, comment_id)` (`init.sql:700`).
- **Impact** : écritures et WAL en trop, place perdue (faible aujourd'hui).
- **Recommandation** :
  ```sql
  DROP INDEX CONCURRENTLY IF EXISTS project_plan_baselines_project_idx;
  DROP INDEX CONCURRENTLY IF EXISTS project_steps_project_id_idx;
  DROP INDEX CONCURRENTLY IF EXISTS studio_observations_variant_idx;
  ```
  et retirer les `CREATE INDEX` correspondants d'`init.sql` (sinon ils sont recréés au démarrage suivant), ainsi que l'index fantôme `schema.ts:256`.
- **Effort** : S.

### F7 — Index composites mal alignés sur les requêtes réelles (exemples vérifiés)
- **Gravité** : Faible à Moyenne selon volumétrie
- **Constat** :
  - `atelier_outbox` : requête `WHERE project_id = $1 AND processed_at IS NULL ORDER BY created_at` (`lib/atelier-events.ts:45`). Index `atelier_outbox_pending_idx (project_id, processed_at)` (`init.sql:412`) : il filtre, mais oblige à un tri et contient toutes les lignes traitées (la table ne fait que grossir).
  - `studio_revisions` : liste `WHERE variant_id = $1 ORDER BY created_at DESC, id DESC` (`lib/studio-commands.ts:254-255`). Seuls `(variant_id, id)` et `(variant_id, request_id)` existent, donc il y a un tri de toutes les révisions de la variante (chaque ligne embarque un `document` jsonb, TOAST).
  - `sessions` : `WHERE user_id = $1 AND revoked_at IS NULL AND mfa_pending = false AND expires_at > now()` (`routes/auth.ts:340`, `routes/admin/index.ts:120`). `sessions_user_id_idx (user_id)` suffit tant que le nombre de sessions par compte est faible, mais **aucune purge des sessions expirées n'a été trouvée** (`grep` : la seule suppression est `lib/account-jobs.ts:54`, à l'anonymisation).
  - `admin.mail_outbox` : `WHERE status='pending' AND next_attempt_at <= now() ORDER BY next_attempt_at … FOR UPDATE SKIP LOCKED` (`lib/mailer/outbox.ts:55-56`) est bien servi par l'index partiel `init.sql:1810`. Conforme.
- **Recommandation** :
  ```sql
  CREATE INDEX CONCURRENTLY atelier_outbox_unprocessed_idx ON atelier_outbox (project_id, created_at) WHERE processed_at IS NULL;
  DROP INDEX CONCURRENTLY atelier_outbox_pending_idx;
  CREATE INDEX CONCURRENTLY studio_revisions_variant_created_idx ON studio_revisions (variant_id, created_at DESC, id DESC);
  CREATE INDEX CONCURRENTLY sessions_expires_idx ON sessions (expires_at);  -- pour un job de purge
  -- job périodique :
  DELETE FROM sessions WHERE ctid IN (SELECT ctid FROM sessions WHERE greatest(expires_at, coalesce(absolute_expires_at, expires_at)) < now() - interval '7 days' LIMIT 5000);
  ```
  Valider chaque index par `EXPLAIN (ANALYZE, BUFFERS)` sur un jeu de données réaliste.
- **Effort** : S.

### F8 — jsonb utilisé comme données relationnelles filtrées
- **Gravité** : Faible
- **Constat** :
  - `projects.editing_lock` (`{userId, email, since, expiresAt}`, `init.sql:91`) est filtré par `editing_lock->>'userId' = $1` (`lib/account-jobs.ts:52`, `routes/admin/index.ts:200`, `lib/fin-participation.ts:23`) : seq scan de `projects` à chaque appel. Il contient aussi une **adresse e-mail** (PII dupliquée).
  - `geodata_versions.droits->>'consultation' = 'autorise'` sert de prédicat d'accès dans 6 requêtes (`routes/geodata/prix.ts:92,102`, `territoires.ts:26,124`, `tableau-de-bord.ts:17`, `lib/geodata/acces.ts:97`).
  - `admin.audit_log.metadata->>'projectId'` : couvert par l'index d'expression `init.sql:1928`. Conforme.
  - `atelier_commands.effets->'crees' @> …` (`routes/atelier-versions.ts:624`) : déjà restreint par `project_id`. Acceptable.
  - `projects` compte **7 colonnes jsonb** (`source_attachment`, `parcel_transmission`, `site_observations`, `programme_state`, `harmony`, `editing_lock`, `site_context`) : ligne large et chaude (`model_revision`, `updated_at`, verrou).
- **Recommandation** : passer le verrou d'édition en colonnes typées (`editing_locked_by text REFERENCES users(id)`, `editing_lock_expires_at timestamptz`) avec un index partiel `WHERE editing_locked_by IS NOT NULL`, et ne plus y stocker l'e-mail (le joindre depuis `users`). Pour `geodata_versions`, une colonne générée suffit :
  ```sql
  ALTER TABLE geodata_versions ADD COLUMN consultation text GENERATED ALWAYS AS (droits->>'consultation') STORED;
  ```
  (réécriture de table : à faire hors pic. Volume probablement faible, **[hypothèse]**.) **[Hypothèse]** : à moyen terme, sortir les gros documents de `projects` (Harmony, programme) dans des tables 1-1 pour garder la ligne projet petite.
- **Effort** : M.

### F9 — Clés primaires `text` (`prefix_uuidv4`)
- **Gravité** : Faible (dette de conception, pas d'urgence)
- **Constat** : 105 PK `text` générées par `newId(prefix)` = `` `${prefix}_${randomUUID()}` `` (`lib/ids.ts:3-5`), environ 40 octets ; toutes les FK et index composites (`(variant_id, id)`, `(project_id, id)`…) répètent ces chaînes. UUIDv4 donne une insertion aléatoire dans le B-tree. La référence §4 recommande « jamais d'UUID en text ».
- **Impact** : index environ 2 à 3 fois plus gros qu'en `uuid`/`bigint`, cache moins efficace, splits de pages à l'insertion. Négligeable à faible volume.
- **Recommandation** : ne **pas** migrer l'existant (coût L, gain modeste). Pour les nouvelles tables à fort volume (journaux, évènements), utiliser `bigint GENERATED ALWAYS AS IDENTITY` (et non `bigserial`) ; si l'identifiant est exposé, un UUIDv7 généré côté application et stocké en `uuid`.
- **Effort** : — (règle de conception).

### F10 — Pas de RLS : isolation entièrement applicative
- **Gravité** : Moyenne (choix d'architecture, à acter)
- **Constat** : `relrowsecurity` est faux sur toutes les tables, il n'existe aucune policy. L'accès passe par la vue `project_effective_access` (`init.sql:2427-2444`) et les contrôles de l'API. Les vues sont exécutées avec les droits de `fadi_owner` (pas de `security_invoker`, `reloptions` vide), ce qui est sans conséquence tant que `fadi_app` lit déjà toutes les tables.
- **Impact** : une requête qui oublie le filtre `project_id` ou le contrôle d'accès expose les données de tous les projets. Les FK composites limitent les références croisées entre variantes (bon point), mais ne protègent pas la lecture.
- **Recommandation** : défense en profondeur ciblée sur les tables les plus sensibles (`studio_revisions`, `project_comments`, `com_messages`) avec `set_config('app.user_id', $1, true)` par transaction, policy fondée sur `project_effective_access`, `ENABLE` + `FORCE ROW LEVEL SECURITY`. **[Hypothèse]** : le coût de performance de la vue dans une policy est à mesurer. Sinon, documenter explicitement ce choix (ADR).
- **Effort** : L.

### F11 — Fonctions de déclencheur sans `search_path` fixé
- **Gravité** : Faible
- **Constat** : 34 fonctions plpgsql, toutes `SECURITY INVOKER` (`prosecdef = f`), `proconfig` vide. Certaines référencent des tables non qualifiées, par exemple `studio_publication_no_delete()` → `projects` (`init.sql:982-989`) et `studio_publication_event_no_delete()` → `studio_publications` (`init.sql:972-979`). `fadi_app` a `search_path = public, auth, admin` et n'a pas CREATE sur `public` (vérifié : `create_public = f`).
- **Impact** : pas d'escalade possible (aucun SECURITY DEFINER, pas de droit CREATE pour l'app). Simple risque de résolution inattendue si le `search_path` change.
- **Recommandation** : `ALTER FUNCTION studio_publication_no_delete() SET search_path = public, pg_temp;` (idem pour les fonctions qui lisent d'autres tables), ou qualifier les noms (`public.projects`).
- **Effort** : S.

### F12 — Données personnelles et secrets : inventaire des colonnes
- **Gravité** : Faible (constat ; une copie e-mail non anonymisée relève de la Moyenne si elle se confirme)
- **Constat** :
  - Secrets correctement protégés : `users.password_hash` (argon2id), `users.totp_secret_enc` (chiffré), `auth.user_recovery_codes.code_hash`, `auth.account_tokens.token_hash`, `auth.invitations.token_hash`, `sessions.token_hash`, `studio_agent_tokens.key_digest`. **En clair** : `archive_signing_keys.secret` (voir F2).
  - PII : `users.email`, `users.display_name`, `sessions.ip`, `sessions.user_agent`, `admin.audit_log.ip`, `admin.mail_outbox.to_address`, `auth.invitations.email`, `people.work_email`, `people.work_phone`, `people.job_title`. Copies dénormalisées d'e-mail : `project_comments.author_email` (anonymisée, `lib/account-jobs.ts:51`), `projects.editing_lock.email` (vidée, `:52`), **`atelier_locks.transmis_par`** (e-mail, `init.sql:477`) : **aucun traitement trouvé** dans `anonymiseAccountIn` (`lib/account-jobs.ts:39-70`) **[hypothèse : effacée par un autre chemin non trouvé ; à confirmer]**.
- **Recommandation** : remplacer `atelier_locks.transmis_par` par un `user_id` (FK `users`) ou l'ajouter à l'anonymisation ; prévoir la rétention de `sessions.ip/user_agent` (voir purge F7).
- **Effort** : S.

### F13 — Divers schéma
- **Gravité** : Faible
- **Constat** :
  - `studio_study_steps` **sans PK** (`init.sql:797-803`) : la contrainte UNIQUE sur des colonnes NOT NULL en tient lieu, mais la réplication logique et certains outils (pg_repack) exigent une PK ou une REPLICA IDENTITY.
  - 13 `bigserial` (séquences propriétaires) au lieu de `GENERATED ALWAYS AS IDENTITY`.
  - 6 colonnes `bytea` en ligne : `step_files.content`, `drawing_exports.content`, `volumes.content`, `com_pieces.content`, `geodata_rasters.valeurs`, `geodata_fichiers.contenu`. Elles gonflent la base, les sauvegardes (`fadi_backup`) et le WAL. C'est assumé par D-GD-29 pour `geodata_fichiers` (archivage en base exigé).
  - `projects.parcel_footprint geography(Polygon,4326)` sans index GiST : aucune requête spatiale ne l'utilise (`grep ST_` : seules les tables `geodata_*` sont interrogées spatialement, et elles ont leurs GiST). Conforme tant que cela reste vrai.
  - Hétérogénéité de nommage (`at`/`le`/`cree_le`/`created_at`, FR/EN).
- **Recommandation** :
  ```sql
  ALTER TABLE studio_study_steps ADD CONSTRAINT studio_study_steps_pkey PRIMARY KEY USING INDEX studio_study_steps_unique;
  ```
  (PK sur l'index unique existant : pas de reconstruction ; verrou bref, à faire avec `SET lock_timeout='3s'`.) Convention de nommage à fixer pour les nouvelles tables.
- **Effort** : S.

## 4. Requêtes de diagnostic utilisées (reproductibles)

Sections 5, 6b, 6c, 6d de `pg_diagnostics.sql`, plus les requêtes catalogue suivantes : comptage par schéma et `relkind`, `pg_constraint` (`contype`, `convalidated`), tables sans PK, types de PK, histogramme `format_type`, recherche `json/timestamp/varchar/money`, `geometry_columns`/`geography_columns`, index GiST/GIN, `confdeltype`, RLS, `pg_proc.prosecdef/proconfig`, déclencheurs, `information_schema.role_table_grants` et `column_privileges`, `has_table_privilege`, et `pg_locks` d'une transaction rejouant `init.sql`. Sorties brutes (session) : `/tmp/claude-0/-home-claude/a425e417-097b-5548-9458-948247a7c196/scratchpad/catalog.out` et `…/scratchpad/dz/cmp.out` (comparaison Drizzle).

Non couvert (aucune donnée) : index inutilisés (`idx_scan`), bloat, `pg_stat_statements`, plans EXPLAIN sur données réelles. À relancer sur la base de production avec un rôle `pg_read_all_stats`.
