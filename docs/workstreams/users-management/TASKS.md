# Gestion des comptes (Users Management) — Tâches

## À faire

- [ ] UM-DEPLOY — Déploiement selon RUNBOOK.md, sur accord explicite du maître d'ouvrage (Issue : #253).

## En cours

- Aucune tâche en cours : le code est fusionné ; le déploiement attend le maître d'ouvrage.

## Terminé

- [x] UM-P0 — Cadrage : concept.md + anti-dérive, audit, matrice, décisions (Issue : #253).
- [x] UM-P1 — Modèle de données additif, journal d'audit append-only (Issue : #253).
- [x] UM-P2 — Durcissement de l'authentification et purge client (Issue : #253).
- [x] UM-P3 — RBAC plateforme, accès support (Issue : #253).
- [x] UM-P4 — Cycle de vie des comptes et courriel (Issue : #253).
- [x] UM-P5 — Écrans (Issue : #253).
- [x] UM-P6 — Scénario e2e, Mailpit en CI, drapeau, runbook (Issue : #253) — sauf DB-3.
- [x] UM-P6-DB3 — 12 suites historiques (105 tests) vertes sur PostGIS éphémère attesté, run CI 39855284507 (Issue : #253).
- [x] UM-CI — CI de la PR #255 verte sur `570d248` et `1d787c4` (Issue : #253).
- [x] UM-EN — Écrans d'administration et accès support relevés en anglais, passe anglaise dans `comptes-admin.mjs` (Issue : #253).
- [x] UM-SEC — Trois blocages de la revue de `c7dbc92` (UM-18 assurance de session, UM-19 dernier administrateur
  atomique, UM-20 capacité « export ») : reproduits, corrigés, vérifiés en CI sur `873f740` (Issue : #253).
- [x] UM-CODEX — Trois constats de la revue Codex de `fcb0dd1` (UM-21 à UM-23) : corrigés, vérifiés en CI sur `24ed965`
  (Issue : #253).
- [x] UM-1 — Chantier « Organisations, participation et revue externe » ouvert par le maître d'ouvrage le 2026-10-23
  (UM-25) ; suivi dans `docs/workstreams/organisations-participation/` (Issue : #262).
- [x] UM-ACC — Fusion de la PR #255 par le maître d'ouvrage le 2026-10-23 (`516e2f7`), CI de `main` verte (Issue : #253).
- [x] UM-E2E — Recette des accueils : retrait d'interception par `unrouteAll({ behavior: "wait" })` et attente de l'accueil
  de B ; 15/15 en local, CI verte sur `18cd1d0` (80 ✓) (Issue : #253).
- [x] UM-D7 — Amendement D-7 : schémas `auth` / `admin`, rôles au moindre privilège, CI et restauration (Issue : #253).

## Bloqué

- Aucun blocage déclaré.

## Critères de sortie

- Chaque tâche liée à une preuve, une Issue et une PR si elle modifie le dépôt.
- Tests pertinents connus et signalés ; décision d'acceptation consignée.
