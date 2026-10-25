# GeoData — Évaluation du plan fourni et plan d’implémentation retenu

Date : 2026-10-25 (UTC). Chantier : `geodata`. Issue de cadrage : #243 (concept fusionné par la PR #245).
Décision d’exécution : [ADR-GEODATA-02](../../continuity/decisions/ADR-GEODATA-02.md) (délégation totale réactivée).

## 1. Évaluation du plan fourni (« Fadi Concept — GeoData — Plan d’implémentation », v1.0 du 25/10/2026)

### 1.1 Points forts, repris tels quels

| Élément | Appréciation |
| --- | --- |
| Invariants INV-01 à INV-10 | Justes et vérifiables ; ils deviennent les assertions des tests (API, statiques et recette). |
| Jalons J1 / J2 / J3 | Bonne séparation « première carte », « V1 fonctionnelle », « mise en service » ; évite la V1 « en apparence ». |
| Matrice GEO 01–13 → lots | Traçabilité complète ; reprise dans la recette (section 5). |
| Droits par usage (consulter, calculer, tuiles, exporter, télécharger, partager) | Indispensable : un droit `inconnu` bloque l’usage concerné ; repris dans le modèle pur. |
| Versions immuables, retrait sans substitution | Repris : déclencheur SQL, références conservées, indisponibilité expliquée. |
| Révision attendue obligatoire (INV-10, GEO 13) | Repris : écriture atomique `UPDATE … WHERE revision = $attendue`, 409 détaillé. |

### 1.2 Écarts avec le dépôt réel (constatés à `main@0ff0638`)

| # | Constat dans le dépôt | Conséquence sur le plan fourni |
| --- | --- | --- |
| E1 | La SPA et l’API partagent l’origine ; `API_PREFIX` (`apps/api/src/app.ts`) décide du repli SPA. Une page `/geodata` et une API `/geodata/maps` se confondraient (sous-pages du client). | API montée sous **`/geodata/api/*`** ; la page reste `/geodata`. |
| E2 | Schéma unique idempotent `apps/api/src/db/init.sql` ; le bloc des droits D-7 ne couvre que les schémas `public`, `auth`, `admin`. | Pas de schéma dédié (il faudrait rouvrir D-7) : **tables préfixées `geodata_`** dans `public`, sans aucune FK vers les projets (D-GD-02). |
| E3 | Les suites API sont soumises à la garde DB-3 et à la liste fermée `scripts/check-api-tests-db3.mjs`. | Toute nouvelle suite API s’inscrit dans cette liste ; non prévu par le plan fourni. |
| E4 | Le build échoue si une famille lourde entre dans le bundle initial (`carte-morceaux.ts`). | MapLibre devient une famille contrôlée, chargée à la demande, interdite au démarrage. |
| E5 | Le Sandbox fournit déjà le modèle d’un module autonome : route propre, test d’indépendance, `scripts/frontieres.json`. | GeoData reprend ce modèle (9ᵉ module) au lieu d’inventer un dispositif. |
| E6 | Règle Fadi : une validation exécutée au navigateur et au serveur partage le même code pur versionné. | Ajout d’un paquet pur **`packages/geodata-model`**, absent du plan fourni. |
| E7 | Interface bilingue (D-163) : tout texte français reçoit sa traduction dans `en.json`. | Chaque texte de GeoData est traduit ; la recette anglaise le contrôle. |
| E8 | La production n’est publiée que par une Release GitHub du maître d’ouvrage (`docs/deploiement-automatique.md`). | GD-11 « production » sort de la délégation : la session prépare, le maître d’ouvrage publie. |

### 1.3 Faiblesses du plan fourni

- **Organisation humaine supposée** (designer, référent données, responsable de publication distincts, prototypes testés par
  un utilisateur) : sous délégation, ces rôles sont tenus par la session ; les jalons demandant un humain (GD-10 recette
  utilisateur, GD-11 production) restent explicitement ouverts.
- **Douze lots séquentiels** dont trois purement documentaires (GD-00, GD-01 et une partie de GD-03) : trop lent pour un
  module dont le concept est déjà fusionné. Regroupés ci-dessous en cinq incréments vérifiables.
