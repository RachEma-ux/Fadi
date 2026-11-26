# Design — Reprise de session

Mis à jour : 2026-11-26 (UTC).

## Point de reprise

- Chantier : design
- Issue : https://github.com/RachEma-ux/Fadi/issues/412
- Branches / PR actives : `design/l0-outillage` (L0) ; L1 à L4 empilées dessus (`design/l1-geodata-seuil`,
  `design/l2-geodata-outils`, `design/l3-saisie-etape`, `design/l4-action-utile`) ; puis L5 à L9
  (`design/l5-navigation-preparation`, `design/l6-navigation-activation`, `design/l6b-ordre-rail`,
  `design/l7-geodata-barre-unique`, `design/l9-entete-une-rangee`). Vérifier leur état sur GitHub.
- Dernier commit vérifié : à relever en début de session.

## Dernier état vérifié

- L0 : PR #418. L1 : PR #419. L2 : PR #420. L3 : PR #421. L4 : action utile remise, `accueils-design.mjs` vert en local ;
  voir `STATUS.md`. Les constats de revue Codex sur #418 et #420 sont corrigés et propagés par fusion dans les branches
  supérieures (jamais de rebase ni de push forcé).
- L5 : PR #434 (barre et feuille « Plus » préparées, masquées). L6 : PR #436 (barre du bas active sous 700 px, rail
  masqué) ; les libellés NAV-001 mobile et RISQ-02 téléphone du registre Studio suivent les nouveaux contrôles.
  Plancher de l'espace de travail à 480 px quand la barre du bas est affichée (la palette de la Planche restait
  coincée à 352 px de vue) ; `planche-boutons.mjs` vise aussi un point libre du canevas. Recette `planche.mjs` (téléphone) : la vue étant plus courte, le premier toucher « dans le vide » tombait sur la
  palette d'outils ; il vise maintenant un point libre du canevas, et l'arête tracée au doigt est annulée avant le carré
  exact (16 m²). Correctif CI : la hauteur de la barre était lue à 0 (`offsetParent` est nul en `position: fixed`) ; l'Atelier et la
  Planche s'arrêtent maintenant au-dessus de la barre ; `select` des options de Collaboration à 44 px.
- L6b : PR #437 (rail du bureau dans l'ordre de la barre puis de « Plus » ; Harmonie ajoutée).

- Fusion autorisée par Roch (26-11-2026, 04:58 et 05:03, heure suisse) : #418 → #440 dans l'ordre, L6 vert. main
  (b286441e) intégré à toute la pile ; plafonds de couleurs remesurés sur ce main (584 / 619, couleurs venues de main).

- `design-releve.mjs` passe à l'inscription par lien (#428) depuis l'intégration de main.
- `extensions-commandes.mjs` (venue de main, #438) passe aussi à l'inscription par lien : sur main elle échouait au champ mot de passe.

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
