# Bases de données — Contexte

## Objectif

Résoudre les problèmes relevés par l'analyse complète des bases de données de Fadi (2 novembre 2026) et implémenter les
améliorations possibles, à la demande du maître d'ouvrage. Plan : [PLAN.md](PLAN.md). Issue
[#379](https://github.com/RachEma-ux/Fadi/issues/379).

## Périmètre

- PostgreSQL + PostGIS de Fadi : schéma `apps/api/src/db/init.sql`, accès `apps/api/src`, exploitation
  `docker-compose.yml`, `deploy/`, `scripts/backup*.sh`.
- Transversal : touche GeoData, Atelier, Studio, comptes ; aucune donnée métier modifiée.

## Sources canoniques

- `AGENTS.md`, `docs/architecture.md`, `docs/workstreams/users-management/AMENDEMENT-D7.md` (rôles D-7).
- `docs/deploiement.md`, `docs/sauvegarde-externe.md`, `docs/retention-swiss-backup.md`, `RUNBOOK.md`.
- `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md` (OPS-09 : objectifs de reprise « non évalués »).

## Contraintes

- Production = Release du maître d'ouvrage ; aucune action irréversible en production depuis la session.
- D-7 (moindre privilège), D-GD-29 (interface ≠ base) ; décisions de la section 10.1 du cahier Atelier au maître
  d'ouvrage.
- Aucune valeur inventée : objectifs RPO / RTO, limites mémoire du serveur restent « à définir ».

## Hypothèses et questions ouvertes

- Les mesures ont été faites sur une base locale avec les données GeoData réelles ; la production n'a pas été mesurée.
- Questions au maître d'ouvrage : objectifs RPO / RTO (BD-7), mots de passe `fadi_migrator` / `fadi_backup` (BD-8),
  portée du verrou de projet de l'Atelier (BD-9).
