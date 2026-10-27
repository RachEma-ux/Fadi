# GeoData — exploitation et données

Module autonome des projets (ADR-GEODATA-01, ADR-GEODATA-02). Page `/geodata`, API `/geodata/api`, tables `geodata_*`.

## Configuration

| Variable | Effet | Défaut |
| --- | --- | --- |
| `GEODATA_ENABLED` | `false` ferme toute l'API GeoData (404) ; la page affiche alors ses états d'erreur. Désactivation fonctionnelle sans migration. | activé |
| `GEODATA_FONDS` | Fonds raster autorisés, JSON `[{ "id": "plan-x", "libelle": "…", "tuiles": ["https://…/{z}/{x}/{y}.png"], "attribution": "…", "export": false, "zoomMax": 19 }]`. Ne déclarer qu'un fournisseur dont les conditions (usage, quotas, attribution, export) sont qualifiées. Une entrée invalide est ignorée. | fond neutre seul |
| `GEODATA_TILE_RATE_LIMIT` | Requêtes de tuiles par minute et par adresse. | 3000 |

Aucun géocodeur externe n'est appelé (D-GD-05) : recherche locale des unités et coordonnées « lon … lat … ».

## Rôles GeoData

Trois rôles distincts, jamais déduits d'un rôle de projet ou de plateforme : `gestionnaire-donnees` (prépare),
`responsable-publication` (publie, retire), `administrateur` (attribue les rôles par l'API `/geodata/api/admin/roles`).
Aucun n'implique les autres. Désigner d'abord les **comptes Fadi** (adresses de connexion) qui les reçoivent.

## Outils d'exploitation (image de production)

Les deux outils sont compilés dans l'image, à côté du serveur, comme `create-admin.mjs`, et s'exécutent avec la base et
le compte applicatif du conteneur (`DATABASE_URL`, sans DDL) — aucun secret à recopier :

```sh
# Rôles (amorçage ; ensuite l'administrateur GeoData passe par l'API)
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-role.js --email <compte> --role administrateur
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-role.js --email <compte> --role gestionnaire-donnees
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-role.js --email <compte> --role responsable-publication

# Limites administratives du Maroc (HCP, RGPH 2024) : préparation (rapport de contrôle affiché), puis publication après examen.
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-reference.js --fiche hcp-rgph2024-population-regions --preparateur <gestionnaire>
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-reference.js --fiche hcp-rgph2024-population-regions --preparateur <gestionnaire> --publier-par <responsable>

# Toutes les fiches livrées d'un coup (HCP, OpenStreetMap, OurAirports, rasters) : une déjà importée n'est pas recréée.
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-reference.js --fiche toutes --preparateur <gestionnaire> --publier-par <responsable>
```

En préproduction, le conteneur s'appelle `fadi-preprod-app-1` (`sudo docker exec fadi-preprod-app-1 node apps/api/dist/…`).
Le contrôle CI `image` exécute `geodata-role.js` dans le conteneur construit et vérifie la présence des fiches.

## Chaîne d'import de référence (D-GD-04, D-GD-07)

Réception → empreinte SHA-256 comparée à la fiche → lecture (GeoJSON CRS84, ou GeoPackage EPSG:4326 lu sans GDAL) →
contrôles (validation partagée, codes texte uniques et présents) → version **en préparation** → publication séparée
(un droit `inconnu` pour la consultation ou les tuiles, ou des contrôles en échec, bloquent la publication).

- `--fiche` : chemin d'une fiche, ou nom d'une fiche qualifiée (`docs/geodata/sources/<nom>.json`, embarquées dans
  l'image sous `apps/api/dist/geodata-sources/`). Sans `--fichier`, la donnée est téléchargée depuis l'adresse de la fiche
  et son empreinte vérifiée.
- **Relance** : une empreinte déjà importée pour la même source ne crée pas de nouvelle version ; avec `--publier-par`,
  la version restée **en préparation** est alors publiée, aux mêmes conditions (rôle, contrôles réussis, droits). La
  publication peut aussi se faire par l'API : `POST /geodata/api/admin/versions/:id/publier` (compte responsable).
- Attendu pour le pilote : ADM1 12 unités, empreinte `6c4e3e25…129f` ; ADM2 75 unités, empreinte `5b3f09cb…1714`. Ces
  limites représentent l'année 2017 (geoBoundaries, d'après OpenStreetMap) : elles ne sont pas un découpage officiel.

Développement (dépôt complet) : `npm run geodata:role --workspace=@fadi/api -- …` et
`npm run geodata:import-reference --workspace=@fadi/api -- --fiche <nom ou chemin> …`.

Fiches de source : `docs/geodata/sources/*.json` (producteur, adresse, empreinte, période, licence, attribution, droits par
usage, précision, conditions). Le jeu `apps/api/test-corpus/geodata/synthetique-unites.*` est **synthétique** (tests et
recette uniquement), n'est pas embarqué dans l'image et ne doit jamais être publié sur un environnement réel.

## Sources ouvertes livrées avec leurs données (D-GD-12)

Couches vectorielles d'OpenStreetMap (ODbL) et d'OurAirports (domaine public), préparées par
`scripts/geodata/extraire_sources.py` (pyosmium ; extraits PBF régionaux d'OpenStreetMap, empreinte et date consignées) :
objets restreints au territoire de geoBoundaries MAR ADM1, GeoJSON déterministe dans `docs/geodata/sources/donnees/`,
fiche qualifiée à côté (`version.fichier`, empreinte contrôlée à l'import, aucun téléchargement en production). Une couche
de plus de 5 000 objets n'est pas écrite (borne V1) ; les couches raster (relief, climat, sols, imagerie) n'entrent pas
dans GeoData V1. Ces données sont collaboratives : ni exhaustives ni officielles.

## Catégories du catalogue et disposition (D-GD-14)

La carte occupe tout l'espace. En haut à gauche : bouton « Données » (catalogue en surimpression : sections par
catégorie repliables, compte « actives / total », bascule Vecteurs / Imagerie ; onglets Couches et Légende). Barre
d'outils verticale **flottante**, à droite par défaut (zoom, nord, position, plein écran, mesurer une distance ou une
surface, zone, annotation, légende) : la poignée du haut la déplace (glisser ou flèches du clavier, double-clic pour la
remettre à droite) ; elle reste dans la carte et sa position est mémorisée dans ce navigateur. En haut à
droite : menu ☰ — Données, Mes cartes, Études, Importer, Exporter.

Menu ☰ → « Données » : catégories communes à tous les comptes. Avec le rôle « gestionnaire-donnees » (ou
« administrateur ») : créer, renommer, monter / descendre, supprimer une catégorie ; ranger une couche commune dans une
catégorie, l'en déplacer ou l'en retirer (elle revient alors à son thème). Supprimer une catégorie ne supprime aucune
couche. API : `GET/POST /geodata/api/categories`, `PATCH/DELETE /categories/:id`, `PUT /categories-ordre`,
`PUT /categories/:id/sources/:sourceId`, `DELETE /categories-sources/:sourceId` ; chaque modification est journalisée.

## Contours et limites administratives (D-GD-16)

Le contour d'une entité prend sa couleur (couleur unie ou une couleur par entité) et reste opaque même
quand l'opacité du remplissage est à 0 % : régler l'opacité à 0 % montre les seules limites. Les contours passent
au-dessus de tous les remplissages. Entre couches de limites administratives, la région est au-dessus (contour le plus
épais), puis la province, puis la commune, quel que soit l'ordre des couches ; le rang vient de la source (ADM1, ADM2,
niveau administratif OpenStreetMap).

