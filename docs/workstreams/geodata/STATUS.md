# GeoData — Statut

Mis à jour : 2026-10-26 (UTC).
État relevé après la fusion de la PR #301.

## État

**Vérifié et fusionné dans `main`** : GeoData V1 (ADR-GEODATA-02, Issue #299), PR #301 fusionnée le 25 octobre 2026 (`1d92920`), CI entièrement verte sur `1d7798e`. **Non accepté** en production : la mise en production reste la Release du maître d'ouvrage.

## Faits vérifiés

Relevés le 25 octobre 2026 sur une base PostGIS 16 jetable locale.

- Base : `main@0ff0638` ; branche `ccr-e71fe633-hjxnjf`.
- `npm run typecheck` : succès ; tests des paquets et du web : succès (dont `@parcours/geodata-model` 18 tests, module web GeoData 11 tests) ; `npm run test:db-guard` : succès ; `check-api-tests-db3` : seule la liste DB-3 (avec `geodata.test.ts`) est refusée sans attestation ; `npm run build` : succès, découpage conforme (famille `maplibre` hors du bundle initial).
- Suite API GeoData sur PostGIS réel (garde DB-3 contournée localement, non commité) : 21 tests sur 21 (GEO 01, 03, 05–10, 13, rôles, immuabilité, recherche, GeoPackage, audit GEO 04).
- `init.sql` rejoué deux fois sans erreur.
- Recette navigateur `apps/web/e2e/geodata.mjs` contre l'API qui sert le build : **tout conforme** (GEO 01, 02, 05, 06, 07, 08, 09, 11, 12, 13, axe-core sans violation critique ou sérieuse, interface anglaise sans résidu).
- Données réelles : geoBoundaries MAR ADM1 (12 régions, SHA-256 `6c4e3e25…129f`) et ADM2 (75 unités, `5b3f09cb…1714`) importées et publiées par la chaîne administrative sur la base locale ; empreintes conformes aux objets LFS publiés.

- CI GitHub sur `1d7798e` (run 40187001869) : `validate` (dont `geodata.test.ts` sur base PostGIS attestée DB-3), les cinq tranches e2e (dont `apps/web/e2e/geodata.mjs` dans `complements`), `image`, architecture, continuité : succès.
- Revue Codex : quatre constats P2 (valeurs > 5 000 objets, hauteur de la légende PNG, export lié à la révision affichée, orientation restituée) corrigés dans `63bcce2`, fils résolus.

- Outils d'exploitation compilés dans l'image (`dist/geodata-role.js`, `dist/geodata-reference.js`, fiches `dist/geodata-sources/`) et reprise de publication d'une version préparée : vérifiés sur une base neuve depuis un autre répertoire (téléchargement réel, empreintes conformes, ADM1 12 et ADM2 75 publiées) ; contrôle ajouté au job CI `image`.
- Aucune Release GitHub ; `fadi-prod-auto` absent du dépôt (phase B non réalisée) : voir `RELEASE-V1.md`.

- Préproduction (25 octobre 2026, compte du maître d'ouvrage) : rôles attribués, geoBoundaries ADM1 (12) et ADM2 (75)
  importés et publiés par les outils de l'image ; carte, fiche, recherche « Casablanca », enregistrement et export PNG
  constatés par le maître d'ouvrage sur téléphone.
- Style « une couleur par entité » (D-GD-11, demande du maître d'ouvrage du 25 octobre 2026) : paquet pur (palette, attribution
  déterministe, 3 tests), route `GET /geodata/api/couches/:id/categories`, choix « Coloration » du panneau Couches, légende
  et export PNG ; vérifié localement sur geoBoundaries (ADM1 : 12 couleurs distinctes ; ADM2 : voisins toujours distincts,
  palette entière employée) ; recette `geodata.mjs` conforme (36 vérifications).

- Sources ouvertes (D-GD-12, demande du maître d'ouvrage du 25 octobre 2026) : 29 couches livrées avec leur fiche
  (`docs/geodata/sources/`, données dans `donnees/`, 15332 objets) — OpenStreetMap, extraits PBF du 23 octobre 2026 lus
  par `scripts/geodata/extraire_sources.py`, et OurAirports : barrages 606, ports 4, marinas 5, gares 157, centrales-electriques 118, postes-electriques 619, eoliennes 956, musees 148, attractions-touristiques 870, campings 754, hotels 2978, information-touristique 245, plages 378, sites-patrimoniaux 1818, agences-de-voyages 232, etablissements-sante 763, administrations 1575, villes 338, silos-agricoles 96, puits 483, reservoirs-eau 409, stations-pompage 10, pepinieres 38, fournitures-agricoles 15, apiculture 6, vignobles 123, serres-horticoles 565, canaux 956, aerodromes 67. Empreintes et validation contrôlées par
  `apps/api/src/db/geodata-sources.test.ts` ; `--fiche toutes` les importe et publie en une commande (vérifié sur la base
  locale). Écartées : couches raster (hors V1), sources aux droits non établis.

- Couches raster (D-GD-13) : capacité livrée (grille figée, tuiles PNG serveur, légende, valeur au point) et 17 couches
  préparées depuis leurs sources d'origine par `scripts/geodata/preparer_rasters.py` (grille 0,01°, masque geoBoundaries) :
  Copernicus DEM (altitude, pente calculée), ESA WorldCover 2021, SoilGrids 2.0 (10 propriétés), CHIRPS 2024, Global Wind
  Atlas, Global Solar Atlas (PVOUT), WorldPop 2020 ; vérifiées sur la base locale (import, tuiles, valeur au point).
- Couches complémentaires : communes OSM (1 498, niveau 8) et sites minéraux USGS MRDS (110).
- Catalogue par catégories et disposition Kharita (D-GD-14) : modèle pur `catalogue.ts` (5 tests), tables
  `geodata_categories` / `geodata_categories_sources` / `geodata_reglages`, routes `/geodata/api/categories*` (suite DB-3,
  CI seulement), panneau « Données » du menu ☰ (créer, renommer, ordonner, supprimer ; ranger, déplacer, retirer une
  couche), barre d'outils verticale flottante (à droite par défaut, déplaçable, bornée), bouton « Données » ; recette
  `geodata.mjs` conforme en local (63 vérifications, dont téléphone 390 px, axe-core et interface anglaise). Suites API DB-3 non exécutées localement (base
  attestée de la CI seulement).
- Population RGPH 2024 du HCP (D-GD-17, lot A) : `scripts/geodata/preparer_hcp.py` (fichier Excel HCP SHA-256
  7e9d3d40…, contours d'empreinte vérifiée), tables `correspondances/hcp-rgph2024-*.csv` (+ table manuelle justifiée),
  3 fiches CC BY 4.0 : 12/12 régions et 75/75 provinces (sommes = 36 828 330, total national), 1 487/1 498 contours
  communaux (97,6 % de la population ; 16 communes HCP sans contour OSM, 11 contours sans valeur) ; import et carte
  thématique vérifiés en local.
- Lot A2 (D-GD-17 point 5) : `scripts/geodata/indicateurs_hcp.py` (fichier « Indicateurs démographiques et
  socio-économiques » du HCP : 648 indicateurs, 2 016 unités) ; tableau CSV par fiche (`version.tableau`, empreinte
  contrôlée par `geodata-sources.test.ts` : colonnes = indicateurs déclarés, codes connus de la couche, cellules
  numériques ou signes déclarés) ; colonnes `theme`, `famille`, `modalite`, `milieu`, `sexe`, `ordre`, `nb_absentes`,
  `nb_total` sur `geodata_indicateurs`, motif « sans-objet » ; `dimensions.ts` (5 tests) ; arrondissements : 41/41
  rattachés (OSM niveau 10, inclusion dans la commune mère ; normalisation « de La… » corrigée, mêmes liens communaux).
  En local : import et publication des 4 fiches (communes : 1 498 objets × 651 indicateurs en 45 s), Casablanca
  3 215 935 habitants, signes stockés comme motifs ; sélecteur famille / modalité / milieu / sexe, légende, table
  (24 indicateurs principaux) et fiche par thème vérifiés dans le navigateur.
- Priorité HCP (D-GD-18) : `hcp-rgph2024-villes` — 258/338 villes rattachées à une commune urbaine ou à un centre
  urbain du HCP (table `correspondances/hcp-rgph2024-villes.csv`, contrôle relu des 31 noms approchés ou inclus) ;
  population OSM retirée pour ces villes (test), gardée pour 8 villes sans unité HCP ; extraits OSM des communes, villes
  et arrondissements régénérés à l'identique (mêmes empreintes) sans fiche importable ; recherche HCP d'abord. En local :
  import et publication, Casablanca 3 215 935, Ouezzane 57 737 (HCP) au lieu de 58 684 (OSM).
- Indicateurs communaux complémentaires (D-GD-20) : `scripts/geodata/sources_hcp_communales.py` (logement urbain
  55, transport domicile – travail 117, CEE 22 indicateurs ; codes CEE recomposés et contrôlés, 1 625 unités) ;
  844 indicateurs par niveau ; `geodata-sources.test.ts` conforme (57) ; import local : Tanger 485 227 logements
  urbains, 25,6 % des actifs à pied, arrondissement de Bni Makada 18 602 établissements, CEE de la commune de Tanger
  « non publiée ».
- Navigation par niveaux (lot B, D-GD-19) : `niveaux.ts` (7 tests : parenté par codes HCP, filtres d'un chemin,
  intersection, chemin coupé), `panneaux/FilNiveaux.tsx`, bouton « Voir ses … » de la fiche, raccourcis Alt+↑ / Alt+↓
  sur toute la page ; jeu synthétique `synthetique-regions` / `synthetique-provinces` ; recette `geodata.mjs` conforme
  en local (7 vérifications de plus) ; vérifié sur les données HCP réelles en local : Tanger-Tétouan-Al Hoceïma →
  Préfecture de Tanger-Assilah → ses communes, Retour, Maroc.
- Limites administratives (D-GD-16) : `limites.ts` (3 tests), contours colorés et hiérarchisés, vérifiés visuellement
  en local sur ADM1, ADM2 et communes OSM (opacité 0 %, une couleur par entité).
- Fournisseurs de fonds (D-GD-15) : modèle pur `fournisseurs.ts` (5 tests), section Paramètres `FournisseursCarte.tsx`,
  fonds lus par GeoData (`fonds-navigateur.ts`), refus d'export motivé (suite DB-3) ; recette `geodata.mjs` conforme en
  local (73 vérifications, tuiles du fournisseur interceptées, aucune requête réelle) ; `interface-anglais.mjs` conforme.

## Points ouverts

Recette sur appareils physiques et validation d'usage ; Release de production ; qualification des droits HCP ; extensions V1.1.

## Liens de suivi

- Issue de réalisation : https://github.com/RachEma-ux/Fadi/issues/299 ; cadrage : #243 (PR #245 fusionnée).
- PR : https://github.com/RachEma-ux/Fadi/pull/301 (fusionnée).

## Préconditions de clôture

Release de production et recette d'usage par le maître d'ouvrage.
