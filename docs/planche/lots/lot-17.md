# Lot Planche L17 — Édition des pièces de profilé — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-219 ; programme `docs/planche/analyses/programme-lots.md` (L17) ;
fiche `docs/planche/fiches/PL-17-01.md`.

## Livré

- **Bloc « Édition de la pièce »** : il paraît quand une seule pièce de profilé est sélectionnée (hors outils Profilé). Il
  contient les commandes de la pièce, le champ Angle et le panneau Profilés (catalogue sourcé du projet, dimensions
  saisies ou section d'une face).
- **Appliquer la section** (⇆ Alt+Maj+S) : `changerSectionPiece` régénère la géométrie depuis les métadonnées.
  - L'axe, la longueur et le placement restent les mêmes ; la nouvelle désignation et la **source** sont enregistrées.
  - Les onglets sont rejoués sur la nouvelle section et les liens sont gardés.
  - L'opération compte un pas d'annulation.
- **Rotation axiale** (⥁ Alt+Maj+H) : `tournerPieceAxe` cumule l'angle saisi (défaut 90°) dans `placement.rotationAxe`. Le
  champ est facultatif, donc les fichiers anciens sont inchangés.
- **Aligner une face** (⫠ Alt+Maj+F, barre Volumes · Modifier) : on clique une face de la pièce, puis la face cible. La pièce
  glisse le long de la normale de la cible jusqu'à son plan (coplanaire à ± 1e-9). Des faces non parallèles sont refusées
  avec un motif.
- **Échelle d'une pièce** : seulement le long de son axe (longueur et décalages). Un refus nommé s'affiche en travers et sur
  une pièce coupée.
- **Inférence « axe de pièce »** : les axes des pièces sont proposés comme arêtes d'inférence à Déplacer.

## Arbitrage (risque du programme)

- Une pièce **recoupée par un profil** est refusée avec motif pour le changement de section et pour la rotation axiale, car
  la coupe booléenne ne se rejoue pas.
- Une pièce **coupée en onglet** garde ses angles, qui sont rejoués sur la nouvelle section.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `pieces-edition-l17.test.ts` (6) : 80 × 40 → 100 × 50 régénéré (axe, longueur, source, un pas, lien) ; onglet rejoué ; rotation 90° et 2 × 180° ; alignement coplanaire ± 1e-9 et refus non parallèle ; échelle axiale, refus transversal et refus sur pièce coupée ; axes pour l'inférence | verts |
| Règle d'or (tests du registre, des raccourcis et des barres) : Aligner une face, Appliquer la section, Rotation axiale | verts |
| Recette `planche-pieces-edition.mjs` (nouvelle, ajoutée à la CI) | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- La rotation axiale reste refusée sur une pièce recoupée par un profil ; il faut refaire la coupe après.
- L'échelle transversale d'une pièce n'existe pas : une section vient d'une source, il faut en changer.
