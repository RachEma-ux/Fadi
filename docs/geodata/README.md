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
Depuis D-GD-45, les administrations, hôpitaux et cliniques et gares d'OpenStreetMap ne sont plus des couches propres : ils
sont fusionnés avec le MTNRA dans la base des services publics (voir plus bas), sans aucun objet en double.

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

## Barre du bas sur téléphone (D-GD-52)

Au téléphone, une barre en bas de l'écran donne Carte (Alt+X), Chercher (Alt+R), Couches (Alt+C) et Enregistrer
(Alt+E).

## Synthèse d'une entité et fiabilité déclarée (D-GD-50, D-GD-51)

La fiche d'une région ou d'une province donne, pour l'indicateur actif, le min, la moyenne simple et le max de ses
subdivisions, avec la source. Elle affiche aussi la fiabilité déclarée par la source (indice de confiance de l'entité,
précision, période, date de récupération) ; ce qui n'est pas déclaré est « Non évalué ».

## Pastilles de thème (D-GD-48)

En haut de la carte, une pastille par catégorie du catalogue affiche ou masque d'un clic toutes ses couches ; son badge
compte les objets dessinés dans la vue. « Thèmes » (Alt+T) replie la bande.

## À proximité (D-GD-49)

La fiche d'un objet compte, pour chaque couche de points affichée, les objets à moins de 250 m à 5 km (rayon au choix)
et donne le plus proche. Route `GET /geodata/api/couches/:id/objets/:code/proximite?rayon=500&couches=a,b`.

## État des couches (D-GD-47)

Dans le panneau Couches, chaque couche visible dit si elle charge, combien de ses objets sont dessinés dans la vue, ou
qu'aucun objet n'est dans la vue.

## Plan / Satellite (D-GD-46)

Le globe de la mini-barre (Alt+S) bascule entre la vue satellite et la vue plan du fournisseur réglé dans Paramètres.
Sans clé MapTiler, aucun fond satellite n'existe : le bouton est désactivé et le dit.

## Recherche de la carte (D-GD-35)

La recherche (nom, code HCP, « lon … lat … ») s'ouvre par la **loupe** de la mini-barre placée sous la barre d'outils
(Alt+R) : barre flottante à gauche de la loupe, même champ et même logique qu'auparavant. Échap, un nouvel appui sur la
loupe ou un clic sur la carte la referment ; le texte saisi est gardé. La barre au-dessus de la carte ne porte plus de
champ de recherche (Fond, Fournisseurs, Enregistrer et menu restent).

## Mini-barre, menu « Cartes » et collections (D-GD-36)

Sous la loupe, la mini-barre porte **Enregistrer** (même action que le bouton de la barre) et **Fond de carte** (liste des
mêmes fonds que le sélecteur). Le menu ☰ regroupe sous **Cartes** : Mes cartes, Collection et Fournisseurs (Partager :
bientôt). Une **collection** est un ensemble ordonné de références vers des cartes enregistrées (atlas) ; concept, modèle
de données et API : [`docs/workstreams/geodata/COLLECTIONS.md`](../workstreams/geodata/COLLECTIONS.md).

## Onglets et tableau de bord RGPH 2024 (D-GD-37)

La barre au-dessus de la carte est une barre d'onglets : **Cartes thématiques** (la carte), **Chiffres clés 2024**,
**Tableaux RGPH 2024**, **CEE 2024**, **Concepts et définitions** ; ☰ à droite. Chaque onglet a son adresse
(`/geodata/chiffres-cles`…) ; la carte reste telle quelle quand on revient. La zone affichée est celle sélectionnée sur
la carte (ou le niveau de la barre territoriale), sinon le Royaume du Maroc ; un filtre de zone la change. L'état
d'enregistrement de la carte est la pastille de l'icône Enregistrer. Données, calculs déclarés et données manquantes :
[`docs/workstreams/geodata/TABLEAU-DE-BORD.md`](../workstreams/geodata/TABLEAU-DE-BORD.md).

## Lecture de l'emprise (D-GD-40)

