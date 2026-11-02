# Base de données : fiabilité et performance — Plan

Établi le 2026-11-02 à partir de l'audit du commit `b9d9897` (dossier `audit/`). Ce plan ne vaut pas autorisation :
chaque lot suit le cycle Issue → branche courte → PR → preuves → STATUS/HANDOFF → revue, et la production attend
l'accord explicite du maître d'ouvrage.

## 1. Analyse croisée

63 constats (18 élevés, 30 moyens, 15 faibles, aucun critique ; aucune injection SQL exploitable). Ils découlent de
cinq causes communes :

1. **Schéma non versionné** : `init.sql` (4 046 lignes) rejoué d'un bloc par `migrate.ts:20`. Il produit les verrous
   exclusifs sur 52 tables, les 83 contraintes jamais validées, les reprises rejouées, l'écart `schema.ts` / SQL,
   l'absence de test de montée de version, et interdit `CREATE INDEX CONCURRENTLY`. **Chantier central (BD-2).**
2. **Aucune borne de temps** : ni délai de connexion, de requête, de verrou, ni de transaction inactive.
3. **Tâches de fond trop gourmandes** sur un pool de 10 : temps réel toutes les 2 s, cloche toutes les 60 s,
   ramasse-miettes dans une requête utilisateur.
4. **Cycle de vie inachevé** : pas de PITR, rétention distante non appliquée, purges absentes, rôles de production
   prévus mais non utilisés.
