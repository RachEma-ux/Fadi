# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 3 : contrôle du modèle

Suite du lot 2 (`catalogue-cas-2-lot-2.md`). Maquettes du lot 3 (`analyses/catalogue-extensions/cas-2/lot-3/lot3-1..4.png`)
validées par le maître d'ouvrage le 27 novembre 2026 à 17 h 27 (heure suisse) : « Ok pour moi / Mets le en attente fusion ».
La PR reste ouverte sans fusion tant que la mise en ligne de préproduction en cours n'est pas confirmée (consigne du
27 novembre 2026, 17 h 23).

## Ce qui est livré (10 entrées)

| n° | Entrée | Où |
|---|---|---|
| 20 | Faces et objets superposés en double sous un seuil en mm | `controle-l3.ts` `releverDefauts` (face-double, objet-double) |
| 23 | Fond DAO importé : aplatir, souder les extrémités, créer les faces | `preparerFondDao`, vue « Préparer un fond DAO » (Ctrl+Maj+F5) |
| 26 | Complétude graphique des pièces du permis | `lireReglesPieces`, `evaluerPieces`, vue « Pièces du permis » (Ctrl+Maj+F12) |
| 46 | Parcourir et localiser un à un les défauts | `indiceDefaut`, commandes `defaut-suivant` / `defaut-precedent` (Ctrl+Maj+F3 / F2) |
| 52 | Objets sans balise et géométrie hors objet avant un échange | `releverDefauts` (sans-balise, hors-objet ; correction : grouper) |
| 54 | Sommets presque confondus et angles presque droits, correction en un geste | `releverDefauts`, `corrigerDefaut` (souder, redresser), Ctrl+Maj+F4 |
| 58 | Faces presque horizontales ou presque verticales | `releverDefauts`, `corrigerDefaut` (redresser) |
| 75 | Site contrôlé avant émission PC1, PC2, PC6 | `controlerSite` (site rattaché lu dans la base `sites_*` par le menu Sites) |
| 89 | Géométrie éloignée de l'origine | `releverDefauts` (eloignee) |
| 113 | Faces intérieures supprimées, volumes adjacents fusionnés | `supprimerFacesInterieures`, `fusionnerVolumes` (Ctrl+Maj+F6) |

## Règle d'or

Six commandes ajoutées à la famille `controle` (extension « Contrôle et nettoyage », hors des 86 entrées du catalogue),
chacune avec son icône Tabler, la barre du panneau Contrôle et son raccourci : `defaut-precedent` Ctrl+Maj+F2,
`defaut-suivant` Ctrl+Maj+F3, `corriger-defaut` Ctrl+Maj+F4, `preparer-fond-dao` Ctrl+Maj+F5, `fusionner-volumes`
Ctrl+Maj+F6, `pieces-permis` Ctrl+Maj+F12. Ctrl+Maj+F7 à F11 sont pris par les paquets d'essai d'extensions ; F3 et Maj+F3
par la Planche (d'où l'écart avec la consigne de la maquette, qui disait « F3 / Maj+F3 »).

## Données et seuils

- Les tolérances du relevé (1 mm, 1 mm, 0,5°, 2°, 1 000 m d'origine) sont des tolérances de dessin, modifiables dans le
  panneau et gardées avec le modèle (`reglages.controle`) ; aucun seuil réglementaire.
- La liste des éléments attendus par pièce n'est pas dans Fadi : elle vient d'un fichier de règles JSON qui cite sa source
  (`{ source, pieces: [{ code, libelle, attendus: [{ libelle, critere }] }] }`), archivé tel quel en base
  (`sandbox_fichiers_extensions`, extension « Contrôle et nettoyage » ; `POST /sandbox/preferences/fichiers` accepte désormais
  une extension livrée du Sandbox active pour le compte) et avec le modèle (`reglages.reglesPieces.texte`, archive référencée
  dans `reglesPieces.archive`). Un refus d'archivage en base est montré dans la vue (« non archivé (motif) »). Sans fichier, la complétude est « non évaluée ». Les critères que la Planche sait
  constater : `emplacement`, `nord`, `altitude`, `point-de-base`, `systeme-vertical`, `parcelle`, `cotes`, `niveaux`,
  `textes`, `geometrie` ; tout autre critère est « non évaluable ».

## Écarts déclarés

- Relevé limité à la racine de la Planche (le contenu des objets n'est pas parcouru) ; les corrections s'y appliquent.
- Chaque tolérance est un petit champ dans sa ligne du relevé (la maquette n'en montrait qu'un) ; la section « À nettoyer »
  et le relevé des solides existants restent sous le relevé.
- Volumes : la ligne « Cloisons internes » de la maquette devient « Arêtes de jonction retirées » (ce que l'aperçu compte).
- Fond DAO : l'archivage du fichier d'origine est celui de l'import (aucun changement) ; la préparation agit sur l'objet
  ouvert ou sur l'objet sélectionné seul.
- Le rattachement au site et la parcelle viennent du site ouvert par le menu « Sites » ; sans site lu, la parcelle est
  « non évaluée ».

## Relecture automatique (27 novembre 2026)

- Faces en double : les trous sont comparés aussi ; une face percée n'est jamais proposée comme double d'une face pleine.
- Faces presque horizontales / verticales : les sommets des trous sont redressés avec le contour (la face reste plane).
- Fond DAO : rien d'aplati, de soudé ni de face nouvelle, la géométrie est gardée telle quelle (aucun pas) ; sinon les
  matières, le masquage, l'adoucissement et la courbe d'appartenance sont reportés sur les faces et arêtes redessinées.

## Contrôles

`npm run typecheck`, `npm test` (paquets et web ; les tests de l'API demandent une base de test attestée DB-3, déclarés non
lancés localement, lancés par la CI), `npm run build` passés avant le commit ; recettes `planche-controle-modele.mjs` et
`planche-accrochage-saisie.mjs` passées en local sur une base PostGIS, puis par la CI de la PR.
