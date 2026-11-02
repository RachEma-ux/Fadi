# Inventaire du découpage administratif du Maroc (D-GD-42)

Généré par `scripts/geodata/decoupage_hcp.py` le 2026-10-27 ; relancer le script régénère ce rapport.

## Source

- Fichier HCP « Population légale du Royaume du Maroc … selon les résultats du RGPH 2024 » (https://www.hcp.ma/file/242341/), SHA-256 `7e9d3d402cc2fd0d9c4fc941c4f23c6a5e5ddcbefbba80b7540267f8e2728dca`, livré tel quel : `decoupage/originaux/hcp-rgph2024-population-legale.xlsx`.
- Niveaux : table de données `decoupage/ma-niveaux.csv` (aucun niveau dans le code) ; entités et parents : lus dans le fichier (libellé de la ligne, emboîtement des lignes). Données : `decoupage/hcp-rgph2024-entites.csv`.

## Comptes par niveau (du plus global au plus fin)

| Rang | Niveau | Entités | Types |
| --- | --- | --- | --- |
| 1 | Régions | 12 | Région : 12 |
| 2 | Provinces et préfectures | 75 | Province : 62, Préfecture : 13 |
| 3 | Communes | 1503 | Commune hors cercle : 242, Commune rattachée à un cercle : 1261 |
| 4 | Préfectures d'arrondissements | 8 | Préfecture d'arrondissement : 2, Préfecture d'arrondissements : 6 |
| 5 | Arrondissements | 41 | Arrondissement : 41 |

Total : 1639 entités. Lignes du fichier qui ne sont pas des entités d'un niveau : Cercle (213), dont le centre urbain (164), ligne par milieu (urbain / rural) (198), total ou ligne sans code (8).

## Profondeur de la hiérarchie (lue par les liens parent → enfant)

- 3 niveaux : commune → province ou préfecture → région — 1497 entité(s) élémentaire(s)
- 4 niveaux : arrondissement → commune → province ou préfecture → région — 25 entité(s) élémentaire(s)
- 5 niveaux : arrondissement → préfecture d'arrondissements → commune → province ou préfecture → région — 16 entité(s) élémentaire(s)

## Communes à arrondissements (6)

- **Commune de Tanger** (1511010, 1275428 hab.) — Région de Tanger-Tétouan-Al Hoceima › Préfecture de Tanger-Assilah
  - Arrondissement de Bni Makada (15110103, 567465 hab.)
  - Arrondissement de Mghogha (15110105, 252656 hab.)
  - Arrondissement de Souani (15110106, 111772 hab.)
  - Arrondissement de Médina (15110107, 343535 hab.)
  - somme des arrondissements : 1275428 ; population de la commune : 1275428 — égales
- **Commune de Fès** (3231010, 1167842 hab.) — Région de Fès-Meknès › Préfecture de Fès
  - Arrondissement d'Agdal (32310101, 128030 hab.)
  - Arrondissement de Saiss (32310105, 237242 hab.)
  - Arrondissement de Fès-Médina (32310107, 49775 hab.)
  - Arrondissement de Jnan El Ouard (32310109, 187737 hab.)
  - Arrondissement d'El Mariniyine (32310111, 206427 hab.)
  - Arrondissement de Zouagha (32310113, 358631 hab.)
  - somme des arrondissements : 1167842 ; population de la commune : 1167842 — égales
- **Commune de Rabat** (4421010, 509916 hab.) — Région de Rabat-Salé-Kénitra › Préfecture de Rabat
  - Arrondissement d'Agdal Riyad (44210101, 70435 hab.)
  - Arrondissement d'El Youssoufia (44210103, 157587 hab.)
  - Arrondissement de Hassan (44210105, 92454 hab.)
  - Arrondissement de Souissi (44210106, 21049 hab.)
  - Arrondissement de Yacoub El Mansour (44210109, 168391 hab.)
  - somme des arrondissements : 509916 ; population de la commune : 509916 — égales
- **Commune de Salé** (4441010, 945101 hab.) — Région de Rabat-Salé-Kénitra › Préfecture de Salé
  - Arrondissement de Bab Lamrissa (44410103, 167319 hab.)
  - Arrondissement de Bettana (44410105, 76233 hab.)
  - Arrondissement de Hssaine (44410106, 234326 hab.)
  - Arrondissement de Layayda (44410107, 229838 hab.)
  - Arrondissement de Tabriquet (44410109, 237385 hab.)
  - somme des arrondissements : 945101 ; population de la commune : 945101 — égales
- **Commune de Casablanca** (6141010, 3215935 hab.) — Région de Casablanca-Settat › Préfecture de Casablanca
  - Préfecture d'arrondissements de Casablanca-Anfa (61410100, 344165 hab.) : Arrondissement d'Anfa (61410101, 66202), Arrondissement de Maârif (61410103, 139669), Arrondissement de Sidi Belyout (61410107, 138294)
  - Préfecture d'arrondissements d'Al-Fida-Mers-Sultan (61410110, 224072 hab.) : Arrondissement d'Al-Fida (61410111, 125933), Arrondissement de Mers-Sultan (61410113, 98139)
  - Préfecture d'arrondissements d'Aïn-Sebaâ-Hay Mohammadi (61410120, 364835 hab.) : Arrondissement d'Aïn-Sebaâ (61410121, 155828), Arrondissement d'Asoukhour Assawda (61410123, 104775), Arrondissement de Hay-Mohammadi (61410125, 104232)
  - Préfecture d'arrondissement de Hay-Hassani (61410130, 537509 hab.) : Arrondissement de Hay-Hassani (61410131, 537509)
  - Préfecture d'arrondissement d'Aïn-Chock (61410140, 374707 hab.) : Arrondissement d'Aïn-Chock (61410141, 374707)
  - Préfecture d'arrondissements de Sidi Bernoussi (61410150, 706362 hab.) : Arrondissement de Sidi Bernoussi (61410151, 154919), Arrondissement de Sidi Moumen (61410153, 551443)
  - Préfecture d'arrondissements de Ben M'sick (61410160, 207252 hab.) : Arrondissement de Ben-M'sick (61410161, 105612), Arrondissement de Sbata (61410163, 101640)
  - Préfecture d'arrondissements de Moulay Rachid (61410170, 457033 hab.) : Arrondissement de Moulay Rachid (61410171, 245139), Arrondissement de Sidi Othmane (61410173, 211894)
  - somme des arrondissements : 3215935 ; population de la commune : 3215935 — égales
- **Commune de Marrakech** (7351010, 1002697 hab.) — Région de Marrakech-Safi › Préfecture de Marrakech
  - Arrondissement d'Annakhil (73510103, 71506 hab.)
  - Arrondissement de Gueliz (73510105, 219863 hab.)
  - Arrondissement de Marrakech-Médina (73510107, 81103 hab.)
  - Arrondissement de Ménara (73510109, 522259 hab.)
  - Arrondissement de Sidi Youssef Ben Ali (73510111, 107966 hab.)
  - somme des arrondissements : 1002697 ; population de la commune : 1002697 — égales

## Contrôles

- Entités sans parent hors du niveau le plus global : 0
- Parents absents du fichier : 0 ; parent d'un rang qui n'est pas plus global : 0.
- Somme des populations des enfants = population du parent, pour chaque entité qui a des enfants : 101 / 101
- Rattachement des communes à un cercle confronté à leur population rurale (« … » = entièrement urbaine) dans le fichier d'indicateurs ; le statut urbain / rural n'est pas déduit (non évalué) : 1482 accord(s), 21 désaccord(s)
  - 15730107 Commune d'Allyene : Commune hors cercle, population rurale 8111 (commune hors cercle qui compte une population rurale)
  - 15730109 Commune de Belyounech : Commune hors cercle, population rurale 5208 (commune hors cercle qui compte une population rurale)
  - 32310115 Commune d'Oulad Tayeb : Commune hors cercle, population rurale 11738 (commune hors cercle qui compte une population rurale)
  - 32710107 Commune de Tizguite : Commune hors cercle, population rurale 12204 (commune hors cercle qui compte une population rurale)
  - 32710105 Commune de Dayat-Aoua : Commune hors cercle, population rurale 12050 (commune hors cercle qui compte une population rurale)
  - 35910103 Commune d'Ain Chkef : Commune hors cercle, population rurale 42708 (commune hors cercle qui compte une population rurale)
  - 44410113 Commune d'Ameur : Commune hors cercle, population rurale 51971 (commune hors cercle qui compte une population rurale)
  - 44410111 Commune de Shoul : Commune hors cercle, population rurale 24913 (commune hors cercle qui compte une population rurale)
  - 42810113 Commune de Sidi Taibi : Commune hors cercle, population rurale 8972 (commune hors cercle qui compte une population rurale)
  - 63710105 Commune de Bni Yakhlef : Commune hors cercle, population rurale 28122 (commune hors cercle qui compte une population rurale)
  - 63710107 Commune d'Ech-challalate : Commune hors cercle, population rurale 45393 (commune hors cercle qui compte une population rurale)
  - 63850107 Commune d'Oulad Azzouz : Commune hors cercle, population rurale 81048 (commune hors cercle qui compte une population rurale)
  - 63850105 Commune d'Ouled Salah : Commune hors cercle, population rurale 18436 (commune hors cercle qui compte une population rurale)
  - 63550109 Commune de Sidi Hajjaj Oued Hassar : Commune hors cercle, population rurale 76362 (commune hors cercle qui compte une population rurale)
  - 63550107 Commune d'Almajjatia Oulad Taleb : Commune hors cercle, population rurale 95457 (commune hors cercle qui compte une population rurale)
  - 64670105 Commune de Loualidia : Commune hors cercle, population rurale 11953 (commune hors cercle qui compte une population rurale)
  - 73510113 Commune de Tassoultante : Commune hors cercle, population rurale 106013 (commune hors cercle qui compte une population rurale)
  - 83630115 Commune de Boumia : Commune hors cercle, population rurale 2280 (commune hors cercle qui compte une population rurale)
  - 91630101 Commune d'Ait Amira : Commune hors cercle, population rurale 35073 (commune hors cercle qui compte une population rurale)
  - 91630127 Commune de Sidi Bibi : Commune hors cercle, population rurale 60570 (commune hors cercle qui compte une population rurale)
  - 104730107 Commune de Mirleft : Commune hors cercle, population rurale 2571 (commune hors cercle qui compte une population rurale)

## Différences avec la livraison précédente

- Ajoutées : 0 ; modifiées : 0 ; retirées : 0.
