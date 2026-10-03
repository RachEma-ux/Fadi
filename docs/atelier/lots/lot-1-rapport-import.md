# Lot 1 — Rapport d'import P.118 (L1.4)

Généré par `packages/atelier-model/src/importeur/importer-p118.test.ts` (`ECRIRE_RAPPORT=1 npx vitest run`) ; ne pas éditer à la main.
Règles appliquées : cahier §6, D-021 (confirmées par D-022). Aucune valeur inventée : une valeur absente est « non évaluée ».

| Source | Valeur |
| --- | --- |
| exampleId | p118-exemple-complet |
| sourceVersion | 8.19.0 |
| Empreinte de la source | `sha256-ca235ca090d0fcb178c65a4ea2cdb8fe4f47947045f464a0ccf9b44c2092a8e7` |
| Empreinte du modèle produit | `sha256-549d52016d9334565116823ea860f4055cadaad364e1b40ed77d307889226439` |

## Effectifs par famille

| Famille | Source | Cible | Répartition des cibles |
| --- | ---: | ---: | --- |
| niveaux | 6 | 6 | niveau 6 |
| murs | 220 | 220 | mur 220 |
| portes | 84 | 84 | porte 84 |
| fenetres | 126 | 126 | fenetre 126 |
| escaliers | 32 | 32 | escalier 32 |
| poteaux | 120 | 120 | poteau 120 |
| pieces | 45 | 45 | piece 45 |
| traces | 967 | 967 | zone 13, piece.polygones 41, solide 871, dalle 6, espace 33, toiture 1, reference-plan 2 |
| cotations | 64 | 64 | cotation 64 |
| textes | 95 | 95 | texte 95 |
| calques | 22 | 22 | calque 22 |
| parcelle | 1 | 1 | parcelle 1 |
| emprise | 1 | 1 | emprise 1 |
| structure | 1 | 2 | structureDeclaree 1, hypothese 1 |
| hypotheses | 17 | 17 | hypothese 17 |
| sources | 9 | 9 | source 9 |
| proprietes-projet | 13 | 13 | propriete 13 |

## Effectifs par niveau (source / cible)

| Famille | ss | rdc | mezz | r1 | r2 | r3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| murs | 23 / 23 | 39 / 39 | 45 / 45 | 40 / 40 | 37 / 37 | 36 / 36 |
| portes | 10 / 10 | 16 / 16 | 12 / 12 | 17 / 17 | 14 / 14 | 15 / 15 |
| fenetres | — | 22 / 22 | 26 / 26 | 26 / 26 | 26 / 26 | 26 / 26 |
| escaliers | 5 / 5 | 5 / 5 | 7 / 7 | 5 / 5 | 5 / 5 | 5 / 5 |
| poteaux | 20 / 20 | 20 / 20 | 20 / 20 | 20 / 20 | 20 / 20 | 20 / 20 |
| pieces | 4 / 4 | 8 / 8 | 8 / 8 | 9 / 9 | 7 / 7 | 9 / 9 |
| traces | 94 / 94 | 162 / 162 | 158 / 158 | 199 / 199 | 237 / 237 | 117 / 117 |
| cotations | 9 / 9 | 11 / 11 | 11 / 11 | 11 / 11 | 11 / 11 | 11 / 11 |
| textes | 13 / 13 | 18 / 18 | 19 / 19 | 16 / 16 | 15 / 15 | 14 / 14 |
| calques | 16 / 16 | 20 / 20 | 19 / 19 | 19 / 19 | 19 / 19 | 20 / 20 |

## Transformations

- **niveaux**
  - `domains.levels[]` → `niveau` (`elevation`, `height` sans arrondi ; `ordre` = ordre source)
  - `floorDesign.levels[*].areas`, `.meta` et tout champ non canonique → propriétés `import.*` bit à bit
  - `floorDesign.levels[*].id/name/elevation/height` comparés à `domains.levels` (doublon, non réimporté)
