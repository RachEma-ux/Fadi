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
| `fiches/PL-NN-MM.md` | Fiches de capacité (gabarit `docs/atelier/fiches/_gabarit.md`). Lot 1 : PL-01-01 géométrie libre, PL-01-02 champ Mesures, PL-01-03 inférences, PL-01-04 catalogue des outils. Lot 2 : PL-02-01 sélection et lasso, PL-02-02 gomme, PL-02-03 ligne et main levée, PL-02-04 rectangles, PL-02-05 cercle et polygone, PL-02-06 arcs et secteur, PL-02-07 interface du mode Planche. Lot 3 : PL-03-01 pousser/tirer, PL-03-02 déplacer, PL-03-03 faire pivoter, PL-03-04 échelle, PL-03-05 décalage, PL-03-06 suivez-moi, PL-03-07 retourner et diviser. |
| `lots/lot-N.md` | Comptes rendus de lot (numérotation propre à la Planche). |
| `reference/` | Relevés en direct de SketchUp pour le Web (06/10/2026) et référence documentaire sourcée — **source de comportement, non modifiée** ; un nouveau relevé s'ajoute en nouveau fichier. |

Relevés : `outils-dessin.md`, `outils-modification.md`, `complements-modification.md`, `mesure-camera-panneaux.md`,
`complements-panneaux.md` (observé en direct) ; `doc-officielle.md` (documentation officielle et forum, non constatée
en direct).

## État

| Lot | Contenu | État |
| --- | --- | --- |
| 1 | Noyau pur `packages/planche-model` : géométrie libre, champ Mesures, inférences, catalogue des outils (sans interface) | Codé et commité sur `planche/lot-1` (D-164) ; fiches PL-01-01 à PL-01-04 encore « spécifiée » (preuve des tests du lot 1 à lier) ; compte rendu `lots/lot-1.md` encore prévisionnel |
| 2 | Rendu three.js, outils de dessin et champ Mesures dans le mode Planche | Codé et commité sur `planche/lot-1` (D-165) ; fiches PL-02-01 à PL-02-07 « prototype » ; compte rendu `lots/lot-2.md` ; recette `apps/web/e2e/planche.mjs` **exécutée et verte** (lot 3) ; écarts du lot 2 tranchés par délégation (D-167) ; acceptation formelle non consignée (l'ouverture du lot 3 a été demandée) |
| 3 | Outils de modification : Pousser/Tirer, Déplacer, Faire pivoter, Échelle, Décalage, Suivez-moi, Retourner, Diviser | Codé sur `planche/lot-3` (D-166, D-167) ; fiches PL-03-01 à PL-03-07 « prototype » ; compte rendu `lots/lot-3.md` ; recettes `planche.mjs` et `planche-modification.mjs` vertes ici ; CI GitHub et acceptation en attente |
| 4 | Mesure, annotation, caméra : Mètre, Cotes, Rapporteur, Axes, Texte, Plan de coupe, Zoom étendu, Zoom fenêtre, Positionner la caméra, Regarder autour, Marcher | Codé sur `planche/lots-4-6` (D-170) ; fiches PL-04-01 à PL-04-06 « prototype » ; compte rendu `lots/lot-4.md` ; recette `planche-lots-4-6.mjs` verte ici ; CI et acceptation en attente |
| 5 | Matériaux, balises, texte 3D (les quatre outils « prévus » : Pot de peinture, Prélever la matière, Balise, Texte 3D ; panneaux Matériaux et Balises ; Ctrl + G) — le reste du lot 5 (composants par boîte, Rendre unique, Éclater, autres panneaux, menu contextuel) reste à faire | Codé sur `planche/lots-4-6` (D-170, P-7 / P-8 / P-9) ; fiches PL-05-01 à PL-05-03 ; compte rendu `lots/lot-5.md` ; partiel |
| 6 | Solides (manifold-3d) : Enveloppe extérieure, Union, Soustraction, Ajuster, Intersection, Scinder — booléens de maillage | Codé sur `planche/lots-4-6` (D-170) ; fiche PL-06-01 ; compte rendu `lots/lot-6.md` ; vrai moteur testé en Node et au navigateur |
| 7 | Persistance par commandes, IFC, recette Playwright ordinateur et téléphone, axe-core | À spécifier |

Un lot à la fois, acceptation du maître d'ouvrage entre deux lots. Décisions ouvertes : `cahier-planche.md` §10.