5. **Règles du projet partiellement tenues dans le code** : D-7 (droits de `fadi_app` trop larges) et D-GD-29
   (catalogues embarqués, repli de l'interface).

Stratégie : garde-fous en une semaine sans changer l'architecture (BD-1), puis socle des migrations (BD-2) dont
dépendent index et contraintes (BD-3) et la performance (BD-4) ; sauvegardes (BD-5), RGPD (BD-6), navigateur (BD-7) et
GeoData (BD-8) en parallèle ; architecture (BD-9) sur décision.

Effort : environ 40 jours-personne pour BD-0 à BD-8 (8 à 10 semaines pour une personne), environ 20 jours pour BD-9.

## 2. Décisions attendues du maître d'ouvrage

| Réf. | Décision | Proposition | Bloque |
| --- | --- | --- | --- |
| D-BD-1 | RPO et RTO | RPO 15 min, RTO 2 h | BD-5.1, BD-5.4 |
| D-BD-2 | Rétention des sauvegardes distantes, durée au registre RGPD | 14 quotidiennes, 8 hebdomadaires, 12 mensuelles ; 12 mois au plus | BD-5.3 |
| D-BD-3 | Autoriser `restic forget` / `prune` après inventaire et essai à blanc | Oui, timer distinct | BD-5.3 |
| D-BD-4 | Effacement des contacts à 2 ans en production (`CONTACT_RETENTION_ENABLED`) | Oui | BD-6.2 |
| D-BD-5 | Isolation entre projets : applicative (ADR) ou RLS ciblée | ADR maintenant ; RLS en BD-9 si souhaitée | BD-9.5 |
| D-BD-6 | Statut des catalogues `apps/api/src/data/*.json` (D-GD-29) | Étapes et formulaires = configuration ; bibliothèque, Harmonie, répartition = données | BD-9.6 |
| D-BD-7 | Studio : verrou de la variante plutôt que du projet pendant une commande | À confirmer avec l'équipe Studio | BD-4.8 |
| D-BD-8 | Fichiers `bytea` : en base ou stockage objet, hébergeur | Stockage objet S3 en Suisse ; `geodata_fichiers` reste en base | BD-9.1 |
| D-BD-9 | Montée de version PostgreSQL et fenêtre | PostgreSQL 18, fenêtre annoncée | BD-9.2 |
| D-BD-10 | Haute disponibilité | Standby en streaming sur une seconde machine | BD-9.3 |
| D-BD-11 | Durées de conservation des sessions expirées, jetons de compte et courriels traités (registre de traitement) | À fixer ; la purge reste désactivée sans elles | BD-6.1 |
| D-BD-12 | Quarantaine Dexie : vider à l'oubli de l'appareil et borner à 30 jours, ou conserver (MIG-COEX-04, ADR-STUDIO-PILOTE-01 « ne jamais supprimer ») | Maître d'ouvrage ; quarantaine laissée intacte d'ici là | BD-7.1 |

Une décision manquante ne bloque que les tâches qui en dépendent.

## 3. Lots

Codes de constats : S = `audit/01-schema-index.md` (S1 = F1), Q = `audit/02-requetes.md` (Q1 = F-01),
M = `audit/03-migrations-exploitation.md` (M1 = F-01), A et B = `audit/04-local-geodata.md`.

### BD-0 — Cadrage et mesures (1 j, sans code)

- BD-0.1 Ouvrir l'Issue, commiter ce dossier, ajouter l'Issue à l'index des chantiers.
- BD-0.2 Mesures en lecture seule (préproduction, puis production avec accord) : taille de `volumes`, `step_files`,
  `studio_revisions`, `sessions`, `admin.audit_log` ; `SELECT count(*) FROM pg_constraint WHERE NOT convalidated` ;
  doublons `lower(email)` ; `to_regclass('public.atelier_store')` ; durée du service `migrate` ; état Healthchecks ;
  taille du dépôt restic.
- BD-0.3 `pg_stat_statements` en préproduction ; `pg_diagnostics.sql` ; ligne de base archivée.
- BD-0.4 Décisions D-BD-1 à D-BD-4.

Acceptation : mesures datées dans `STATUS.md`, ligne de base archivée.

### BD-1 — Garde-fous immédiats (3,5 j, P0)

| Tâche | Contenu | Constats | Effort |
| --- | --- | --- | --- |
| BD-1.1 | `SET lock_timeout = '3s'` et `statement_timeout` en tête d'`init.sql` ; 3 relances sur `55P03` dans `migrate.ts` ; contrôle `pg_stat_activity` avant `migrate` dans `deploy/` | S1, M2 | 0,5 j |
| BD-1.2 | Pool `pg` : `connectionTimeoutMillis` 5 s, `statement_timeout` 15 s, `idle_in_transaction_session_timeout` 30 s, `application_name`, `pool.on('error')`, arrêt propre SIGTERM/SIGINT ; `ALTER ROLE fadi_app SET …` ; `chargerModele` sur une connexion (`repeatable read`, `read only`) | Q1 | 0,5 j |
| BD-1.3 | `nettoyerVolumes` hors de `DELETE /projects/:id`, en tâche planifiée | Q7 | 0,5 j |
| BD-1.4 | `REVOKE` : UPDATE/DELETE sur les journaux, écriture sur `spatial_ref_sys` et `archive_signing_keys`, `TEMP` ; déclencheurs anti-suppression sur `geodata_journal`, `atelier_lock_events` ; vérifier d'abord les purges passant par `fadi_app` | S2 | 0,5 j |
| BD-1.5 | `docs/deploiement.md` : restauration dans `fadi_restore`, contrôles, bascule, `docker compose run --rm migrate`, démarrage ; retrait de `MIGRATE_ON_START` (l. 11, 48, 63-72) | M12 | 0,25 j |
| BD-1.6 | Healthchecks constaté et consigné ; sonde du conteneur `backup` (dump de moins de 26 h) ; `/health` avec requête bornée | M13, M17 | 0,5 j |
| BD-1.7 | `forgetDevice` purge les préfixes `localStorage` du compte ; MapTiler en `sessionStorage` ; e2e A → B | A1 | 0,5 j |
| BD-1.8 | `bascule.ts` : annuler si un projet est sauté (l. 57) au lieu de supprimer `atelier_store` (l. 117) | M3 | 0,25 j |

Acceptation : `migrate` échoue en moins de 5 s face à un verrou tenu, sans bloquer les lectures ; `SHOW
statement_timeout` = `15s` en `fadi_app` ; `has_table_privilege('fadi_app', <journal>, 'DELETE')` faux ; e2e de
changement de compte vert ; CI verte ; déploiement en préproduction.

### BD-2 — Migrations versionnées (6 j, socle)

- BD-2.1 Exécuteur `apps/api/src/db/migrations/` : `0000_baseline.sql` = `init.sql` actuel ; table
  `schema_migrations (version, name, checksum, applied_at, duration_ms)` ; `pg_advisory_lock` ; une transaction par
  fichier ; `*.concurrent.sql` hors transaction ; refus d'un fichier appliqué modifié ; base existante marquée
  « baseline appliquée » après contrôle de structure. (M1)
- BD-2.2 Droits dans `R__grants.sql`, seul fichier rejoué ; plus de suppression/recréation de contraintes. (S1, M2)
- BD-2.3 `0001_validate_constraints` : `VALIDATE` des 83 contraintes après correction des lignes en échec. (M5)
- BD-2.4 Reprises figées dans la baseline ; futures reprises par lots (gabarit sans interruption). (M4)
- BD-2.5 squawk en CI ; règle ESLint contre `sql.raw` et l'interpolation dans `.query(` hors liste blanche. (Q13)
- BD-2.6 Job CI « montée de version » : dernière Release + données → migrations du HEAD → `verify-restore`. (M8)
- BD-2.7 Test d'écart `schema.ts` / base ; `project_members` en vue ; `drizzle-kit push` interdit ; choix entre
  complétion manuelle et `drizzle-kit pull`. (S3, M7)
- BD-2.8 Guide : expand/contract, pas de contraction dans la même Release, retour arrière ; nouvelles tables en
  `bigint GENERATED ALWAYS AS IDENTITY` ou UUIDv7 ; nommage unifié. (M6, S9, S13)

Acceptation : un deuxième `migrate` sans verrou exclusif (`pg_locks`) ; jobs montée de version, squawk et écart verts ;
zéro contrainte `NOT VALID` en préproduction.

### BD-3 — Index, contraintes et droits (2,5 j ; dépend de BD-2.1)

- BD-3.1 Les 26 index de cascade de `audit/01-schema-index.md` F4 ; pas d'index sur les 128 FK vers `users`. (S4)
- BD-3.2 Doublons d'e-mail contrôlés ; `UNIQUE (lower(email))` ; `CHECK (email = lower(btrim(email)))`. (S5)
- BD-3.3 Suppression de `project_plan_baselines_project_idx`, `project_steps_project_id_idx`,
  `studio_observations_variant_idx` et de l'index fantôme `schema.ts:256`. (S6)
- BD-3.4 `atelier_outbox (project_id, created_at) WHERE processed_at IS NULL` ; `studio_revisions (variant_id,
  created_at DESC, id DESC)` ; `sessions (expires_at)`. (S7)
- BD-3.5 Index de la cloche : `com_messages (author_id, conversation_id)`, `atelier_commands (author_id, project_id,
  result_revision)`, `atelier_commands (project_id, created_at DESC)`, `atelier_locks (author_id, expires_at)`,
  `drawing_exports (created_by, created_at DESC)`. (Q3)
- BD-3.6 Verrou d'édition en colonnes typées sans e-mail (expand/contract) ; `geodata_versions.consultation` générée. (S8)
- BD-3.7 `search_path` des fonctions de déclencheur ; PK de `studio_study_steps` sur son index unique. (S11, S13)

Acceptation : plus de cascade non indexée hors `users` ; aucun index invalide ; EXPLAIN avant/après par index.

### BD-4 — Performance des requêtes (10 j ; dépend de BD-1.2 et BD-3.5)

| Tâche | Contenu | Constats | Effort |
| --- | --- | --- | --- |
| BD-4.1 | Cloche : historique borné, calcul en SQL, `LATERAL` au lieu de la boucle, colonnes projetées, sondage ralenti onglet caché | Q3 | 2 j |
| BD-4.2 | Temps réel : sessions et couples (projet, compte) en une requête chacun par cycle ; intervalle 15–30 s | Q2 | 1,5 j |
| BD-4.3 | Projections de `loadProjectAccess`, `resolveSession`, `GET /projects` ; pagination | Q5 | 2 j |
| BD-4.4 | `loadProjectAccessMany`, `loadReviewAccessMany` ; `/com/boite` en 5–6 requêtes ; insertions multi-lignes | Q4, Q8 | 2 j |
| BD-4.5 | Verrous : condition dans l'écriture, `rowCount`, tests de concurrence | Q11 | 0,5 j |
| BD-4.6 | Export d'archive et fichiers en flux | Q6 | 0,5 j |
| BD-4.7 | File de courriels en bail, SMTP hors transaction | Q10 | 0,5 j |
| BD-4.8 | Studio : verrou de variante (après D-BD-7) | Q10 | 1 j |
| BD-4.9 | Fichiers statiques avant `attachUser` | Q14 | 0,25 j |

Acceptation : `GET /notifications` à 8 requêtes au plus, sans boucle ; `/com/boite` indépendant du nombre de
conversations ; test de charge à 200 connexions temps réel sans attente HTTP sur le pool (`pool.waitingCount`) ;
rejeu Studio vert ; `pg_stat_statements` avant/après dans chaque PR.

### BD-5 — Sauvegardes, PITR, exploitation (5 j + administrateur ; dépend de D-BD-1 à D-BD-3)

- BD-5.1 pgBackRest ≥ 2.59.3 (ou WAL-G) vers Swiss Backup : `archive_mode`, `archive_timeout`, complète hebdomadaire,
  différentielle quotidienne, chiffrement, alerte `pg_stat_archiver.failed_count`. (M11)
- BD-5.2 `ops/restore-drill.sh` mensuel : PITR à un instant aléatoire, conteneur jetable sans réseau, migration,
  contrôles `verify-restore`, RTO envoyé à Healthchecks. (M12)
- BD-5.3 Rétention restic (essai à blanc consigné d'abord) ; purge des dumps de déploiement ; `.env.deploy` dans un
  dépôt séparé chiffré (age ou sops). (M14)
- BD-5.4 Production en `fadi_migrator` et `fadi_backup` ; super-utilisateur à l'amorçage seulement ; secrets Docker. (M9)
- BD-5.5 Supervision : disque, connexions, verrous, âge des transactions, archivage WAL ; `restic check
  --read-data-subset` hebdomadaire. (M13)
- BD-5.6 Réglages PostgreSQL dimensionnés ; limites de ressources et rotation des journaux ; image par empreinte ;
  sauvegardes locales sur un autre disque. (M10, M17)

Acceptation : exercice PITR réussi en préproduction avec RTO mesuré ; alerte déclenchée par une panne d'archivage
simulée ; RPO/RTO consignés dans `docs/deploiement.md`.

### BD-6 — Cycle de vie des données et RGPD (3,5 j)

- BD-6.1 Tâche quotidienne en `fadi_retention` sous verrou consultatif : sessions, jetons, file de courriels expirés,
  durées du registre de traitement. (M16, S7, Q14)
- BD-6.2 Effacement des contacts à 2 ans (D-BD-4). (M16)
- BD-6.3 Ramasse-miettes des volumes après anonymisation, plus passage planifié. (M15)
- BD-6.4 `atelier_locks.transmis_par` → identifiant de compte, ou anonymisation. (S12)
- BD-6.5 `archive_signing_keys.secret` chiffré ou en variable d'environnement ; `REVOKE SELECT … FROM fadi_backup`. (S2)
- BD-6.6 Révisions Studio sans double stockage, test de non-régression du rejeu. (Q9)

Acceptation : aucune ligne au-delà de sa durée après passage ; test d'anonymisation couvrant `transmis_par` et
volumes ; taille d'une révision divisée par deux sur un même scénario.

### BD-7 — Stockage navigateur (2 j, indépendant)

- BD-7.1 Quarantaine vidée par `forgetDevice` et bornée. (A2)
- BD-7.2 `navigator.storage.persist()` pour toutes les files. (A3)
- BD-7.3 `clientRequestId` sur les commentaires, unicité serveur. (A4)
- BD-7.4 Purge sur 401 en cours de session. (A5)
- BD-7.5 `oublierProjet` supprime le brouillon Planche. (A6)
- BD-7.6 Préfixes d'API partagés service worker / serveur. (A7)
- BD-7.7 Gestionnaires Dexie `versionchange` / `blocked`, échecs signalés. (A8)

Acceptation : tests unitaires par tâche ; e2e « 401 en cours de session » ; rien du compte précédent après changement.

### BD-8 — GeoData (7 j)

| Tâche | Contenu | Constats | Effort |
| --- | --- | --- | --- |
| BD-8.1 | Import atomique : `UNIQUE (source_id, empreinte) WHERE espace_id IS NULL`, `pg_advisory_xact_lock`, recherche et publication dans la transaction, un seul import automatique | B1 | 0,5 j |
| BD-8.2 | Archive des fichiers dans la transaction ; correction de `--prix-sources` (`geodata-reference.ts:385`) | B6 | 0,5 j |
| BD-8.3 | Rôle `fadi_geodata` ; `fadi_app` en lecture seule sur archive et journal | B5 | 0,5 j |
| BD-8.4 | Cache des tuiles (`ETag`, `immutable`) ; plus d'écriture d'espace par tuile ; GiST `(couche_id, geom)` avec `btree_gist` | B2, Q12 | 2 j |
| BD-8.5 | Préfiltre `&&` avant `::geography` ; `pg_trgm` ; pagination par clé, total depuis `nombre_objets` | B3, B4, Q12 | 1 j |
| BD-8.6 | Contours simplifiés précalculés ; index `geodata_indicateurs (couche_id)` ; cache raster borné | B10, B11 | 1 j |
| BD-8.7 | D-GD-29 : catégories en fichier source archivé sans repli ; douars via `geodata_concepts` ; FeenWay via correspondances archivées ; `priorite_recherche` | B7, B8 | 1,5 j |
| BD-8.8 | Merchich 26191 défini une fois ; autres zones seulement avec paramètres officiels sourcés | B9 | 0,25 j |

Acceptation : deux imports simultanés → une version ; interface « catégories non chargées » sans base ; EXPLAIN des
tuiles et de la recherche par index ; test d'indépendance refusant tout tableau de libellés exporté.

### BD-9 — Évolutions structurelles (environ 20 j, sur décision)

| Tâche | Contenu | Décision | Constats |
| --- | --- | --- | --- |
| BD-9.1 | `bytea` vers stockage objet ; référence et empreinte en base ; `geodata_fichiers` reste en base | D-BD-8 | Q6, S13 |
| BD-9.2 | PostgreSQL 16 → 18 : répétition en préproduction, `pg_upgrade`, réindexation trigramme/plein texte, `ANALYZE` | D-BD-9 | M10 |
| BD-9.3 | Standby en streaming, bascule documentée et testée | D-BD-10 | M10 |
| BD-9.4 | Gros `jsonb` de `projects` en tables 1-1 si BD-0 le justifie | — | S8 |
| BD-9.5 | RLS ciblée ou ADR | D-BD-5 | S10 |
| BD-9.6 | Catalogues `data/*.json` reconnus comme données → base, archivés, lus par l'API | D-BD-6 | B8 |
| BD-9.7 | Révisions Studio en instantanés + deltas | — | Q9 |

## 4. Exécution

1. Une Issue par lot ; branches `fix/<issue>-bd-1-garde-fous`, `feat/<issue>-bd-2-migrations`… ; une PR par tâche ou
   petit groupe de tâches ; `STATUS.md` et `HANDOFF.md` actualisés dans chaque PR du chantier.
2. Par PR : `npm run typecheck`, `npm test`, `npm run build`, scénario e2e, CI verte ; pour BD-2 à BD-6, squawk, job de
   montée de version et EXPLAIN avant/après. Un contrôle non exécuté est déclaré.
3. Suites écrivant en base : garde DB-3 (base jetable attestée) uniquement.
4. Préproduction par le déploiement automatique, puis mesures (`pg_stat_statements`, durée de `migrate`, `pg_locks`).
5. Production sur accord explicite ; répétition obligatoire pour BD-5 et BD-9.
6. Retour arrière décrit dans chaque PR ; aucune contraction dans la même Release que le code qui l'exige.

Ordre pour une personne : semaine 1 BD-0 + BD-1 ; semaines 2–3 BD-2 puis BD-3, BD-7 en parallèle ; semaines 4–6 BD-4 et
BD-8.1 à 8.3 ; semaines 6–8 BD-5, BD-6, reste de BD-8 ; ensuite BD-9 selon les décisions. Chaîne critique :
BD-1 → BD-2 → BD-3 → BD-4.

## 5. Traçabilité des 63 constats

| Constat | Gravité | Tâches |
| --- | --- | --- |
| S1 verrou exclusif sur 52 tables | Élevée | BD-1.1, BD-2.2 |
| S2 droits de `fadi_app`, clé de signature | Élevée | BD-1.4, BD-6.5 |
| S3 `schema.ts` incomplet | Élevée | BD-2.7 |
| S4 cascades sans index | Moyenne | BD-3.1 |
| S5 e-mail sensible à la casse | Moyenne | BD-3.2 |
| S6 index dupliqués | Faible | BD-3.3 |
| S7 index mal alignés, purge des sessions | Faible | BD-3.4, BD-6.1 |
| S8 `jsonb` filtré | Faible | BD-3.6, BD-9.4 |
| S9 PK `text` | Faible | BD-2.8 |
| S10 pas de RLS | Moyenne | BD-9.5 |
| S11 `search_path` | Faible | BD-3.7 |
| S12 e-mail dans `atelier_locks` | Faible | BD-6.4 |
| S13 table sans PK, `bigserial`, `bytea`, nommage | Faible | BD-3.7, BD-2.8, BD-9.1 |
| Q1 pool sans garde-fous | Élevée | BD-1.2 |
| Q2 temps réel 2 s | Élevée | BD-4.2 |
| Q3 cloche | Élevée | BD-3.5, BD-4.1 |
| Q4 `/com/boite` | Élevée | BD-4.4 |
| Q5 lignes entières, listes non bornées | Élevée | BD-4.3 |
| Q6 `bytea` en mémoire | Élevée | BD-4.6, BD-9.1 |
| Q7 ramasse-miettes dans `DELETE` | Élevée | BD-1.3 |
| Q8 N+1 secondaires | Moyenne | BD-4.4 |
| Q9 révisions doublées | Moyenne | BD-6.6, BD-9.7 |
| Q10 transactions longues | Moyenne | BD-4.7, BD-4.8 |
| Q11 courses sur les verrous | Moyenne | BD-4.5 |
| Q12 requêtes GeoData | Moyenne | BD-8.4, BD-8.5 |
| Q13 interpolations SQL | Faible | BD-2.5 |
| Q14 session par fichier statique | Faible | BD-4.9, BD-6.1 |
| M1 pas de versioning | Élevée | BD-2.1 |
| M2 transaction unique sans `lock_timeout` | Élevée | BD-1.1, BD-2.2 |
| M3 `bascule.ts` | Moyenne (revue) | BD-1.8 |
| M4 reprises rejouées | Moyenne | BD-2.4 |
| M5 contraintes non validées | Moyenne | BD-2.3 |
| M6 pas de retour arrière | Moyenne | BD-2.8 |
| M7 dérive non contrôlée | Moyenne | BD-2.7 |
| M8 pas de test de montée | Moyenne | BD-2.6 |
| M9 super-utilisateur en production | Moyenne | BD-5.4 |
| M10 instance unique, PG16 | Élevée | BD-5.6, BD-9.2, BD-9.3 |
| M11 pas de PITR | Élevée | BD-5.1 |
| M12 restauration incomplète | Élevée | BD-1.5, BD-5.2 |
| M13 supervision | Moyenne | BD-1.6, BD-5.5 |
| M14 rétention non appliquée | Élevée | BD-5.3 |
| M15 volumes orphelins | Moyenne | BD-6.3 |
| M16 purges RGPD | Moyenne | BD-6.1, BD-6.2 |
| M17 sondes | Faible | BD-1.6, BD-5.6 |
| A1 `localStorage` | Élevée | BD-1.7 |
| A2 quarantaine | Moyenne | BD-7.1 |
| A3 persistance | Moyenne | BD-7.2 |
| A4 commentaires | Moyenne | BD-7.3 |
| A5 401 | Moyenne | BD-7.4 |
| A6 brouillon Planche | Faible | BD-7.5 |
| A7 préfixes d'API | Faible | BD-7.6 |
| A8 Dexie silencieux | Faible | BD-7.7 |
| B1 import non atomique | Élevée | BD-8.1 |
| B2 tuiles | Moyenne | BD-8.4 |
| B3 `geography` | Moyenne | BD-8.5 |
| B4 recherche | Moyenne | BD-8.5 |
| B5 rôle GeoData | Moyenne | BD-8.3 |
| B6 archive non transactionnelle | Moyenne | BD-8.2 |
| B7 catégories embarquées | Moyenne | BD-8.7 |
| B8 autres catalogues | Moyenne | BD-8.7, BD-9.6 |
| B9 Merchich | Faible | BD-8.8 |
| B10 index, cache raster | Faible | BD-8.6 |
| B11 contours | Faible | BD-8.6 |