- **murs**
  - `a`, `b` → `axe` (repère local du projet) ; `thickness` → `epaisseur` ; `height` → `hauteur`
  - `type` → définition `cloison` / `mur`, absent → `non-type` ; `exteriorWallIds` → `exterieur`
  - `lineRef` « axe » → `alignement: axe` ; `lineRef` absent → `axe` « à vérifier » (règle) ; `lineRef`, `color` conservés en `import.*`
- **portes**
  - `hostWallId` → `murHoteId` + relations `heberge-par` / `heberge` ; `t` conservé ; `distance` dérivée = t × longueur de l'axe
  - `sill` → `allege` ; `mark` → `repere` ; type `non-type`
- **fenetres**
  - `hostWallId` → `murHoteId` + relations `heberge-par` / `heberge` ; `t` conservé ; `distance` dérivée = t × longueur de l'axe
  - `sill` → `allege` ; `mark` → `repere` ; type `non-type`
- **escaliers**
  - chaque occurrence conservée (vue par niveau) ; `stairGroup` → `groupe`, sans fusion
  - `sourceLevel` / `targetLevel` → `niveauDepartId` / `niveauArriveeId` + relation `relie` (rôle `depart` / `arrivee`) ; absents → pas de relation, problème
  - `risers`, `waistThickness` absents → « non évaluée » ; `planReferenceOnly` absent → `referencePlanSeulement` « non évaluée » (D-024, D-025)
- **poteaux**
  - `p` → `point` ; `shapeId` → `formeId` ; `depth` → `profondeur` ; `angle` en degrés ; `designStatus` → `statutConception` (texte)
- **pieces**
  - `area` → `aireDeclaree` (provenance `prototype`, « à vérifier » : antérieure à 8.19)
  - `polygons`, `label` → `polygonesSource`, `etiquette` dans le repère `p118-layoutV819-registration` (jamais mélangés)
  - géométrie courante `polygones` = tracés `room` de même code ; pièce sans tracé : `polygones` vide + problème
- **traces**
  - `floor-slab` → `dalle` : `epaisseur` = `height` 0,25 m « à vérifier », `thickness` 0,10 m en `import.thickness`
  - `roof-slab` → `toiture` plate : `epaisseur` = `height` « à vérifier », `pente` « non évaluée » ; `roof-slab` annulaire (contour + trou, acrotère) → `solide`, rôle conservé (D-025)
  - `room` → `piece.polygones` si le code correspond, sinon `espace` ; `core-zone` → `zone` ; `plan-reference` → `reference-plan`
  - autres rôles → `solide`, `role` conservé tel quel ; `vertexOffsets`, `topOffsets`, hauteurs nulles conservés
- **cotations**
  - `a`, `b`, `offset` → cotation `libre`, sans référence (D-019)
- **textes**
  - `x`, `y` → `position` ; `text` → `texte`
- **calques**
  - union des noms des calques des niveaux, ordre de première apparition (D-021)
  - présence par niveau → `niveauxPresence` ; rang par niveau conservé ; `fill` absent → `remplissage` absent
- **parcelle**
  - sommets → `sommetsCadastraux` (CRS déclaré) ; `area`, `officialArea`, `correctedAreaPrinted` séparés ; `setback.distance` / `.envelope` → `recul` / `enveloppeRecul`
  - aucune conversion vers le repère local (pas de `sommetsLocaux`)
- **emprise**
  - `vertices` → `sommetsCadastraux` (CRS de la parcelle) ; `architectureRevision` → `revisionArchitecture`
- **structure**
  - `meta.structure` → `structureDeclaree` « à confirmer » ; `loadNature` → hypothèse « à confirmer » (R4)
- **hypotheses**
  - `meta.assumptions` [code, thème, texte] → `hypothese` « à confirmer », codes conservés
- **sources**
  - `meta.sources` → `source` ; identifiants et champs conservés
- **proprietes-projet**
  - `meta.*` restants, racine du jeu de données → propriétés de projet `import.*`, bit à bit

## Rôles inconnus

Aucun : tous les rôles de tracés rencontrés sont ceux du §6.

## Données non importées dans le modèle

