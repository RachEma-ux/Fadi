# Base de données : fiabilité et performance — Tâches

Le détail, les constats traités et les critères d'acceptation de chaque tâche sont dans `PLAN.md`. Les décisions
D-BD-n sont listées dans `PLAN.md` § 2.

## À faire

- [ ] BD-0 — Cadrage et mesures : Issue, mesures en lecture seule, `pg_stat_statements`, décisions D-BD-1 à D-BD-4 (Issue : à ouvrir).
- [ ] BD-1 — **Implémenté localement, CI à faire** — Garde-fous immédiats (P0) : BD-1.1 `lock_timeout` de migration ; BD-1.2 pool et délais ; BD-1.3 ramasse-miettes hors requête ; BD-1.4 droits de `fadi_app` ; BD-1.5 procédure de restauration ; BD-1.6 supervision des sauvegardes ; BD-1.7 purge `localStorage` ; BD-1.8 garde de `bascule.ts`.
- [ ] BD-2 — **Implémenté localement, CI à faire** — Migrations versionnées : exécuteur et `schema_migrations`, `R__grants.sql`, `VALIDATE`, reprises, squawk et ESLint, job de montée de version, écart `schema.ts`, guide expand/contract. Dépend de BD-1.1.
- [ ] BD-3 — **Implémenté localement (sauf BD-3.6 reporté), CI à faire** — Index, contraintes et droits : 26 index de cascade, e-mail insensible à la casse, index redondants, index réalignés, index de la cloche, verrou d'édition typé, `search_path`, PK. Dépend de BD-2.1.
- [ ] BD-4 — Performance des requêtes : cloche, temps réel, projections, N+1, courses, flux de fichiers, outbox en bail, verrou Studio (D-BD-7), statiques. Dépend de BD-1.2 et BD-3.5.
- [ ] BD-5 — Sauvegardes, PITR et exploitation : pgBackRest, exercice mensuel, rétention restic, rôles de production, supervision, réglages. Dépend de D-BD-1 à D-BD-3.
- [ ] BD-6 — Cycle de vie et RGPD : tâche de rétention, contacts (D-BD-4), volumes après anonymisation, `transmis_par`, clé de signature, révisions Studio.
- [ ] BD-7 — Stockage navigateur : quarantaine, persistance, idempotence des commentaires, purge sur 401, brouillon Planche, préfixes, Dexie.
- [ ] BD-8 — GeoData : import atomique, archive transactionnelle, rôle dédié, tuiles, index spatiaux et trigramme, contours, D-GD-29, Merchich.
- [ ] BD-9 — Évolutions structurelles, chacune sur sa décision : stockage objet (D-BD-8), PostgreSQL 18 (D-BD-9), standby (D-BD-10), tables 1-1, RLS (D-BD-5), catalogues en base (D-BD-6), révisions en deltas.

## En cours

- BD-1 : implémenté sur `fix/bd-1-garde-fous` (local) ; reste la CI DB-3, la revue et le constat Healthchecks sur le VPS.

## Terminé

- Audit des bases de données (2026-11-02, commit audité `b9d9897`) : quatre volets dans `audit/`, en lecture seule ; ce n'est pas une tâche de remédiation.

## Bloqué

- Aucune tâche bloquée à ce stade. BD-4.8, BD-5.1, BD-5.3, BD-6.2 et BD-9 attendent leurs décisions D-BD-n, sans bloquer les autres tâches.

## Critères de sortie

- Chaque tâche liée à une preuve, une Issue et une PR si elle modifie le dépôt.
- Tests pertinents connus et signalés ; décision d'acceptation consignée.
- Chacun des 63 constats de `PLAN.md` § 5 est traité (tâche « Vérifié ») ou porté par une décision explicite du maître d'ouvrage.
