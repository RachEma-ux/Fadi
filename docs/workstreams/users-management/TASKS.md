# Gestion des comptes (Users Management) — Tâches

## À faire

- [ ] UM-P6-DB3 — Enrôler une autorité d'attestation et brancher les 12 suites historiques sur PostGIS éphémère (Issue : #253) — bloqué, voir ci-dessous.
- [ ] UM-ACC — Acceptation du maître d'ouvrage et fusion de la PR (Issue : #253).

## En cours

- UM-CI — Constater la CI de la PR et corriger tout échec (Issue : #253).

## Terminé

- [x] UM-P0 — Cadrage : concept.md + anti-dérive, audit, matrice, décisions (Issue : #253).
- [x] UM-P1 — Modèle de données additif, journal d'audit append-only (Issue : #253).
- [x] UM-P2 — Durcissement de l'authentification et purge client (Issue : #253).
- [x] UM-P3 — RBAC plateforme, accès support (Issue : #253).
- [x] UM-P4 — Cycle de vie des comptes et courriel (Issue : #253).
- [x] UM-P5 — Écrans (Issue : #253).
- [x] UM-P6 — Scénario e2e, Mailpit en CI, drapeau, runbook (Issue : #253) — sauf DB-3.
- [x] UM-D7 — Amendement D-7 : schémas `auth` / `admin`, rôles au moindre privilège, CI et restauration (Issue : #253).

## Bloqué

- UM-P6-DB3 : la clé privée de l'autorité d'attestation doit vivre hors dépôt (secret GitHub) ; seule l'administration
  du dépôt peut la créer et décider de l'enrôlement (UM-11). Déblocage : procédure dans RUNBOOK.md, § Garde DB-3.

## Critères de sortie

- Chaque tâche liée à une preuve, une Issue et une PR si elle modifie le dépôt.
- Tests pertinents connus et signalés ; décision d'acceptation consignée.
