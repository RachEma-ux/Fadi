# Design — Statut

Mis à jour : 2026-11-26 (UTC).

## État

**En cours** — lot L0 implémenté sur branche ; non accepté.

## Faits vérifiés

- Garde des plafonds (`apps/web/src/design/plafonds.test.ts`) verte sur `main` 470e99f : 581 couleurs hexadécimales
  opaques, 616 avec alpha, 19 points de rupture distincts dans les feuilles CSS de `apps/web/src`.
- Relevé `e2e/design-releve.mjs` exécuté localement le 26-11-2026 (stack locale, 21 cas : 7 écrans × 412 / 1 440 /
  320 px) : aucune violation axe critique ou grave ; aucun débordement du document ; défilements horizontaux internes
  relevés (barre des modules de projet, phases et grille de la Vue d'ensemble, onglets et pastilles GeoData) ; cibles
  sous 24 px relevées par écran (1 à 5).

## Points ouverts

- Capture sur un vrai téléphone Android à joindre par le maître d'ouvrage avant fusion.
- Lots L1 à L4 autorisés, en PR empilées sur L0.

## Liens de suivi

- Issue de chantier : https://github.com/RachEma-ux/Fadi/issues/412 ; lot L0 : #413
- Branche de tâche : `design/l0-outillage`

## Préconditions de clôture

- Critères de chaque Issue de lot testés et documentés ; acceptation du maître d'ouvrage consignée.
