# Design — Plan des lots de PR

Règles communes : un écran ou une famille de jetons par PR ; recette du lot livrée d'abord en relevé puis rendue
bloquante dans la même PR ; retour arrière par `git revert` sans migration ; aucun lot ne touche aux 21 étapes ni à la
production. Cycle Issue → branche → PR (`AGENTS.md`). Seuls les lots marqués « autorisé » peuvent être engagés.

| Lot | Contenu | Dépend de | Recette bloquante | Autorisation |
|---|---|---|---|---|
| L0 | Outillage : `e2e/lib-design.mjs`, `e2e/design-releve.mjs`, `design-exceptions.json`, `design-plafonds.json`, garde vitest `src/design/plafonds.test.ts`, étape CI | — | garde des plafonds ; relevé produit | autorisé (#413) |
| L1 | GeoData : seuil téléphone 760 → 700 px (CSS et `PageGeoData.tsx`), état pressé de la barre du bas lisible | L0 | « Carte » pressé ≥ 4,5:1 ; barre à 700 px, absente à 701 px | autorisé (#414) |
| L2 | GeoData : colonne d'outils bornée au-dessus de la barre du bas, défilable au doigt | L1 | aucun outil sous la barre ; `tap()` sur chaque outil | autorisé (#415) |
| L3 | Étape : saisie numérique sans effacement ni conversion silencieuse, message relié au champ | L0 | « 12,5 » → 12,5 ; « 1e » : message, aucune écriture | autorisé (#416) |
| L4 | Vue d'ensemble : action utile de la Tâche 3 rendue, recettes alignées | L0 | action visible sans défiler à 412 × 839, ≥ 44 px | autorisé (#417), action remise (décision du 26-11-2026) |
| L5 | Navigation, préparation (barre du bas et feuille « Plus » masquées) | L0 | aucune capture ne change | autorisé (#429, 26-11-2026) |
| L6 | Navigation, activation ≤ 700 px ; rail masqué | L5 | rail ou barre, jamais les deux ; focus non masqué | autorisé (#430, 26-11-2026) |
| L6b | Rail bureau : ordre des entrées | L6 | ordre Tab = ordre visuel | autorisé (#431, 26-11-2026) |
| L7 | Fusion des barres GeoData (5ᵉ bouton « Plus ») | L1, L2, L6 | une seule barre fixe | autorisé (#432, 26-11-2026) |
| L8 | Paysage, clavier virtuel, Atelier | L6 | — | à autoriser |
| L9 | En-tête d'une rangée, un seul `h1`, titres de page | L6 | — | à autoriser |
| L10a-d | États : page introuvable, erreur / hors-ligne / droits séparés, Projets, Administration | L0 | — | à autoriser |
| L11a-b | Formulaires : champ + résumé d'erreurs | L0 | — | à autoriser |
| L12 | Carte accessible : liste des couches, objet sélectionné, légende non chromatique | L7 | — | à autoriser |
| L13.x | Jetons, typographie en rem, points de rupture (une famille par PR) | L0 | plafonds en baisse | à autoriser |