- **Synthèse de la vue** (barre d'outils, Alt+V) : pour chaque couche d'objets visible, « N dans la vue sur T » (objets
  lus en base qui recoupent la vue) ; avec un indicateur actif, min, moyenne simple et max des entités évaluées de la vue
  et nombre d'entités non évaluées. Route `GET /geodata/api/couches/:id/vue?bbox=ouest,sud,est,nord`.
- **Regrouper les points** (case par couche de points, barre d'outils, Alt+G) : grappes numérotées calculées dans les
  tuiles (`/tuiles/…?regrouper=1`) jusqu'au zoom 13 ; un clic sur une grappe s'en rapproche.
- **Adresse de la vue** : la caméra, la carte ouverte, les couches et l'indicateur actif s'écrivent dans le fragment de
  l'adresse (`#v=…`) ; ouvrir cette adresse rouvre la même vue. « Copier l'adresse de cette vue » (Alt+K) ; un
  destinataire ne voit que les couches qu'il peut déjà consulter.
- **Zoom** affiché en permanence en bas à gauche de la carte.

## Services publics : MTNRA et OpenStreetMap fusionnés (D-GD-43, D-GD-45)

Sources :
- « Coordonnées alphanumériques des administrations disponibles sur le portail maps.service-public.ma » (Ministère de la
  Transition numérique et de la Réforme de l'Administration, data.gov.ma, données de mai 2022, ODbL), fichier
  `donnees-geoportail-open-data-2022.xlsx` (SHA-256 `7d1a4d30…a6f920`, 17 499 lignes, 17 473 points retenus) ;
- extraits OpenStreetMap « administrations », « hôpitaux et cliniques » et « gares » (2 495 objets, ODbL).

**Une seule base, sans doublon** : 19 797 objets en 13 couches `services-publics-<région>` (Casablanca-Settat découpée
par province sous la borne de 5 000 objets), catégorie « Équipements et services ». Propriété `source` : `mtnra`,
`mtnra+osm` (objet OSM apparié et fusionné dans le point du MTNRA, dont les attributs priment, référence `osm`) ou
`osm` (objet ajouté). Règle d'appariement : moins de 150 m, même famille, même échelon, natures compatibles, au moins la
moitié des mots distinctifs en commun, ou nom identique. Un objet à plusieurs candidats est gardé et marqué
`doublon_probable`. Dans la source MTNRA, 22 lignes sans point lisible et 4 lignes strictement identiques à une précédente
sont écartées, et 16 paires de même nom au même point sont gardées et marquées `doublon_probable`. Le rattachement est
noté sur chaque objet (`rattachement`), avec le rapprochement provincial du RGPH (`province_hcp`, `concordance`) pour les
objets du MTNRA. Champs tels que publiés, jamais corrigés. Régénération (fichier MTNRA hors dépôt, empreinte contrôlée ;
une copie réenregistrée par un tableur est refusée) :

```sh
python3 -I scripts/geodata/preparer_services_publics.py --excel donnees-geoportail-open-data-2022.xlsx
```

Chaque point porte aussi son rapprochement avec le RGPH, sans correction : `province_hcp` (province du RGPH de même nom)
et `concordance` (`concorde`, `discorde`, `non-appariee`). L'original est archivé tel quel
(`donnees/mtnra-services-publics-2022-origine.xlsx`).

**Douars (compléments, D-GD-43).** L'annexe des douars reprend les deux feuilles du fichier HCP « Population et ménages
par douars » jointes par le code : nationalité, état civil, état matrimonial, type de logement et distances moyennes aux
équipements, affichés en trois tableaux dans la fiche de la commune rurale. Régénération seule :
`python3 -I scripts/geodata/douars_hcp.py --douars <fichier.xlsx>` (original archivé dans
`donnees/hcp-rgph2024-douars-origine.xlsx`).

## Zone d'étude qui filtre (D-GD-41)

Dans **Études**, « Filtrer par cette zone » limite la carte, la table attributaire et la synthèse de la vue aux objets
qui recoupent la zone ; une puce « Zone d'étude : nom × » s'affiche en haut de la carte, Alt+Z retire ou rétablit le
filtre, et la zone est écrite dans l'adresse de la vue. Le tableau de bord n'est pas filtré (territoires entiers) : pour
une zone libre, « Analyser » donne l'analyse figée.

## Fil de navigation administrative dans la mini-barre (D-GD-38)

La mini-barre porte, de haut en bas : **Loupe**, **Enregistrer**, **≡** (« Navigation administrative ») et **Fond**. ≡
déplie le fil « Maroc › Régions › … › Retour » en panneau à gauche de la mini-barre (plié par défaut). Un seul panneau
(recherche, fil ou fonds) est ouvert à la fois ; le fil reste ouvert pendant la sélection par clics et se ferme par ≡ ou
Échap ; il garde son état d'un onglet à l'autre.

## Fiche d'information : tableaux croisés Milieu × Sexe (D-GD-39)

Un indicateur décliné par milieu et par sexe (population légale, population municipale, taux…) s'affiche en tableau
croisé : lignes Urbain, Rural, Ensemble ; colonnes Ensemble, Masculin, Féminin ; sans défilement horizontal. Les
couleurs des catégories sont celles des légendes des graphiques (palette `--gd-cat-*`). Un écart Urbain + Rural ≠
Ensemble ou Masculin + Féminin ≠ Ensemble est signalé sous le tableau, jamais corrigé.

## Sélection par nombre de clics (D-GD-34 ; D-GD-42 : niveaux réels de l'endroit lus en base)

Des clics rapides au même endroit de la carte montrent les niveaux un par un, du plus élémentaire au plus global, en
suivant les niveaux réels de l'endroit lus en base (D-GD-42) : arrondissement, préfecture d'arrondissements, commune,
préfecture, région à Casablanca (5 clics) ; arrondissement, commune, préfecture, région dans les autres communes à
arrondissements (4) ; commune, province, région ailleurs (3) (600 ms au plus entre deux clics — plus que le double-clic
du navigateur, car deux tapes humaines sur téléphone sont séparées de 350 à 450 ms ; au-delà, ou si le pointeur a bougé
de plus de 16 px, on recommence). Couches de limites visibles : seuls leurs niveaux comptent ; l'entité du premier clic
est la plus fine touchée, ses parents sont lus des liens parent → enfant en base. Carte vierge : les unités du pays courant qui contiennent le
point (`GET /territoires/:pays/point?lon=&lat=`) ; l'entité est affichée seule (contour et mise en évidence), sans
couche ajoutée. Le double-clic et la double-tape ne zooment plus ; un clic hors de toute entité efface la sélection ; les
outils (dessin, mesure) gardent leurs clics. Téléphone : la fiche (volet du bas, qui recouvre la carte) ne s'ouvre
qu'une fois la série de tapes terminée, la sélection restant immédiate. Logique pure :
`geodata-model/src/selection-clics.ts`.

## Découpage administratif en base, niveaux infra-communaux (D-GD-42)

Niveaux (`geodata_niveaux_administratifs`), entités et liens parent → enfant (`geodata_entites_administratives`) sont en
base ; aucun niveau ni territoire dans le code. Données : `docs/geodata/sources/decoupage/` (fichier HCP tel quel, table
des niveaux, entités produites par `python3 scripts/geodata/decoupage_hcp.py --excel <fichier HCP>`). Import **unique**,
une fois, sur le serveur :

```
docker compose --env-file .env.deploy exec app node apps/api/dist/geodata-reference.js --decoupage MA
```

Relancé sur le même fichier : « déjà importé », rien n'est fait. Nouveau fichier HCP : relancer le script, livrer, puis
relancer la commande (mise à jour par code, sans doublon, bilan). Le démarrage de l'API ne lance jamais cet import ;
avant lui, les couches HCP sont publiées mais la barre territoriale attend (avis dans la quittance). Contours : union de
bas en haut suivant les liens (`construire_niveaux.py`). Détail : `docs/workstreams/geodata/DECOUPAGE-INFRA-COMMUNAL.md`.

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

## Prix immobiliers (Concept Prix v1.1, lots P2 à P6)

Deux couches indépendantes : **valeurs immobilières de référence officielles** (`officielle`) et **prix immobiliers
affichés dans les annonces** (`annonces`). Tout vit en base (D-GD-29) ; une base vide donne des états vides explicites
(PRX01). Sources et blocages : `docs/workstreams/geodata/PRIX-SOURCES.md` ; points d'extension :
`docs/workstreams/geodata/PRIX-INVENTAIRE.md`.

**Tables** (`apps/api/src/db/init.sql`, additives) : `geodata_prix_sources` (registre ; statut et origine du statut,
changements journalisés `prix.source.statut`), `geodata_prix_agregats_publies` (agrégats publiés par un tiers, annexe
d'une version, figés avec elle), `geodata_prix_editions`, `geodata_prix_lots` (clé d'idempotence = SHA-256 du fichier +
version de l'analyseur + source, fichier archivé dans `geodata_fichiers`, rôle `import-prix`), `geodata_prix_zones` et
`geodata_prix_valeurs_officielles` (formes unique, fourchette, terrain + construction, conditionnelle ; texte d'origine ;
validité `verifiee` / `non-verifiee` / `historique`), `geodata_prix_observations` (unicité source, annonce, date),
`geodata_prix_quarantaine`, `geodata_prix_rattachements`, `geodata_prix_decisions_doublons` (ajout seul),
`geodata_prix_instantanes` (immuables, empreinte unique, manifeste), `geodata_prix_cellules`, `geodata_prix_biens`,
`geodata_prix_publications` (un pointeur actif par couche et produit ; publication, retour, retrait en ajout seul).
Montants en `numeric` ; absent = NULL, jamais 0.

**Import.** Au démarrage (`--archiver`) ou par `geodata-reference.js --prix-sources` : `prix/prix-sources.json` est
archivé (rôle `prix`) puis chargé dans `geodata_prix_sources` (même empreinte : rien n'est réécrit ; un statut posé par
l'administration n'est pas levé par un rechargement). Une fiche peut porter l'annexe `version.annexes.prixPublies`
(CSV d'en-tête `ENTETES_FEENWAY`, empreinte contrôlée, comprise dans l'empreinte de la version) : lignes validées par
`lireAgregatsFeenway`, niveau ville rattaché à l'objet dont la propriété `ville_source` porte ce nom, quartiers
commerciaux non rattachés (PRX06). Baromètre FeenWay livré : 66 lignes, 16 rattachées à la commune 6141010.
Observations : `POST /prix/imports` (aperçu puis validation avec la clé d'idempotence ; source au produit
`observations` et au statut `active` ou `autorisee`, sinon refus 409 avec le motif du registre — aucune source réelle ne
l'est aujourd'hui). Colonnes : `annonce_id, observe_le, transaction, type_bien, etat_bien, prix, monnaie, periode,
surface, base_surface, localite, precision, empreinte` (CSV à en-tête ou JSON liste d'objets, 10 Mo et 50 000 lignes
au plus). `precision` = code d'un niveau du découpage en base ; le rattachement n'est jamais plus fin.

**Routes** (`/geodata/api`, `routes/geodata/prix.ts`) — lecture pour tout compte connecté : `GET /prix/sources`,
`GET /prix/couches` (états, `motifs` en codes stables, `details` en texte, `capacites`), `GET /prix/agregats-publies`
(`code`, `versionId`, `transaction`, `type`), `GET /prix/cellules` (`code`, `niveau`, `transaction`, `type`, `base` ;
instantané publié seulement ; jamais la lignée), `GET /prix/comparaison` (`code`, `type`, `transaction`, `base`) ; la
fiche d'objet porte `prixPublies`. Réservé : `GET /prix/observations`, `/prix/lots`, `/prix/lots/:id/quarantaine`,
`/prix/instantanes`, `/prix/publications/:couche` (rôles GeoData) ; `POST /prix/imports`, `POST /prix/instantanes`,
`POST /prix/doublons/decisions` (gestionnaire de données) ; `POST /prix/instantanes/:id/publier { attendu, motif }` et
`POST /prix/publications/:couche/retour { attendu, instantaneId?, motif }` (responsable de publication ; pointeur
attendu périmé → 409 consigné, PRX11) ; `POST /prix/sources/:cle/statut { statut, motif }` (administrateur ; une
suspension retire les publications construites avec la source et masque ses agrégats, PRX13) ;
`GET /prix/export?format=csv&produit=agregats|cellules[&versionId=…]` (rôles GeoData, droit « export » de la source,
attribution et identifiants d'édition ou d'instantané dans chaque ligne).

**Essais.** Sans base : `apps/api/src/lib/geodata/prix/prix.test.ts`, `src/db/geodata-sources.test.ts` ; base
attestée (DB-3) : `src/routes/geodata-prix.test.ts` (scénarios `geodata-prix.scenarios.ts`, PRX01 à PRX14, fiche
FeenWay et registre réels, jeux d'observations synthétiques créés dans la base de test seulement).

## Sauvegarde, restauration, retrait

- Les tables `geodata_*` sont dans le schéma `public` : couvertes par les sauvegardes et la restauration existantes de la
  base (`scripts/backup.sh`, `scripts/verify-restore.sh`) ; les fichiers de référence ne sont pas stockés (adresse et
  empreinte conservées : retéléchargement vérifiable). Les fiches d'export (HTML) sont en base, expirées après 30 jours.
- Une version publiée est immuable et ne s'efface pas (déclencheurs) ; un retrait (`POST /geodata/api/admin/versions/:id/retirer`,
  motif obligatoire) rend son contenu inaccessible, les cartes gardent la référence et affichent le motif.
- Retour arrière applicatif : `GEODATA_ENABLED=false` ; les tables additives restent en place (aucune perte de cartes).

## Journal

`geodata_journal` : acteur, action, ressource, résultat — jamais de coordonnée, de contenu de fichier ni de secret.
