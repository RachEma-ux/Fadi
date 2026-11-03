# Modèles régionaux du terrain — licences vérifiées et première comparaison (TER-D4)

Date : 2 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381.
Décision du maître d'ouvrage du 2 novembre 2026, relayée par la session VPS « Fadi VPS - Audit » : voir
[`DECISIONS.md`](DECISIONS.md), TER-D4.

## 1. Licences et conditions, lues avant tout téléchargement

### GEDTM30 — MNT terrain nu régional (remplace TessaDEM)

| Élément | Constat | Source |
| --- | --- | --- |
| Titre | Global Ensemble Digital Terrain Model 30m (GEDTM30) | Zenodo |
| Producteur | OpenGeoHub — Yufeng Ho, Tom Hengl | Zenodo |
| Version retenue | **v1.2.0** (recommandée par le dépôt Codeberg), publiée le 6 mars 2026, modifiée le 8 avril 2026 | https://zenodo.org/records/18887460 |
| DOI | 10.5281/zenodo.18887460 (v1.2) ; v1.1 : 10.5281/zenodo.15689805 ; concept : 10.5281/zenodo.14900181 | Zenodo, Codeberg |
| Licence | **Creative Commons Attribution 4.0 International (CC BY 4.0)** — conforme à la licence annoncée : pas d'arrêt | Zenodo v1.1 et v1.2 |
| Opérations permises (CC BY 4.0) | stockage, calcul, affichage, export, usage commercial, œuvres dérivées, avec attribution | texte de la licence |
| Attribution | à l'écran et dans chaque export : « GEDTM30 © OpenGeoHub, CC-BY 4.0 » ; publication de référence : Ho, Y. F., Grohmann, C. H., Lindsay, J., Reuter, H. I., Parente, L., Witjes, M., Hengl, T. (2025). GEDTM30: global ensemble digital terrain model at 30 m and derived multiscale terrain variables. PeerJ 13:e19673, doi:10.7717/peerj.19673 | Zenodo, demande du maître d'ouvrage |
| Fichiers 30 m (COG, hors Zenodo) | `gedtm_rf_m_30m_…_v1.2.tif` (altitude), `gedtm_rf_std_30m_…_v1.2.tif` (écart type), `gedtm_mask_c_30m_…_v1.2.tif` (masque 0 global, 1 global-vers-local, 2 eau) sur `s3.opengeohub.org/global/dtm/v1.2/` | Zenodo v1.2 |
| Format | COG Float32, nodata 3,40 × 10³⁸, EPSG:4326, pas 1″ (0,000277…°) | Zenodo + lecture des en-têtes |
| Référence verticale | **Non déclarée** sur la page Zenodo, sur Codeberg, ni dans les clés GeoTIFF (aucune `VerticalCSTypeGeoKey`). Le nom de fichier porte `epsg.4326.3855` (EPSG:3855 = EGM2008) : indice, **pas une déclaration** → enregistrée « non déclarée (nom de fichier : 4326.3855) », question à poser à OpenGeoHub. Jamais présentée comme le nivellement général du Maroc ; aucune conversion. | lecture du 2 novembre 2026 |
| Réserves du producteur | « first release », « Use for testing purposes only » ; données fournies « as is », sans garantie | Zenodo |
| Article PeerJ | page refusée à la lecture automatique (HTTP 403) : précision publiée non relevée ici | — |

### Copernicus DEM GLO-30 — MNS régional distinct

