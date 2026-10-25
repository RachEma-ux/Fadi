# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-25 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche : `lot-autocontrole` (repartie de `main` = `a37bc69`, lot OP-PONT et Axes phase A fusionnés). PR #281, #290,
  #297 et OP-PONT fusionnés.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Toutes les phases du plan implémentées et fusionnées ; CI complète verte sur `866f54d` (PR #290). OP-4 et OP-5
  fusionnées (PR #297, CI verte sur `739d019`). Lot OP-PONT fusionné (`7eed727`, `d23a880`).
- Lot OP-AUTOCONTROLE (décision OP-6) implémenté sur la branche, vérifié en local ([lot-autocontrole.md](lot-autocontrole.md)
  § 5) ; suites DB-3 et CI non exécutées ici.

## Prochaine action

- Ouvrir la PR du lot OP-AUTOCONTROLE, la mener jusqu'à la CI verte (DB-3 comprises : `app.test.ts` § 8,
  `reviews.test.ts` « auto-contrôle »), puis recueillir l'acceptation du maître d'ouvrage.
- 🛑 final franchi (OP-5, 2026-10-25). Déploiement : seulement sur accord explicite, selon le runbook (poser
  `CONTACT_RETENTION_ENABLED=1` ; § 10 pour l'auto-contrôle).

## Tests et preuves

- `npm run typecheck`, `npm test`, `npm run build` ; `scripts/validation/*-migration-check.mjs` (base locale jetable) ;
  `scripts/validation/organisations-participation-post-deploiement.mjs` (lecture seule) ; recettes `apps/web/e2e/*.mjs`, dont
  `organisations-participation-final.mjs` et `auto-controle.mjs` (53 contrôles). Les suites DB-3 ne tournent qu'en CI.

## Risques et blocages

- Fin de l'ajout direct (OP-D2) : changement visible pour les propriétaires qui partagent un projet ; à annoncer.
- Accès externe : la moindre fuite par une route, un aperçu ou un export est un défaut bloquant (`revue-externe.mjs`,
  recette finale ; l'aperçu `GET /reviews/:id/controle-approbation` ne rend aucune adresse).
- Auto-contrôle : désactiver l'option d'un compte ferme l'approbation de ses propres dossiers ; à annoncer aux
  administrateurs avant usage. `revue-externe.mjs` a montré une instabilité de temps préexistante (1 passage sur 2).
- Réserve juridique d'OP-2 levée par le maître d'ouvrage (OP-5) ; l'effacement automatique reste à activer explicitement en production.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
