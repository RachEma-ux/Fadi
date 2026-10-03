# Lot 1 — Modèle typé `packages/atelier-model` — compte rendu

Exécuté le 3 octobre 2026 (chef de projet, session unique). Paquet pur, contrats `modele-atelier/1` et
`atelier-commands/1`, manifeste et contrôle de dépendances en CI (`scripts/check-module-deps.mjs`).

## Fait

| Tâche | Résultat |
| --- | --- |
| L1.1 | Ontologie (18 classes : bâtiment, poteau de structure, dessin, annotation), classe IFC 4.3 par classe, caractéristiques nommées, paramètres canoniques typés par classe avec validation des unités (`{ value, unit: "m" }` obligatoire, grandeur sans unité refusée), définitions versionnées (types de murs), calques avec `visible` / `verrouille` dans le modèle, groupes. |
| L1.2 | 90 types de commandes enregistrés (annexe B) : objets (créer / modifier / supprimer pour chaque classe), `mur.scinder` / `mur.joindre`, `ouverture.poser` / `.deplacer`, 14 transformations (dont `raccorder` et `chanfreiner`), annotations et `cotation.rattacher`, calques, groupes, types, propriétés, classification, `reference.reparer`, site (parcelle, emprise), inverse `interne.restaurer`. Lot atomique ; identifiants déterministes dérivés du `requestId` (même résultat navigateur / serveur) ; inverse = instantané différentiel exact. |
| L1.3 | Références : résolution par caractéristique (faces et arêtes de mur, centre d'ouverture suivant son hôte, sommets de contour, sommets / segments d'esquisse), état « à réparer » avec propositions à la scission, au miroir, à la suppression ; quantités reproductibles (pièces avec écart déclaré / calculé, murs, ouvertures, dalles, toitures, poteaux, escaliers, solides). Détection de pièces par boucles fermées du graphe des axes (P.118 : 5 à 12 boucles par niveau en 37 ms), proposition jamais imposée. |
| L1.4 | Importeur P.118 à sens unique (section 6, D-014) : 220 murs, 84 portes, 126 fenêtres (210 hôtes trouvés), 32 escaliers avec niveaux d'arrivée et groupes, 120 poteaux, 45 espaces déclarés, 74 pièces, 6 dalles, 2 toitures, 13 zones, 2 références de plan, 870 solides (rôles conservés, aucun rôle inconnu), 64 cotations libres, 95 textes, 22 calques, parcelle (sommets cadastraux EPSG:26191 et locaux, origine locale explicite), emprise, structure déclarée « à confirmer », 2 hypothèses du prototype + 1 hypothèse de charge, sources, méta conservées en propriétés `natif:*`. Rapport nominatif par famille ; 37 problèmes listés (14 écarts d'aire, 23 absences de correspondance). Projection vers l'entrée d'analyse : **analyse identique** à celle du modèle natif (74 pièces, aires, portes, fenêtres, mobilier, niveaux). |
| L1.5 | `core-geometry` relu : conservé tel quel pour le lot 3b (solides et projections) ; la géométrie 2D du modèle (polygones, jonctions, boucles, transformations, arcs, splines) est dans `atelier-model`, testée. |
| L1.6 | `manifest.json`, `README.md`, 30 tests vitest. |

## Non fait / reporté

- Importeur des exports du prototype via l'archive (`project-archive.ts`) : branché au lot 4 (même fonction `importerModeleNatif`).
- Esquisse contrainte (`contrainte.*`), blocs / composants, références externes : lot 5 / 7 (classes et commandes réservées).

## Décisions

D-014 (`docs/atelier/decisions.md`).

## Ce que vous pouvez vérifier

- `npm test --workspace=@parcours/atelier-model` (30 tests) ; `npm run typecheck` (contrôle de modularité en tête).
- `packages/atelier-model/README.md` ; les règles d'import dans `docs/atelier-cahier-des-charges.md` section 6 (mise à jour).
