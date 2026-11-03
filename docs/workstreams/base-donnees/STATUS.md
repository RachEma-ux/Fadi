# Base de données : fiabilité et performance — Statut

Mis à jour : 2026-11-02 (UTC).

## État

**En cours** — BD-1 à BD-3, BD-4 (en partie), la part dépôt de BD-5 / BD-6, BD-7 (en partie) et BD-8 (en partie) **implémentés** sur les branches locales empilées `fix/bd-1-garde-fous`, `feat/bd-2-migrations`, `feat/bd-3-index`, `perf/bd-4-requetes`, `ops/bd-5-6-exploitation-rgpd`, `feat/bd-7-navigateur`, `feat/bd-8-geodata`, puis `feat/bd-decisions-proprietaire` (décisions D-BD-1 à D-BD-12, BD-4.8, BD-9.1, 9.2, 9.3, 9.5, 9.6) (non poussées, sans Issue ni PR) ; suites API sur base non exécutées ici (garde DB-3, CI seulement). Ne pas assimiler à un travail accepté.

## Faits vérifiés

- Audit en lecture seule du commit `b9d9897` (2026-11-02 06:13 heure suisse) : 63 constats, 18 élevés, 30 moyens, 15 faibles ; dossier `audit/`.
- `init.sql` appliqué deux fois sur PostgreSQL 16.15 + PostGIS 3.4.2 jetables (1,66 s puis 0,22 s, sans erreur) ; au deuxième passage, `AccessExclusiveLock` sur 52 tables, 83 contraintes `NOT VALID` (mesures `pg_locks`, `pg_constraint`).
- 152 tables, 349 index, 356 FK, 349 CHECK, 0 politique RLS, 213 FK sans index de support dont 128 vers `users` (catalogue de la base jetable).
- Constats revérifiés dans le code : `migrate.ts:20` (un seul `pool.query`), `db/client.ts:13` (pool sans option), `init.sql:53` (unicité sensible à la casse), `bascule.ts:57` et `:117`, `geodata-reference.ts` (recherche de doublon avant `BEGIN`), `docker-compose.yml` (sauvegarde en super-utilisateur).
- Aucune connexion à la production ni à la préproduction pendant l'audit.

## BD-1 — garde-fous (implémenté le 2026-11-02, non poussé)

- BD-1.1 `db/apply-schema.ts`, `init.sql` (`SET lock_timeout = '3s'`, `statement_timeout = '10min'`, `RESET` en fin) : mesuré
  sur PostgreSQL 16.15 jetable — verrou tenu 12 s sur `projects`, la migration cède à 3 s, relance et réussit en 11,3 s ;
  lecteur concurrent servi en 2,5 s au plus (sans `lock_timeout`, il attendait la fin du verrou).
- BD-1.2 `db/pool-config.ts`, `db/client.ts` (délais, `pool.on('error')`), arrêt propre SIGTERM/SIGINT (`server.ts`),
  `chargerModele` en transaction lecture seule, `SET LOCAL statement_timeout = '10min'` dans les transactions GeoData,
  `ALTER ROLE fadi_app SET idle_in_transaction_session_timeout = '10min'`. Écart au plan : `statement_timeout` à 60 s
  (et non 15 s) pour ne pas couper d'export légitime avant mesure (BD-0.3).
- BD-1.3 `lib/volumes-gc-planifie.ts`, `lib/volumes-gc-app.ts` : plus de ramasse-miettes dans `DELETE /projects/:id` ;
  passage différé regroupé et passage horaire (couvre aussi BD-6.3).
- BD-1.4 `init.sql` : DELETE retiré à `fadi_app` sur 10 journaux, UPDATE et DELETE sur `geodata_journal` et
  `atelier_lock_events`, écriture sur `spatial_ref_sys`, UPDATE/DELETE sur `archive_signing_keys` ; vérifié sur base
  jetable (`has_table_privilege`), cascade depuis le parent toujours effective. Écart : pas de déclencheur
  anti-suppression ajouté (il casserait les cascades) ; `studio_access_events` garde DELETE (purge de rétention).
- BD-1.5 `docs/deploiement.md` : restauration dans `fadi_restore`, contrôle, bascule, `migrate`, démarrage.
- BD-1.6 `docker-compose.yml` : sonde du conteneur `backup` (dump de moins de 26 h). Activation Healthchecks sur le VPS :
  **non constatée** (administrateur).
