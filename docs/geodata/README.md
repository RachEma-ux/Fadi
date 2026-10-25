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
Amorçage du premier compte :

```sh
npm run geodata:role --workspace=@fadi/api -- --email <courriel> --role administrateur
```

## Chaîne d'import de référence (D-GD-04, D-GD-07)

Réception → empreinte SHA-256 comparée à la fiche → lecture (GeoJSON CRS84, ou GeoPackage EPSG:4326 lu sans GDAL) →
contrôles (validation partagée, codes texte uniques et présents) → version **en préparation** → publication séparée
(un droit `inconnu` pour la consultation ou les tuiles, ou des contrôles en échec, bloquent la publication). Une empreinte
déjà importée pour la même source ne crée pas de nouvelle version.

```sh
# Pilote réel : limites geoBoundaries du Maroc (ODbL 1.0), téléchargées depuis l'adresse de la fiche et vérifiées.
npm run geodata:import-reference --workspace=@fadi/api -- --fiche ../../docs/geodata/sources/geoboundaries-mar-adm1.json --preparateur <gestionnaire>
npm run geodata:import-reference --workspace=@fadi/api -- --fiche ../../docs/geodata/sources/geoboundaries-mar-adm2.json --preparateur <gestionnaire>
# puis publication par un responsable : POST /geodata/api/admin/versions/:id/publier (ou --publier-par <responsable>)
```

Fiches de source : `docs/geodata/sources/*.json` (producteur, adresse, empreinte, période, licence, attribution, droits par
usage, précision, conditions). Le jeu `apps/api/test-corpus/geodata/synthetique-unites.*` est **synthétique** (tests et
recette uniquement) et se déclare comme tel partout (catalogue, fiche, export).

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
