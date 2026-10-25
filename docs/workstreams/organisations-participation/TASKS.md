# Organisations, participation et revue externe — Tâches

Mis à jour : 2026-10-25 (UTC).

## À faire

- [ ] OP-DEPLOI — Préproduction : demandée par le maître d'ouvrage (2026-10-25) ; déployée automatiquement par `fadi-preprod-auto` depuis `main` vert (PR #297 : OP-4, OP-5, `CONTACT_RETENTION_ENABLED=1` dans `deploy/preprod/compose.yml`), OP-PONT compris. Production : sur accord explicite seulement, selon RUNBOOK-deploiement.md.

## En cours

- OP-AUTOCONTROLE — Séparation des responsabilités (décision OP-6) : implémenté sur `lot-autocontrole`, vérifié en local (`lot-autocontrole.md`) ; PR, suites DB-3 et CI à faire passer, acceptation à recueillir (Issue : #262).

## Terminé

- [x] OP-PONT — Retrait du pont `op_sync_access` fusionné dans `main` (`7eed727`, `d23a880`).

- [x] OP-P297 — OP-4, OP-5 et réglage de préproduction fusionnés (PR #297, CI verte sur `739d019`).
- [x] OP-FINAL — 🛑 final franchi : périmètre accepté (OP-5, 2026-10-25).
- [x] OP-JURIDIQUE — Réserve d'OP-2 levée par le maître d'ouvrage, sous sa responsabilité (OP-5).
- [x] OP-LISTES — Listes métier : saisie libre définitive (OP-5).

- [x] OP-REC — Recommandations de la recette appliquées (OP-4) : accès de revue 14 jours, effacement automatique des contacts désactivé par défaut, décisions consignées.
- [x] OP-P3, OP-P4, OP-P6, OP-RELIQUATS — fusionnés (PR #290, CI verte sur `866f54d`).
- [x] OP-P2, OP-P3b, OP-P5 — fusionnées (PR #281) (Issue : #262).
- [x] OP-P1 — Phase 1 fusionnée (PR #265) (Issue : #262).
- [x] OP-P0, OP-INIT — Plan validé, décisions OP-D1 à OP-D13 (OP-1), dossier de continuité (Issue : #262).

## Bloqué

- Aucune tâche bloquée : OP-AUTOCONTROLE attend sa PR et sa CI (suites DB-3 non exécutables hors CI) ; la production attend l'accord explicite du maître d'ouvrage.

## Critères de sortie

- Chaque tâche liée à une preuve, une Issue et une PR si elle modifie le dépôt.
- Tests pertinents connus et signalés ; décision d'acceptation consignée.
