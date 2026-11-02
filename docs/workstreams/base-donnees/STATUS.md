# Base de données : fiabilité et performance — Statut

Mis à jour : 2026-11-02 (UTC).

## État

**En cours** — BD-1 à BD-3, BD-4 (en partie), la part dépôt de BD-5 / BD-6, BD-7 (en partie) et BD-8 (en partie) **implémentés** sur les branches locales empilées `fix/bd-1-garde-fous`, `feat/bd-2-migrations`, `feat/bd-3-index`, `perf/bd-4-requetes`, `ops/bd-5-6-exploitation-rgpd`, `feat/bd-7-navigateur`, `feat/bd-8-geodata` (non poussées, sans Issue ni PR) ; suites API sur base non exécutées ici (garde DB-3, CI seulement). Ne pas assimiler à un travail accepté.

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
- **BD-7.1 bloqué** : vider ou borner la quarantaine contredit MIG-COEX-04 / ADR-STUDIO-PILOTE-01 (« ne jamais
  supprimer ») ; changement retiré, test d'origine `local-store-migration.test.ts` rétabli ; décision **D-BD-12**.
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

## Points ouverts

- Ouvrir l'Issue du chantier et reporter son numéro dans `CONTEXT.md` et l'index.
- Mesures de production (BD-0.2) : volumétrie, contraintes, doublons d'e-mail, `atelier_store`, Healthchecks.
- Décisions D-BD-1 à D-BD-12 (`PLAN.md` § 2).

## Liens de suivi

- Issue : à ouvrir.
- Branche de tâche : à ouvrir après l'Issue (première : BD-1).
- Pull Request : aucune au moment de la création.

## Préconditions de clôture

- Critères de l'Issue testés et documentés ; chaque constat de `PLAN.md` § 5 traité ou porté par une décision.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
