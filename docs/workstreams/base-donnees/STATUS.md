# Base de données : fiabilité et performance — Statut

Mis à jour : 2026-11-02 (UTC).

## État

**En cours** — BD-1 **implémenté** sur la branche locale `fix/bd-1-garde-fous` (non poussée, sans Issue ni PR) ; suites API sur base non exécutées ici (garde DB-3, CI seulement). Ne pas assimiler à un travail accepté.

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

## Points ouverts

- Ouvrir l'Issue du chantier et reporter son numéro dans `CONTEXT.md` et l'index.
- Mesures de production (BD-0.2) : volumétrie, contraintes, doublons d'e-mail, `atelier_store`, Healthchecks.
- Décisions D-BD-1 à D-BD-10 (`PLAN.md` § 2).

## Liens de suivi

- Issue : à ouvrir.
- Branche de tâche : à ouvrir après l'Issue (première : BD-1).
- Pull Request : aucune au moment de la création.

## Préconditions de clôture

- Critères de l'Issue testés et documentés ; chaque constat de `PLAN.md` § 5 traité ou porté par une décision.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
