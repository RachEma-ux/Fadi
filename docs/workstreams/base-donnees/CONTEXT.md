# Base de données : fiabilité et performance — Contexte

## Objectif

Traiter les 63 constats de l'audit des bases de données du 2 novembre 2026 (commit audité `b9d9897`) : supprimer les
risques de panne (verrous de migration, pool sans délais), poser des migrations versionnées, compléter index, contraintes
et droits, réduire la charge des requêtes, tenir des objectifs de reprise (PITR, restauration testée), achever le cycle
de vie des données (RGPD), fiabiliser le stockage navigateur et GeoData, et appliquer D-7 et D-GD-29 dans le code.

## Périmètre

- Inclus : `apps/api/src/db/` (schéma, migrations, rôles), couche d'accès aux données de `apps/api/src` (pool, requêtes,
  transactions, tâches de fond), stockage navigateur de `apps/web` (Dexie, `localStorage`, service worker), GeoData
  (`apps/api/src/routes/geodata`, `apps/api/src/lib/geodata`, `packages/geodata-model`), exploitation de la base
  (`docker-compose.yml`, `deploy/`, `ops/`, `scripts/backup*`, `docs/deploiement.md`, sauvegardes Swiss Backup), CI.
- Exclus : tout changement non approuvé ; production et données clients sans autorisation explicite ; changements
  d'architecture du lot BD-9 avant leur décision (D-BD-5, D-BD-6, D-BD-8 à D-BD-10) ; toute opération destructive sur
  une base non jetable.

## Sources canoniques

- `AGENTS.md` ; `CLAUDE.md` ; `docs/architecture.md` ; `docs/continuity/README.md`
- Issue : à ouvrir (« Base de données : fiabilité et performance ») ; numéro à reporter ici et dans l'index des chantiers.
- Références métier spécifiques :
  - audit détaillé : `audit/01-schema-index.md`, `audit/02-requetes.md`, `audit/03-migrations-exploitation.md`,
    `audit/04-local-geodata.md` (preuves `fichier:ligne`, SQL et EXPLAIN par constat) ;
  - plan : `PLAN.md` (lots BD-0 à BD-9, décisions D-BD-1 à D-BD-10, traçabilité des 63 constats) ;
  - rôles au moindre privilège : `docs/workstreams/users-management/AMENDEMENT-D7.md`, `RUNBOOK.md` ;
  - garde des bases de test : lot DB-3 (`docs/workstreams/users-management/STATUS.md`, `docs/ai-team/reports/mission-004/`) ;
  - GeoData et D-GD-29 : `docs/workstreams/geodata/`, `docs/geodata/sources/` ;
  - exploitation : `docs/deploiement.md`, `docs/deploiement-automatique.md`, `docs/sauvegarde-externe.md`,
    `docs/retention-swiss-backup.md`.

## Contraintes

- Préserver les décisions et règles métier existantes (21 étapes, D-7, D-GD-29, idempotence GeoData, versions publiées
  immuables, déclencheurs d'immuabilité des journaux).
- Ne pas confondre implémentation, vérification et acceptation.
- Pas de secret dans GitHub.
- Préfixe des lots : **BD-** (jamais « DB- », réservé à la garde des bases de test DB-1 à DB-3).
- Toute suite qui écrit en base passe par la garde DB-3 ; aucun test destructif sur une cible non jetable.
- `CREATE INDEX CONCURRENTLY` est impossible dans `init.sql` (une seule transaction) : jusqu'à BD-2, passer par un script
  de maintenance séparé, puis un `CREATE INDEX IF NOT EXISTS` équivalent.
- Aucune donnée inventée : en particulier, paramètres des zones Merchich 26192 à 26195 seulement depuis une source
  officielle citée.
- Production : accord explicite du maître d'ouvrage pour chaque lot ; répétition en préproduction obligatoire pour BD-5
  et BD-9.

## Hypothèses et questions ouvertes

- Volumétrie de production inconnue : les coûts de l'audit sont estimés à la lecture du code ; BD-0 les mesure.
- Décisions attendues D-BD-1 à D-BD-10 (voir `PLAN.md`, section « Décisions attendues »).
- L'activation réelle de Healthchecks sur le VPS est contradictoire dans les docs (16 et 17 octobre 2026) : à constater.
- Présence résiduelle d'`atelier_store` en production : à constater avant tout déploiement touchant `bascule.ts`.
- `atelier_locks.transmis_par` est peut-être effacé par un chemin non trouvé lors de l'audit : à confirmer.