- `domains.ui.activeLevel` — état d'affichage local, hors modèle (R10)
- `domains.ui.showLegends` — état d'affichage local, hors modèle (R10)
- `floorDesign.levels.ss.activeLayer` — calque actif de l'outil : état d'affichage, hors modèle (R10)
- `floorDesign.levels.rdc.activeLayer` — calque actif de l'outil : état d'affichage, hors modèle (R10)
- `floorDesign.levels.mezz.activeLayer` — calque actif de l'outil : état d'affichage, hors modèle (R10)
- `floorDesign.levels.r1.activeLayer` — calque actif de l'outil : état d'affichage, hors modèle (R10)
- `floorDesign.levels.r2.activeLayer` — calque actif de l'outil : état d'affichage, hors modèle (R10)
- `floorDesign.levels.r3.activeLayer` — calque actif de l'outil : état d'affichage, hors modèle (R10)

## Problèmes

| Code | Gravité | Nombre |
| --- | --- | ---: |
| valeur-a-verifier | information | 25 |
| niveaux-relies-absents | information | 6 |
| valeur-a-verifier | avertissement | 7 |
| trace-piece-sans-code | information | 33 |
| aire-ecart | information | 17 |
| piece-libelle-divergent | information | 7 |
| piece-sans-trace | avertissement | 7 |
| valeur-non-evaluee | information | 16 |
| niveaux-relies-absents | avertissement | 8 |

### valeur-a-verifier

- Mur EX118-ss-EXT-0 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-ss-EXT-1 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-ss-EXT-2 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-ss-EXT-3 : lineRef absent, alignement « axe » à vérifier.
- Dalle EX118-ss-SLAB-0 : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Mur EX118-rdc-EXT-0 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-rdc-EXT-1 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-rdc-EXT-2 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-rdc-EXT-3 : lineRef absent, alignement « axe » à vérifier.
- Dalle EX118-rdc-SLAB-0 : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Mur EX118-mezz-EXT-0 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-mezz-EXT-1 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-mezz-EXT-2 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-mezz-EXT-3 : lineRef absent, alignement « axe » à vérifier.
- Dalle EX118-mezz-SLAB-0 : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Mur EX118-r1-EXT-0 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r1-EXT-1 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r1-EXT-2 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r1-EXT-3 : lineRef absent, alignement « axe » à vérifier.
- Dalle EX118-r1-SLAB-0 : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Mur EX118-r2-EXT-0 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r2-EXT-1 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r2-EXT-2 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r2-EXT-3 : lineRef absent, alignement « axe » à vérifier.
- Dalle EX118-r2-SLAB-0 : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Mur EX118-r3-EXT-0 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r3-EXT-1 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r3-EXT-2 : lineRef absent, alignement « axe » à vérifier.
- Mur EX118-r3-EXT-3 : lineRef absent, alignement « axe » à vérifier.
- Dalle EX118-r3-SLAB-0 : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Toiture EX118-roof : épaisseur 0.25 m (représentation) à vérifier ; thickness 0.1 m conservé.
- Tracé EX118-parapet « Acrotère » : « roof-slab » annulaire importé comme solide (acrotère, D-025), rôle conservé.

### niveaux-relies-absents

- Escalier EX118-ss-V819-B-S1 : niveau de arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-ss-V819-B-S2 : niveau de arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-rdc-V819-B-S1 : niveau de arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-rdc-V819-B-S2 : niveau de arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-mezz-S-003 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-mezz-S-004 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-mezz-V819-B-S1 : niveau de arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-mezz-V819-B-S2 : niveau de arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-r1-S-003 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-r1-S-004 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-r2-S-003 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-r2-S-004 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-r3-S-003 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.
- Escalier EX118-r3-S-004 : niveau de départ (sourceLevel) et arrivée (targetLevel) absent ou inconnu ; pas de relation « relie » correspondante.

### trace-piece-sans-code

