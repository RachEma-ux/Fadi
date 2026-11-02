# Base de données : fiabilité et performance — Statut

Mis à jour : 2026-11-02 (UTC).

## État

**À faire** — audit terminé et plan établi ; aucune remédiation engagée. Ne pas assimiler à un travail terminé.

## Faits vérifiés

- Audit en lecture seule du commit `b9d9897` (2026-11-02 06:13 heure suisse) : 63 constats, 18 élevés, 30 moyens, 15 faibles ; dossier `audit/`.
- `init.sql` appliqué deux fois sur PostgreSQL 16.15 + PostGIS 3.4.2 jetables (1,66 s puis 0,22 s, sans erreur) ; au deuxième passage, `AccessExclusiveLock` sur 52 tables, 83 contraintes `NOT VALID` (mesures `pg_locks`, `pg_constraint`).
- 152 tables, 349 index, 356 FK, 349 CHECK, 0 politique RLS, 213 FK sans index de support dont 128 vers `users` (catalogue de la base jetable).
- Constats revérifiés dans le code : `migrate.ts:20` (un seul `pool.query`), `db/client.ts:13` (pool sans option), `init.sql:53` (unicité sensible à la casse), `bascule.ts:57` et `:117`, `geodata-reference.ts` (recherche de doublon avant `BEGIN`), `docker-compose.yml` (sauvegarde en super-utilisateur).
- Aucune connexion à la production ni à la préproduction pendant l'audit.

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
