# Contours des niveaux administratifs construits par union, de bas en haut (D-GD-42, après D-GD-33)

Généré par `scripts/geodata/construire_niveaux.py` le 2026-10-28 ; relancer le script régénère ce rapport.

## Source

- Découpage : `decoupage/hcp-rgph2024-entites.csv` (entités, niveaux et parents lus dans le fichier HCP par `decoupage_hcp.py`) et table des niveaux `decoupage/ma-niveaux.csv` ; aucun niveau n'est écrit dans le script.
- Contours d'origine des communes : extrait OpenStreetMap `donnees/osm-mar-communes.geojson` (OpenStreetMap — extraits du 2026-10-23, 1498 contours, licence ODbL), rattachés par `correspondances/hcp-rgph2024-communes.csv`.
- Contours d'origine des arrondissements : extrait OpenStreetMap `donnees/osm-mar-arrondissements.geojson` (OpenStreetMap — extraits du 2026-10-23, 103 contours, licence ODbL), rattachés par `correspondances/hcp-rgph2024-arrondissements.csv`.

## Méthode

1. Entités élémentaires (sans enfant dans le découpage) : 1522 contours d'origine ; 16 sans contour (lacune signalée).
2. mapshaper 0.7.98 : `snap`, `-simplify interval=20 keep-shapes`, `-clean`, **une seule fois, sur la topologie partagée**.
3. Chaque niveau : `-dissolve2` des entités élémentaires par le code de leur ancêtre à ce niveau (union de bas en haut).
4. Contours d'origine remplacés par l'union de leurs enfants (entités qui ont des enfants) : 6 — Commune de Tanger (1511010), Commune de Fès (3231010), Commune de Rabat (4421010), Commune de Salé (4441010), Commune de Casablanca (6141010), Commune de Marrakech (7351010).
5. Sommets des entités élémentaires : 284041 avant simplification.

## Comptes et contrôles par niveau

| Rang | Niveau | Entités en base | Contours livrés | Sommets | Chevauchements | Lacunes intérieures | Invalides | Frontière hors des limites élémentaires |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Régions | 12 | 12 | 40623 | 0 | 2 | 0 | 0.0 m |
| 2 | Provinces et préfectures | 75 | 75 | 68247 | 0 | 1 | 0 | 0.0 m |
| 3 | Communes | 1503 | 1487 | 206592 | 0 | 44 | 0 | 0.0 m |
| 4 | Préfectures d'arrondissements | 8 | 8 | 858 | 0 | 1 | 0 | 0.0 m |
| 5 | Arrondissements | 41 | 41 | 4189 | 0 | 1 | 0 | 0.0 m |

- Écarts d'emprise entre niveaux construits successifs : region/province 0.0 km².
- Entités élémentaires sans contour (lacune du niveau supérieur, signalée, jamais comblée) : 16.
  - Commune de Mirleft (104730107) — Région de Guelmim-Oued Noun › Province de Sidi Ifni
  - Commune d'Al Hoceima (10510101) — Région de Tanger-Tétouan-Al Hoceima › Province d'Al Hoceima
  - Commune de Chbika (105210505) — Région de Guelmim-Oued Noun › Province de Tan-Tan
  - Commune d'El Marsa (113210101) — Région de Laâyoune-Sakia El Hamra › Province de Laâyoune
  - Commune de Foum El Oued (113210305) — Région de Laâyoune-Sakia El Hamra › Province de Laâyoune
  - Commune d'El Argoub (123910901) — Région de Dakhla-Oued Ed-Dahab › Province d'Oued Ed-Dahab
  - Commune de M'diq (15730105) — Région de Tanger-Tétouan-Al Hoceima › Préfecture de M'diq-Fnideq
  - Commune de Saidia (21130125) — Région de l'Oriental › Province de Berkane
  - Commune de Bni Ansar (23810103) — Région de l'Oriental › Province de Nador
  - Commune d'Al Barkanyene (23810703) — Région de l'Oriental › Province de Nador
  - Commune de Bni Khaled (24110305) — Région de l'Oriental › Préfecture d'Oujda-Angad
  - Commune de Mehdya (42810105) — Région de Rabat-Salé-Kénitra › Province de Kénitra
  - Commune de Sidi Mohamed Benmansour (42810511) — Région de Rabat-Salé-Kénitra › Province de Kénitra
  - Commune de Harhoura (45010103) — Région de Rabat-Salé-Kénitra › Préfecture de Skhirate-Témara
  - Commune de Loualidia (64670105) — Région de Casablanca-Settat › Province de Sidi Bennour
  - Commune d'Agadir (90010101) — Région de Souss-Massa › Préfecture d'Agadir-Ida-Ou-Tanane
