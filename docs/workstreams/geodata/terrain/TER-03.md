# TER-03 — Traitement et porte qualité (compte rendu de lot)

Date : 3 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381. Branche :
`feat/381-ter-03-traitement-qualite`, partie de `main@426c37b` (TER-02 fusionné, CI de `main` verte). Décisions appliquées :
TER-D1, D6, D13, D14, D16, D17 ([`DECISIONS.md`](DECISIONS.md)).

État : **implémenté et vérifié** (contrôles ci-dessous) ; **non accepté** ; aucun déploiement.

## Livré

| Élément | Fichier | Rôle |
| --- | --- | --- |
| Calculs purs | `packages/geodata-model/src/terrain/analyse.ts` | Pente (Horn), ombrage (rendu seulement), valeur au point (cellule, bilinéaire jamais extrapolée), espacement métrique sur l'ellipsoïde WGS 84 (grille géographique), courbes de niveau par carrés marchants (NoData : courbe interrompue), couverture valide en rectangles, équidistance minimale liée à la précision (TER-D17) |
| Porte qualité | `…/terrain/qualite.ts` | e_i = modèle − levé ; biais, RMSEz, P95 de \|e_i\| (rang le plus proche) exactement comme au plan ; par classe ; points sans valeur exclus et listés ; états « non évaluée », « sans cible », « conforme », « non conforme » ; lecture du CSV de points |
| Priorité et profils | `…/terrain/priorite.ts` | Règle TER-D16 (produit, publiée, plus fin, qualité mesurée puis déclarée, date ; datum différent écarté ; « indisponible ») ; profil avec transitions de source, lacunes, points interpolés, limite de points (au-delà : traitement de fond) — servi par l'API au lot TER-04 |
| Travailleur | `apps/api/src/lib/geodata/terrain/derives.ts` | GDAL : COG d'altitude relu et comparé **cellule à cellule** à l'original (dimensions, géoréférence) ; pente et ombrage calculés par le paquet pur, géoréférence recopiée par GDAL (WKT + transformation affine via VRT brut), convertis en COG ; couverture et courbes dans le repère natif ; « PixelIsPoint » pris en compte |
| Orchestration | `…/terrain/traitement.ts` | Traitement idempotent (empreinte + paramètres + version de GDAL), sérialisé par version, original relu par empreinte avant tout calcul ; couverture transformée en WGS 84 par PostGIS (transformation consignée) ; courbes en base ; rapport initial « non évaluée » ; traitement → revue ; contrôle qualité ; décision de revue (responsable de publication, motif, état de qualité consigné) |
| Schéma | `apps/api/src/db/init.sql` | `geodata_terrain_couvertures`, `_courbes`, `_rapports_qualite` (ajout seul), nature des dérivés, type de traitement « derives » ; changements idempotents sur les tables de TER-02 |
| Commande | `apps/api/src/db/geodata-terrain.ts` | `--traiter`, `--controler`, `--decider`, `--essai-gdal` |
| Déploiement | `deploy/preprod/terrain-worker.Dockerfile`, `compose.yml` | Service `terrain-worker` (profil `terrain`) : image applicative + `gdal-bin=3.6.2+dfsg-1*` et `proj-data` (Debian bookworm), volume terrain en écriture, réseau interne seulement |
| CI | `.github/workflows/ci.yml` | GDAL installé avant les tests API ; job image : construction du travailleur, version GDAL 3.6.2 vérifiée, `--essai-gdal` |

Hors de ce lot : publication (accepté → publié), routes de l'API (point, profil, statistiques d'AOI, export, tuiles) et
droits servis (TER-04) ; interface (TER-05) ; nuages de points LAS / LAZ et PDAL (aucun jeu livré n'en contient ; à
épingler quand un levé en livrera) ; transformations de datum vertical (aucune approuvée : TER-D11).

## Vérifications (3 novembre 2026)

| Contrôle | Résultat |
| --- | --- |
| `packages/geodata-model` | 32 fichiers, 246 tests réussis (dont 35 du terrain TER-02 / TER-03) |
| `apps/api/src/lib/geodata/terrain/` sans base (GDAL 3.8.4 local) | 9 tests réussis, dont le travailleur sur un plan synthétique connu |
| Suite DB-3 `src/routes/geodata-terrain.test.ts` | 16 tests ; exécutés localement sur PostGIS 16 par une copie à connexion directe : 16/16 ; en CI sur base attestée |
| Commande empaquetée `dist/geodata-terrain.js --essai-gdal` | Réussi |
| `bash deploy/preprod/tests/run.sh` (compte non privilégié) | 107 réussis, 0 échec |
| Garde de préproduction (profils `terrain`, `recette`) | Conforme : 6 services, 4 volumes |

Tests du plan couverts : plan synthétique connu pour la pente (exacte à 10⁻³ °, valeurs Float32) et les profils ; NoData
(pente, ombrage, courbes interrompues, couverture qui exclut le trou) ; couture entre deux jeux (transition marquée) ;
cuvette (courbes fermées) ; équidistance refusée sous le seuil ; statistiques de contrôle exactement comme au plan.

## Essais sur les données réelles (base et volume locaux jetables)

Le travailleur a tourné sur les trois originaux réels importés en TER-02 (GDAL 3.8.4) :

| Jeu | Durée | Constat |
| --- | --- | --- |
| Lucerne MNT 1150337 (15 M cellules) | 71 s, base comprise | COG identique à l'original ; couverture 937 500 m² (1 250 × 750 m) dont l'enveloppe WGS 84 recoupe celle du catalogue STAC du producteur ; 30 niveaux de courbes à 10 m (417 lignes, 174 126 sommets) |
| GEDTM30 extrait Benslimane | 1,6 s | Courbes 140 à 360 m à 10 m |
| GLO-30 N33 W008 (13 M cellules) | 73 à 99 s | Origine décalée d'un demi-pas (« PixelIsPoint ») prise en compte ; courbe 0 m sur l'océan (226 lignes) : illustre la question Q-TER-02-3 |

Pour l'essai de Lucerne, la quarantaine a été levée **dans la base locale jetable seulement**, avec une référence marquée
« essai local » : ce n'est pas une décision ; en préproduction, les quatre versions restent en quarantaine jusqu'aux
réponses Q-TER-02-1 à 3.

## Suite

TER-04 (services numériques, tuiles, droits, publication, export), un lot à la fois.
