# Design — Reprise de session

Mis à jour : 2026-11-26 (UTC).

## Point de reprise

- Chantier : design
- Issue : https://github.com/RachEma-ux/Fadi/issues/412
- Branches / PR actives : `design/l0-outillage` (L0) ; L1 à L4 empilées dessus (`design/l1-geodata-seuil`,
  `design/l2-geodata-outils`, `design/l3-saisie-etape`, `design/l4-action-utile`). Vérifier leur état sur GitHub.
- Dernier commit vérifié : à relever en début de session.

## Dernier état vérifié

- L0 : PR #418. L1 : PR #419. L2 : PR #420. L3 : contrôles de saisie verts en local ; voir `STATUS.md`.

- Fusion autorisée par Roch (26-11-2026, 04:58 et 05:03, heure suisse) : #418 → #440 dans l'ordre, L6 vert. main
  (b286441e) intégré à toute la pile ; plafonds de couleurs remesurés sur ce main (584 / 619, couleurs venues de main).

## Prochaine action

- Faire passer la CI de la PR L0, puis traiter L1 à L4 dans l'ordre ([PLAN-LOTS.md](PLAN-LOTS.md)).

## Tests et preuves

- `npx vitest run src/design` (apps/web) ; `node apps/web/e2e/design-releve.mjs` (relevé, planches « avant »).

## Risques et blocages

- Le scénario `parcours-scenario.mjs` complet n'a pas pu finir sur la stack locale (serveur de développement Vite) : il
  s'arrête aussi sur `main`, à un autre endroit ; la CI (application construite) fait foi.

- Les recettes `accueils-design.mjs` exigent l'absence de l'action utile : le lot L4 les modifie avec le code.

## Arrêt sûr

- Aucune fusion ni déploiement sans le maître d'ouvrage ; jamais la production.
