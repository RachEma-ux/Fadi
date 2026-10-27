# Contours des niveaux administratifs construits à partir des communes (D-GD-33)

Généré par `scripts/geodata/construire_niveaux.py` le 2026-10-27 ; relancer le script régénère ce rapport.

## Source

- Communes : extrait OpenStreetMap `donnees/osm-mar-communes.geojson` (OpenStreetMap — extraits du 2026-10-23, 1498 contours, licence ODbL), rattachées à leur code géographique HCP par la table relue `correspondances/hcp-rgph2024-communes.csv` (`preparer_hcp.py`, D-GD-17). Ce fichier peut être remplacé par un fichier officiel du HCP sans changer la logique : les provinces et les régions sont recalculées.
- Codes HCP : province = plus long code de province dont le code de la commune est le préfixe ; région = code de province sans ses trois derniers chiffres. Les noms viennent des tables `correspondances/hcp-rgph2024-{provinces,regions}.csv`.
- geoBoundaries (ADM1 / ADM2) n'est plus utilisé pour aucun contour livré ; ses fiches de référence ne servent plus qu'au rattachement des communes par la géographie dans `preparer_hcp.py`.

## Méthode

1. Rattachement de chaque contour OSM apparié à son code HCP de commune, de province et de région (16 communes HCP sans contour, 11 contours OSM sans unité HCP, 0 rattachement ambigu).
2. mapshaper 0.7.98 : `snap` (accrochage des sommets voisins), `-simplify interval=20 keep-shapes` (Visvalingam, petites formes conservées), `-clean` (chevauchements et interstices résiduels), **une seule fois, sur la topologie partagée** : une frontière commune n'existe qu'en un exemplaire.
3. Provinces / préfectures : `-dissolve2 province` (union des communes de même code) ; régions : `-dissolve2 region` sur les provinces.
4. Sommets : 280293 avant, 206577 après pour les communes ; 68238 provinces ; 40622 régions.
5. Les tuiles de l'API ne simplifient plus séparément ces contours (quantification MVT seule) : les limites se superposent à tous les zooms.

## Comptes

- Régions construites : 12 / 12 ; provinces et préfectures : 75 / 75 ; communes livrées : 1487 (rattachées à un code HCP).
- Communes HCP sans contour (lacune du niveau supérieur, signalée, jamais comblée) : 16.
  - Province de Sidi Ifni (10473) : Commune de Mirleft (104730107)
  - Province d'Al Hoceima (1051) : Commune d'Al Hoceima (10510101)
  - Province de Tan-Tan (10521) : Commune de Chbika (105210505)
  - Province de Laâyoune (11321) : Commune d'El Marsa (113210101), Commune de Foum El Oued (113210305)
  - Province d'Oued Ed-Dahab (12391) : Commune d'El Argoub (123910901)
  - Préfecture de M'diq-Fnideq (1573) : Commune de M'diq (15730105)
  - Province de Berkane (2113) : Commune de Saidia (21130125)
  - Province de Nador (2381) : Commune de Bni Ansar (23810103), Commune d'Al Barkanyene (23810703)
  - Préfecture d'Oujda-Angad (2411) : Commune de Bni Khaled (24110305)
  - Province de Kénitra (4281) : Commune de Mehdya (42810105), Commune de Sidi Mohamed Benmansour (42810511)
  - Préfecture de Skhirate-Témara (4501) : Commune de Harhoura (45010103)
  - Province de Sidi Bennour (6467) : Commune de Loualidia (64670105)
  - Préfecture d'Agadir-Ida-Ou-Tanane (9001) : Commune d'Agadir (90010101)
- Contours OSM sans unité HCP, écartés (entièrement inclus dans une commune rattachée, aucune valeur) : 11 — w1338748400, w183919379, w189229517, w191547315, w193804981, w207633044, w208360487, w217660503, w303649959 (Blida), w336734081, w336764990.

## Contrôles

