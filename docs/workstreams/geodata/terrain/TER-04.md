# TER-04 — Services numériques, tuiles, droits, publication et export (compte rendu de lot)

Date : 3 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381. Branche :
`feat/381-ter-04-services`, partie de `main@22e22eb` (TER-03 fusionné). Décisions appliquées : TER-D1, D9, D14, D15 (droit
`calcul` exigé pour les calculs du terrain), D16, D17, D18 ([`DECISIONS.md`](DECISIONS.md)).

État : **implémenté et vérifié** (contrôles ci-dessous) ; **non accepté** ; aucun déploiement.

## Routes (sous `/geodata/api`, compte connecté, réponses privées)

| Opération du plan | Route | Usage exigé | Comportement |
| --- | --- | --- | --- |
| Jeux par emprise | `GET /terrain/jeux?ouest&sud&est&nord&produit` | consultation | Versions **publiées** seulement, couverture exacte (GeoJSON), qualité, pas, référence verticale, dates, étiquette, attribution |
| Altitude au point | `GET /terrain/point?lon&lat&produit` | calcul | Règle TER-D16 (produit, plus fin, qualité, date ; une seule référence verticale) ; bilinéaire, sinon la cellule ; méthode, unités, datum, version, pas, qualité renvoyés ; hors couverture : `disponible: false`, jamais une valeur |
| Profil | `POST /terrain/profil` | calcul | 2 à 500 sommets, ≤ 10 000 points (au-delà : 413) ; chaînage en Mercator transverse locale ; transitions de source, lacunes, points interpolés |
| Statistiques de zone | `POST /terrain/statistiques` | calcul | Polygone réel à trous (jamais le rectangle englobant), ≤ 50 M cellules ; couverture valide mesurée (surface valide / surface de la zone) |
| Tuiles | `GET /terrain/tuiles/:version/:style/:z/:x/:y` | tuiles | `altitude` (palette sans bleu, légende verrouillée sur la version, ou plage `min`/`max` explicite), `pente`, `ombrage` ; aperçus pour l'affichage seulement ; transparent hors couverture ; `private, max-age=3600`, `Vary: Cookie` ; cache par version + style + plage, vidé à chaque publication |
| Courbes | `GET /terrain/courbes/:version/:z/:x/:y` (MVT) | tuiles | Équidistance demandée ≥ celle qu'exige la précision (sinon 422 avec message) ; sous-ensemble exact d'une équidistance calculée ; maîtresses, altitude, référence verticale |
| Export | `POST /terrain/exports` → 202 ; `GET /terrain/exports/:id` ; `…/fichier` | export **et** téléchargement | Budget 25 M pixels ; préparé par le travailleur (tâche de fond) ; GeoTIFF de l'**original** numérique (repère composé avec la référence verticale déclarée, métadonnées source / version / qualité / licence / attribution) ; courbes GeoJSON (WGS 84) ou DXF R12 (repère natif) ; pour le seul demandeur, 24 h |
| Publication / retour arrière | `POST /terrain/versions/:id/publier` | rôle responsable-publication | Version acceptée → publiée ; la publiée du même jeu → remplacée ; republier une version remplacée = retour arrière ; rien n'est effacé |

Drapeau de retour arrière du plan : `GEODATA_TERRAIN_ENABLED=false` ferme `/terrain` (404). Commande d'administration :
`--publier`, `--exports`, `--continu` (travailleur en boucle : traitements et exports, expirés effacés).

Précision du cycle de vie (TER-D12) : le plan exige un retour arrière vers la version acceptée précédente ; la transition
**remplacée → publiée** est donc ajoutée (modèle pur et déclencheur SQL). À confirmer par le maître d'ouvrage.

## Vérifications (3 novembre 2026)

| Contrôle | Résultat |
| --- | --- |
| `packages/geodata-model` | 33 fichiers, 253 tests réussis |
| Suite DB-3 `geodata-terrain-services.test.ts` (nouvelle) | 8 tests ; exécutés localement sur PostGIS 16 + GDAL 3.8.4 par une copie à connexion directe : 8/8 ; en CI sur base attestée |
| Suite DB-3 `geodata-terrain.test.ts` | 18/18 (local) |
| Tests sans base du travailleur | 9/9 |
| Garde de préproduction | Conforme (6 services, 4 volumes) |

Tests du plan couverts dans ce lot : AOI trouée (statistiques), couture entre jeux (profil, transition marquée), accès non
autorisé (401 sans session, 404 version non publiée ou export d'un autre compte, 403 droit `tuiles` refusé ou `export`
inconnu), exports conservant CRS, datum et valeurs (GeoTIFF relu par GDAL : repère CH1903+ / LV95 + vertical, métadonnées,
valeurs identiques à l'original), plan synthétique connu (altitude au point exacte au millimètre près, l'écart venant de
l'aller-retour de transformation PROJ), retour arrière (republication).

Deux défauts trouvés et corrigés pendant le lot : la projection locale du profil sans datum (`+ellps` seul : ≈ 170 m
d'écart vers CH1903+, corrigé par `+datum=WGS84`) ; transformation point par point par PostGIS (≈ 7 ms par point depuis une
chaîne PROJ : un seul `ST_Transform` par multipoint).

## Revue Codex de la PR #389 (corrigée)

- Altitude au point : la référence verticale est celle de la première source qui a une **valeur** au point ; une source
  plus fine sans valeur (NoData) n'écarte plus une source plus grossière d'une autre référence (un point n'a qu'une source,
  aucun mélange). Les profils, qui combinent plusieurs sources, gardent une seule référence.
- Priorité à pas et qualité égaux : date des **données** (levé, sinon version) lue dans la fiche (`dateDeDonnees`), jamais
  la date de publication dans Fadi (une republication ne rend pas une mesure plus récente).
- Surfaces en m² pour **tout** repère géographique (pas seulement EPSG:4326) : statistiques de zone et couverture (TER-03).

## Performances mesurées (budgets du plan)

Conditions : conteneur de développement (4 processeurs, 15 Go), PostGIS 16 local, volume local, un seul client, aucun
réseau, version réelle **Lucerne MNT 1150337** publiée **dans la base locale jetable seulement** (quarantaine levée pour
l'essai, aucune décision réelle).

| Mesure | Résultat | Budget du plan |
| --- | --- | --- |
| Altitude au point, 200 points aléatoires | p95 ≈ 30 ms (premier et second passage) | p95 < 1 s en cache |
| Profil diagonal ≈ 1,15 km au pas de 1 m (1 152 points) | ≈ 0,57 s (médiane de 5) | charge fixe à mesurer ; au-delà de 10 000 points : tâche de fond |
| Tuile d'altitude (z 15, 17, 19) | 104 à 184 ms à froid, < 1 ms en cache | — |
| Vue de 5 × 3 tuiles d'ombrage à froid | 0,44 à 1,2 s | vue visible < 3 s en cache |

Ces mesures ne valent pas recette : le plan exige de les refaire en préproduction (réseau, appareil Android réel, cache,
concurrence consignés) avant d'accepter les budgets (porte G3).

## Suite

TER-05 (interface : contrôle Terrain, légendes, profil, panneau « Sources et précision », courbes de niveau), un lot à la
fois.