- **Infrastructure spéculative** (traitements asynchrones, serveur de tuiles séparé, stockage objet) : non justifiée par des
  mesures. Les volumes V1 (12 régions, 75 provinces, imports ≤ 5 Mo) tiennent en traitement synchrone borné avec états
  durables ; le plan fourni lui-même dit « mesurer avant d’introduire un serveur de tuiles ».
- **Données** : le plan reste sur des « sources candidates ». Une source ouverte réelle et vérifiable existe :
  **geoBoundaries MAR ADM1/ADM2** (ODbL 1.0, dérivée d’OpenStreetMap, empreintes SHA-256 contrôlées). Elle est retenue
  pour le pilote ; les jeux synthétiques ne servent qu’aux tests et sont marqués comme tels.
- **Export** : laissé ouvert (« PNG + HTML ou PDF »). Tranché : image PNG composée au navigateur (carte, légende, échelle,
  attributions) **après** un verdict serveur des droits, et fiche de sources HTML produite et conservée par le serveur.
- **Géocodage** externe : aucun fournisseur n’est autorisé ni chiffré. V1 : recherche locale des unités et coordonnées
  explicites ; l’adaptateur est prévu mais aucun appel externe n’est fait.

## 2. Décisions de conception (D-GD, tranchées sous délégation, détail dans ADR-GEODATA-02)

| ID | Décision |
| --- | --- |
| D-GD-01 | ADR-GEODATA-01 reste la décision de périmètre ; GeoData devient le 9ᵉ module (`docs/architecture.md`). |
| D-GD-02 | Tables `geodata_*` dans `public`, migrations dans `init.sql` (idempotentes), aucune FK vers `projects`. |
| D-GD-03 | Moteur **MapLibre GL JS 6.12.0** (BSD-3-Clause), chargé à la demande ; repli sans WebGL : recherche, table et fiches. |
| D-GD-04 | Pilote : geoBoundaries MAR ADM1 (12 régions) et ADM2 (75 provinces / préfectures), ODbL 1.0 ; indicateur « superficie calculée » (résultat calculé, méthode déclarée). Population HCP : droits de réutilisation non établis → **non publiée**. |
| D-GD-05 | Fond par défaut **neutre** (aucun fournisseur externe) ; fonds raster seulement s’ils sont configurés (`GEODATA_FONDS`), avec attribution ; aucun géocodeur externe en V1. |
| D-GD-06 | Échanges en WGS 84 longitude puis latitude (CRS84) ; coordonnées saisies **étiquetées** (`lon … lat …`), sinon refus ; mesures sur l’ellipsoïde (PostGIS `geography`) côté serveur, sphère moyenne indicative côté client. |
| D-GD-07 | Import utilisateur GeoJSON ≤ 5 Mo, ≤ 5 000 objets, ≤ 200 000 sommets ; import de référence GeoJSON / GeoPackage (EPSG:4326 seulement) par la chaîne administrative `geodata:import-reference`. |
| D-GD-08 | Versions publiées immuables ; retrait tracé avec motif ; imports non confirmés expirés après 24 h ; fiches d’export 30 jours. |
| D-GD-09 | V1 privée : aucun partage ; le modèle réserve les rôles d’espace collectif sans afficher d’action inopérante. |
| D-GD-11 | Style « une couleur par entité » : palette qualitative de 12 couleurs, voisins distincts au-delà de 12 unités (graphe de voisinage calculé au serveur) ; rien n'est enregistré dans la composition hors le mode. |
| D-GD-12 | Couches de sources d'origine ouvertes (OpenStreetMap ODbL, OurAirports domaine public), données livrées avec leur fiche ; raster, > 5 000 objets et droits non établis écartés. |
| D-GD-13 | Couches raster : GeoTIFF EPSG:4326, grille ≤ 4 M cellules figée, tuiles PNG serveur, palette ou classes déclarées, valeur au point, nodata transparent et « non évalué ». |
| D-GD-10 | Traitements synchrones bornés, état durable en base, journal `geodata_journal` sans coordonnées. |

## 3. Plan retenu — cinq incréments

