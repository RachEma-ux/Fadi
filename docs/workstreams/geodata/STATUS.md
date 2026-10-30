# GeoData — Statut

Mis à jour : 2026-10-30 (UTC).
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
- Import automatique au déploiement (D-GD-23) : `lib/geodata/import-auto.ts` (4 tests), `lib/geodata/empreinte-fiche.ts`
  (empreinte attendue = empreinte réelle pour chaque fiche, test), retraits déclarés (test), `GET /version/donnees`
  (test). En local sur l'API construite : 1er démarrage 14 s (2 versions préparées et publiées, 2 retraits, 53 fiches
  déjà en base), 2e démarrage < 1 s (rien refait). CI : installation de Chromium bornée (3 × 10 min).
- Rubrique « Indicateurs » (D-GD-31, étape 1) : `geodata-model/src/indicateur-actif.ts` (clé d'indicateur commune aux
  couches, `indicateurPourCle`, `unionIndicateurs` ; 3 tests), `panneaux/consultation.tsx` (rubrique du catalogue après
  « Géologie », arbre et dimensions ; option Afficher / Masquer sur les cartes de couche), `PageGeoData.tsx` (indicateur
  actif, application à toutes les couches qui le portent, couches chargées ensuite). Recette `geodata.mjs` adaptée.
- Sélection par nombre de clics (D-GD-34) : `geodata-model/src/selection-clics.ts` (3 tests), moteur MapLibre (série de
  clics, double-clic sans zoom, couche `gd-entite`), page (niveaux chargés ou découpage en base, parents par `ancetres`),
  route `GET /territoires/:pays/point` (test API), `versionId` / `coucheId` dans l'unité servie ; recette `geodata.mjs`
  : carte vierge (1, 2, 3 clics, clic hors entité) et couches chargées (provinces + régions).
  Correctifs du 28 octobre 2026 : fiche différée sur téléphone (#358) ; fenêtre de la série portée à **600 ms** et
  horodatage de l'événement d'entrée (`originalEvent.timeStamp`) plutôt que du traitement — mesure en émulation tactile :
  350 à 450 ms entre deux tapes humaines, remise du clic retardée par le rendu ; vérifié Pixel 7, cadence 280–460 ms,
  carte vierge et couches HCP chargées : 1 → commune, 2 → province, 3 → région.
- Recherche en mini-barre (D-GD-35) : `panneaux/BarreRecherche.tsx` (placement pur, 3 tests), `onPlacement` de la barre
  d'outils, Alt+R ; recette `geodata.mjs` 144 contrôles (15 nouveaux : place, style, ouverture / fermeture, texte gardé,
  clic sur la carte, outil de mesure actif, suivi du déplacement, sources non chevauchées) ; vérifié Pixel 7, 360 × 560
  et 1440 × 900, « Dir El Ksiba », code HCP 15710321, coordonnées.
- Collections, menu « Cartes » et mini-barre (D-GD-36) : tables `geodata_collections` (+ description, propriétaire,
  modification) et `geodata_collection_cartes` (rang), reprise idempotente de `collection_id` (vérifiée en base locale) ;
  routes `GET/POST/PUT/DELETE /collections` ; `panneaux/collection.tsx`, `geodata-model/src/collections.ts` (4 tests) ;
  recette `geodata.mjs` 168 contrôles (24 nouveaux) ; scénario API rejoué en HTTP sur l'API locale (19/19) — les tests API
  sur base (`geodata.test.ts`, étendus) tournent en CI seulement (cible de test signée).
- Fiche : tableaux croisés Milieu × Sexe (D-GD-39) : `geodata-model/src/tableau-croise.ts` (6 tests), palette partagée
  `--gd-cat-*` (tableaux, légendes des graphiques, impression), contrôle de cohérence ; vérifié sur 4 entités réelles
  (commune urbaine d'Assilah, commune rurale de Boutferda, préfecture de Tanger-Assilah, région de Tanger-Tétouan-Al
  Hoceima), bureau et Pixel 7, sans défilement horizontal ; captures avant / après dans `captures/d-gd-39/` ; recette
  `geodata.mjs` 199 contrôles (3 nouveaux, jeu synthétique des régions ventilé Milieu × Sexe).