- Tracé de pièce EX118-ss-BAND-0 « Adaptation périphérique » sans code de pièce du niveau ss : importé comme espace.
- Tracé de pièce EX118-ss-BAND-1 « Adaptation périphérique » sans code de pièce du niveau ss : importé comme espace.
- Tracé de pièce EX118-ss-BAND-2 « Adaptation périphérique » sans code de pièce du niveau ss : importé comme espace.
- Tracé de pièce EX118-ss-V815-MC-PALIER « MC · Palier de manutention » sans code de pièce du niveau ss : importé comme espace.
- Tracé de pièce EX118-rdc-BAND-0 « Adaptation périphérique » sans code de pièce du niveau rdc : importé comme espace.
- Tracé de pièce EX118-rdc-BAND-1 « Adaptation périphérique » sans code de pièce du niveau rdc : importé comme espace.
- Tracé de pièce EX118-rdc-BAND-2 « Adaptation périphérique » sans code de pièce du niveau rdc : importé comme espace.
- Tracé de pièce EX118-rdc-V815-MC-PALIER « MC · Palier de manutention » sans code de pièce du niveau rdc : importé comme espace.
- Tracé de pièce EX118-rdc-V815-SAN-F « Sanitaires Femmes · 2 WC dont 1 adapté · 3 lavabos » sans code de pièce du niveau rdc : importé comme espace.
- Tracé de pièce EX118-rdc-V815-SAN-H « Sanitaires Hommes · 2 WC dont 1 adapté · 3 lavabos · 1 urinoir » sans code de pièce du niveau rdc : importé comme espace.
- Tracé de pièce EX118-mezz-BAND-0 « Adaptation périphérique » sans code de pièce du niveau mezz : importé comme espace.
- Tracé de pièce EX118-mezz-BAND-1 « Adaptation périphérique » sans code de pièce du niveau mezz : importé comme espace.
- Tracé de pièce EX118-mezz-V815-MC-PALIER « MC · Palier de manutention » sans code de pièce du niveau mezz : importé comme espace.
- Tracé de pièce EX118-mezz-V815-SAN-F « Sanitaires Femmes · 1 WC dont 1 adapté · 2 lavabos » sans code de pièce du niveau mezz : importé comme espace.
- Tracé de pièce EX118-mezz-V815-SAN-H « Sanitaires Hommes · 1 WC dont 1 adapté · 2 lavabos · 1 urinoir » sans code de pièce du niveau mezz : importé comme espace.
- Tracé de pièce EX118-r1-BAND-0 « Adaptation périphérique » sans code de pièce du niveau r1 : importé comme espace.
- Tracé de pièce EX118-r1-BAND-1 « Adaptation périphérique » sans code de pièce du niveau r1 : importé comme espace.
- Tracé de pièce EX118-r1-BAND-2 « Adaptation périphérique » sans code de pièce du niveau r1 : importé comme espace.
- Tracé de pièce EX118-r1-V815-MC-PALIER « MC · Palier de manutention » sans code de pièce du niveau r1 : importé comme espace.
- Tracé de pièce EX118-r1-V815-SAN-F « Sanitaires Femmes · 2 WC dont 1 adapté · 3 lavabos » sans code de pièce du niveau r1 : importé comme espace.
- Tracé de pièce EX118-r1-V815-SAN-H « Sanitaires Hommes · 2 WC dont 1 adapté · 3 lavabos · 1 urinoir » sans code de pièce du niveau r1 : importé comme espace.
- Tracé de pièce EX118-r2-BAND-0 « Adaptation périphérique » sans code de pièce du niveau r2 : importé comme espace.
- Tracé de pièce EX118-r2-BAND-1 « Adaptation périphérique » sans code de pièce du niveau r2 : importé comme espace.
- Tracé de pièce EX118-r2-BAND-2 « Adaptation périphérique » sans code de pièce du niveau r2 : importé comme espace.
- Tracé de pièce EX118-r2-V815-MC-PALIER « MC · Palier de manutention » sans code de pièce du niveau r2 : importé comme espace.
- Tracé de pièce EX118-r2-V815-SAN-F « Sanitaires Femmes · 2 WC dont 1 adapté · 5 lavabos » sans code de pièce du niveau r2 : importé comme espace.
- Tracé de pièce EX118-r2-V815-SAN-H « Sanitaires Hommes · 2 WC dont 1 adapté · 5 lavabos · 1 urinoir » sans code de pièce du niveau r2 : importé comme espace.
- Tracé de pièce EX118-r3-BAND-0 « Adaptation périphérique » sans code de pièce du niveau r3 : importé comme espace.
- Tracé de pièce EX118-r3-BAND-1 « Adaptation périphérique » sans code de pièce du niveau r3 : importé comme espace.
- Tracé de pièce EX118-r3-BAND-2 « Adaptation périphérique » sans code de pièce du niveau r3 : importé comme espace.
- Tracé de pièce EX118-r3-V815-MC-PALIER « MC · Palier de manutention » sans code de pièce du niveau r3 : importé comme espace.
- Tracé de pièce EX118-r3-V815-SAN-F « Sanitaires Femmes · 1 WC dont 1 adapté · 2 lavabos » sans code de pièce du niveau r3 : importé comme espace.
- Tracé de pièce EX118-r3-V815-SAN-H « Sanitaires Hommes · 1 WC dont 1 adapté · 2 lavabos · 1 urinoir » sans code de pièce du niveau r3 : importé comme espace.

