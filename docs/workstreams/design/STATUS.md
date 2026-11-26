# Design — Statut

Mis à jour : 2026-11-26 (UTC).

## État

**En cours** — lots L0 (PR #418), L1 (PR #419), L2 (PR #420) et L3 implémentés sur branches empilées ; non acceptés.

## Faits vérifiés

- Garde des plafonds (`apps/web/src/design/plafonds.test.ts`) verte sur `main` 470e99f : 581 couleurs hexadécimales
  opaques, 616 avec alpha, 19 points de rupture distincts dans les feuilles CSS de `apps/web/src`.
- Relevé `e2e/design-releve.mjs` exécuté localement le 26-11-2026 (stack locale, 21 cas : 7 écrans × 412 / 1 440 /
  320 px) : aucune violation axe critique ou grave ; aucun débordement du document ; défilements horizontaux internes
  relevés (barre des modules de projet, phases et grille de la Vue d'ensemble, onglets et pastilles GeoData) ; cibles
  sous 24 px relevées par écran (1 à 5).

- L1 (#414) : GeoData bascule à 700 px (CSS et `PageGeoData.tsx`), plus aucun 760 px dans le module ; « Carte » pressé
  et survolé à 5,23:1 (au lieu de 1,00:1). `e2e/geodata.mjs` : 269 contrôles verts en local, dont 4 nouveaux
  (`DESIGN L1`). Points de rupture : plafond inchangé à 19 (700 existait déjà ; 701 écrit `not all and (max-width:700px)`).

- L2 (#415) : au téléphone (Pixel 7), la colonne d'outils GeoData s'arrête à 777 px, au-dessus de la barre du bas
  (781 px) ; avant, elle descendait à 841 px et cinq outils étaient cachés dessous. Elle défile au doigt (`pan-y`,
  balayage tactile CDP : `scrollTop` 178) ; la poignée (24 px, collante) garde seule le glisser. `e2e/geodata.mjs` :
  273 contrôles verts en local, dont 4 nouveaux (`DESIGN L2`).

- L3 (#416) : un champ nombre d'étape est un texte à clavier décimal ; « 12,5 » est enregistré 12,5 ; « 1e » et
  « abc » gardent le texte, affichent un message relié au champ (`aria-invalid`, `aria-describedby`) et n'envoient
  aucune écriture ; « -3 » reste accepté. Avant : « 1e » effaçait en silence une valeur enregistrée (500 relu vide
  après rechargement, vérifié). Date incomplète : même règle. `parcours-scenario.mjs` : 5 contrôles `DESIGN L3` verts
  en local ; vitest `lireNombre` : 3 tests.

## Points ouverts

- Capture sur un vrai téléphone Android à joindre par le maître d'ouvrage avant fusion.
- Lots L1 à L4 autorisés, en PR empilées sur L0.

## Liens de suivi

- Issue de chantier : https://github.com/RachEma-ux/Fadi/issues/412 ; lot L0 : #413
- Branche de tâche : `design/l0-outillage`

## Préconditions de clôture

- Critères de chaque Issue de lot testés et documentés ; acceptation du maître d'ouvrage consignée.
