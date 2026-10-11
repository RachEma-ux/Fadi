# Écarts Fadi — profilés (outils propres à Fadi, lots L12 et L13)

Ce document est la référence des outils de la chaîne des profilés : programme D-202, lots L11 à L14, décisions D-214 et
D-215. Ces outils n'existent pas dans SketchUp, qui ne fait que les approcher avec des extensions de tiers comme
MetalFab ou Profile Builder. Ils sont donc **déclarés** au catalogue avec le statut `fadi`. Aucune donnée de profilé
n'est fournie par Fadi : la section vient d'un catalogue sourcé importé dans l'Atelier (D-180), de dimensions saisies
ou d'une face de la Planche (R3).

## § 1 — Profilé

- **Étape 1** : « Cliquez le début de la pièce. » Le champ Mesures affiche la longueur.
- **Étape 2** : « Cliquez la fin de la pièce, ou tapez sa longueur. » La pièce suit le curseur en aperçu.
- **Flèches** : verrou d'axe. **Maj** : verrou d'inférence.
- **Ctrl** frappé seul fait défiler le point de placement : centre, haut gauche, haut droite, bas droite, bas gauche.
- **Alt** frappé seul tourne la section de 90°. C'est un écart déclaré par rapport à MetalFab.
- **Résultat** : un composant qui porte la section, sa source et son placement, posé dans le contexte d'édition
  courant. La pièce est sélectionnée, et un pas d'historique est créé.
- **Raccourci Fadi** : Maj+Q.

## § 2 — Profilés depuis arêtes

- **Présélection** : une ou plusieurs chaînes d'arêtes continues.
- « Cliquez dans la vue (ou « Poser ») pour poser une pièce sur chaque arête sélectionnée. » L'aperçu est calculé au
  survol, sans rien écrire.
- **Mesures** : le décalage signé des extrémités libres.
- **Options** :
  - position centre / extérieur / intérieur, que **Ctrl** frappé seul fait défiler ;
  - rotation de 90°, basculée par **Alt** frappé seul ;
  - onglets aux sommets partagés ;
  - fusion des arêtes colinéaires (la pièce fusionnée couvre plusieurs arêtes et n'est pas liée).
- **Résultat** : une pièce par arête (ou par tronçon fusionné), toutes chaînes comprises, en **un seul pas**. Chaque
  pièce posée sur une seule arête à la racine reste liée à cette arête (lot L11).
- **Raccourci Fadi** : Alt+Maj+Q.

## § 3 — Source de la section (panneau Profilés)

1. **Catalogue du projet** : une ligne d'un catalogue importé dans l'Atelier (`catalogue.importer`, gabarits
   `profils-acier.csv` et `sections-bois.csv`). Les colonnes `_mm` sont converties en mètres explicitement. La source
   (titre, édition, page, ligne) est copiée dans la pièce. Sans catalogue importé, la liste le dit et ne propose
   aucune valeur.
2. **Dimensions saisies** : rectangle, rond, rond creux, tube rectangulaire, I, H, T, L ou U. Aucune valeur par défaut :
   un champ vide bloque la pose (« dimension manquante »). Le rond et le rond creux sont facettisés avec le nombre de
   segments saisi (24 par défaut, comme le Cercle).
3. **Face de la Planche** : une face sélectionnée sert de contour, trous compris.

## § 4 — Onglet (lot L13)

- « Cliquez la première pièce. » puis « Cliquez la seconde pièce : les deux sont recoupées en onglet. »
- Les axes des deux pièces doivent se couper. Leurs extrémités voisines sont ramenées au point de rencontre, puis
  recoupées par le plan bissecteur.
- L'angle de coupe de chaque extrémité est enregistré dans les métadonnées. Il est dérivé : 45° pour un angle droit,
  30° pour deux pièces à 120°.
- Axes parallèles, axes gauches ou onglet singulier (moins de 12°) : refus nommé.
- Le lien aux arêtes sources est retiré, puisque la pièce est modifiée elle-même.
- Un pas. **Raccourci Fadi** : Alt+Maj+O.

## § 5 — Coupe par profil (lot L13)

- « Cliquez la pièce à couper. » puis « Cliquez la pièce qui coupe (elle reste en place). »
- La première pièce est coupée par le volume de la seconde : soustraction de maillages par manifold-3d (lot 6, MO-4),
  moteur chargé au premier choix de l'outil.
- La pièce coupée garde son occurrence, sa définition (rendue unique si elle est partagée) et ses métadonnées.
  `coupesProfil` compte les coupes subies, et la géométrie ne se régénère plus depuis les seules métadonnées.
- Profilés depuis arêtes reçoit l'option « Couper après pose », sans onglets : chaque pièce est coupée par la
  précédente de sa chaîne.
- Un pas. **Raccourci Fadi** : Alt+Maj+B.

## § 6 — Allonger une pièce (lot L13)

- « Cliquez près de l'extrémité de la pièce à allonger ou raccourcir. » Le champ Mesures prend l'allongement signé.
- Option **Valeur** : saisie, demi-largeur ou demi-hauteur de la section posée. Avec une demi-section, le clic applique
  aussitôt.
- Option **Sens** : + ou − (ce n'est pas Maj, qui reste le verrou d'inférence).
- Une extrémité coupée en onglet, ou une pièce recoupée par un profil, refusent.
- Le lien à l'arête source est gardé : le décalage fait partie des métadonnées.
- Un pas. **Raccourci Fadi** : Alt+Maj+A.
