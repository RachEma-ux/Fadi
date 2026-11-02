# TER-00 — Audit des points d'intégration du terrain haute résolution

Date : 2 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381.
Plan : [`PLAN.md`](PLAN.md), déposé tel quel ; empreinte SHA-256 du fichier déposé
`01423199e644b835609cc071cb6962f2f6a1c104baef6f48c3f82b188739c569`, **identique** à celle déclarée par le maître
d'ouvrage pour le fichier source.

**Commit audité : `main@79f7a38eef44ae2278dc187a3a8359a5f45f8b2e`** (« Web : suppression des appels API en double au
chargement des écrans (#378) »). Tout constat ci-dessous cite un fichier de ce commit. Les faits relevant du VPS (disque,
racine des données Docker) n'ont **pas** été vérifiés par cette session : ils sont marqués « déclaré » ou « à constater ».

État : **Implémenté (document)**, non accepté. Aucune ligne de code, aucune donnée téléchargée, aucun fournisseur contacté.

## 1. Synthèse

| Point du plan | Existant dans Fadi | Écart | Réutilisation proposée |
| --- | --- | --- | --- |
| Moteur cartographique | MapLibre GL JS chargé à la demande (D-GD-03), couches raster servies en tuiles PNG serveur | Aucun ombrage, aucun profil, aucune requête numérique riche | Étendre `carte/moteur-maplibre.ts` (couche raster existante) |
| Registre des sources | Fiches JSON qualifiées, versions immuables, droits par usage, archive `geodata_fichiers` | Cycle de vie à 3 états, aucun état qualité, aucun datum vertical | Garder la version GeoData comme pivot ; tables `geodata_terrain_*` en plus |
| Rasters | GeoTIFF EPSG:4326 seulement, ≤ 4 M cellules, plus proche voisin, Float32 deflate en `bytea`, grille gardée en mémoire | 25 cm × 1 km² = 16 M cellules : **hors borne** ; projection métrique refusée | Nouveau chemin COG sur volume, lecture par fenêtres ; le chemin D-GD-13 reste pour le régional |
| Droits | Rôles du module, espaces personnels, droits par usage (8), « inconnu » bloque | Aucune portée organisation / projet — **voulu** (ADR-GEODATA-01, GEO 04) | Portée = espace GeoData ; rattachement au projet côté Parcours (TER-D9) |
| Envoi de fichiers | Corps JSON borné (GeoJSON ≤ 5 Mo), import de référence par fichiers livrés avec le code | Aucun envoi en flux de fichiers volumineux | Dépôt opérateur sur volume + commande d'import (TER-D10) |
| Tâches de fond | Boucles `setInterval` dans le processus API (courriels 5 s, tâche horaire) | Aucune file, aucun travailleur, aucune reprise | Table de traitements + travailleur séparé (`FOR UPDATE SKIP LOCKED`) |
| Stockage durable | PostgreSQL seulement ; volumes Docker `fadi-preprod-db`, `-backups`, `-out` ; **aucun stockage objet** | Fichiers de plusieurs Go impossibles en `bytea` (borne 1 Go par valeur, sauvegardes `pg_dump` gonflées) | Volume nommé adressé par empreinte (TER-D5) |
| Déploiement | Image `node:22-bookworm-slim`, un processus, sans GDAL/PDAL ; préproduction `deploy/preprod/compose.yml` | Aucun outil géomatique ; limites mémoire 2 Go (app) | Service `terrain-worker` séparé, épinglé (TER-D6) |
| Tests | Vitest par paquet, suites API sous garde DB-3, recette `geodata.mjs` en CI, règle d'or, frontières, recette anglaise | Aucun test de terrain | Tests obligatoires du plan répartis par lot (§ 5) |

## 2. Constats détaillés

### 2.1 Moteur cartographique (A1)

- `apps/web/src/modules/geodata/carte/moteur-maplibre.ts` : MapLibre (version épinglée D-GD-03), famille chargée à la demande
  (`carte-morceaux.ts`, le build échoue si elle entre dans le bundle initial). Une couche raster est une source
  `type: "raster"` dont les tuiles viennent de `/geodata/api/raster/:coucheId/:z/:x/:y` (`adresseRaster`), `maxzoom: 14`,
  `raster-resampling: "nearest"`, seule l'opacité est réglable (l. 191-199).
- Point d'extension : la même branche `d.rasters` accueille une couche de terrain (couleur et ombrage = deux tuiles serveur
  distinctes). `maxzoom` 14 (≈ 9,5 m/pixel à l'équateur) est insuffisant pour une grille de 25 cm : la couche terrain doit
  déclarer son propre `maxzoom` (≈ 19–20 pour 25 cm), sur-zoom ensuite.
- Barre d'outils flottante (`panneaux/BarreOutilsCarte.tsx`) et barre du bas (`BarreBas.tsx`) : `ICONES` et
  `RACCOURCIS_BARRE` contrôlés par `panneaux/barre-outils.test.ts` (une icône et une touche Alt+… propres par commande) :
  c'est là que s'inscrivent « Altitude », « Pente », « Ombrage », « Profil du terrain », « Sources et précision »,
  « Couverture disponible » (TER-05, règle d'or). Touches déjà prises à vérifier au lot (Alt+V, G, K, Z, S, T, L, M, I, P,
  R, ↑, ↓…).
- Le profil exige un tracé de ligne : les outils de mesure existent déjà (D-GD-06, mesures sur l'ellipsoïde) et sont la base
  du tracé de profil.

### 2.2 Registre des sources et versions (A2)

- Fiches qualifiées `docs/geodata/sources/*.json` (titre, producteur, licence, attribution, droits par usage, précision,
  `synthetique`), chargées au démarrage (`apps/api/src/lib/geodata/import-auto.ts`) et archivées telles quelles dans
  `geodata_fichiers` (`archive-fichiers.ts`, D-GD-29).
- `geodata_versions` (`apps/api/src/db/init.sql` l. 2973) : empreinte SHA-256, licence, droits `jsonb`, `crs_source`,
  `precision_donnees`, `transformations`, `controles`, `synthetique`, état `preparation | publiee | retiree` ; déclencheur
  `geodata_versions_immuables` et `geodata_contenu_fige` (une version sortie de préparation est figée).
- Qualification `qualifiee | provisoire` (D-GD-54), garde d'environnement `GEODATA_SOURCES_PROVISOIRES`.
- Écart avec le plan : pas d'états `validating`, `quarantined`, `awaiting review`, `accepted`, `superseded` ; aucun
  champ datum vertical, type MNT / MNS, pas de grille source / livrée, date de levé, rapport qualité. → tables propres au
  terrain liées à `geodata_versions` (TER-D12), sans modifier le cycle commun.

### 2.3 Rasters existants et modèle régional (A3)

- `apps/api/src/lib/geodata/raster.ts` : lecture `geotiff` 3.0.5, **EPSG:4326 exigé** (projeté refusé, aucune reprojection
  devinée), grille ramenée sous `MAX_PIXELS_RASTER = 4 000 000` (`packages/geodata-model/src/raster.ts` l. 43) en plus proche
  voisin, `Float32` deflate dans `geodata_rasters.valeurs` (`bytea`, contrainte `largeur*hauteur <= 4 000 000`).
- Route `GET /geodata/api/raster/:coucheId/valeur` : valeur de la cellule, `null` hors emprise ou nodata (jamais zéro).
  Elle ne renvoie **ni version, ni pas de grille, ni datum, ni méthode d'échantillonnage**, et ne vérifie que la
  consultabilité de la couche, **pas le droit d'usage `calcul`** (la route des tuiles vérifie `tuiles`). Constat à corriger
  dans le lot TER-04 pour les couches de terrain (et à signaler pour les rasters existants).
- Cache serveur : 12 grilles au plus en mémoire (`consultation.ts` l. 282) ; en-tête `private, max-age=3600` (jamais
  public) — conforme à l'exigence « jamais de cache public ».
- Modèle régional présent : `copernicus-dem-mar-altitude` (Copernicus GLO-90, **modèle de surface**, bâti et végétation
  compris, moyenné à 0,01° ≈ 1,1 km) et `copernicus-dem-mar-pente` (pente calculée sur cette grille lissée). Ce n'est **ni
  un MNT, ni un modèle à ~30 m** : il ne peut être présenté comme repli « terrain nu » (TER-D4). TessaDEM n'est pas au
  dépôt ; sa licence n'est pas qualifiée.

### 2.4 Droits et portée (A4)

- `apps/api/src/lib/geodata/acces.ts` : autorisations fondées sur l'identité et les tables `geodata_*` seulement ; rôles du
  module `gestionnaire-donnees`, `responsable-publication`, `administrateur` (`geodata_roles`) ; espace personnel
  idempotent ; espaces collectifs préparés mais non exposés (D-GD-09) ; ressource d'un autre espace → 404 (GEO 08).
- Droits par usage (`consultation, stockage, calcul, tuiles, commercial, partage, telechargement, export`), « inconnu »
  bloque (`droits.ts`).
- Le plan demande une portée « organisation / projet ». GeoData est **indépendant des projets** par décision
  (ADR-GEODATA-01, tests GEO 04 : aucun `projectId` dans le noyau, `scripts/frontieres.json`). Le rattachement « version de
  terrain approuvée → projet » se fait donc **côté Parcours / Atelier**, par référence à un identifiant de version, jamais
  par GeoData (TER-D9).

### 2.5 Envoi de fichiers (A5)

- `apps/api/src/app.ts` l. 53 : `express.json({ limit: "256kb" })` ; import personnel GeoJSON en JSON borné
  (`routes/geodata/imports.ts`, D-GD-07 : 5 Mo, 5 000 objets, 200 000 sommets) ; import de prix idem (`prix.ts`).
- Import de référence : fichiers livrés **avec le code** sous `docs/geodata/sources/donnees/` (dans le dépôt Git, copiés
  dans l'image `apps/api/dist/geodata-sources/`). Un raster de plusieurs centaines de Mo ou de Go ne peut ni entrer dans
  Git, ni transiter en JSON.
- Proposition (TER-D10) : dépôt par l'opérateur dans un dossier `depot/` du volume terrain, puis commande
  d'administration (même modèle que `geodata-reference.js`) qui calcule l'empreinte en flux et crée le traitement. Aucune
  URL distante n'est lue par le serveur (le plan l'interdit hors sources approuvées).

### 2.6 Tâches de fond (A6)

- `apps/api/src/lib/account-jobs.ts` et `mailer/outbox.ts` : boucles dans le processus API (file des courriels toutes les
  5 s, tâche horaire), état en base, 3 tentatives. Aucun gestionnaire de file (pas de pg-boss, BullMQ…), aucun
  `worker_threads` pour GeoData ; GeoData traite en synchrone borné (D-GD-10).
- Le plan exige des traitements asynchrones, reprenables, idempotents (empreinte d'entrée + configuration) et observables.
  Proposition : table `geodata_terrain_traitements` (entrées, paramètres, versions logicielles, progression, tentatives,
  sorties, motif d'échec) consommée par un travailleur séparé (`SELECT … FOR UPDATE SKIP LOCKED`), clé d'idempotence
  `sha256(empreintes d'entrée + configuration)`. L'API ne fait que lire.

### 2.7 Stockage durable (A7)

- **Aucun stockage objet**, ni en préproduction ni dans le code. Volumes nommés de `deploy/preprod/compose.yml` :
  `fadi-preprod-db` (base), `fadi-preprod-backups` (sauvegardes `scripts/backup.sh` via `fadi-preprod backup`),
  `fadi-preprod-out` (rapports). Le service `app` **n'a aucun volume** et « aucun montage de l'hôte ».
- Tous les fichiers de données sont aujourd'hui archivés tels quels en base (`geodata_fichiers.contenu bytea`, règle
  D-GD-29). Pour le terrain : une valeur `bytea` est bornée à 1 Go, chaque `pg_dump` recopierait les Go de rasters, et la
  base n'a que 1,5 Go de mémoire. **Conflit avec D-GD-29** → décision du maître d'ouvrage (TER-D5).
- Proposition : volume nommé `fadi-preprod-terrain` (lecture seule pour `app`, lecture-écriture pour le travailleur),
  arborescence adressée par empreinte `originaux/<sha256>`, `derives/<version>/<produit>.tif`, `depot/`, `travail/` ; la
  base garde la fiche, l'empreinte, la taille, le chemin et la politique d'accès ; une interface `StockageTerrain`
  (lire, écrire, vérifier l'empreinte) permet de passer plus tard à un stockage S3 (MinIO sur le VPS ou service externe)
  sans toucher au reste.
- Disque : « environ 139 Go libres sur `/mnt/data` » est **déclaré** par le maître d'ouvrage ; la racine des données
  Docker (`data-root`) du VPS n'est pas connue de cette session → **à constater** par la session VPS avant TER-02.

### 2.8 Déploiement (A8)

- `Dockerfile` : `node:22-bookworm-slim`, un seul processus `node apps/api/dist/server.js`, utilisateur `node` ; aucun
  binaire GDAL/PDAL. `deploy/preprod/compose.yml` : `app` 2 Go / 2 CPU, `db` 1,5 Go / 1,5 CPU, réseau `internal` isolé.
- Lecture numérique côté API sans GDAL : `geotiff` 3.0.5 (déjà dépendance) lit un COG par fenêtres et aperçus ; valeur au
  point, profil et statistiques d'emprise peuvent donc rester en Node, sans charger la grille entière.
- Traitements (reprojection, datum, aperçus, ombrage, pente, nuages de points) : GDAL / PDAL requis → service séparé
  `terrain-worker` (image épinglée par condensat, profil Compose, réseau `internal` seulement, limites mémoire propres),
  plutôt que d'alourdir l'image applicative (TER-D6).
- `proj4` 2.22 est déjà présent (API) ; `apps/api/src/lib/site-context.ts` définit `EPSG:26191` avec
  `+towgs84=31,146,47` (paramètres du prototype, précision non documentée). **Cette transformation n'est pas approuvée pour
  le terrain** : aucune donnée marocaine ne l'utilisera sans validation par un ingénieur géomètre-topographe habilité.
  Aucune altitude n'est traitée nulle part dans le code.
- Production : Release du maître d'ouvrage (`docs/deploiement-automatique.md`) — hors portée (TER-08).

### 2.9 Repères et intégrations métier (A9)

- `packages/domain-model/src/entities.ts` : `Coordinate` étiqueté `cadastral | geographic | local` ; conversions
  explicites. Le terrain ajoute une **dimension verticale** : toute altitude portera son datum vertical déclaré ; une
  hauteur ellipsoïdale non convertie par une transformation approuvée est mise en quarantaine, jamais réétiquetée.
- Parcours : contexte de site de l'étape 01 (`site-context.ts`, parcelle cadastrale EPSG:26191 / 2154) = flux « parcelle »
  du plan. Atelier : classe `terrain` (P2-6, `packages/atelier-model/src/batiment-p2.ts` : semis triangulé en repère local,
  altitude interpolée, `null` hors semis, jamais extrapolée) = point d'accueil d'une « référence de terrain versionnée »
  (origine, unités, transformation explicites). Ces deux intégrations touchent Parcours et l'Atelier, hors du noyau GeoData :
  elles ne font pas partie de TER-02 → TER-05 tels que délégués et seront proposées séparément.
- Aucun site Benslimane ni polygone d'AOI dans le dépôt ; le point 33.5315 N, 7.10621 W n'est pas une limite ; la parcelle
  P.118 n'est **pas** substituée (règle du plan).

### 2.10 Tests et CI (A10)

- Vitest par paquet (`packages/geodata-model` : 30 suites), suites API sous la garde DB-3
  (`scripts/check-api-tests-db3.mjs`, liste fermée, `apps/api/src/routes/geodata.test.ts`), recette navigateur
  `apps/web/e2e/geodata.mjs` (CI `ci.yml` l. 667), recette anglaise `interface-anglais.mjs`, frontières
  `scripts/frontieres.json`, test d'indépendance web `modules/geodata/independance.test.ts`, contrôle d'image
  (`ci.yml` l. 1300 : outils `geodata-*` présents dans l'image).

## 3. Jeu de référence proposé : Lucerne, MNT 2024 à 25 cm (vérification de licence)

Vérifié le 2 novembre 2026, **avant tout téléchargement** (aucun fichier téléchargé) :

| Élément | Constat | Source |
| --- | --- | --- |
| Produit | « Digitales Terrainmodell (DTM) 2024, 0.25m-Raster », identifiant `DTM24025_DS`, version 1 révision 2, mise à jour 28.02.2025, métadonnées 15.05.2026 ; MNS jumeau `DOM24025_DS` | https://daten.geo.lu.ch/produkt/aktuell/dtm24025_ds |
| Format, livraison | TIFF, **un seul fichier pour le canton** (`DTM24025_V1_RAS`) ; taille non publiée ; API STAC annoncée | idem |
| Licence | **Open-By** : usage non commercial **et** commercial permis sans autorisation ; reproduction et diffusion gratuites permises ; obligations transmises aux tiers | https://geoportal.lu.ch/Nutzungsbedingungen |
| Attribution | Obligatoire (GeoIV art. 30) : « © 2026, rawi Kanton Luzern » (année courante) ; imprimés : Kanton Luzern, Raum und Wirtschaft (rawi), www.geoportal.lu.ch | idem |
| Limites | Aucune garantie d'exactitude, d'actualité ni d'exhaustivité ; aucune portée juridique ; données modifiables ou retirables sans préavis | idem |
| Précision | Nuage de points : ≥ 16 points/m² hors végétation, ±20 cm en plan, ±10 cm en altitude ; **précision du raster 25 cm non publiée** | https://geoportal.lu.ch/3D/geodaten |
| Repère et datum | **Non publiés sur ces pages** (seulement « Höhe über Meer ») → à lire dans le fichier et à consigner ; rien n'est supposé | — |

Conséquences : la licence permet stockage, calcul, tuiles, export et usage commercial avec attribution → droits de la fiche
tous `autorise`, attribution obligatoire, `synthetique: false`, étiquette « Données suisses de démonstration — Canton de
Lucerne, jamais une couverture de Benslimane ». Le fichier cantonal entier dépasse probablement le budget disque (ordre de
grandeur : canton ≈ 1 494 km² → ≈ 24 milliards de cellules à 25 cm, ≈ 96 Go non compressés en Float32 ; **estimation**,
taille réelle à constater) : un **extrait** de 1 à 2 km² est nécessaire (TER-D3). La précision du raster n'étant pas
publiée, la qualité de la version sera « non évaluée » (aucun point de contrôle indépendant), jamais déduite de la
précision du nuage.

## 4. Architecture proposée (à valider par les décisions TER-Dx)

```
packages/geodata-model/src/terrain/   pur, sans React ni DOM : pente (unités H et V), profil (chaînage, ruptures de
                                      source, lacunes, échantillonnage « interpolé »), statistiques dans le polygone réel
                                      (trous compris, couverture valide %), RMSEz / biais / P95 |e_i| exactement comme au
                                      plan, cycle de vie, sélection de source documentée, datum vertical étiqueté
apps/api/src/lib/geodata/terrain/     catalogue, stockage (interface StockageTerrain → volume), lecture COG par fenêtres
                                      (geotiff), tuiles couleur / ombrage versionnées, file de traitements
apps/api/src/routes/geodata/terrain.ts  sous /geodata/api/terrain/… : jeux par emprise, point, profil, statistiques,
                                      export asynchrone, tuiles — mêmes droits par usage, 404 hors espace
apps/api/scripts/geodata-terrain.ts   commande d'import depuis `depot/` (empreinte en flux, aucune URL distante)
deploy/preprod : service terrain-worker (GDAL + PDAL épinglés), volume fadi-preprod-terrain
apps/web/src/modules/geodata/panneaux/Terrain*.tsx  contrôles, légende verrouillée / adaptative (portée affichée),
                                      panneau « Sources et précision », profil ; icône + Alt+… par commande (règle d'or)
```

Tables proposées (préfixe `geodata_`, aucune FK vers les projets) : `geodata_terrain_jeux` (lié à `geodata_sources`),
`geodata_terrain_versions` (lié à `geodata_versions` : type MNT / MNS, date de levé, pas source et livré, unités, CRS
horizontal, datum vertical, état du cycle de vie du plan), `geodata_terrain_fichiers` (clé de stockage, empreinte, format,
emprise, nodata, traitement, politique d'accès), `geodata_terrain_rapports_qualite` (points de contrôle et leur
incertitude, méthode, biais, RMSEz, P95, effectifs, lacunes, réviseur, décision), `geodata_terrain_traitements`.
Retour arrière : pointeur de version publiée + drapeau `GEODATA_TERRAIN_ENABLED`, originaux jamais effacés.

## 5. Répartition des tests obligatoires du plan

| Test du plan | Lot | Niveau |
| --- | --- | --- |
| Plan synthétique connu → pente et profil exacts | TER-03 (pur), TER-04 (API) | `geodata-model` + suite DB-3 |
| AOI trouée → statistiques dans le polygone réel | TER-04 | pur + API |
| Bords NoData, NoData ≠ 0 | TER-02 (validation), TER-04 | pur + API |
| Datum incompatible → quarantaine, jamais mélangé | TER-02 | API |
| Couture entre deux jeux, rupture de source signalée dans le profil | TER-03 / TER-04 | pur + API |
| Accès non autorisé (autre espace → 404, droit refusé → 403) | TER-04 | API DB-3 |
| Import raté préservant la version publiée | TER-02 | API DB-3 |
| Exports conservant CRS, datum et valeurs | TER-04 | API (relecture du GeoTIFF exporté) |
| Jeu réel (Lucerne) en intégration ; fixtures synthétiques étiquetées « test seulement » | TER-02 → TER-05 | API + recette |

## 6. Hors portée de la session

TER-01 (contacts fournisseurs, achats : seul le cahier [`TER-01-CAHIER-ACQUISITION.md`](TER-01-CAHIER-ACQUISITION.md) est
préparé, à compléter) ; TER-06 / TER-07 (levé réel et contrôle indépendant ; couche Benslimane haute résolution
indisponible tant que la porte G2 n'est pas passée) ; TER-08 (production = Release du maître d'ouvrage). Décisions :
[`DECISIONS.md`](DECISIONS.md).