- Lecture de l'emprise (D-GD-40, PR #367 fusionnée, `603504f`, CI verte) : `geodata-model/src/emprise.ts` (synthèse d'une
  couche dans la vue, grille de regroupement alignée sur les tuiles, 8 tests) et `adresse-vue.ts` (fragment d'adresse,
  4 tests) ; composition `regrouper` ; route `GET /couches/:id/vue?bbox=` et tuiles `?regrouper=1` (`consultation.ts`) ;
  `panneaux/SyntheseVue.tsx`, trois boutons de la barre d'outils (Alt+V, Alt+G, Alt+K ; icônes et touches distinctes,
  test `barre-outils.test.ts`), case « Regrouper les points », zoom affiché, état écrit dans l'adresse et relu à
  l'ouverture. Requête de regroupement vérifiée sur PostGIS 16 local (3 points d'une cellule → une grappe « 3 », point
  isolé gardant son nom, polygone inchangé). Recette `geodata.mjs` sur PostGIS 16 local : 206 contrôles, tout conforme (14 nouveaux : zoom affiché, synthèse lue en base et relue au déplacement, statistiques de l'indicateur avec absence non comptée, adresse écrite, copiée et rouverte, raccourcis). Test API sur base
  (`geodata.test.ts`, nouveau cas « lecture de l'emprise ») : en CI seulement (cible de test signée DB-3).
- Zone d'étude qui filtre (D-GD-41, PR à venir sur `ccr-9ee33f24-q1rmt0`) : route `/couches/:id/vue?zone=` (zone de
  l'espace, active ; sinon 404) et `/couches/:id/table?zone=` ; filtre de codes combiné sur la carte, table et synthèse ;
  puce « Zone d'étude : nom × », bouton « Filtrer par cette zone » des Études, Alt+Z, `z=` dans l'adresse
  (`adresse-vue.ts`, 1 test) ; tableau de bord non filtré, avis affiché. Scénario API rejoué en HTTP sur l'API locale :
  7/7 ; recette `geodata.mjs` sur PostGIS 16 local : 215 contrôles conformes (6 nouveaux) ; test API sur base
  (`geodata.test.ts`, cas étendu) en CI seulement.
- Services publics du MTNRA (D-GD-42, branche `ccr-202174a8-jkf2k9`) : `scripts/geodata/preparer_geoportail.py`
  (empreinte de la source contrôlée), 12 fiches `mtnra-services-publics-2022-*` et leurs GeoJSON ; 17 477 points
  (16 757 par contour, 657 par province du RGPH, 63 par province de la source), 22 lignes sans point écartées. Test
  `geodata-sources.test.ts` (validation de chaque fiche + cas MTNRA). Import réel sur PostGIS 16 local
  (`geodata-reference.ts --livraison`) : Casablanca-Settat 4 670 objets, Souss-Massa 1 017, publiés.
- Garde « interface ≠ base de données » (D-GD-29, rappel du maître d'ouvrage du 30 octobre 2026) :
  `independance.test.ts` échoue si la page GeoData ou `geodata-model` importe un fichier de données, écrit une géométrie,
  une série de 12 nombres ou plus, ou un nom de lieu du référentiel (vérifié : un fichier piège est refusé). Le lot D-GD-40
  ne contient que des constantes techniques (bornes Web Mercator, grille des tuiles, icônes) ; toutes ses données sont
  lues en base par l'API.
- Fil de navigation administrative dans la mini-barre (D-GD-38) : ≡ entre Enregistrer et Fond, `BarreTerritoriale`
  réutilisée telle quelle dans un panneau flottant, un seul panneau à la fois (`panneauMini`) ; recette `geodata.mjs`
  194 contrôles (8 nouveaux), vérifié bureau 1885 × 893 et Pixel 7 sur données HCP réelles.
- Onglets et tableau de bord RGPH 2024 (D-GD-37) : barre blanche → barre d'onglets (5 adresses), pastille « Carte non
  enregistrée » ; fiche `hcp-rgph2024-royaume` (ligne nationale, 670 indicateurs dont 22 totaux CEE calculés, 52
  concepts, 18 blocs) importée en base locale ; tables `geodata_concepts`, `geodata_tableaux_bord` ; routes
  `/tableau-de-bord`, `/tableau-de-bord/concepts` ; `panneaux/TableauDeBord.tsx` (SVG interne), `tableau-de-bord.ts`
  (9 tests) ; valeurs de contrôle vérifiées (test des sources + navigateur, bureau 1885 × 893 et Pixel 7) ; recette
  `geodata.mjs` 186 contrôles (17 nouveaux, dont l'interface anglaise des onglets) ; tests API sur base en CI seulement.
- Régions et provinces construites par union des communes (D-GD-33) : `scripts/geodata/construire_niveaux.py` (mapshaper,
  topologie partagée simplifiée une seule fois, rapport `CONTOURS-NIVEAUX.md`), fiches et GeoJSON des trois niveaux
  régénérés, tuiles et contour de territoire sans simplification propre (`consultation.ts`, `territoires.ts`). Contrôles :
  12 / 75 / 1 487, 0 chevauchement, frontières partagées à 0 m ; 16 communes HCP sans contour listées. Vérifié en local
  (import des trois versions, captures avant / après autour de Tétouan), recette `geodata.mjs` 121 contrôles.
- Indicateur = valeur affichée, jamais une coloration (D-GD-32) : liste « Coloration » réduite aux deux modes de style,
  classification du lot D retirée de l'interface (`sansColorationThematique` à l'ouverture d'une carte, test), couche de
  rendu `-valeurs` distincte des libellés (`carte/moteur-maplibre.ts`), case « Afficher l'indicateur — [nom] » dérivée
  (cochée par défaut, masquage mémorisé par couche). Recette `geodata.mjs` : combinaisons nom / valeur, retrait puis
  rechargement, coloration sans indicateur.
- Une seule source par niveau (D-GD-30) : 4 fiches HCP sous `limites-administratives` (titres « Limites administratives —
  … (RGPH 2024) »), fiches geoBoundaries déplacées dans `sources/references/` (rôle `reference` à l'archive), retraits
  déclarés de `geoboundaries-mar-adm1` / `adm2` au profit des couches HCP (test), métadonnées de source suivies par la
  fiche (`assurerSource`, ON CONFLICT ; test base). Communes : 1 498 contours OSM, 1 487 rattachés, 11 contours OSM sans
  nom (aucun nom OSM non plus), 16 unités HCP sans contour (table de correspondance seulement).
- Interface ≠ base, fichiers archivés (D-GD-29) : `lib/geodata/archive-fichiers.ts` (inventaire et archive ; 4 tests sur
  le dossier réel), table `geodata_fichiers`, `--archiver` dans `geodata-reference.ts`, lancé à chaque démarrage
  (`import-auto.ts`, 5 tests), test base (ajout, inchangé, modifié, retiré). En local sur la base de développement :
  121 fichiers (53 fiches, 57 données, 6 correspondances, 4 extraits, 1 déclaration), 52 Mo bruts → 35 Mo en base,
  2,2 s ; second passage 0,4 s, rien réécrit ; deux fichiers plus livrés marqués retirés. Mode livraison (`--livraison`,
  sans compte) sur une base neuve (0 compte) : 53 versions publiées, 121 fichiers, découpage MA 12 / 75 / 1 487 / 41 en
  61 s ; second passage 1 s (53 « déjà présente »). CI : `GEODATA_IMPORT_AUTO=non` sur les recettes et le job `image`.
  Revue adversariale après fusion (#349) : chargement du découpage en transaction propre, déclaration d'une fiche
  répercutée sans nouvelle donnée (parents recalculés si la règle change ; test base), import arrêté avec l'API
  (SIGTERM ; test), barre : « (…) » tant que la base n'a pas répondu (jamais « (0) »), sélecteur de pays nommé par un
  span traduisible, « Retour » toujours suivi d'effet (repli par les couches), chemin appliqué aux seules couches des
  versions du découpage courant (`versions` dans `/territoires`).
- Navigation territoriale (lot H, D-GD-28) : `geodata-model/src/territoires.ts` (déclaration, règles de parent ; 3
  tests), tables `geodata_pays` / `geodata_territoires`, `lib/geodata/territoires.ts` (chargement idempotent, parents
  `codes-hcp` ou `inclusion`), routes `routes/geodata/territoires.ts`, `panneaux/BarreTerritoriale.tsx` (remplace le fil
  du lot B), contour sur la carte. En local sur la base de développement : MA chargé par la chaîne d'import — 12
  régions, 75/75 provinces et préfectures avec parent, 1 487/1 487 communes (11 contours sans code HCP écartés), 41/41
  arrondissements ; second passage « déjà chargée(s) » ; la règle `inclusion` donne les mêmes parents que les codes HCP
  (75/75). Navigateur sans aucune couche posée : Fès-Meknès → 9 provinces, El Hajeb → 16 communes, contour tracé.
  Recette `geodata.mjs` en local : 113 contrôles conformes dont 6 du lot H (pays de test ZZ en base).
- Mini-carte et impression (lot G, D-GD-27) : contrat `MoteurCarte.afficherMiniCarte` / `canevasMiniCarte`, seconde carte
  MapLibre dans `moteur-maplibre.ts`, encart dans `composerPng`, `ouvrirFenetreImpression` (`export-png.ts`), boutons
  et raccourcis (Alt+M, Alt+I) dans `BarreOutilsCarte.tsx` et `PageGeoData.tsx`. Recette `geodata.mjs` en local : 106
  contrôles conformes dont 8 du lot G (mini-carte : Alt+M, bouton, placement à droite du panneau, clic ; impression :
  refus d'une carte non enregistrée, Alt+I sur une carte enregistrée → fenêtre avec l'image autorisée, 1 312 px).
- Arbre d'indicateurs (lot F, D-GD-26) : `dimensions.ts` (`arbreIndicateurs`, `normaliserRecherche` ; `arbre.test.ts`, 3
  tests), `panneaux/consultation.tsx` (`ArbreIndicateurs`). Vérifié sur la fiche réelle des communes du HCP : 844
  indicateurs → 9 thèmes, 59 familles ; « chomage » → Taux de chômage, « age logement » → 3 familles « Âge du
  logement ». Recette `geodata.mjs` en local : 99 contrôles conformes dont 4 de l'arbre.
- Palettes et classes (lot D, D-GD-25) : `classification.ts` (palettes, `couleursPalette`, `rupturesNaturelles` de
  Fisher-Jenks, méthode `seuils-naturels`), composition (`palette`, `inverser`), `composition-ops.ts` (`reclasser`,
  `recolorerClasse`), légende (`Seuils` : méthode, classes, palette, inversion ; pastille = sélecteur de couleur). Tests :
  `palettes.test.ts` (6, dont l'optimum de Jenks et l'absence jamais classée), opérations de composition. Recette
  `geodata.mjs` en local : 95 contrôles conformes dont 5 du lot D ; capture : carte et légende concordantes (palette
  « Verts » inversée, classe recolorée, valeur absente hachurée).
- Libellés sur la carte (lot C, D-GD-24) : `geodata-model/src/etiquettes.ts` (valeur abrégée, plages des glyphes ;
  4 tests), `composition-ops.ts` (bascule par couche et bouton ; test), route `/etiquettes` (test d'intégration : point
  dans la seule tuile qui le contient, nom sans caractère non traçable, accès refusé à un tiers ; requête vérifiée en
  local sur PostGIS), glyphes Noto Sans hébergés (test : plages exactes, empreintes de la notice, licence OFL). Recette
  `geodata.mjs` en local : 90 contrôles conformes dont 10 sur les libellés (Alt+L, bouton, case, glyphes servis par
  Fadi, aucune police tierce, points d'étiquette lus à la demande) ; capture : nom et valeur abrégée, « 0 » pour zéro, nom
  seul pour la valeur absente.
- Fiche territoriale (lot E, D-GD-22) : `panneaux/FicheTerritoriale.tsx` (thèmes, tableaux de ventilation via
  `tableauVentilation`, arrondissements, douars, impression Alt+P), table `geodata_douars` et annexe
  `donnees/hcp-rgph2024-douars.tsv` (33 189 douars, 1 279 communes rurales ; `scripts/geodata/douars_hcp.py`), test de
  l'annexe dans `geodata-sources.test.ts` ; vérifié en local sur les données réelles : Casablanca (16 arrondissements,
  51 tableaux), commune de Tamorot (28 douars, noms en arabe), impression en PDF ; recette `geodata.mjs` conforme.
- Arabe là où il est nécessaire (D-GD-21) : appliqué aux noms des douars (fiche territoriale).
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
