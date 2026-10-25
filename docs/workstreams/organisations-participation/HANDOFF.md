# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche : `ccr-3b26a9f6-z073dc` (repartie de `main` après la fusion de la PR #290, `0ff0638`). PR #281 et #290 fusionnées.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Toutes les phases du plan implémentées et fusionnées ; CI complète verte sur `866f54d` (PR #290). OP-4 appliquée.

## Prochaine action

- Mener le lot OP-PONT (retrait du pont `op_sync_access`) jusqu'à une PR verte en CI.
- Puis présenter le 🛑 final au maître d'ouvrage avec [recette-finale.md](recette-finale.md) ; restent : avis juridique
  (OP-2), listes métier (OP-D4).

## Tests et preuves

- `npm run typecheck`, `npm test`, `npm run build` ; `scripts/validation/*-migration-check.mjs` (base locale jetable) ;
  `scripts/validation/organisations-participation-post-deploiement.mjs` (lecture seule) ; recettes `apps/web/e2e/*.mjs`, dont
  `organisations-participation-final.mjs`. Les suites DB-3 ne tournent qu'en CI.

## Risques et blocages

- Fin de l'ajout direct (OP-D2) : changement visible pour les propriétaires qui partagent un projet ; à annoncer.
- Accès externe : la moindre fuite par une route, un aperçu ou un export est un défaut bloquant (`revue-externe.mjs`,
  recette finale).
- Réserve juridique d'OP-2 non levée avant d'activer l'effacement automatique en production.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
