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

# Limites geoBoundaries du Maroc : préparation (rapport de contrôle affiché), puis publication après examen.
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-reference.js --fiche geoboundaries-mar-adm1 --preparateur <gestionnaire>
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-reference.js --fiche geoboundaries-mar-adm1 --preparateur <gestionnaire> --publier-par <responsable>
# (idem avec geoboundaries-mar-adm2)

# Toutes les fiches livrées d'un coup (geoBoundaries, OpenStreetMap, OurAirports) : une déjà importée n'est pas recréée.
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

Sources non publiées faute de droits établis : population HCP RGPH 2024 (conditions de réutilisation non qualifiées).
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