### aire-ecart

- Pièce piece-ss-S01 : aire déclarée 253.394 m², aire des tracés 230.614 m² (écart -22.780 m²) ; aucune correction.
- Pièce piece-ss-S02 : aire déclarée 180.493 m², aire des tracés 200.028 m² (écart 19.535 m²) ; aucune correction.
- Pièce piece-ss-S03 : aire déclarée 53.067 m², aire des tracés 52.583 m² (écart -0.484 m²) ; aucune correction.
- Pièce piece-ss-S04 : aire déclarée 28.744 m², aire des tracés 15.979 m² (écart -12.765 m²) ; aucune correction.
- Pièce piece-rdc-R01 : aire déclarée 160.649 m², aire des tracés 140.743 m² (écart -19.906 m²) ; aucune correction.
- Pièce piece-rdc-R03 : aire déclarée 91.07 m², aire des tracés 92.084 m² (écart 1.014 m²) ; aucune correction.
- Pièce piece-rdc-R04 : aire déclarée 35.66 m², aire des tracés 35.176 m² (écart -0.484 m²) ; aucune correction.
- Pièce piece-rdc-R08 : aire déclarée 14.603 m², aire des tracés 10.806 m² (écart -3.797 m²) ; aucune correction.
- Pièce piece-mezz-M01 : aire déclarée 69.551 m², aire des tracés 65.359 m² (écart -4.192 m²) ; aucune correction.
- Pièce piece-mezz-M03 : aire déclarée 23.287 m², aire des tracés 76.866 m² (écart 53.579 m²) ; aucune correction.
- Pièce piece-mezz-M07 : aire déclarée 20.261 m², aire des tracés 15.496 m² (écart -4.765 m²) ; aucune correction.
- Pièce piece-r1-E05 : aire déclarée 152.078 m², aire des tracés 135.884 m² (écart -16.194 m²) ; aucune correction.
- Pièce piece-r1-E08 : aire déclarée 33.703 m², aire des tracés 22.057 m² (écart -11.646 m²) ; aucune correction.
- Pièce piece-r2-E03 : aire déclarée 152.078 m², aire des tracés 135.884 m² (écart -16.194 m²) ; aucune correction.
- Pièce piece-r2-E08 : aire déclarée 33.703 m², aire des tracés 22.057 m² (écart -11.646 m²) ; aucune correction.
- Pièce piece-r3-E05 : aire déclarée 152.078 m², aire des tracés 146.988 m² (écart -5.090 m²) ; aucune correction.
- Pièce piece-r3-E08 : aire déclarée 33.703 m², aire des tracés 22.057 m² (écart -11.646 m²) ; aucune correction.

### piece-libelle-divergent