| Incrément | Lots du plan fourni couverts | Contenu | Preuve de sortie |
| --- | --- | --- | --- |
| **I1 — Socle** | GD-00, GD-01, GD-02 | Évaluation, décisions, paquet pur `@parcours/geodata-model`, tables `geodata_*`, espace personnel idempotent, rôles GeoData, journal | Tests purs ; migration rejouée deux fois sur PostGIS ; tests API isolation (INV-01 à INV-05) |
| **I2 — Données et consultation** | GD-03, GD-04 | Chaîne d’import de référence (fiche de source, empreinte, contrôles, préparation → publication séparées), catalogue, recherche, tuiles MVT autorisées, table paginée, fiche d’objet, valeurs avec motif d’absence | Import réel geoBoundaries ; tests GEO 06, 07, 08, 10 |
| **I3 — Carte et persistance (J1)** | GD-05, GD-06 | Page `/geodata` (Catalogue / Couches / Légende, recherche, fiche, table, fonds, échelle, attributions, repli WebGL), Mes cartes, collections, révisions et conflits | Tests GEO 01, 02, 05, 13 ; recette navigateur |
| **I4 — Outils (J2)** | GD-07, GD-08, GD-09 | Import GeoJSON personnel (aperçu, diagnostic, confirmation), mesures, zones et annotations, analyse « superficie et unités intersectées », export PNG + fiche de sources | Tests GEO 07, 08, 09, 10 ; recette import → analyse → export |
| **I5 — Recette et mise à disposition** | GD-10, GD-11 (préproduction) | Recette `geodata.mjs` en CI, interface anglaise, clavier, mobile, frontières, documentation d’exploitation, PR, CI verte, fusion | CI verte sur le HEAD ; production = Release du maître d’ouvrage |

## 4. Architecture de réalisation

- `packages/geodata-model` : coordonnées étiquetées, mesures géodésiques indicatives, format de composition
  `geodata-composition/1`, classification (seuils, absence distincte), validation GeoJSON (CRS, plages, limites),
  capacités et droits par usage. Aucun import de React, du DOM ni d’un autre module.
- `apps/api/src/routes/geodata/` montée sous `/geodata/api` ; `apps/api/src/lib/geodata/` (SQL, import, analyses, export) ;
  `apps/api/scripts/geodata-*.ts` (import de référence, rôles).
- `apps/web/src/modules/geodata/` : page, panneaux, client minimal `client.ts` (seul fichier qui appelle le serveur, et
  seulement `/geodata/api`), moteur `carte/moteur-maplibre.ts` chargé à la demande ; test d’indépendance.
- Frontières : `scripts/frontieres.json` (GeoData n’importe ni projets, ni Parcours, ni Atelier, ni Studio, ni Sandbox, ni
  le client d’API général ; aucun module ne l’importe).

## 5. Traçabilité GEO → preuves prévues

| Critère | Preuve |
| --- | --- |
| GEO 01, 02 | Suite API (compte sans projet) + recette navigateur (`/geodata` direct, aucun sélecteur de projet) |
| GEO 03 | Suite API : création puis suppression d’un projet sans rapport, ressources GeoData inchangées |
| GEO 04 | Tests statiques : aucun `projectId` / `project_id` dans le noyau GeoData (API, web, paquet, SQL `geodata_*`) |
| GEO 05 | Suite API + recette : composition relue identique (seuils, indicateur, versions) |
| GEO 06 | Paquet pur + suite API : zéro et absence distincts (valeur, légende, fiche) |
| GEO 07 | Paquet pur + suite API : CRS projeté / inconnu refusé, aucune transformation devinée |
| GEO 08 | Suite API : carte, zone, analyse, import, tuile privée et fiche d’export d’un tiers → 404 |
| GEO 09 | Suite API : couche à droit d’export `refuse` ou `inconnu` → export refusé et motivé |
| GEO 10 | Suite API : seconde version publiée ; analyse et carte gardent la première, analyse marquée « source plus récente » |
| GEO 11 | Recette : WebGL désactivé → message, recherche et table utilisables |
| GEO 12 | Recette : parcours clavier et largeur téléphone (axe-core sans violation critique) |
| GEO 13 | Suite API + recette : second enregistrement périmé → 409, travail local conservé |

## 6. Hors délégation / restant ouvert

- Mise en production `www.fadimmo.com` : Release GitHub du maître d’ouvrage.
- Recette métier par un utilisateur réel et validation des appareils cibles physiques.
- Population HCP RGPH 2024 et autres sources : publication seulement après qualification écrite des droits.
- Partage nominatif, espaces collectifs, KML/KMZ/Shapefile, analyses avancées : V1.1 ou V2.
