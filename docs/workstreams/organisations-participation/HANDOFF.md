# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche / PR : `ccr-3b26a9f6-z073dc`, PR [#290](https://github.com/RachEma-ux/Fadi/pull/290) (phases 3, 4, 6 et reliquats).
  PR #281 (phases 2, 3 bis, 5) fusionnée le 2026-10-24.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Toutes les phases du plan implémentées (STATUS.md) ; vérifications locales vertes ; suites DB-3 des lots de la PR #290
  à constater en CI.

## Prochaine action

- Relever la CI de la PR #290 et la mener au vert (premier point : suites DB-3 des phases 3 et 4, des portées étroites et du
  mandat).
- Puis présenter le 🛑 final au maître d'ouvrage avec [recette-finale.md](recette-finale.md) et les décisions en attente.
- Lot suivant possible, sur décision : retrait du pont `op_sync_access` (OP-PONT).

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
