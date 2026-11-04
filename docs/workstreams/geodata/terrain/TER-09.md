# TER-09 — Fond mondial à la demande (compte rendu de lot)

Date : 3 novembre 2026 (heure suisse). Issue : https://github.com/RachEma-ux/Fadi/issues/381. Branche :
`feat/381-ter-09-fond-mondial`, partie de `main@5a5885a` (TER-05 fusionné, en ligne en préproduction). Demande du maître
d'ouvrage du 3 novembre 2026, relayée par la session VPS « Fadi VPS - Audit » : « Les données d'altitude ne doivent pas être
celles de Benslimane uniquement mais celles de la zone sélectionnée, comme dans une carte normale. » Décisions appliquées :
TER-D4, D5, D7, D10, D12, D13, D14, D16, D17, D19 ; **TER-D22 à TER-D28 acceptées le 4 novembre 2026** (recommandations retenues) ([`DECISIONS.md`](DECISIONS.md)).

État : **implémenté et vérifié** (contrôles ci-dessous) ; **non accepté** ; aucun déploiement ; aucune fusion sans accord
écrit du maître d'ouvrage.

## Constat de départ

En préproduction (`main@5a5885a0`), GEDTM30 n'était publié que sur l'extrait `gedtm30-v1-2-benslimane`
(`gdtv_c5ed38b7…`, 0,57 Mo, ≈ 11 × 11 km) : le panneau Terrain était vide partout ailleurs.

## Ce qui change