- Pièce piece-rdc-R04 : libellé du tracé EX118-rdc-P-010 « R04 · Desserte principale · 2 m » ≠ « R04 · Desserte principale · 1,94 m » ; les deux sont conservés.
- Pièce piece-rdc-R06 : libellé du tracé EX118-rdc-P-012 « R06 · Office / pause · 2 places » ≠ « R06 · Office » ; les deux sont conservés.
- Pièce piece-mezz-M03 : libellé du tracé EX118-mezz-P-009 « M03 · Galerie avant et liaison aux noyaux » ≠ « M03 · Galerie · 1,75 m » ; les deux sont conservés.
- Pièce piece-mezz-M05 : libellé du tracé EX118-mezz-P-011 « M05 · Office / pause · 2 places » ≠ « M05 · Cuisine » ; les deux sont conservés.
- Pièce piece-r1-E01 : libellé du tracé EX118-r1-P-007 « E01 · Desserte principale · 2 m » ≠ « E01 · Desserte principale · 1,94 m » ; les deux sont conservés.
- Pièce piece-r2-E01 : libellé du tracé EX118-r2-P-007 « E01 · Desserte principale · 2 m » ≠ « E01 · Desserte principale · 1,94 m » ; les deux sont conservés.
- Pièce piece-r3-E01 : libellé du tracé EX118-r3-P-007 « E01 · Desserte principale · 2 m » ≠ « E01 · Desserte principale · 1,94 m » ; les deux sont conservés.

### piece-sans-trace

- Pièce piece-rdc-R05 « Pause / espace projet » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).
- Pièce piece-rdc-R07 « Sanitaires » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).
- Pièce piece-mezz-M04 « Pause » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).
- Pièce piece-mezz-M06 « Sanitaires » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).
- Pièce piece-r1-E07 « Sanitaires et office » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).
- Pièce piece-r2-E07 « Sanitaires et office » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).
- Pièce piece-r3-E07 « Sanitaires et office » : aucun tracé courant de même code ; importée sans géométrie courante (rien n'est supprimé).

### valeur-non-evaluee

- Escalier EX118-mezz-S-003 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-mezz-S-003 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-mezz-S-004 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-mezz-S-004 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-r1-S-003 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-r1-S-003 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-r1-S-004 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-r1-S-004 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-r2-S-003 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-r2-S-003 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-r2-S-004 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-r2-S-004 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-r3-S-003 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-r3-S-003 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».
- Escalier EX118-r3-S-004 : risers, waistThickness absent(s) de la source → « non évaluée ».
- Escalier EX118-r3-S-004 : planReferenceOnly absent → referencePlanSeulement « non évaluée ».

## Questions ouvertes

- Pièces sans tracé courant (7) conservées sans géométrie (D-025 : gardées, problème listé) : piece-rdc-R05, piece-rdc-R07, piece-mezz-M04, piece-mezz-M06, piece-r1-E07, piece-r2-E07, piece-r3-E07.
- 24 murs sans lineRef (murs de façade) : alignement « axe » retenu par règle (D-025), statut « à vérifier » conservé.

## Projection modèle typé → entrée d'analyse (§5.6)

`projeterDomainesNatifs(modele)` reconstruit `levels`, `floorDesign`, `nativeParcel`, `buildingFootprint` et la racine ; `projeterEntreeAnalyse` donne l'entrée de `analyseModel` (forme de `apps/api/src/lib/model-context.ts`).

- Domaines projetés comparés à la source (sans `ui` ni `activeLayer`, valeurs canoniques) : **identiques**.
- Racine (`sourceVersion`, `exampleId`, `nativeId`, `registry`…) : **identique**.
- Objets non représentables dans la forme native : aucun.
- `analyseModel` : `floors` (6) **identiques** ; `rooms` (74) **identiques** (aires, usages, ouvertures, mobilier, contours, centres, ordre).
- `nativeHash` : **différent** (c7a9f564 → b0ce8a96) — empreinte FNV-1a de la sérialisation JSON : l'ordre des clés des objets n'est pas conservé par le modèle typé et `activeLayer` (état d'affichage, R10) n'est plus présent. Conséquence au lot 4 : les documents et étapes datés par `nativeHash` seront marqués « à recalculer » une fois, à la bascule.