## Sélection par nombre de clics (D-GD-34)

Des clics rapides au même endroit de la carte montrent les niveaux un par un, du plus élémentaire au plus global :
1 clic → commune, 2 → province / préfecture, 3 → région (délai du navigateur, ~300 ms ; au-delà, ou si le pointeur a
bougé, on recommence). Couches de limites visibles : seuls leurs niveaux comptent (provinces et régions chargées :
1 clic → province, 2 → région) ; l'entité du premier clic est celle touchée dans la couche du plus petit niveau, ses
parents sont lus de la hiérarchie des codes HCP en base. Carte vierge : les unités du pays courant qui contiennent le
point (`GET /territoires/:pays/point?lon=&lat=`) ; l'entité est affichée seule (contour et mise en évidence), sans
couche ajoutée. Le double-clic et la double-tape ne zooment plus ; un clic hors de toute entité efface la sélection ; les
outils (dessin, mesure) gardent leurs clics. Logique pure : `geodata-model/src/selection-clics.ts`.

## Régions et provinces construites à partir des communes (D-GD-33)

Les contours des régions et des provinces / préfectures ne viennent plus d'une source indépendante : ils sont **construits
par union des communes** OpenStreetMap rattachées à leur code HCP (`scripts/geodata/construire_niveaux.py`, appelé en fin
de `preparer_hcp.py` ; relançable seul : `python3 scripts/geodata/construire_niveaux.py [--intervalle 20] [--mapshaper …]`,
mapshaper via npm). La topologie partagée est accrochée, simplifiée **une seule fois** (intervalle 20 m, petites formes
conservées) et nettoyée ; province = union des communes de son code, région = union des provinces. Les tuiles
(`/tuiles/:couche/:z/:x/:y`) et le contour du territoire (`/territoires/…`) ne simplifient plus séparément : une limite de
région ou de province se superpose exactement aux limites des communes à tout zoom. Comptes et contrôles (lacunes,
chevauchements, communes sans contour) : `docs/workstreams/geodata/CONTOURS-NIVEAUX.md`. Le fichier des communes peut
être remplacé par un fichier officiel du HCP sans changer la logique.