| Exigence | Réalisation |
| --- | --- |
| Toute zone affichée, sans import manuel | Deux fiches **distantes** : `gedtm30-v1-2-mondial` (MNT, adresse unique, COG global 432 Go, 1 296 009 × 540 009 cellules, tuiles internes 2 048², 10 aperçus) et `copernicus-glo30-mondial` (MNS, dalles 1° × 1° `Copernicus_DSM_COG_10_{lat}_00_{lon}_00_DEM`). L'API lit **par plages HTTP**, dans l'emprise demandée seulement, à travers un service dédié |
| Adresses officielles et licences, vérifiées le 3 novembre 2026 | GEDTM30 : adresse `https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif` citée par la page Zenodo v1.2.0 (API Zenodo : licence `cc-by-4.0`, version `v1.2.0`, publiée le 2026-03-06 ; réserve « testing purposes only ») ; GLO-30 : bucket `copernicus-dem-30m` (AWS Open Data, eu-central-1), licence « GLO-30 Public … free basis for the general public » (registre AWS, lu le jour même) ; le registre précise « ocean areas do not have tiles, there one can assume height values equal to zero » : **Fadi ne suppose jamais 0**, une dalle absente est « indisponible » |
| Hors de la requête interactive pour ce qui est lourd ; états « chargement » | Service `terrain-distant` (Node, même image) : seul à sortir vers Internet, il sert à l'API (réseau `internal`) des plages depuis son cache et va chercher à l'origine les blocs manquants ; le travail continue si l'API abandonne. Délais de l'API : point 12 s, tuile 15 s, profil / statistiques 25 s ; au-delà, **« chargement »** (503 + `X-Terrain-Etat: chargement`, `Retry-After`) : l'interface redemande (point : trois fois ; tuiles : nouvel essai de la source trois fois), puis dit « indisponible ». Exports du fond mondial : refusés dans ce lot (409, travailleur sans réseau) |
| Liste fermée d'hôtes et de motifs | L'adresse est **construite** depuis le modèle d'une fiche livrée (`hote` déclaré, `https`, ni port, ni identifiant, ni requête ; `{lat}` / `{lon}` seuls), puis revérifiée caractère pour caractère (`adresseAutorisee`) avant chaque requête ; redirection jamais suivie (`redirect: "manual"`, 3xx refusé) ; origine qui ignore les plages refusée (rien n'est téléchargé en entier) ; corps borné à la plage demandée |
| Délais, tailles, nombre de requêtes bornés | Budget (TER-D24) : 6 requêtes simultanées, 300 par minute, 5 Go par jour, 16 Mio par requête d'origine, délai 20 s ; au plus 4 dalles par requête (9 pour une tuile), statistiques à la demande ≤ 4 M cellules ; zoom minimal 3 pour GEDTM30 (aperçus), 8 pour les dalles GLO-30, 12 pour les courbes (TER-D23) : rien n'est lu en dessous |
| Cache par tuile source et par version, quota, LRU, jamais public | `cache-distant/<fiche>/<sha256(adresse)>/` du volume terrain : épinglage `meta.json` (ETag, Last-Modified, taille, premier accès) et blocs de 256 Kio ; quota (TER-D22, 10 Go par défaut) **à l'intérieur** des 30 Go du volume (la garde refuse un cache plus grand ; le service évince aussi pour que le volume entier reste sous 30 Go) ; éviction du moins récemment utilisé ; réponses `private, no-store`, service sans port publié. En base, `geodata_terrain_sources_distantes` (ajout seul) consigne chaque adresse lue par version : une source dont l'ETag, la date ou la taille change est **refusée** (« source modifiée »), jamais mélangée. Dans l'API, tuiles internes décodées gardées (≤ 256 Mo) |
| Mêmes services et mêmes métadonnées | Altitude au point, profil, statistiques dans le polygone réel, tuiles altitude / pente / ombrage, courbes MVT (calculées sur la grille **native** à la demande, jamais sous le seuil TER-D17 : 10 m minimum, maîtresses tous les 50 m) : mêmes routes, mêmes métadonnées (source, version, pas natif, référence verticale déclarée et sourcée, qualité « non évaluée », attribution, licence, étiquette « Modèle régional, précision de plusieurs mètres »), plus `doi` et `acces: "a-la-demande"` |
| Version de catalogue comme les autres | `--importer` d'une fiche distante lit **l'en-tête à la source** (aucun fichier déposé) et le contrôle contre la fiche comme un fichier : GEDTM30 → quarantaine « référence verticale non déclarée » (TER-D28), GLO-30 → quarantaine « NoData inconnu » (Q-TER-02-3) ; puis levée consignée, traitement (couverture **déclarée**, nature `declaree`, cellules valides non comptées, surface de la bande sur la sphère authalique), revue, publication, retour arrière (TER-D19) |
| Priorité des levés locaux (TER-D16) ; « indisponible » ; MNT ≠ MNS | Au point et dans les profils, la règle TER-D16 s'applique telle quelle (le plus fin d'abord : un levé local sur son emprise exacte passe devant le fond mondial) ; une source distante injoignable n'écarte pas une source plus grossière ; hors couverture, dalle absente, service arrêté, budget atteint : `disponible: false`, `etat` « hors-couverture » / « indisponible » / « chargement », jamais une valeur ; le produit filtre toujours (un MNT ne répond jamais pour le MNS) |
| Retour du maître d'ouvrage du 3 novembre 2026 (capture au zoom 7,1 sur le Maroc, relayée par la session VPS) | (1) le fond mondial GEDTM30 remplit la vue **dès le zoom 3** (aperçus basse résolution, puis 30 m), aucun jeu à choisir (le jeu suit la vue) ; (2) un seul geste : bouton Terrain → altitude colorée, **légende adaptée à la vue par défaut** (`GET /terrain/plage`, lue sur un aperçu de la vue, couleur seulement, portée « vue courante » ; suit la carte), légende verrouillée en option ; (3) panneau resserré : produit, couches (altitude, pente, ombrage, courbes), altitude au point, profil en haut ; résumé d'une ligne (« GEDTM30 v1.2 · 31 m · précision de plusieurs mètres ») ; jeux publiés, couverture et source détaillée **repliés** sous « Sources et précision » ; une seule ligne de précision (plus de « non évaluée » répété) ; (4) altitude au point en **bulle** à l'endroit touché ; demande du maître d'ouvrage du 4 novembre 2026 : option **Contours** (courbes de niveau) dans la liste des couches, avec case et opacité comme Altitude, Pente et Ombrage, équidistance juste en dessous (jamais sous le seuil TER-D17) ; (5) captures au format téléphone (émulation Pixel 7 dans la recette) — **la recette sur un vrai téléphone Android (porte G3) reste à faire** : la session n'a pas d'appareil |
| Interface | Le jeu affiché **suit le centre de la vue** (le plus fin qui le contient : levé local sur son emprise, sinon fond mondial), sauf choix manuel ; « Fond mondial lu à la demande » dit avec le jeu ; « Zoomez davantage » sous le zoom 8 ; avis des courbes sous le zoom 12 ; « Chargement du fond mondial… » ; « Une partie du terrain est indisponible… » ; DOI et accès dans « Sources et précision » ; source en dalles sans plage de version : altitude après « Adapter à la vue ». 26 textes ajoutés à `en.json`. **Aucune nouvelle commande** (règle d'or inchangée, contrôlée par les tests existants) |

## Fichiers

- Modèle pur : `packages/geodata-model/src/terrain/distant.ts` (dalles, adresses fermées, plages et blocs, LRU, budget,
  `LIMITES_FOND_MONDIAL`) ; `catalogue.ts` (acquisition `distant` : hôte, modèle, dalles, emprise, conditions ; EPSG:4326 et
  niveau « mondial » exigés).
- API : `lib/geodata/terrain/distant.ts` (lecture d'origine, `ServiceDistant`, clients), `fond-mondial.ts` (point, profil,
  statistiques, plage, tuiles, courbes à la demande, épinglage par version), `services.ts` (sources distantes servies,
  tuiles internes décodées), `import.ts` (`importerTerrainDistant`), `traitement.ts` (`traiterDistante`, `surfaceEmprise`),
  `exports.ts` (refus), `routes/geodata/terrain.ts`, `db/geodata-terrain.ts` (`--distant-serveur`, `--distant-etat`,
  `--distant-vider`), `db/init.sql` (`geodata_terrain_sources_distantes`, `nature` des couvertures).
- Fiches : `docs/geodata/terrain/gedtm30-v1-2-mondial.json`, `copernicus-glo30-mondial.json` (liste fermée : 6 fiches).
- Web : `panneaux/Terrain.tsx`, `terrain-ops.ts` (`jeuPourVue`, DOI, accès), `carte/moteur*.ts` (zooms minimaux, état des
  tuiles, nouveaux essais), `PageGeoData.tsx`, `client.ts`, `lib/i18n/en.json`.
- Préproduction : `deploy/preprod/compose.yml` (service `terrain-distant`, `GEODATA_TERRAIN_DISTANT_URL` de l'API),
  `env.example`, `fadi-preprod` (garde, `terrain distant --demarrer | --arreter | --etat | --vider`), `tests/run.sh`,
  `tests/doubles/docker`.
- Mesure : `scripts/geodata/terrain/mesurer_fond_mondial.mjs`.

## Garde de préproduction

`terrain-distant` sort vers Internet (réseau `front`) : **mêmes exigences que `terrain-import`** (image
`fadi-preprod-app:<commit approuvé>`, pas de build, volume `fadi-preprod-terrain` en écriture et rien d'autre, réseaux
`front` + `internal` exactement, aucun `network_mode`, aucun port publié, `restart: "no"`, ni `DATABASE_MIGRATION_URL`, ni
`SMTP_PASS`, ni `MIGRATE_ONLY`), **et en plus** : point d'entrée fixé (`node apps/api/dist/geodata-terrain.js
--distant-serveur`, aucune `command`), aucune base (`DATABASE_URL` refusée), environnement en **liste fermée** (aucun
secret), aucun `expose`, quota du cache ≤ quota du volume ≤ 30 Go ; l'API ne peut viser que
`http://fadi-preprod-terrain-distant:3002`. Liste fermée des services : `db`, `migrate`, `app`, `recette`,
`terrain-import`, `terrain-worker`, `terrain-distant`. Lancement : `sudo fadi-preprod terrain distant --demarrer`
(administrateur ; garde complète, conteneur détaché unique `fadi-preprod-terrain-distant`, TER-D27), état par l'opérateur.

SHA-256 de `deploy/preprod/fadi-preprod` : voir la PR (calculé sur le commit final).

## Vérifications (3 novembre 2026)

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm run build` | Réussis |
| `packages/geodata-model` | 34 fichiers, 266 tests (dont 12 du fond mondial : dalles, liste fermée, plages, LRU, budget, fiches distantes) |
| API sans base `lib/geodata/terrain/` | 21 tests, dont `distant.test.ts` 8 : zone hors Benslimane servie (dalle de Lucerne), cache borné et évincé, hôte / chemin non autorisés et redirection refusés, origine qui ignore les plages refusée, origine en panne ou lente → « indisponible », dalle absente → hors couverture, budget → 429 sans requête, source modifiée → refusée |
| Suite DB-3 `geodata-terrain-fond-mondial.test.ts` (nouvelle, inscrite) | 4/4 en local (PostGIS 16 + 3.4.2, copie à connexion directe) : cycle d'une version distante (en-tête lu, épinglage, couverture déclarée, aucune copie, idempotence), point / profil / statistiques / tuiles / courbes hors Benslimane avec métadonnées et attribution, 422 sous le seuil, export 409, dalle absente → hors couverture, panne et service arrêté → « indisponible », MNT ≠ MNS, levé local prioritaire sur son emprise ; en CI sur base attestée |
| Suites DB-3 existantes du terrain | `geodata-terrain.test.ts` 18/18, `geodata-terrain-services.test.ts` 8/8 (local) |
| Tests web (`apps/web`) | 1 369 réussis (1 ignoré) ; module GeoData 68 (dont 2 du fond mondial) |
| `npm test` (racine) | Paquets et web réussis ; API : 21 suites DB-3 refusées par la garde sans base attestée (`TARGET_REQUIRED`, attendu en local), exécutées en CI |
| Recette navigateur `geodata-terrain.mjs` (Chromium, API construite locale) | 44 contrôles, 0 échec (après le retour du maître d'ouvrage : panneau replié, légende adaptée par défaut, bulle, téléphone ; dont, pour le fond mondial : fond mondial choisi hors levé et ses tuiles, « à la demande », point « chargement » puis valeur, DOI et accès, zoom minimal sans requête, levé local choisi sur son emprise, source indisponible → nouveaux essais puis « indisponible », anglais) |
| Recette `geodata.mjs` (non-régression) | 265 contrôles, 0 échec |
| `deploy/preprod/tests/run.sh` (compte non privilégié) | 248 réussis, 0 échec (dont 18 mutations de `terrain-distant` et 18 cas de `terrain distant`) ; `run-auto.sh` 85/0 |
| Import réel (base locale jetable, réseau sortant du conteneur de développement) | `gedtm30-v1-2-mondial` : en-tête lu en 1,7 s, **quarantaine** « référence verticale non déclarée » ; `copernicus-glo30-mondial` : **quarantaine** « NoData inconnu » — exactement les motifs des extraits |

Limite de la recette navigateur : les services du terrain y sont interceptés (jeux synthétiques « test seulement ») ; la
chaîne serveur est vérifiée par les suites DB-3 et par la mesure réelle ci-dessous.

## Performances mesurées (budgets du plan : point p95 < 1 s en cache, vue < 3 s en cache)

Conditions : conteneur de développement (4 processeurs, 15 Go), PostGIS 16 local, un seul client, réseau sortant par le
mandataire du conteneur (hors du VPS), version **GEDTM30 mondial** publiée **dans une base locale jetable seulement**
(quarantaine levée avec une référence marquée « essai local », aucune décision réelle), cache distant vide au départ ; 20
points pseudo-aléatoires dans ± 0,05° autour du centre ; vue = 5 × 3 tuiles d'altitude au zoom 13, 6 requêtes simultanées
(comme un navigateur). Script : `scripts/geodata/terrain/mesurer_fond_mondial.mjs`.

| Zone | Phase | Premier point | Points p95 | Vue 15 tuiles |
| --- | --- | --- | --- | --- |
| Benslimane (220,1 m au centre, comme l'extrait) | à froid | 1 099 ms | 8 ms | 2 133 ms |
| Lucerne (443,6 m) | à froid | 1 034 ms | 19 ms | 322 ms |
| Paris (49,4 m) | à froid | 731 ms | 10 ms | 391 ms |
| Benslimane / Lucerne / Paris | cache mémoire de l'API | 6 / 4 / 5 ms | 5 / 4 / 7 ms | 33 / 34 / 34 ms |
| Benslimane / Lucerne / Paris | cache disque seul (API redémarrée) | 261 / 308 / 315 ms | 11 / 11 / 6 ms | 1 409 / 354 / 361 ms |
| Ifrane (Moyen Atlas), ombrage z 13, aucune lecture préalable | à froid / en cache | — | — | 3 194 / 43 ms |
| Kilimandjaro, ombrage z 12, aucune lecture préalable | à froid / en cache | — | — | 3 492 / 42 ms |

À froid, la vue de Benslimane comprend la lecture de la plage de la version (plus petit aperçu mondial) ; à froid les
points suivent le premier dans la même tuile source (2 048² ≈ 0,57°). Une première mesure sans cache des tuiles internes
décodées donnait ≈ 3 s même en cache disque (décodage répété de la même tuile 2 048²) : corrigé dans ce lot. Courbes z 12
à 13 calculées à la demande (16 à 221 Ko par tuile MVT). Ces mesures **ne valent pas recette** : à refaire en préproduction
(réseau du VPS, appareil Android réel, porte G3).

## Procédure sur le VPS après fusion et déploiement (administrateur, `sudo`)

```sh
# 0. Réinstaller /usr/local/sbin/fadi-preprod depuis main (empreinte SHA-256 donnée dans la PR), puis :
sudo fadi-preprod garde                                   # 7 services, « terrain-import borné, terrain-distant borné »
# 1. Service de lecture distante (TER-D27 : conteneur détaché unique, restart "no") :
sudo fadi-preprod terrain distant --demarrer
sudo fadi-preprod terrain distant --etat                  # sources copernicus-glo30-mondial, gedtm30-v1-2-mondial ; cache, budget
# 2. Fond mondial MNT : en-tête lu à la source, aucun fichier déposé (aucun --telecharger) :
sudo fadi-preprod terrain --importer gedtm30-v1-2-mondial --par <gestionnaire-donnees>
sudo fadi-preprod terrain --etat                          # gdtv_… gedtm30-v1-2-mondial MNT En quarantaine [reference-verticale-inconnue]
# 3. Levée par décision consignée (TER-D28, responsable de publication) — mêmes libellé, code et source que la levée de
#    l'extrait gdtv_c5ed38b7-6d28-478a-b045-a5af1d6ca1ab (même fichier) ; la session ne lève rien :
sudo fadi-preprod terrain --lever <gdtv_mondial> --par <responsable-publication> --motif "…" \
    --reference-libelle "EGM2008" --reference-code EPSG:3855 --reference-source "<source citée pour l'extrait>"
# 3 bis. Publication possible seulement après la décision écrite TER-D26 (dérogation d'archivage) : l'administrateur ajoute
#    PREPROD_GEODATA_TERRAIN_DEROGATION_TER_D26=accordee au fichier d'environnement de la préproduction, puis
#    sudo fadi-preprod up ; sans elle, --publier d'une version distante est refusé (409 « derogation_requise »).
# 4. Traitement (aucun réseau ni GDAL), revue, publication :
sudo fadi-preprod terrain worker --traiter <gdtv_mondial> --par <gestionnaire-donnees>
sudo fadi-preprod terrain worker --decider <gdtv_mondial> --decision accepte --motif "…" --par <responsable-publication>
sudo fadi-preprod terrain worker --publier <gdtv_mondial> --motif "…" --par <responsable-publication>
# 5. Fond mondial MNS (facultatif) : import → quarantaine « NoData inconnu » tant que Q-TER-02-3 n'est pas tranchée.
sudo fadi-preprod terrain --importer copernicus-glo30-mondial --par <gestionnaire-donnees>
# Arrêt / vidage du cache : sudo fadi-preprod terrain distant --arreter ; sudo fadi-preprod terrain distant --vider
# Retour arrière : republier une version remplacée (TER-D19), ou arrêter terrain-distant (fond mondial « indisponible »),
# ou PREPROD_GEODATA_TERRAIN_ENABLED=false (terrain fermé).
```

Contrôle après publication : GeoData › Terrain (Alt+H) à Benslimane, Lucerne et Paris, sans choisir de jeu : couche
d'altitude dès le zoom 3 (GEDTM30, TER-D23), légende « adaptée à la vue », bulle au point touché (≈ 220 m au centre de
Benslimane), « Contours » dès le zoom 12, « Sources et précision » replié (GEDTM30 v1.2, DOI 10.5281/zenodo.18887460,
1″, EGM2008 déclaré par décision, « précision de plusieurs mètres », qualité non évaluée, attribution) ; zoom < 3 :
« Zoomez davantage » ; MNS GLO-30 seulement dès le zoom 8. Puis mesurer les budgets en préproduction (porte G3), sur un
appareil Android réel.

## Hors de ce lot

Export du fond mondial (le travailleur n'a pas de réseau) ; affichage simultané de plusieurs versions (un seul jeu affiché,
celui du centre de la vue) ; contrôle qualité par points sur une version distante ; retrait d'une version publiée (TER-D25
B) ; service permanent (TER-D27 B) ; courbes raccordées entre dalles GLO-30 (coupées aux limites de dalle, jamais
raccordées sans marque).

## Captures (recette `geodata-terrain.mjs`, données synthétiques « test seulement », émulation de téléphone)

`docs/workstreams/geodata/captures/ter-09/` : `05-fond-mondial.png` (bureau, Benslimane, fond mondial), 
`06-telephone-terrain.png` (format Pixel 7 : un geste, altitude et légende de la vue), `07-telephone-bulle.png` (altitude au
point en bulle). Émulation Chromium, **pas un appareil Android réel** : la porte G3 reste à passer en préproduction.
