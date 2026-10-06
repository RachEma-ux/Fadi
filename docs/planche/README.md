# Planche — mode de travail de l'Atelier

La **Planche** est un mode de travail de l'Atelier, à côté de **Plan**, **3D** et **Documents**. Elle offre les outils
de SketchUp pour le Web — géométrie libre (arêtes et faces collantes), groupes, composants, dessin, modification,
mesure, annotation, caméra, panneaux — avec des écarts déclarés là où les règles de Fadi l'imposent (français, rien
d'inventé, commandes inversibles, repères explicites).

## Place dans l'Atelier

- **Pas un 8ᵉ module** : les 7 modules de `docs/architecture.md` sont inchangés ; la Planche vit dans le module
  Atelier (étapes 10 et 11 en mode immersif, comme l'Atelier).
- **Réutilise l'existant** : bus de commandes, révisions, file hors ligne, annuler / rétablir, disposition Canevas
  (D-156), navigation configurable (D-157), partage et droits.
- **Calcul pur** dans `packages/planche-model` (aucune dépendance d'interface, R6) ; rendu three.js dans `apps/web`
  à partir du lot 2.
- Booléens de **maillage** par manifold-3d (Apache-2.0, D-013) ; OCCT non ouvert.

## Contenu du dossier

| Chemin | Rôle |
| --- | --- |
| `cahier-planche.md` | Cahier des charges : décisions, compatibilité avec les règles Fadi, anatomie de l'écran, spécification outil par outil, conventions, panneaux, menus, plan par lots, lacunes du relevé, décisions ouvertes. |
| `fiches/PL-NN-MM.md` | Fiches de capacité (gabarit `docs/atelier/fiches/_gabarit.md`). Lot 1 : PL-01-01 géométrie libre, PL-01-02 champ Mesures, PL-01-03 inférences, PL-01-04 catalogue des outils. |
| `lots/lot-N.md` | Comptes rendus de lot (numérotation propre à la Planche). |
| `reference/` | Relevés en direct de SketchUp pour le Web (06/10/2026) et référence documentaire sourcée — **source de comportement, non modifiée** ; un nouveau relevé s'ajoute en nouveau fichier. |

Relevés : `outils-dessin.md`, `outils-modification.md`, `complements-modification.md`, `mesure-camera-panneaux.md`,
`complements-panneaux.md` (observé en direct) ; `doc-officielle.md` (documentation officielle et forum, non constatée
en direct).

## État

| Lot | Contenu | État |
| --- | --- | --- |
| 1 | Noyau pur `packages/planche-model` : géométrie libre, champ Mesures, inférences, catalogue des outils (sans interface) | Spécifié ; fiches PL-01-01 à PL-01-04 « spécifiée » ; compte rendu prévisionnel `lots/lot-1.md` |
| 2 | Rendu three.js, outils de dessin et champ Mesures dans le mode Planche | À spécifier |
| 3 | Outils de modification | À spécifier |
| 4 | Mesure, annotation, caméra | À spécifier |
| 5 | Groupes, composants, matériaux, balises, panneaux | À spécifier |
| 6 | Solides (manifold-3d) | À spécifier |
| 7 | Persistance par commandes, IFC, recette Playwright ordinateur et téléphone, axe-core | À spécifier |

Un lot à la fois, acceptation du maître d'ouvrage entre deux lots. Décisions ouvertes : `cahier-planche.md` §10.