## Navigation par niveaux (D-GD-19 ; barre territoriale du lot H)

Le fil « Maroc › Région › Province » du lot B est remplacé par la barre territoriale permanente (lot H, D-GD-28,
ci-dessous), lue en base. Restent du lot B : « Voir ses … » dans la fiche d'une entité (Alt+↓ ; nom du niveau inférieur
lu dans le découpage en base, jamais dans le code), Retour (Alt+↑) et le filtrage des couches de la carte par le chemin
courant — pour les seules couches dont la version forme le découpage du pays courant. Une couche à codes HCP sans
découpage en base garde le repli du lot B (chemin lu dans les couches).

## Import automatique au déploiement et quittance (D-GD-23)

Avec `GEODATA_IMPORT_AUTO_PAR=<compte GeoData>` (préproduction : `PREPROD_GEODATA_IMPORT_AUTO_PAR` dans
`/opt/fadi-preprod/env/.env.preprod`), l'API importe et publie au démarrage, en arrière-plan, les fiches livrées qui ne
sont pas encore en base (même empreinte = rien n'est refait), puis applique les retraits de
`sources/donnees/retraits-sources.json`. État : `GET /version/donnees` (`desactive`, `en-cours`, `termine` + bilan,
`echec` + dernière erreur). Les imports manuels (`geodata-reference.js --fiche …`) restent possibles.

## Libellés sur la carte (lot C, D-GD-24)

Case « Libellés » de chaque couche (panneau Couches) ou bouton « Libellés » de la barre d'outils (Alt+L, toutes les
couches vectorielles visibles) : le nom de chaque entité, et rien d'autre (la valeur de l'indicateur actif est un texte
distinct, D-GD-32 ci-dessous). Points d'étiquette : `GET /geodata/api/etiquettes/:couche/:z/:x/:y`. Glyphes : Noto Sans
Regular (OFL), plages latines, servis par l'application (`/geodata/glyphes/…`, licence `/licences/noto-sans/`).

## Coloration des couches (D-GD-32)

