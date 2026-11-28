# Catalogue, cas 2 « Amélioration d'un élément existant » — lot 2 : accrochage et saisie précise

Suite du lot 1 (`catalogue-cas-2-lot-1.md`). Maquettes du lot 2 (`analyses/catalogue-extensions/cas-2/lot-2/lot2-1..4.png`)
validées par le maître d'ouvrage le 27 novembre 2026 à 15 h 55 (heure suisse) : « Implimente ».

## Ce qui est livré (20 entrées)

| n° | Entrée | Où |
|---|---|---|
| 4 | Pas d'accrochage de longueur d'Info modèle appliqué à tous les outils de tracé et de modification (point libre ramené à un multiple du pas depuis le départ) | `inference.ts` `finaliser`, `OptionsAccrochage.pasLongueur` |
| 10 | Accrochage aux arêtes de section du plan de coupe actif | `aretesDeSection`, `axesDeSaisie` (coupe) |
| 17 | Presque accroché : signalé près du point (sommet, arête, angle droit), jamais déplacé ; seuil réglable (10 mm) | `Inference.presque`, infobulle de la vue, panneau « Accrochage » |
| 21 | Unité d'affichage et de saisie (m, cm, mm, pieds-pouces) ; contrôle d'écart nul sur toutes les valeurs stockées, sinon refus | `saisie-projet.ts` `changerUnite`, Info modèle, champ Mesures |
| 27 | Mètre : mesure décomposée (longueur, horizontale, dénivelé, pente, altitude, NGF ou « NGF ? ») | `decomposerMesure`, panneau « Mètre · Mesure » (Alt+F9) |
| 34 | Longueur d'une arête et coordonnées de ses sommets modifiables dans Info entité | `changerLongueurArete`, `placerSommet` |
| 37 | Accrochage aux lignes et points de guide et à leurs intersections avec la géométrie | `inference.ts` (point-guide, sur-guide) |
| 47 | Remise à l'échelle d'un seul import par une distance connue | `remettreAEchelleImport`, Info entité, commande `remettre-echelle` (Alt+F12) |
| 49 | Groupe, composant ou balise exclu de l'accrochage sans être masqué | `exclureDeLAccrochage`, `Balise.horsAccrochage`, Info entité |
| 51 | Expression arithmétique avec unités dans Mesures ; « x5 », « /5 », « 5x » gardent leur sens de réseau | `saisie-vcb.ts` `lireExpression` |
| 67 | Croisement de deux alignements et intersection d'une ligne d'inférence avec une arête, sans ligne de construction | `inference.ts` (croisement) |
| 78 | « à partir de » : « @dx ; dy [; dz] » depuis le point visé, sans le poser | outil Ligne |
| 83 | Chanfrein par pente ou rapport et hauteur ; ressaut signalé seulement contre un maximum saisi avec sa source | outil Ligne, Info modèle « Chanfrein et ressaut » |
| 84 | Intersection apparente de deux arêtes non sécantes (vue de plan ou de façade) | `inference.ts` (intersection-apparente) |
| 87 | Guide du Mètre répété en réseau : « x5 » / « /5 » au champ Mesures, ou entraxe et nombre saisis | outil Mètre, commande `guide-reseau` (Alt+F10) |
| 93 | Paramètres nommés du projet, employés dans toute saisie Mesures | Info modèle « Paramètres du projet », `poserParametre` |
| 101 | Axe médian entre deux arêtes parallèles (axe d'un mur dessiné par ses deux nus) | `inference.ts` (axe-median) |
| 103 | Répartition entre deux bornes par entraxe maximal, vide maximal ou nombre d'éléments | `repartition`, `repartir`, commande `repartir` (Alt+F11) |
| 106 | Quadrants d'un cercle ou d'un arc dans le repère de travail | `inference.ts` (quadrant) |
| 111 | Un seul genre d'accrochage pour le prochain point (sommet, milieu, intersection, quadrant, axe, guide) | commandes `forcer-*` (Alt+1 à Alt+6), panneau « Accrochage » (Alt+F8) |

## Règle d'or

Onze commandes au registre (famille `accrochage`, hors des 86 entrées du catalogue), chacune avec son icône Tabler, sa
barre (panneau « Accrochage », panneau « Mètre · Mesure » ou Info entité) et son raccourci : `accrochage` Alt+F8,
`forcer-sommet` à `forcer-guide` Alt+1 à Alt+6, `metre-mesure` Alt+F9, `guide-reseau` Alt+F10, `repartir` Alt+F11,
`remettre-echelle` Alt+F12. Ces combinaisons n'étaient prises ni par la Planche ni par les extensions du cas 1.

## Écarts déclarés

- Les panneaux « Accrochage » et « Mètre · Mesure » sont contextuels (ouverts par leur commande) : la colonne garde ses
  dix-sept panneaux, la limite de l'écran tactile large (écart 4 px) étant atteinte.
- Genres d'accrochage : tous actifs (comme la maquette) ; seul le genre forcé du prochain point les restreint.
- La consigne de la maquette disait « Alt+1…9 » : six genres sont forçables, donc Alt+1 à Alt+6.
- Unité : les longueurs proposées par les outils au champ Mesures et dans les nouveaux panneaux suivent l'unité du
  projet ; les autres textes d'outils restent en mètres. Les valeurs stockées ne changent jamais.
- Arête et sommets (n° 34) : modifiables à la racine seulement (un objet ouvert garde l'affichage seul).
- Répartition (n° 103) : la largeur d'élément du « vide maximal » est 0 tant qu'aucun champ ne la saisit ; l'original
  est supposé posé à la première borne.
- Aucun seuil réglementaire n'est fourni : sans ressaut maximal saisi avec sa source, le ressaut est « non évalué ».

## Contrôles

`npm run typecheck`, `npm test` (paquets et web ; les tests de l'API demandent une base de test, déclarés non lancés
localement, lancés par la CI), `npm run build` passés avant le commit ; recette `apps/web/e2e/planche-accrochage-saisie.mjs`
par la CI de la PR.