- communes : 1487 entités, 206577 sommets, 0 chevauchement(s) entre voisines, 44 lacune(s) intérieure(s), 0 géométrie(s) invalide(s).
  - lacune dans 100710305 : 52.911 km²
  - lacune dans 102610309 : 6.645 km²
  - lacune dans 21130307 : 1.615 km²
  - lacune dans 21130503 : 3.741 km²
  - lacune dans 21671709 : 12.902 km²
  - lacune dans 22510503 : 5.607 km²
  - lacune dans 22650505 : 31.066 km²
  - lacune dans 22750501 : 16.463 km²
  - lacune dans 22750707 : 20.873 km²
  - lacune dans 25330317 : 3.522 km²
  - lacune dans 25330703 : 15.010 km²
  - lacune dans 25330901 : 22.264 km²
  - lacune dans 30610101 : 1.036 km²
  - lacune dans 30610709 : 3.030 km²
  - lacune dans 31310505 : 10.680 km²
  - lacune dans 31310903 : 3.946 km²
  - lacune dans 31710507 : 6.319 km²
  - lacune dans 3231010 : 1.971 km²
  - lacune dans 34510503 : 5.641 km²
  - lacune dans 34510701 : 3.818 km²
  - lacune dans 35610305 : 7.313 km²
  - lacune dans 35610707 : 6.755 km²
  - lacune dans 35910305 : 0.386 km²
  - lacune dans 42810703 : 27.386 km²
  - lacune dans 42910713 : 5.057 km²
  - lacune dans 4421010 : 1.425 km²
  - lacune dans 44410113 : 2.518 km²
  - lacune dans 44810707 : 3.948 km²
  - lacune dans 50910703 : 8.273 km²
  - lacune dans 50910707 : 6.912 km²
  - lacune dans 52550911 : 36.674 km²
  - lacune dans 53010707 : 8.974 km²
  - lacune dans 6141010 : 0.505 km²
  - lacune dans 63550107 : 5.255 km²
  - lacune dans 64611333 : 8.826 km²
  - lacune dans 70410913 : 6.873 km²
  - lacune dans 74270906 : 30.940 km²
  - lacune dans 82010303 : 7.454 km²
  - lacune dans 82010709 : 5.705 km²
  - lacune dans 82011101 : 6.500 km²
- provinces : 75 entités, 68238 sommets, 0 chevauchement(s) entre voisines, 1 lacune(s) intérieure(s), 0 géométrie(s) invalide(s) ; frontière hors des limites de communes : 0.0 m.
  - lacune dans 4281 : 13.141 km²
- regions : 12 entités, 40622 sommets, 0 chevauchement(s) entre voisines, 2 lacune(s) intérieure(s), 0 géométrie(s) invalide(s) ; frontière hors des limites de communes : 0.0 m.
  - lacune dans 3 : 105.324 km²
  - lacune dans 4 : 13.141 km²
- Écart d'emprise entre l'union des provinces et l'union des régions : 0.0 km².
- Les indicateurs RGPH 2024 restent reliés par le code HCP (`code`) à chaque niveau : tableaux de valeurs inchangés.

## Journal mapshaper

```
[i] Snapped 61 points
[simplify] Repaired 0 intersections; 2 intersections could not be repaired
[clean] Removed 1 of 3 slivers using 290m width threshold
[clean] Retained 1,487 of 1,487 features
[o] Wrote /tmp/tmp75t6tm9_/communes.json
[filter] Retained 1,487 of 1,487 features
[dissolve2] This command has been merged into -dissolve and is deprecated. Use -dissolve (or -dissolve no-repair for the legacy fast algorithm).
[dissolve2] Dissolved 1,487 features into 75 features
[o] Wrote /tmp/tmp75t6tm9_/provinces.json
[dissolve2] Dissolved 75 features into 12 features
[o] Wrote /tmp/tmp75t6tm9_/regions.json
```