La liste « Coloration » d'une couche ne propose que deux modes de style : **Couleur unie** et **Une couleur par entité**.
Aucun indicateur ne s'y choisit et aucun code ne colore une couche d'après un indicateur : la classification par classes
du lot D (D-GD-25) est retirée de l'interface ; une carte enregistrée avant D-GD-32 avec une coloration thématique
revient à la couleur unie à l'ouverture (`sansColorationThematique`). Les fonctions pures de classification et de
palettes restent dans `geodata-model` (sans usage dans l'interface).

## Rubrique « Indicateurs » du catalogue (lot F, D-GD-26 ; D-GD-31, D-GD-32)

Catalogue › Vecteurs › **Indicateurs** (après « Géologie », même style que les autres rubriques) : recherche sans accents
ni casse (chaque mot au début d'un mot ; Échap vide la recherche), neuf thèmes avec leurs compteurs puis les familles,
réunion des indicateurs de toutes les couches vectorielles du catalogue. Le choix d'un indicateur se fait **uniquement**
ici. Choisir une famille rend sa déclinaison (modalité, milieu, sexe réglables en dessous) active sur **toutes** les
couches chargées qui portent cet indicateur (reconnu par sa clé thème / famille / modalité / milieu / sexe, jamais par son
identifiant) ; un seul indicateur actif à la fois ; une couche chargée ensuite le reçoit aussi. L'indicateur ne recolore
**jamais** la couche : sa **valeur** s'affiche, abrégée, sur chaque entité, dans un texte propre (couche de rendu
`-valeurs`, sous le point d'étiquette), tant que la case « Afficher l'indicateur — [nom] » de la carte de couche est
cochée (cochée par défaut, y compris sur une couche chargée après ; décochée : valeurs masquées, indicateur mémorisé ;
une couche retirée puis rechargée repart cochée). « Libellés (nom) » et « Afficher l'indicateur » sont deux textes
indépendants (nom au-dessus du point, valeur au-dessous), sans état ni logique partagés : aucun texte, nom seul, valeur
seule ou les deux. L'indicateur actif n'est pas enregistré avec la carte. Hors périmètre : choix de l'entité par la barre
territoriale, multi-indicateurs.

## Mini-carte de situation et impression (lot G, D-GD-27)

Barre d'outils : « Mini-carte de situation » (Alt+M) montre l'emprise de la vue sur les limites administratives ; un clic
y recentre la carte. « Imprimer la carte » (Alt+I) imprime une carte enregistrée, après le même contrôle des droits que
l'export ; la mini-carte figure en encart si elle est affichée.

## Navigation territoriale (lot H, D-GD-28)

Au-dessus de la carte, en permanence : pays, puis une liste par niveau (Région › Province ou préfecture › Commune ›
Arrondissement pour le Maroc) et Retour (Alt+↑). Elle ne dépend d'aucune couche affichée : le découpage est en base
(`geodata_pays`, `geodata_territoires`), chargé par la chaîne d'import depuis les fiches qui déclarent `territoire`
(`pays`, `nomPays`, `rang` 1–4, `niveau` { `singulier`, `pluriel` }, `parent` : `codes-hcp` ou `inclusion`). API :
`GET /geodata/api/territoires`, `…/territoires/:pays/unites?parent=`, `…/territoires/:pays/unites/:code?rang=`
(ancêtres, nombre d'enfants, contour simplifié, attribution).

## Une seule source par niveau administratif (D-GD-30)

Sous « Limites administratives », une couche par niveau : régions, provinces et préfectures, communes, arrondissements
(RGPH 2024). Chaque couche porte tous les contours d'origine (geoBoundaries pour régions et provinces, OpenStreetMap
pour communes et arrondissements) avec les noms, codes et valeurs du HCP là où le rattachement existe ; un contour sans
rattachement garde ses attributs d'origine. Les fiches geoBoundaries sont dans `sources/references/` (contours pour
`preparer_hcp.py`, jamais importées) et leurs anciennes versions sont retirées par `donnees/retraits-sources.json`.
Les métadonnées d'une source (titre, thème…) suivent la fiche à chaque démarrage, même sans nouvelle version.

## Interface et base de données (D-GD-29)

L'application ne contient aucune donnée : elle lit la base par l'API. Au démarrage de l'API, l'outil d'import copie
chaque fichier livré du dossier `docs/geodata/sources/` dans `geodata_fichiers` (rôle `fiche`, `donnees`,
`correspondance`, `extrait` ou `declaration` ; SHA-256 ; contenu compressé par PostgreSQL), puis prépare et publie
toutes les fiches livrées **par la livraison elle-même** (`--livraison`, aucun compte ni réglage :
`preparee_par` / `publiee_par` nuls, journal « livraison »), applique les retraits déclarés et écrit le découpage
territorial. `GEODATA_IMPORT_AUTO_PAR=<courriel>` fait la même chose au nom d'un compte GeoData ;
`GEODATA_IMPORT_AUTO=non` coupe tout (CI). À la main : `node apps/api/dist/geodata-reference.js --archiver --fiche toutes
--livraison`. Base neuve sans compte : 53 versions, 121 fichiers, découpage MA en 61 s ; redémarrage 1 s.

## Fiche territoriale (D-GD-22)

La fiche d'une entité range ses indicateurs par thème ; une famille déclinée devient un tableau (modalités ×
milieu × sexe ; « … » sans objet, « . » non publiée, motif au survol). La fiche d'une commune donne les chiffres de ses
arrondissements ; celle d'une commune rurale, ses douars (annexe `donnees/hcp-rgph2024-douars.tsv` de la fiche des
communes, table `geodata_douars`, noms en arabe tels que publiés). « Imprimer la fiche » (Alt+P) imprime la fiche seule.

## Fonds de carte et fournisseurs (D-GD-15)