- BD-1.7 `apps/web/src/lib/purge-stockage-compte.ts` + `forgetDevice` + réinitialisation des ensembles en mémoire.
- BD-1.8 `db/bascule.ts` : annulation si un projet est sauté, abandon seulement avec `FADI_BASCULE_IGNORER_SANS_ACTIF=1`.
- Contrôles locaux : `npm run typecheck` vert ; web 1 357 tests verts ; API 1 152 tests purs verts, 18 fichiers de tests
  sur base non exécutables ici (`TARGET_REQUIRED`, identique à la référence `b9d9897`) ; build de l'API vert ;
  `init.sql` appliqué deux fois sur base jetable (8,3 s puis 3,1 s avec démarrage de tsx).

## BD-2 — migrations versionnées (implémenté le 2026-11-02, non poussé)

- `db/schema-migrations.ts` : `init.sql` = base de départ gelée (version `0000`, empreinte `migrations/init.sql.sha256`,
  test de gel), fichiers numérotés `db/migrations/NNNN_nom[.concurrent].sql` appliqués une fois, verrou consultatif,
  relances sur 55P03, exécution en `fadi_owner`, index invalide repris, migration appliquée puis modifiée refusée ;
  table `schema_migrations` (lecture seule pour `fadi_app`). `migrate.ts`, `server.ts` et le build branchés ; le journal
  garde « Schema applied (init.sql). » (contrôle de la préproduction).
- Vérifié sur PostgreSQL 16.15 jetable : base neuve puis base existante (second passage : rien de rejoué) ; fichier
  transactionnel appliqué et possédé par `fadi_owner` ; index unique échoué (doublons) laissé invalide puis repris après
  correction ; fichier modifié refusé ; montée depuis le schéma de `b9d9897` réussie.
- BD-2.3 `npm run db:validate-constraints` : 83 contraintes validées sur base jetable, puis `migrate` ne les défait plus
  (avant BD-2, chaque déploiement les recréait `NOT VALID`). Volontairement hors du déploiement (données historiques).
