# Design — Reprise de session

Mis à jour : 2026-11-26 (UTC).

## Point de reprise

- Chantier : design
- Issue : https://github.com/RachEma-ux/Fadi/issues/412
- Branches / PR actives : `design/l0-outillage` (L0) ; L1 à L4 empilées dessus (`design/l1-geodata-seuil`,
  `design/l2-geodata-outils`, `design/l3-saisie-etape`, `design/l4-action-utile`). Vérifier leur état sur GitHub.
- Dernier commit vérifié : à relever en début de session.

## Dernier état vérifié

- L0 : PR #418. L1 : PR #419. L2 : PR #420. L3 : PR #421. L4 : action utile remise, `accueils-design.mjs` vert en local ;
  voir `STATUS.md`. Les constats de revue Codex sur #418 et #420 sont corrigés et propagés par fusion dans les branches
  supérieures (jamais de rebase ni de push forcé).

## Prochaine action

- Suivre la CI des PR L0 à L9 ; fusion dans l'ordre par le maître d'ouvrage, après captures sur un vrai téléphone.

## Tests et preuves

- `npx vitest run src/design` (apps/web) ; `node apps/web/e2e/design-releve.mjs` (relevé, planches « avant »).

## Risques et blocages

- Le scénario `parcours-scenario.mjs` complet n'a pas pu finir sur la stack locale (serveur de développement Vite) : il
  s'arrête aussi sur `main`, à un autre endroit ; la CI (application construite) fait foi.

- L4 change `accueils-design.mjs` et `parcours-scenario.mjs` (l'action est de nouveau exigée) ; le Design Historique § 7
  porte l'amendement du 26-11-2026.

## Arrêt sûr

- Aucune fusion ni déploiement sans le maître d'ouvrage ; jamais la production.