- lacune intérieure region 3 (Région de Fès-Meknès) : 105.324 km²
- lacune intérieure region 4 (Région de Rabat-Salé-Kénitra) : 13.141 km²
- lacune intérieure province 4281 (Province de Kénitra) : 13.141 km²
- lacune intérieure commune 100710305 (Commune de Touizgui) : 52.911 km²
- lacune intérieure commune 102610309 (Commune de Tagante) : 6.645 km²
- lacune intérieure commune 21130307 (Commune de Fezouane) : 1.615 km²
- lacune intérieure commune 21130503 (Commune de Boughriba) : 3.741 km²
- lacune intérieure commune 21671709 (Commune de Mtalssa) : 12.902 km²
- lacune intérieure commune 22510503 (Commune de Bni Guil) : 5.607 km²
- lacune intérieure commune 22650505 (Commune de Houara Oulad Raho) : 31.066 km²
- lacune intérieure commune 22750501 (Commune de Bni Mathar) : 16.463 km²
- lacune intérieure commune 22750707 (Commune de Laaouinate) : 20.873 km²
- lacune intérieure commune 25330317 (Commune de Sidi Ali Bel Quassem) : 3.522 km²
- lacune intérieure commune 25330703 (Commune d'Ain Lehjer) : 15.010 km²
- lacune intérieure commune 25330901 (Commune d'Ahl Oued Za) : 22.264 km²
- lacune intérieure commune 30610101 (Commune de Meknès) : 1.036 km²
- lacune intérieure commune 30610709 (Commune d'Oualili) : 3.030 km²
- lacune intérieure commune 31310505 (Commune de Sidi Boutayeb) : 10.680 km²
- lacune intérieure commune 31310903 (Commune d'Ait El Mane) : 3.946 km²
- lacune intérieure commune 31710507 (Commune de Laqsir) : 6.319 km²
- lacune intérieure commune 3231010 (Commune de Fès) : 1.971 km²
- lacune intérieure commune 34510503 (Commune d'Ait Sebaa Lajrouf) : 5.641 km²
- lacune intérieure commune 34510701 (Commune d'Aghbalou Aqorar) : 3.818 km²
- lacune intérieure commune 35610305 (Commune de Gzenaya Al Janoubia) : 7.313 km²
- lacune intérieure commune 35610707 (Commune de Ghiata Al Gharbia) : 6.755 km²
- lacune intérieure commune 35910305 (Commune de Sebaa Rouadi) : 0.386 km²
- lacune intérieure commune 42810703 (Commune de Beni Malek) : 27.386 km²
- lacune intérieure commune 42910713 (Commune de Marchouch) : 5.057 km²
- lacune intérieure commune 4421010 (Commune de Rabat) : 1.426 km²
- lacune intérieure commune 44410113 (Commune d'Ameur) : 2.518 km²
- lacune intérieure commune 44810707 (Commune de Lamrabih) : 3.948 km²
- lacune intérieure commune 50910703 (Commune d'Ait Oum El Bekht) : 8.273 km²
- lacune intérieure commune 50910707 (Commune de Dir El Ksiba) : 6.912 km²
- lacune intérieure commune 52550911 (Commune de Krifate) : 36.674 km²
- lacune intérieure commune 53010707 (Commune d'El Hammam) : 8.974 km²
- lacune intérieure commune 6141010 (Commune de Casablanca) : 0.505 km²
- lacune intérieure commune 63550107 (Commune d'Almajjatia Oulad Taleb) : 5.255 km²
- lacune intérieure commune 64611333 (Commune de Sidi Hajjaj) : 8.826 km²
- lacune intérieure commune 70410913 (Commune d'Aghouatim) : 6.873 km²
- lacune intérieure commune 74270906 (Commune de Jbilate) : 30.940 km²
- lacune intérieure commune 82010303 (Commune d'Aarab Sebbah Ziz) : 7.454 km²
- lacune intérieure commune 82010709 (Commune d'Oued Naam) : 5.705 km²
- lacune intérieure commune 82011101 (Commune de Bni M'hamed-Sijelmassa) : 6.500 km²
- lacune intérieure commune 84010311 (Commune d'Ouisselsate) : 26.946 km²
- lacune intérieure commune 84010709 (Commune de Tarmigt) : 35.060 km²
- lacune intérieure commune 91630723 (Commune d'Oued Essafa) : 12.253 km²
- lacune intérieure commune 95510709 (Commune de Tigzmerte) : 17.247 km²
- lacune intérieure prefecture-arrondissements 61410110 (Préfecture d'arrondissements d'Al-Fida-Mers-Sultan) : 0.505 km²
- lacune intérieure arrondissement 61410113 (Arrondissement de Mers-Sultan) : 0.505 km²
- Les lacunes intérieures des communes sont des enclaves d'autres communes ; celles des niveaux supérieurs viennent des communes sans contour.
- Les indicateurs RGPH 2024 restent reliés par le code HCP (`code`) à chaque niveau.

## Journal mapshaper

```
npm warn deprecated prebuild-install@7.1.3: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
npm warn deprecated geographiclib@1.48.0: This package has been split into geographic-geodesic + geographiclib-dms; use one or both of these instead of geographiclib.  WARNING: there's a potential buffer overrun on this package.  SWITCH TO THE NEW PACKAGES NOW.
[i] Snapped 59 points
[simplify] Repaired 0 intersections; 2 intersections could not be repaired
[clean] Removed 2 of 4 slivers using 290m width threshold
[clean] Retained 1,522 of 1,522 features
[filter] Retained 1,522 of 1,522 features
[dissolve2] This command has been merged into -dissolve and is deprecated. Use -dissolve (or -dissolve no-repair for the legacy fast algorithm).
[dissolve2] Dissolved 1,522 features into 12 features
[o] Wrote /tmp/tmp0ubm3ztu/region.json
[filter] Retained 1,522 of 1,522 features
[dissolve2] Dissolved 1,522 features into 75 features
[o] Wrote /tmp/tmp0ubm3ztu/province.json
[filter] Retained 1,522 of 1,522 features
[dissolve2] Dissolved 1,522 features into 1,487 features
[o] Wrote /tmp/tmp0ubm3ztu/commune.json
[filter] Retained 16 of 1,522 features
[dissolve2] Dissolved 16 features into 8 features
[o] Wrote /tmp/tmp0ubm3ztu/prefecture-arrondissements.json
[filter] Retained 41 of 1,522 features
[dissolve2] Dissolved 41 features into 41 features
[o] Wrote /tmp/tmp0ubm3ztu/arrondissement.json
```