| Élément | Constat | Source |
| --- | --- | --- |
| Producteur | ESA, programme Copernicus (WorldDEM, DLR / Airbus) | Copernicus Data Space |
| Nature | **Modèle numérique de surface** (bâti, infrastructures, végétation) — jamais présenté comme terrain nu, jamais mélangé avec le MNT | idem |
| Licence | Licence ESA gratuite pour le grand public (GLO-30 Public) ; même famille que la fiche existante `copernicus-dem-mar-altitude` (« libre et gratuite, attribution obligatoire ») | https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM |
| Attribution | « © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved » ; donnée modifiée : « produced using Copernicus WorldDEM-30 » ; accès AWS : « Copernicus Digital Elevation Model (DEM) was accessed on <date> from https://registry.opendata.aws/copernicus-dem » | idem ; https://registry.opendata.aws/copernicus-dem/ |
| Référence verticale | **EGM2008 (EPSG:3855), mètres** — déclarée par l'ESA (aucune clé verticale dans le fichier) | idem |
| Précision annoncée (ESA) | absolue verticale < 4 m (LE90) ; relative < 2 m (pente ≤ 20 %), < 4 m au-delà ; horizontale < 6 m (CE90) | idem |
| Accès | `s3://copernicus-dem-30m/` (COG, eu-central-1), tuile `Copernicus_DSM_COG_10_N33_00_W008_00_DEM` pour Benslimane | AWS Open Data |

Exclus (décision) : FABDEM (CC BY-NC-SA, pas d'usage commercial). SRTM / NASADEM : comparaison seulement. TessaDEM :
remplacé.

À reporter au catalogue en TER-02 : producteur, version, DOI, licence exacte, attribution, opérations permises (ci-dessus),
référence verticale telle que lue, pas de 30 m, mention « modèle régional, précision de plusieurs mètres » à côté de
chaque altitude, jamais confondu avec un levé local.

## 2. Première comparaison autour de 33.5315 N / 7.10621 W (constat, aucune précision déduite)

Lecture par fenêtre des COG (requêtes HTTP de plage, aucun fichier enregistré, rien versé au dépôt), le 2 novembre 2026 :
fenêtre ±0,0045° en latitude × ±0,0054° en longitude (≈ 1 km × 1 km).

| Jeu | Cellules valides | Centre (plus proche cellule) | Min | Max | Moyenne |
| --- | --- | --- | --- | --- | --- |
| GEDTM30 v1.2 (MNT) | 1 360 | 220,1 m | 206,0 m | 304,4 m | 239,3 m |
| GEDTM30 v1.2 — écart type publié | 1 360 | 0,39 m | 0,25 m | 5,67 m | 0,93 m |
| Copernicus GLO-30 (MNS) | 1 320 | 219,7 m | 206,3 m | 305,6 m | 238,7 m |
| SRTM 30 m (**relevé par la session VPS**, non refait ici) | — | ≈ 219 m | 208 m | 307 m | — |

Écarts GEDTM30 − GLO-30 (chaque cellule GEDTM30 appariée à la cellule GLO-30 la plus proche, n = 1 360) : moyenne
+0,27 m, écart quadratique 3,78 m, min −17,25 m, max +13,26 m, 95ᵉ percentile de |écart| 8,62 m.

Lecture et limites :
- Les trois modèles concordent au centre (≈ 219–220 m) et sur l'étendue (≈ 206–307 m). Ce sont des **écarts entre
  modèles**, pas une précision : aucun point levé indépendant n'est disponible ; la qualité reste « non évaluée ».
- GEDTM30 est en `PixelIsArea`, GLO-30 en `PixelIsPoint` : les grilles sont décalées d'un demi-pixel (≈ 15 m) ; l'appariement
  au plus proche ajoute donc un écart lié à la pente, surtout aux extrêmes. Une comparaison rigoureuse rééchantillonnera
  sur une grille commune déclarée (TER-03).
- Le MNS inclut bâti et végétation : un écart positif GLO-30 − GEDTM30 y est attendu ; il n'est pas corrigé.
- Les deux jeux sont annoncés en EGM2008 (déclaré pour GLO-30, indice de nom de fichier pour GEDTM30) ; SRTM est
  habituellement en EGM96 : **non vérifié**, aucune conversion faite.

Script de lecture : `scripts/geodata/terrain/comparer_modeles_regionaux.mjs`, `geotiff` 3.0.5, lecture de fenêtre, nodata exclu, aucune valeur
remplacée par zéro.