Paramètres → « Fournisseurs de fonds de carte » : MapTiler est intégré et fournisseur par défaut (Satellite, Satellite et
noms, Plan, Topographique), avec la clé saisie dans « Connexion MapTiler ». « Ajouter un fournisseur » saisit un autre
service par son adresse de tuiles XYZ en https (`{z}`, `{x}`, `{y}`, et `{cle}` avec sa clé), son attribution et un zoom
maximal facultatif ; chaque fournisseur se modifie, se désactive ou se supprime (MapTiler se désactive seulement), et le
fournisseur par défaut se choisit (ou le fond neutre). Ces réglages et les clés restent dans le navigateur : la carte
enregistrée ne garde que l'identifiant du fond. Une nouvelle carte s'ouvre sur le premier fond du fournisseur par défaut
quand sa clé est présente. Un fond de fournisseur n'est pas exportable (conditions non établies) : exporter sur le fond
neutre.

## Couches raster (D-GD-13)

Fiche avec `couche.raster` (`unite`, `grandeur`, `palette` parmi `viridis`, `relief`, `precipitations`, `temperature`,
`vegetation`, `sols`, `population`, `energie`, `eau`, `gris` ; `min`/`max` facultatifs, sinon 2ᵉ et 98ᵉ centiles ; ou
`classes` `{ valeur, libelle, couleur }`) et données GeoTIFF mono-bande en EPSG:4326. La grille est ramenée au plus à
4 000 000 cellules (plus proche voisin, consigné dans la version), stockée figée, servie en tuiles PNG
(`/geodata/api/raster/:couche/{z}/{x}/{y}.png`, droit « tuiles » exigé) ; `GET /geodata/api/raster/:couche/valeur?lon&lat`
donne la valeur au point (`null` = non évaluée). Sur la carte : légende en dégradé ou par classes, toucher la carte lit la
valeur de la couche raster visible la plus haute.

Population légale RGPH 2024 du HCP (D-GD-17) : fichiers de hcp.ma sous CC BY 4.0, rattachés aux contours par
`scripts/geodata/preparer_hcp.py --excel <fichier HCP>` ; tables de correspondance dans `sources/correspondances/`
(une ligne par rattachement, méthode et statut ; `hcp-rgph2024-communes-manuel.csv` pour les liens relus à la main, avec
leur justification). Quatre fiches : `hcp-rgph2024-population-regions`, `-provinces`, `-communes` et
`hcp-rgph2024-arrondissements` (lot A2 : `--indicateurs <fichier HCP>` ajoute les 648 indicateurs démographiques et
socio-économiques, livrés dans un tableau `donnees/<clé>.csv` déclaré par `version.tableau` ; « … » = sans objet,
« . » = non publiée, jamais zéro). Contours des arrondissements : OpenStreetMap niveau 10
(`donnees/osm-mar-arrondissements.geojson`, extrait par `extraire_sources.py`, sans fiche propre : il ne sert qu'au
rattachement). Indicateurs communaux complémentaires (D-GD-20) : `--logement`, `--transport` et `--cee` ajoutent le parc
de logement urbain 2024, le mode de transport domicile – travail (RGPH 2024) et la CEE 2023/2024 (lecture :
`scripts/geodata/sources_hcp_communales.py`). Priorité HCP (D-GD-18) : quand une donnée existe dans le HCP et dans OpenStreetMap, celle du HCP est
retenue ; les extraits OSM des communes, villes et arrondissements n'ont plus de fiche importable (fiches consignées dans
`donnees/osm-extraits.json`) et la couche `hcp-rgph2024-villes` porte les effectifs du HCP sur les points OSM.
Un indicateur « Superficie calculée » est produit par GeoData (ellipsoïde WGS 84) : c'est un résultat calculé, pas une
superficie officielle.

## Sauvegarde, restauration, retrait

- Les tables `geodata_*` sont dans le schéma `public` : couvertes par les sauvegardes et la restauration existantes de la
  base (`scripts/backup.sh`, `scripts/verify-restore.sh`) ; les fichiers de référence ne sont pas stockés (adresse et
  empreinte conservées : retéléchargement vérifiable). Les fiches d'export (HTML) sont en base, expirées après 30 jours.
- Une version publiée est immuable et ne s'efface pas (déclencheurs) ; un retrait (`POST /geodata/api/admin/versions/:id/retirer`,
  motif obligatoire) rend son contenu inaccessible, les cartes gardent la référence et affichent le motif.
- Retour arrière applicatif : `GEODATA_ENABLED=false` ; les tables additives restent en place (aucune perte de cartes).

## Journal

`geodata_journal` : acteur, action, ressource, résultat — jamais de coordonnée, de contenu de fichier ni de secret.
