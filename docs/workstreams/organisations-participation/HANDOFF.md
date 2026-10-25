# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche : `ccr-3b26a9f6-z073dc` (repartie de `main` après la fusion de la PR #297, `cd2b9f7`). PR #281, #290 et #297 fusionnées.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Toutes les phases du plan implémentées et fusionnées ; CI complète verte sur `866f54d` (PR #290). OP-4 et OP-5 fusionnées
  (PR #297, CI verte sur `739d019`). Lot OP-PONT livré sur la branche, PR à suivre.

## Prochaine action

- Mener la PR du lot OP-PONT (retrait du pont `op_sync_access`, `lot-pont.md`) jusqu'à la CI verte (DB-3 comprises), la
  fusionner : la préproduction la déploie seule (`fadi-preprod-auto`).
- 🛑 final franchi (OP-5, 2026-10-25). Déploiement : seulement sur accord explicite, selon le runbook (poser
  `CONTACT_RETENTION_ENABLED=1`).

## Tests et preuves

- `npm run typecheck`, `npm test`, `npm run build` ; `scripts/validation/*-migration-check.mjs` (base locale jetable) ;
  `scripts/validation/organisations-participation-post-deploiement.mjs` (lecture seule) ; recettes `apps/web/e2e/*.mjs`, dont
  `organisations-participation-final.mjs`. Les suites DB-3 ne tournent qu'en CI.

## Risques et blocages

- Fin de l'ajout direct (OP-D2) : changement visible pour les propriétaires qui partagent un projet ; à annoncer.
- Accès externe : la moindre fuite par une route, un aperçu ou un export est un défaut bloquant (`revue-externe.mjs`,
  recette finale).
- Réserve juridique d'OP-2 levée par le maître d'ouvrage (OP-5) ; l'effacement automatique reste à activer explicitement en production.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
