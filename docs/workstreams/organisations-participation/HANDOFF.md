# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche / PR : `ccr-3b26a9f6-z073dc`, PR [#281](https://github.com/RachEma-ux/Fadi/pull/281) (phases 2 à 6).
- Phase 1 fusionnée dans `main` (PR #265). Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- OP-3 (2026-10-24) : le maître d'ouvrage demande l'exécution du plan de bout en bout ; 🛑 1 franchi, phases enchaînées sans
  attente intermédiaire, 🛑 final et tout déploiement restent au maître d'ouvrage.
- Phase 3 bis (journal d'activité) livrée sur la branche : compte rendu [phase-3bis.md](phase-3bis.md).
- Phases 2 et 5 livrées (comptes rendus [phase-2.md](phase-2.md), [phase-5.md](phase-5.md)) ; CI verte sur `9abca29`.
- Phases 3 (invitations acceptées) et 4 (revue externe) en cours ; puis phase 6.

## Prochaine action

- Fusionner les phases 3 et 4, puis la phase 6 (recette finale, runbook) ; CI verte de la PR #281.

## Tests et preuves

- Locales : `npm run typecheck`, `npm test`, `npm run build`, `scripts/validation/*-migration-check.mjs`, recettes
  `apps/web/e2e/*.mjs` sur PostgreSQL 16 + PostGIS jetable. Les suites DB-3 ne tournent qu'en CI.

## Risques et blocages

- Fin de l'ajout direct (OP-D2) : changement visible pour les propriétaires qui partagent un projet.
- Accès externe : la moindre fuite par une route, un aperçu ou un export est un défaut bloquant (recette dédiée en phase 4).
- Réserve juridique d'OP-2 (obligations de conservation) non levée.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
