# Lot Planche L13 — Onglet, coupe par profil, allonger / raccourcir — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-216 ; fiches `PL-13-01.md` à `PL-13-03.md` ;
référence `docs/planche/reference/ecarts-fadi-profiles.md` (§ 4 à 6) ; programme `docs/planche/analyses/programme-lots.md` (L13).

## Livré

- **Noyau** :
  - `ongletPieces` : plan bissecteur, extrémités ramenées au point de rencontre, angles de coupe dérivés en
    métadonnées (`coupeDebut`, `coupeFin`) ; refus des axes parallèles ou gauches ;
  - `allongerPiece` et `demiSectionPiece` ;
  - `remplacerContenuPiece` ;
  - `couperParProfil` (nouveau `assemblages.ts`, moteur booléen injecté).

  Les pièces posées en onglet par Profilés depuis arêtes enregistrent aussi leurs angles. Une définition partagée est
  rendue unique avant toute modification.
- **Trois outils propres à Fadi** (statut `fadi`, famille Modification, barre « Volumes » ② Modifier) :
  - **Onglet** : ◸, Alt+Maj+O ;
  - **Coupe par profil** : ⧄, Alt+Maj+B, avec le moteur manifold-3d chargé au premier choix ;
  - **Allonger une pièce** : ⇿, Alt+Maj+A, avec les options Valeur (saisie, ½ largeur, ½ hauteur) et Sens (+ / −).
- **Couper après pose** : nouvelle option de Profilés depuis arêtes, sans onglets. Chaque pièce est coupée par la
  précédente de sa chaîne.
- **Visée des pièces** : l'arête source, cachée au milieu de la section, l'emportait dans la tolérance de visée. Les
  outils de pièces visent maintenant les faces quand la visée ordinaire rend une arête (test).
- **Correctif du moteur booléen (lot 6)** : `facesDuMaillage` groupait les triangles par identifiant de face d'origine
  seulement. Or les deux opérandes numérotent leurs faces à partir de zéro : des parois de plans différents étaient
  fusionnées et une aire perdue. On l'observait sur la Découpe : 0,11784 au lieu de 0,118 m³. Le plan fait désormais
  partie de la clé.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `assemblages-l13.test.ts` (6) : 90° → 45°, arête extérieure exacte ; 120° → 30° ; refus ; liens retirés ; allongements signés et demi-section ; lien gardé à l'allongement ; onglet refusé à l'allongement | verts |
| `outils/assemblages-outils.test.ts` (4) : machine Onglet, Allonger (saisie, sens, demi-largeur), visée d'une pièce posée sur son arête | verts |
| `coupe-profil-manifold.test.ts` (2), avec le vrai moteur sous Node : V − V∩ à 1e-6 près, métadonnées gardées, refus ; `booleens-manifold.test.ts` toujours vert | verts |
| Recette `planche-assemblages.mjs` (nouvelle, ajoutée à la CI) : cadre de 4 pièces recoupées en onglet (8 coupes à 45°, 4 pas) ; Ctrl + Z ; poteau coupé par une poutre ; Ctrl + Z ; allongement de 0,25 | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Mesure (⏱)

Coupe par profil d'un poteau par une poutre, avec manifold-3d sous Node : **≈ 35 ms**.

## Limites déclarées

- **Pièce recoupée par un profil** : elle ne se régénère plus depuis ses métadonnées (`coupesProfil`). L'allongement
  la refuse ; l'édition est prévue au lot L17.
- **Onglet** : il retire les liens aux arêtes sources, puisque la pièce est modifiée elle-même. La coupe enregistrée
  est relue par l'allongement, qui refuse une extrémité coupée.
- **Couper après pose** : la coupe suit l'ordre de la chaîne (chaque pièce coupée par la précédente). Aucun autre
  choix de priorité n'est proposé.