- BD-2.5 contrôle maison des migrations (`db/migrations-lint.ts`, rôle de squawk, sans dépendance) et garde des
  interpolations SQL (`testing/sql-interpolation-garde.test.ts`, relevé figé de l'audit). Écart : pas de squawk ni
  d'ESLint (aucun ESLint dans le dépôt ; éviter un binaire tiers installé par script).
- BD-2.6 `scripts/validation/migration-montee-version.mjs` + étape CI après `db:migrate` (non exécutée en CI d'ici).
- BD-2.7 `db/schema-ecart.test.ts` (suite sur base, CI) ; `studio_revision_events.xact_id` aligné ; relevé : aucune
  colonne Drizzle absente, 48 tables propres au SQL figées. Écart : `project_members` reste déclarée comme table (vue en
  base), contrôlée comme vue par le test.
- BD-2.8 guide `apps/api/src/db/migrations/README.md`. Écart : pas de `R__grants.sql` (les droits des nouvelles tables
  viennent des privilèges par défaut de `fadi_owner` ; les `REVOKE` vont dans la migration de la table).
- Contrôles : typecheck vert ; 1 160 tests API purs verts ; build vert (migrations copiées dans `dist/db/migrations`).

## BD-3 — index, contraintes et droits (implémenté le 2026-11-02, non poussé)

- Migrations `0001_index_cascades.concurrent.sql` (28 index de cascade), `0002_index_requetes.concurrent.sql` (cloche
  des notifications, `atelier_outbox` partiel, `studio_revisions` ordonné, `sessions (expires_at)`, unicité
  `lower(email)`, index d'expression `geodata_versions.droits->>'consultation'`, future clé primaire),
  `0003_index_redondants.concurrent.sql` (4 index retirés), `0004_fonctions_et_cle_primaire.sql` (`search_path` des
  fonctions de déclencheur, clé primaire de `studio_study_steps`), `0005_index_cascades_complement.concurrent.sql`
  (11 index : prix, territoires, agents, invitations).
- Vérifié sur base neuve et base existante : 5 migrations appliquées, 0 index invalide, plus aucune fonction de
  déclencheur sans `search_path`, clé primaire posée, index redondants absents ; cascades non indexées hors `users`
  passées de 70 à 41 (le reste : clés composites servies par un index sur `variant_id`, petites tables
  d'organisation). `schema.ts` aligné (index retirés ou remplacés, clé primaire).
- Écarts au plan : BD-3.6 (verrou d'édition en colonnes typées) **reporté**, il exige un changement applicatif en
  expand/contract avec la route de verrou ; colonne générée `consultation` remplacée par un index d'expression (sans
  réécriture) ; `CHECK` de normalisation de l'e-mail non posé (un chemin d'insertion non normalisé serait refusé) ;
  `REVOKE TEMP` non appliqué (tables temporaires utilisées par des tests).
- Risque connu : `users_email_lower_unique` échoue si deux comptes ne diffèrent que par la casse ; l'index reste
  invalide, la migration échoue et le déploiement s'arrête avant l'application (requête de repérage dans le fichier).

## BD-4 — performance des requêtes (partiellement implémenté le 2026-11-02, non poussé)

- BD-4.1 `routes/notifications.ts` : colonnes projetées pour les projets partagés ; péremption des exports en une
  requête `LATERAL` (plan vérifié sur base jetable) au lieu d'une par export. Index de la cloche : BD-3 (0002).
  **Non fait** : borner dans le temps l'historique « mes objets » (changement de comportement, à décider).
- BD-4.2 `lib/temps-reel-hub.ts` : par cycle, une lecture par jeton et par couple (projet, compte), au plus 4 lectures
  simultanées ; test `temps-reel-revalidation.test.ts` (12 connexions d'un compte : 1 lecture au lieu de 12 ; 30 comptes :
  jamais plus de 4 en parallèle). L'intervalle de 2 s (RT-D5) est **conservé** : c'est une exigence de sécurité acceptée.
- BD-4.3 `lib/auth.ts` : la session lue à chaque requête ne charge plus que 8 colonnes du compte (plus les jsonb ni les
  secrets). **Non fait** : projection de `loadProjectAccess` et pagination de `GET /projects` (contrat des routes et du
  client à relever route par route).
- BD-4.4 `routes/com.ts` (`/com/boite`) : conversations, participants, lectures et accusés en une requête chacun pour
  toute la boîte, au lieu de quatre par conversation ; messages toujours lus par conversation ; ordre et contenu inchangés.
- BD-4.5 `routes/lock.ts`, `routes/atelier-versions.ts` : libération de la réservation sous verrou de ligne ; suppression
  et transmission d'un verrou fin conditionnées au verrou examiné (409 sinon), comparaison à la milliseconde.
- BD-4.7 `lib/mailer/outbox.ts` : bail de 5 min, envoi SMTP hors transaction ; test pur `outbox-traitement.test.ts`.
- BD-4.9 `app.ts` : fichiers du build servis avant la lecture de session ; test `app-statique.test.ts` (échoue sur
  l'ancien code : 500, la base simulée étant sollicitée).
- **Reportés** : BD-4.6 (flux pour l'export d'archive, à traiter avec BD-9.1), BD-4.8 (attend D-BD-7).
- Contrôles : typecheck vert ; 1 166 tests API purs verts ; les suites sur base (dont `notifications`, `com`, `lock`,
  `atelier-versions`) ne tournent qu'en CI.

## BD-5 / BD-6 — exploitation et RGPD, part dépôt (implémenté le 2026-11-02, non poussé)

- BD-5.1 PITR : `scripts/validation/pitr-essai.sh` **réussi** sur cluster jetable (pgBackRest 2.50 local, PostgreSQL
  16.15) — la ligne écrite après l'instant cible n'est pas restaurée ; modèles `ops/pgbackrest/` (configuration S3
  chiffrée, image avec pgBackRest PGDG, surcharge Compose : **non construits ni éprouvés en conteneur**) ; guide
  `docs/sauvegarde-pitr.md`. Production : pgBackRest ≥ 2.59.3.
- BD-5.2 `ops/restore-drill.sh` : essayé sur un dump de base jetable (restauration, migration, comptes, 5 s, base
  d'exercice supprimée).
- BD-5.3 `ops/backup/restic-retention.sh` : essayé sur un dépôt restic local (refus sans politique ; essai à blanc sans
  suppression ; refus d'appliquer sans `FADI_RETENTION_VALIDEE=oui` ; application : 3 instantanés → 1).
- BD-5.5 `ops/surveillance/sonde-base.sh` : codes 0 / 1 / 2 vérifiés (base saine, archivage à jour, base injoignable).
- BD-5.4 (rôles de production) et BD-5.6 (réglages, limites) : décrits dans `docs/sauvegarde-pitr.md` § 5, **à faire
  par l'administrateur** ; aucune valeur mémoire inventée.
- BD-6.1 `lib/retention-technique.ts` : purge par lots des sessions, jetons et courriels traités, sous verrou
  consultatif, branchée sur la boucle horaire ; **désactivée tant que les durées ne sont pas fournies** (nouvelle
  décision D-BD-11 ; aucune durée de conservation n'existe dans le dépôt). SQL vérifié sur base jetable.
- BD-6.3 : couvert par le passage horaire du ramasse-miettes (BD-1.3).
- BD-6.4 `lib/account-jobs.ts` : l'anonymisation remplace aussi `atelier_locks.transmis_par`.
- **Reportés** : BD-6.2 (attend D-BD-4), BD-6.5 (chiffrer la clé de signature : effet sur la vérification des archives
  existantes après restauration, à décider), BD-6.6 (révisions Studio sans double stockage : non-régression du rejeu
  à construire avec l'équipe Studio).

## BD-7 — stockage navigateur (implémenté le 2026-11-02, non poussé)

- BD-7.2 `apps/web/src/lib/persistance-stockage.ts` : `navigator.storage.persist()` demandé une fois (échec toléré) pour
  les lots de l'Atelier, les photos COM et les mutations en pause.
- BD-7.4 : un 401 `authentication_required` reçu en cours de session déclenche `forgetDevice` (`ecouterSessionPerdue`).
- BD-7.5 : `oublierProjet` efface aussi le brouillon Planche du projet.
- BD-7.6 : préfixes d'API du service worker égaux à `API_PREFIX` du serveur (`prefixes-api.test.ts`).
- BD-7.7 : gestionnaires Dexie `versionchange` / `blocked` ; échecs signalés sans contenu (`signalerEchecLocal`).
- BD-7.1 : d'abord retiré (contraire à MIG-COEX-04), puis rétabli après **D-BD-12** (voir ci-dessous).
- **BD-7.3 reporté** : `project_comments` n'a pas de `client_request_id` (API + migration nécessaires).

## BD-8 — GeoData (implémenté en partie le 2026-11-02, non poussé)

- BD-8.1 : recherche de version identique, écriture, publication et journal dans une transaction sous
  `pg_advisory_xact_lock` ; import automatique exclusif (`--exclusif`) ; migration `0006` (unique partiel
  `geodata_versions (source_id, empreinte) WHERE espace_id IS NULL`).
- BD-8.2 : archive des fichiers en une transaction sous verrou ; `--prix-sources` corrigé.
- BD-8.5 : migrations `0007` (`pg_trgm`), `0008` (GIN trigrammes `lower(nom)`, B-tree `lower(code)`), `0009` (GiST
  `geom::geography`) ; requête de proximité mesurée sur base jetable : 2 070 ms → moins de 28 ms ; espace personnel lu
  avant toute écriture.
- BD-8.4 partiel : ETag des tuiles et réponse 304 après contrôle d'accès (`lib/geodata/cache-tuiles.ts`).
- BD-8.7 partiel (D-GD-29) : rangement des catégories obligatoire ; l'interface affiche « Catégories non chargées » au lieu
  du repli sur un catalogue codé en dur (traduction `en.json`).
- **Reportés** : BD-8.3 (rôle `fadi_geodata`), BD-8.6, BD-8.8, GiST `(couche_id, geom)`, douars et FeenWay de BD-8.7.

## Contrôles sur l'empilement complet (2026-11-02)

- `npm run typecheck` vert ; `npm run build` vert.
- Web : 205 fichiers, 1 369 tests verts, 2 ignorés ; `geodata-model` : 212 tests verts.
- API : 1 176 tests purs verts ; 19 fichiers sur base non exécutables ici (`TARGET_REQUIRED`, garde DB-3, comme la
  référence) — **à faire tourner en CI**.
- Base neuve PostgreSQL 16 jetable : base de départ + migrations `0001` à `0009` appliquées, second passage sans effet,
  aucun index invalide.

## Décisions du maître d'ouvrage (2026-11-02, 22 h 24 heure suisse) et mise en œuvre

- **D-BD-12** : quarantaine vidée par `forgetDevice` et élaguée au-delà de 30 jours (BD-7.1 rétabli) ; règle « ne jamais
  supprimer » amendée : ADR-STUDIO-PILOTE-01 **P-13** (actions de maintenance déclarées) ; checklist Studio et libellés du
  registre `docs/workstreams/studio/task-register.json` alignés.
- **D-BD-11** : purge des sessions, jetons et courriels traités à **30 jours** par défaut (`desactive` coupe une catégorie).
- **D-BD-4** : `CONTACT_RETENTION_ENABLED=1` dans `docker-compose.yml` (production).
- **D-BD-1** : RPO 15 min (archivage WAL, sonde 900 s) ; RTO 2 h contrôlé par `ops/restore-drill.sh` (code 4 au-delà) et
  timer mensuel `ops/systemd/fadi-restore-drill.*`.
- **D-BD-2 / D-BD-3** : rétention restic 14 / 8 / 12 par défaut, timer hebdomadaire distinct
  `ops/systemd/fadi-backup-retention.*` (essai à blanc puis application) ; essayé sur un dépôt restic local.
- **D-BD-5** : `docs/continuity/decisions/ADR-BD-01.md` (isolation applicative, RLS reportée).
- **D-BD-6** (BD-9.6) : migration `0011_catalogues_donnees.sql` ; bibliothèque, profils et moteur Harmonie, répartition
  chargés en base (fichier archivé tel quel, empreinte, versions immuables, `fadi_app` en lecture seule) à chaque
  `db:migrate` ; API sans repli (503 `catalogue_non_charge`), état « non chargé » dans l'interface ; étapes et formulaires
  restent de la configuration. Vérifié sur base jetable : chargement idempotent, droits, API servie en `fadi_app`.
- **D-BD-7** (BD-4.8) : une commande Studio verrouille sa variante (`FOR UPDATE`) et le projet en `FOR SHARE` ; deux
  variantes du même projet en parallèle (1,66 s contre 3,24 s avant, mesuré sur base jetable), même variante sérialisée ;
  autres écritures Studio et fusion gardent le verrou du projet.
- **D-BD-8** (BD-9.1) : stockage objet S3 pour `step_files`, `drawing_exports`, `volumes`, `com_pieces` (migration
  `0010_fichiers_stockage_objet.sql`, expand) ; `FADI_STOCKAGE=base` par défaut ; reprise `db:fichiers-vers-objet`
  (essai par défaut, relecture de chaque objet) et balayage des orphelins ; `@aws-sdk/client-s3` 3.1152.0. Essayé avec un
  émulateur S3 (`s3rver`) sur PostgreSQL 16 ; **hébergeur suisse non choisi**, aucun vrai service essayé.
  `geodata_fichiers` et `geodata_rasters` restent en base.
- **D-BD-9** (BD-9.2) : `docs/montee-postgresql-18.md`, `ops/pg18/` (image `postgis/postgis:18-3.6`, `montee.sh`,
  `verifier.sh`) ; mécanique éprouvée en 16 → 16 seulement : **montée 16 → 18 non répétée** (paquets PostgreSQL 18 et
  Docker Hub inaccessibles depuis la session). `docker-compose.yml` reste en 16.
- **D-BD-10** (BD-9.3) : `docs/haute-disponibilite.md`, `ops/standby/`, sonde primaire / standby (retard 600 s) ; répété
  sur deux clusters PostgreSQL 16 : amorçage, retard 0,2–0,3 s, promotion < 0,5 s, `pg_rewind` (avec archive WAL) et
  retour de l'ancien primaire en standby.

## Contrôles sur l'empilement final (2026-11-02)

- `npm run typecheck` et `npm run build` verts ; `check-continuity` vert ; `test:scripts` 24/24 ; `test:db-guard` 253/253.
- Web : 205 fichiers, 1 372 tests verts ; `geodata-model` : 212 verts.
- API : 1 207 tests purs verts (délai porté à 120 s : `app-statique.test.ts` dépasse 20 s sur ce banc chargé, aussi sans
  ces changements) ; 19 fichiers sur base non exécutables ici (`TARGET_REQUIRED`) — **à faire tourner en CI**.
- Base neuve PostgreSQL 16 : base de départ + migrations `0001` à `0011`, catalogues chargés ; second passage sans
  effet ; aucun index invalide ; 91 contraintes `NOT VALID` validées sans violation.
- Montée depuis le commit audité `b9d9897` (`migration-montee-version.mjs`) : quatre contrôles réussis.

## Intégration avec `main` (#379 / #380, 2026-11-03)

Le chantier parallèle `bases-de-donnees` (Issue #379, PR #380 fusionnée le 2026-11-02) recoupait BD-1, des index et la
migration. Fusion de `origin/main` (`0810325`) dans la branche, un seul mécanisme gardé :
- Pool : `db/pool-options.ts` de #379 (variables `DB_*`, 120 s) remplace `db/pool-config.ts` (`PG_*`, 60 s) ; arrêt propre
  commun (SIGTERM et SIGINT, `ARRET_DELAI_MS` 8 s).
- Migration : l'exécuteur versionné (`db/schema-migrations.ts`) applique la base de départ par `appliquerSchemaClient` de
  #379 (même verrou consultatif, `MIGRATION_LOCK_TIMEOUT` 5 s et réessais, journal `admin.schema_applications`,
  `pg_stat_statements`) ; `db/apply-schema.ts` retiré, ainsi que les `SET lock_timeout` / `RESET` ajoutés à `init.sql`.
- Index : `geodata_indicateurs_couche_idx (couche_id, ordre)` de #379 repris en 0001 ; `users_email_lower_idx` et
  `atelier_commands_author_idx` (#379) couverts par ceux de 0002, retirés en 0003.
- Contraintes : `db:verifier-contraintes` (#379, contrôle sans modification, en CI) et `db:validate-constraints` (validation)
  coexistent. `init.sql` regelé (nouvelle empreinte).
- Vérifié sur base jetable : base neuve (migrations 0001–0011, une ligne `admin.schema_applications`, second passage sans
  effet) ; montée depuis `origin/main` et depuis `b9d9897` réussie ; 91 contraintes contrôlées sans violation ; typecheck,
  build, web 1 373, API 1 200 tests purs, `test:db-guard` 253, `test:scripts` 24 verts.

## CI de la PR #385 (2026-11-03)

- Première exécution (`128e682`) : `validate` vert — **126 fichiers de tests de l'API, dont les 19 suites sur base**,
  montée de version (4 contrôles), `db:verifier-contraintes` ; e2e atelier, p2, planche, image, architecture, sécurité verts.
- Échecs corrigés ensuite : description de PR au modèle Studio ; rapports d'état Studio et empreinte de la checklist ;
  e2e parcours (la clé MapTiler de session est désormais oubliée avec la purge d'un 401, BD-1.7 : scénario adapté) ;
  e2e compléments (la page GeoData garde son état `geodata.*`, retiré de la purge : un identifiant de carte n'ouvre rien
  sans droit, la reconnexion rouvre la dernière carte) ; e2e organisations (jeu synthétique : tables tenues par la
  migration tolérées) ; Studio V1 (profil jetable : migrations numérotées et catalogues appliqués par l'exécuteur réel).
- Deuxième exécution (`a968031`, après fusion de #383) : `validate`, organisations, continuité, protocole Studio, Codex verts.
  Corrigés ensuite : contrôle de restauration (`init.sql` rejoué rendait l'écriture des catalogues à `fadi_app` : révocation
  reprise dans le bloc D-7 d'`init.sql`, droits identiques vérifiés après rejeu) ; recette MIG-COEX-04 (la quarantaine
  n'est vidée par `forgetDevice` que si un compte était connu de l'appareil, P-13 précisé) ; profil Studio V1 (base de
  départ inscrite avant l'exécuteur, aucun rôle `fadi_owner` requis ; répété sur un cluster sans rôles Fadi).

## Points ouverts

- Ouvrir l'Issue du chantier et reporter son numéro dans `CONTEXT.md` et l'index.
- Mesures de production (BD-0.2) : volumétrie, contraintes, doublons d'e-mail, `atelier_store`, Healthchecks.
- Décisions D-BD-1 à D-BD-12 prises ; restent : hébergeur S3 suisse, répétition de la montée 18 en préproduction,
  seconde machine, balayage des objets orphelins (planification à décider, RGPD), confirmation métier de D-BD-7.

## Liens de suivi

- Issue : [#384](https://github.com/RachEma-ux/Fadi/issues/384).
- Branche de tâche : `feat/384-base-donnees` (poussée le 2026-11-03).
- Pull Request : aucune au moment de la création.

## Préconditions de clôture

- Critères de l'Issue testés et documentés ; chaque constat de `PLAN.md` § 5 traité ou porté par une décision.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
