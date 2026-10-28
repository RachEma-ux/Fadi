# ADR-GEODATA-02 — Délégation totale et décisions de réalisation de GeoData V1

Statut : **Accepté** (délégation du maître d’ouvrage) ; décisions techniques prises par le chef de projet sous délégation.
Date : 2026-10-25.
Chantier : geodata.
Issues : https://github.com/RachEma-ux/Fadi/issues/243 (cadrage) et https://github.com/RachEma-ux/Fadi/issues/299 (réalisation).

## Contexte

Le concept GeoData v1.0 (ADR-GEODATA-01) a été fusionné par la PR #245 sans autoriser l’implémentation. Le 25 octobre 2026,
le maître d’ouvrage écrit : « Réactive la délégation totale », demande d’analyser le plan d’implémentation fourni, de
l’évaluer, de créer un plan propre, puis « Exécute non stop de A à Z sans t’arrêter pour me demander ».

## Décision et responsable

1. **Délégation totale réactivée pour GeoData** (même forme que D-203, OP-3 et la délégation du temps réel) : le chef de
   projet tranche les décisions D-GD-01 à D-GD-10, réalise les incréments I1 à I5 de
   [`PLAN-IMPLEMENTATION.md`](../../workstreams/geodata/PLAN-IMPLEMENTATION.md) sans acceptation intermédiaire, fusionne
   chaque PR **seulement CI verte**, et consigne chaque décision ici et dans le chantier. Le maître d’ouvrage peut reprendre
   la main à tout moment.
2. **Exclusions maintenues** : publication en production (Release GitHub du maître d’ouvrage,
   `docs/deploiement-automatique.md`), paramètres GitHub, secrets, données réelles de projet, tests destructifs hors base
   jetable, modification de DrawAll. Aucune donnée réglementaire, statistique ou territoriale n’est inventée.
3. **Décisions D-GD** (détail et justification dans le plan, section 2) :
   - D-GD-01 : GeoData est le 9ᵉ module de Fadi, autonome dans les deux sens (modèle du Sandbox).
   - D-GD-02 : tables `geodata_*` dans `public` via `init.sql` ; aucune clé vers les projets ; API sous `/geodata/api`.
   - D-GD-03 : MapLibre GL JS 6.12.0 (BSD-3-Clause, publiée le 3 octobre 2026), chargée à la demande.
   - D-GD-04 : pilote geoBoundaries MAR ADM1 / ADM2 (ODbL 1.0, © contributeurs OpenStreetMap, version `9469f09`) ;
     indicateur « superficie calculée » ; population HCP non publiée tant que ses droits ne sont pas établis.
   - D-GD-05 : fond neutre par défaut, fonds externes seulement configurés ; pas de géocodeur externe en V1.
   - D-GD-06 : WGS 84 lon/lat, coordonnées saisies étiquetées, mesures ellipsoïdales au serveur.
   - D-GD-07 : GeoJSON personnel borné ; GeoPackage / GeoJSON de référence par chaîne administrative, EPSG:4326 seul.
   - D-GD-08 : versions immuables, retrait motivé, expiration des imports (24 h) et des fiches d’export (30 jours).
   - D-GD-09 : V1 privée, sans partage.
   - D-GD-10 : traitements synchrones bornés, journal GeoData sans coordonnées.
   - D-GD-11 (25 octobre 2026, demande du maître d'ouvrage) : style « une couleur par entité » (`categories`) — palette
     qualitative de 12 couleurs (ColorBrewer « Paired »), une couleur distincte par unité jusqu'à 12 unités, au-delà
     coloration du graphe de voisinage (voisins distincts) calculée par le serveur ; aucune couleur ni valeur enregistrée
     dans la composition, la couleur n'est qu'un repère visuel.
   - D-GD-12 (25 octobre 2026, demande du maître d'ouvrage d'importer les couches d'un portail tiers, option « sources
     d'origine » retenue par lui) : aucune copie depuis un portail agrégateur ; les couches sont reprises de leurs
     sources d'origine ouvertes — OpenStreetMap (ODbL, extraits PBF régionaux) et OurAirports (domaine public) —,
     restreintes au territoire de geoBoundaries MAR ADM1, livrées avec leur fiche dans `docs/geodata/sources/` (données
     dans `donnees/`, empreinte contrôlée). Écartées : couches raster (hors V1), couches de plus de 5 000 objets,
     sources aux droits non établis (HCP, producteurs non identifiés, résultats électoraux).
   - D-GD-13 (25 octobre 2026, demande du maître d'ouvrage d'intégrer aussi les couches raster) : couches raster dans
     GeoData — GeoTIFF mono-bande EPSG:4326 (aucune reprojection devinée), grille ramenée au plus à 4 000 000 cellules
     (plus proche voisin, consigné), stockée figée (`geodata_rasters`), tuiles PNG rendues par le serveur, symbologie
     déclarée par la fiche (palette continue et bornes, ou classes), valeur au point ; une cellule sans donnée est
     transparente et « non évaluée », jamais zéro. Dépendance `geotiff` (MIT) côté serveur.
   - D-GD-14 (25 octobre 2026, demande du maître d'ouvrage : couches rangées par catégorie, barre verticale, bouton
     « Data », menu hamburger dont l'article « Data » crée, modifie et supprime les catégories et leurs couches) :
     catégories du catalogue **communes à tous les comptes** (`geodata_categories`), gérées par la nouvelle capacité
     `organiser-catalogue` (rôles « gestionnaire-donnees » et « administrateur ») ; lecture seule pour les autres. Une
     source commune est rangée explicitement (`geodata_categories_sources`, par source : le rangement survit aux nouvelles
     versions), sinon par les thèmes déclarés de la catégorie, sinon « Autres » ; une source privée n'est rangée que par
     son thème. Supprimer une catégorie ne supprime aucune couche. 15 catégories initiales semées une seule fois
     par l'API à la première lecture (`geodata_reglages`) ; une base neuve reste vide. Interface : carte pleine surface, barre d'outils verticale **flottante**, à droite par défaut
     (précision du maître d'ouvrage), déplaçable par sa poignée (souris, doigt, flèches ; double-clic : retour à
     droite), bornée à la carte, position mémorisée dans le navigateur seulement ; bouton « Données » ouvrant le catalogue en surimpression (sections repliables, compte
     actives / total, bascule Vecteurs / Imagerie), menu ☰ en haut à droite (Données, Mes cartes, Études, Importer,
     Exporter).
   - D-GD-15 (25 octobre 2026, demande du maître d'ouvrage : lier le fond de la carte aux Paramètres, qui permettent
     la saisie et la modification des fournisseurs de carte, MapTiler par défaut) : section « Fournisseurs de fonds de
     carte » des Paramètres ; MapTiler intégré et fournisseur par défaut (fonds Satellite, Satellite et noms, Plan,
     Topographique ; clé de « Connexion MapTiler ») ; fournisseurs XYZ saisis (https, `{z}{x}{y}`, `{cle}` facultatif,
     attribution obligatoire), modifiables, désactivables, supprimables ; fond neutre choisissable par défaut. Réglages et
     clés **dans le navigateur seulement** (jamais envoyés à l'API Fadi) ; une carte enregistrée ne garde que
     l'identifiant `navigateur:<fournisseur>:<style>`. Sans clé, aucun fond n'est inventé (option « clé absente ») ; tuiles
     refusées → avis non bloquant et retour au fond neutre en un geste. Conditions d'export non établies : un fond de
     fournisseur n'est jamais exportable (refus motivé du serveur).
   - D-GD-16 (25 octobre 2026, demande du maître d'ouvrage, limites administratives) : le contour d'une entité prend
     la couleur de l'entité, opaque même à 0 % de remplissage ; tous les contours sont dessinés au-dessus de tous les
     remplissages ; en superposition, hiérarchie Région (dessus, contour 3,5 px) → Province (2,2 px) → Commune (1,2 px).
     Le rang se lit de la source (niveau `ADM1`/`ADM2`/`ADM3`, ou niveau administratif OpenStreetMap du titre : 4, 5, 8),
     jamais deviné ; une couche hors hiérarchie garde l'ordre de la composition (contour 1,5 px).
   - D-GD-17 (26 octobre 2026, analyse des cartes du HCP et des sources RGPH 2024 transmise par le maître d'ouvrage ;
     décisions prises sous la délégation GeoData, sur les options recommandées par l'analyse) :
     1. **Droits HCP** : les indicateurs téléchargés sur hcp.ma et bds.hcp.ma sont réutilisables sous **CC BY 4.0**, usage
        commercial compris (CGU du HCP v1.0, § 3, lues le 26 octobre 2026) — citer « HCP, RGPH 2024 », indiquer les
        modifications, ne pas laisser entendre un soutien du HCP, respecter l'intégrité des effectifs. Seuls les **fichiers
        de données** sont repris ; les cartes, tableaux de bord et la plateforme Superset `resultats2024.rgphapps.ma` ne
        sont ni reproduits ni aspirés (§ 5 : éléments du site protégés). Débloque GEO-DATA-01.
     2. **Arabe : aucun** (décision du maître d'ouvrage du 26 octobre 2026) — ni interface arabe ni bouton AR, ni nom ou
        libellé arabe affiché dans les couches ajoutées ; les noms arabes du HCP ne servent qu'au rattachement des
        communes et ne sont pas livrés dans les couches. Les couches existantes ne sont pas modifiées.
     3. **Contours des communes** : OpenStreetMap (déjà en base) ; un fichier officiel du HCP le remplacera s'il est fourni.
     4. **Rattachement** : valeurs HCP rattachées aux contours par une table de correspondance relisible
        (`docs/geodata/sources/correspondances/`), chaque lien contrôlé par la géographie (inclusion dans la région ou la
        province), nom approché seulement s'il est unique et nettement devant, rattachements manuels justifiés ligne à
        ligne ; une entité non rattachée garde « non appariée », jamais zéro. Lot A livré : population légale sur
        3 niveaux (12/12 régions, 75/75 provinces et préfectures, 1 487/1 498 contours communaux, 97,6 % de la population).
     5. **Lot A2 — indicateurs et arrondissements** (accord du maître d'ouvrage du 26 octobre 2026 : ordre A2, puis B,
        E, C, D, F, G ; arrondissements : chiffres dans la fiche **et** recherche de leurs contours) :
        - fichier HCP « Indicateurs démographiques et socio-économiques » (`https://www.hcp.ma/file/242671/`, CC BY 4.0) :
          648 indicateurs par niveau, rangés par **thème** et **famille**, déclinés par **modalité**, **milieu**
          (ensemble, urbain, rural) et **sexe** ; plus la population légale selon la nationalité ;
        - valeurs livrées dans un **tableau CSV** à côté du GeoJSON (`version.tableau`, empreinte contrôlée ; l'empreinte
          de la version couvre les deux fichiers), jamais dans les propriétés des objets ;
        - signes du HCP : « … » → motif « sans objet » (nouveau motif d'absence), « . » → « non publiée » ; jamais zéro ;
        - **arrondissements** (41 du HCP, code de 8 chiffres rattaché à sa commune) : contours OpenStreetMap de niveau
          administratif 10 (`donnees/osm-mar-arrondissements.geojson`, extrait du 23 octobre 2026), rattachés par nom et
          inclusion dans la commune mère : 41/41 ; couche `hcp-rgph2024-arrondissements` (rang 4, sous la commune). Les
          subdivisions OSM sans arrondissement HCP (quartiers…) ne sont pas livrées ;
        - interface : choix d'une famille par thème puis de sa modalité, de son milieu et de son sexe ; fiche par thème ;
          table limitée aux 24 indicateurs principaux (la fiche les montre tous).
     6. **Suite** (lots B à G de l'analyse : navigation par niveaux, libellés, palettes et classes, fiche territoriale,
        arbre d'indicateurs, mini-carte et impression) : un lot à la fois, chacun consigné.

   - D-GD-18 (26 octobre 2026, consigne du maître d'ouvrage : « si des données existent dans HCP et OpenStreetMap,
     utilise celles du HCP ») — **priorité HCP** :
     1. Noms, codes et effectifs : ceux du HCP dès qu'une unité HCP est rattachée ; OpenStreetMap ne fournit alors que la
        géométrie (contour ou point). Sans unité HCP, la donnée OSM reste, avec sa source déclarée.
     2. **Villes** : la couche `hcp-rgph2024-villes` (points OSM place=city / town) porte la population légale, les
        ménages et la nationalité du HCP pour 258 villes sur 338, rattachées à une commune entièrement urbaine ou à un
        centre urbain (« dont le centre urbain de … ») contenant le point, de même nom (jamais l'effectif d'une commune
        rurale) ; l'attribut `population` d'OSM est alors retiré. 8 villes sans unité HCP gardent la population OSM,
        signalée par `source_population`.
     3. **Pas de doublon au catalogue** : les extraits OSM des communes, des villes et des arrondissements n'ont plus de
        fiche importable ; leur fiche (licence, empreinte) est consignée dans `docs/geodata/sources/donnees/osm-extraits.json`
        et ne sert qu'aux couches du HCP. Les versions déjà publiées (`osm-mar-communes`, `osm-mar-villes`) restent
        immuables : le gestionnaire de données les retire du catalogue s'il le souhaite.
     4. **Recherche** : les unités du HCP sont proposées en premier.

   - D-GD-19 (26 octobre 2026, lot B du plan HCP, sous la délégation GeoData) — **navigation par niveaux** :
     1. Fil posé sur la carte, à droite du bouton « Données » : « Maroc › Région … › Province … » ; chaque étape ramène à
        son niveau ; « Retour » (icône, **Alt+↑**) remonte d'un niveau et recadre la carte.
     2. On descend depuis la fiche d'une entité : « Voir ses provinces et préfectures / communes / arrondissements »
        (icône, **Alt+↓**). La couche du niveau inférieur est prise dans la carte, sinon au catalogue chez le même
        producteur des valeurs (ajoutée alors à la carte).
     3. Parenté lue des **codes du HCP** seulement (`packages/geodata-model/src/niveaux.ts`) : province = code sans ses
        3 derniers chiffres ; commune = plus long préfixe de province ; arrondissement = commune de 7 chiffres aux
        6 mêmes premiers. Jamais par la géométrie ni par le nom ; un contour non rattaché ou un code non HCP n'est jamais
        rangé sous une entité ; un niveau absent de la carte interrompt la descente (aucune parenté devinée).
     4. Affichage : l'entité seule à son niveau, ses ancêtres au-dessus, ses descendants en dessous ; ce filtre de
        navigation s'ajoute au filtre de la table (intersection) et n'est pas enregistré dans la carte.

   - D-GD-20 (26 octobre 2026, fichiers HCP transmis par le maître d'ouvrage) — **indicateurs communaux complémentaires** :
     1. Trois fichiers du HCP (CC BY 4.0) ajoutés aux couches RGPH 2024 (régions, provinces, communes, arrondissements),
        rangés comme le lot A2 : « Logement urbain » (parc logement urbain 2024, 55 indicateurs, milieu urbain),
        « Mobilité domicile – travail » (mode de transport des actifs occupés, RGPH 2024, 117 indicateurs par milieu et
        sexe), « Établissements économiques » (CEE 2023/2024, 22 indicateurs) : 844 indicateurs par niveau.
     2. Codes : ceux du RGPH ; pour la CEE, code en colonnes recomposé (« 01.511.01.03 » → « 15110103 ») et contrôlé par
        les unités du RGPH (noms relus : 2 écarts seulement, arrondissements renommés à Tanger) ; les grandes communes
        n'ont dans la CEE que leurs arrondissements : la commune reste « non publiée » (aucune somme calculée).
     3. Signes : « _ » (pas de logement urbain) = sans objet ; cellule vide, ou unité absente d'un fichier = « vide »,
        non publiée ; jamais zéro.
     4. Les deux autres fichiers transmis sont ceux déjà intégrés (mêmes empreintes). La base des **douars** (33 000
        douars, sans contour, noms en arabe seulement) n'est pas une couche : elle ira dans la fiche territoriale de la
        commune rurale (lot E), par code, nom (en arabe, D-GD-21), type de douar, ménages et population.

   - D-GD-21 (26 octobre 2026, consigne du maître d'ouvrage : « là où l'arabe est nécessaire, utilise-la ») —
     **arabe là où il est nécessaire**, précision de D-GD-17 point 2 :
     1. Une donnée publiée **seulement en arabe** (noms des douars, de leur fraction et de leur commune dans la base des
        douars du HCP) est affichée en arabe, telle quelle : écriture de droite à gauche (`dir="rtl"`, `lang="ar"`),
        jamais traduite ni translittérée par Fadi (`translate="no"`).
     2. Quand un nom existe en français (régions, provinces, communes, arrondissements, villes), seul le français est
        affiché, comme décidé le 26 octobre 2026 ; l'interface reste en français et en anglais (aucune interface arabe).

   - D-GD-22 (26 octobre 2026, lot E du plan HCP, sous la délégation GeoData) — **fiche territoriale** :
     1. La fiche d'une entité range ses indicateurs par thème ; une famille déclinée est un **tableau de ventilation**
        (modalités en lignes, milieu × sexe en colonnes). Cellule absente : signe du HCP (« … » sans objet, « . » non
        publiée, « n.d. » autre absence) avec le motif complet en infobulle, jamais zéro ; une colonne entièrement sans
        objet pour l'entité (l'urbain d'une commune rurale) est masquée.
     2. Fiche d'une commune : chiffres de ses **arrondissements** (population légale, ménages), lus dans la couche des
        arrondissements du même producteur, chacun ouvrant sa propre fiche.
     3. Fiche d'une commune rurale : ses **douars** (annexe `geodata_douars` de la version, 33 189 douars rattachés par
        le code à 1 279 communes) — code, fraction et nom en arabe (D-GD-21, de droite à gauche), type, ménages,
        population, sexe et grands groupes d'âge ; « X » du HCP = secret statistique, jamais zéro ; aucune somme.
     4. **Impression** : « Imprimer la fiche » (icône, **Alt+P**) imprime la fiche seule, toutes sections dépliées, avec
        son titre, sa source et sa date (heure de Zurich), dans une fenêtre d'impression : ni iframe (ARC-10), ni règle de
        style hors de `.geodata-page` (GEO 04) ; fenêtre bloquée par le navigateur = avis, rien d'imprimé en silence.

   - D-GD-23 (26 octobre 2026, demande du maître d'ouvrage : « fais l'import automatique au déploiement » et
     « demande une quittance de fin de processus et de non-blocage du déploiement automatique ») :
     1. **Import automatique** : au démarrage de l'API, si `GEODATA_IMPORT_AUTO_PAR` désigne un compte GeoData (rôles
        « gestionnaire-donnees » et « responsable-publication »), la chaîne d'import (`geodata-reference.js --fiche toutes
        --preparateur … --publier-par …`) tourne en arrière-plan : chaque fiche livrée est préparée puis publiée si elle
        n'est pas en base. L'empreinte attendue se lit dans la fiche : une fiche déjà importée n'est ni relue ni
        retéléchargée (contrôle en moins d'une seconde) ; les empreintes réelles restent contrôlées à la lecture.
     2. **Retraits déclarés** : `docs/geodata/sources/donnees/retraits-sources.json` (clé, remplaçante, motif, décision) ;
        les versions de référence publiées de ces sources sont retirées par le même compte, journalisées
        (`version.retiree`), **seulement si leur remplaçante a une version publiée** (sinon l'ancienne reste
        consultable et le refus est consigné) — `osm-mar-communes` et `osm-mar-villes` (D-GD-18).
     3. **Quittance du serveur** : `GET /version/donnees` (commit qui tourne, état de l'import : désactivé, en cours,
        terminé avec son bilan, échec avec la dernière erreur), sans requête à la base.
     4. **Quittance de fin de processus** : après chaque fusion, la CI de `main` est suivie jusqu'au vert ; un job tué
        par l'infrastructure (installation de Chromium figée…) est relancé une fois, un vrai échec est corrigé ; une
        quittance est déposée sur la PR fusionnée (commit, CI de `main` verte, déploiement automatique non bloqué). Côté
        serveur, `sudo fadi-preprod status` et `/version/donnees` confirment le commit déployé et l'import.
     5. **Non-blocage** : l'installation de Chromium de la CI est bornée (10 minutes par essai, 3 essais) au lieu
        d'attendre l'annulation du job ; avant un nouvel essai, l'apt-get laissé par l'essai interrompu est attendu
        (10 minutes au plus), sinon son verrou dpkg ferait échouer les essais suivants.
   - D-GD-24 (26 octobre 2026, lot C, demande du maître d'ouvrage : « continue avec le lot C ») — **libellés sur la
     carte** :
     1. Un libellé par entité : son nom, et pour une couche thématique sa valeur **abrégée** (« 36,8 M », « 12,3 k »,
        « 12,5 % » ; `packages/geodata-model/src/etiquettes.ts`). Une valeur absente n'affiche que le nom, jamais « 0 » ;
        la valeur complète reste dans la fiche et la table. Collisions résolues par le moteur (un libellé qui en chevauche
        un autre n'est pas tracé).
     2. Affichage par couche (case « Libellés » du panneau Couches, enregistrée dans la composition : clé `etiquettes`,
        absente quand ils sont masqués, si bien qu'une carte enregistrée avant le lot C reste identique) et pour toutes
        les couches vectorielles visibles par le bouton « Libellés » de la barre d'outils (icône propre, raccourci Alt+L).
     3. Points d'étiquette servis par `GET /geodata/api/etiquettes/:couche/:z/:x/:y` (MVT, couche `etiquettes`), lus
        seulement quand les libellés d'une couche sont affichés : `ST_PointOnSurface` (toujours sur l'entité), dans la
        seule tuile qui le contient (aucun libellé doublé), mêmes règles d'accès et de cache que les tuiles.
     4. **Glyphes hébergés par Fadi** (aucune police tierce) : Noto Sans Regular (SIL OFL 1.1) au format PBF
        d'OpenMapTiles, six plages latines seulement (`apps/web/public/geodata/glyphes/NotoSans-Regular/`, ≈ 540 Ko,
        chargées à la demande) ; provenance, empreintes et licence dans `apps/web/public/licences/noto-sans/`, contrôlées
        par test. Un caractère hors de ces plages (arabe) est retiré du libellé de la carte par le serveur ; s'il ne reste
        rien, le code de l'entité est affiché. Les noms publiés seulement en arabe restent affichés en arabe dans la fiche
        (D-GD-21).
   - D-GD-25 (26 octobre 2026, lot D) — **palettes et classes** d'une carte thématique :
     1. Méthodes : quantiles, intervalles égaux, **seuils naturels de Jenks** (algorithme exact de Fisher ; au-delà de
        2 000 valeurs, un échantillon régulier des valeurs triées est classé), seuils manuels. Les valeurs absentes ne
        sont jamais classées (entrée « Valeur absente » hachurée, jamais zéro).
     2. Nombre de classes : 2 à 10 ; moins si les valeurs se répètent (aucune classe vide inventée).
     3. Palettes prédéfinies : la palette historique « Bleu-violet » (défaut, inchangée) et des palettes ColorBrewer
        (Cynthia Brewer, licence Apache 2.0) séquentielles (bleus, verts, oranges, rouges, violets, jaune → rouge) et
        divergentes (rouge ↔ bleu, brun ↔ vert) ; inversion possible ; n couleurs réparties sur toute la palette.
     4. Couleur par classe : la pastille de chaque classe de la légende est un sélecteur de couleur ; les couleurs
        enregistrées dans la composition font foi. Composition : `methode` « seuils-naturels », `palette` et `inverser`
        optionnels (absents par défaut : une carte enregistrée avant le lot D reste identique).
   - D-GD-26 (26 octobre 2026, lot F) — **arbre d'indicateurs** : dans le panneau Couches, « Parcourir les indicateurs »
     range les indicateurs d'une couche par thème puis famille (repliés ; le thème de l'indicateur en cours est déplié),
     avec une recherche qui ignore accents et casse et retient une famille quand chaque mot cherché commence un mot de
     son thème, de son nom, d'une modalité ou de son unité (« âge » ne trouve pas « chômage »). Choisir une famille colore
     la couche par sa déclinaison par défaut ; la liste « Coloration » reste disponible. Aucun indicateur n'est renommé
     ni regroupé autrement que par ses dimensions publiées (`arbreIndicateurs`, `packages/geodata-model`).
   - D-GD-27 (26 octobre 2026, lot G) — **mini-carte de situation et impression directe** :
     1. Mini-carte : bouton de la barre d'outils (icône propre, Alt+M), masquée par défaut, préférence mémorisée dans ce
        navigateur seulement ; seconde carte sans interaction propre, zoom de la vue moins 4 niveaux, contours de la
        limite administrative la plus haute visible (sinon de la première couche vectorielle visible), emprise de la vue
        en rectangle ; un clic recentre la carte. Placée en bas à gauche, à droite du panneau quand il est ouvert.
     2. Impression directe : bouton « Imprimer la carte » (icône, Alt+I). Seule une carte **enregistrée** s'imprime, avec
        **le même verdict du serveur que l'export** (droits des sources, attributions, révision) : l'impression n'est
        pas un contournement de l'export. La fenêtre est ouverte au clic (sinon bloquée), l'image autorisée (titre,
        légende, échelle, attributions, mini-carte en encart si elle est affichée) y est posée puis imprimée ; un refus
        y est expliqué avec ses motifs.
   - D-GD-28 (26 octobre 2026, lot H) — **navigation territoriale permanente, découpage du pays en base** (choix du
     maître d'ouvrage : « Fadi neutre, données du pays en base » ; aucun référentiel territorial dans le code) :
     1. La barre de navigation (pays › niveau 1 › … › niveau 4, une liste par niveau, Retour Alt+↑) fait partie de
        l'interface : elle est toujours affichée et ne dépend ni des couches posées ni de la source des couches.
     2. Le découpage vit en base : `geodata_pays` (code ISO alpha-2, nom, noms des niveaux) et `geodata_territoires`
        (pays, rang 1–4, code, nom, parent, contour, version source). Il se charge à la publication d'une fiche
        qualifiée qui déclare `territoire` { pays, nomPays, rang, niveau { singulier, pluriel }, parent } ; le
        chargement est idempotent par version et rejoué par la chaîne d'import (aussi pour une version déjà présente).
     3. Le parent se déduit par une règle déclarée dans la fiche : `codes-hcp` (code HCP du niveau supérieur) ou
        `inclusion` (point intérieur du contour dans le contour du niveau supérieur, PostGIS). Le Maroc (fiches HCP
        RGPH 2024, rangs 1 à 4) est le premier pays ; un autre pays s'ajoute par ses fiches, sans code.
     4. Choisir une unité cadre la carte sur son emprise et trace son contour (attribution de la version source) ;
        une base sans découpage l'annonce, sans rien inventer.
   - D-GD-29 (26 octobre 2026) — **interface et base de données distinctes ; tous les fichiers de données en base**
     (règle du maître d'ouvrage, inscrite dans `AGENTS.md` et `CLAUDE.md`) :
     1. Toujours distinguer l'interface (l'application et ses outils) des données, stockées en base dédiée ; ce binôme
        s'emploie partout où il y a des données. Aucun référentiel ni jeu de données n'est codé dans l'application.
     2. Chaque fichier du dossier des sources qualifiées (fiches, données GeoJSON / CSV / TSV / GeoTIFF, correspondances,
        extraits, retraits déclarés) est copié tel quel dans `geodata_fichiers` (contenu, taille, SHA-256, rôle, clé de
        source) par la chaîne d'import (`--archiver`), à chaque démarrage de l'API, même sans
        `GEODATA_IMPORT_AUTO_PAR` (aucun compte requis) ; un fichier inchangé n'est pas réécrit, un fichier qui n'est plus
        livré reste en base, marqué retiré. Bilan dans la quittance `GET /version/donnees`.
     3. Au même démarrage, le découpage territorial est écrit en base depuis les versions publiées des fiches qui le
        déclarent (aucune commande pour le maître d'ouvrage).
     4. **Aucun réglage, aucun compte** : sans `GEODATA_IMPORT_AUTO_PAR`, les fiches livrées sont préparées et publiées
        **par la livraison elle-même** (`geodata-reference --livraison` : `preparee_par` et `publiee_par` nuls, journal
        `{ par: "livraison" }`), et les retraits déclarés appliqués. La responsabilité est celle du dépôt : fiche qualifiée
        relue en PR, empreinte contrôlée, CI verte. `GEODATA_IMPORT_AUTO_PAR=<courriel>` fait la même chose au nom d'un
        compte ; `GEODATA_IMPORT_AUTO=non` coupe tout (recettes de la CI). Mesuré sur une base neuve sans aucun compte :
        53 versions publiées, 121 fichiers archivés, découpage MA (4 rangs) en 61 s ; second démarrage 1 s, rien refait.
   - D-GD-30 (27 octobre 2026) — **une seule source par niveau administratif** (demande du maître d'ouvrage : « fusionne
     les deux sources, HCP là où il y en a, sinon OpenStreetMap ; complète, sans doublon ») :
     1. Par niveau, une seule couche au catalogue, rangée sous « Limites administratives » (thème
        `limites-administratives`) : « Limites administratives — régions / provinces et préfectures / communes /
        arrondissements (RGPH 2024) ». Chacune porte **tous** les contours d'origine (geoBoundaries ADM1 / ADM2 pour
        régions et provinces, OpenStreetMap pour communes et arrondissements), enrichis des noms, codes et valeurs du HCP
        là où le rattachement existe ; un contour sans rattachement garde ses seuls attributs d'origine, rien n'est
        inventé (communes : 1 498 contours, 1 487 rattachés, 11 contours OSM sans nom ni unité HCP ; 16 unités HCP sans
        contour connu restent dans la table de correspondance, sans géométrie).
     2. Les fiches geoBoundaries ADM1 / ADM2 ne sont plus des fiches livrées : déplacées dans `sources/references/` (lues
        par `preparer_hcp.py` pour les contours, archivées avec le rôle `reference`), leurs versions sont retirées du
        catalogue par `retraits-sources.json` au profit des couches HCP, comme OSM communes et villes (D-GD-18).
     3. Les métadonnées d'une source (titre, producteur, thème, couverture, description) suivent la fiche, même sans
        nouvelle version (`assurerSource`, `ecrireVersion` ON CONFLICT) : une fiche corrigée range la source au bon
        endroit au redéploiement.
   - D-GD-31 (27 octobre 2026, étape 1) — **rubrique « Indicateurs » du catalogue** (spécification du maître d'ouvrage) :
     1. « Parcourir les indicateurs » quitte les cartes de couche de l'onglet Couches ; il devient la rubrique
        **▸ Indicateurs** de Catalogue › Vecteurs, après « Géologie » (recherche, thèmes et compteurs : réunion des
        indicateurs des couches vectorielles du catalogue, une entrée par clé thème / famille / modalité / milieu / sexe).
     2. Parcours : charger des entités administratives depuis « Limites administratives », choisir un indicateur dans
        « Indicateurs » : il s'applique à **toutes** les couches chargées qui le portent (reconnu par sa clé, jamais par
        son identifiant, différent d'une couche à l'autre) ; une couche qui ne le porte pas garde sa coloration.
     3. Un seul indicateur actif à la fois (un nouveau choix remplace le précédent partout ; règle à revoir plus tard).
        Chaque carte de couche concernée a l'option « Afficher / Masquer l'indicateur » (Afficher par défaut ; Masquer
        rend la coloration normale, l'indicateur reste mémorisé). Une couche chargée après le choix reçoit l'indicateur
        actif, option sur Afficher. L'indicateur actif n'est pas enregistré avec la carte (les colorations le sont).
     4. Hors périmètre : choix de l'entité par la barre territoriale, multi-indicateurs.
   - D-GD-32 (27 octobre 2026, étape 1 consolidée) — **l'indicateur est une valeur affichée, jamais une coloration**
     (spécification consolidée du maître d'ouvrage, corrections de D-GD-31) :
     1. La liste « Coloration » d'une couche ne garde que les modes de style « Couleur unie » et « Une couleur par
        entité » ; tous les groupes et options d'indicateurs en sont retirés ; aucun code ne recolore une couche d'après
        un indicateur (classification du lot D retirée de l'interface ; une carte enregistrée avec une coloration
        thématique revient à la couleur unie à l'ouverture). Le choix d'un indicateur se fait uniquement dans la rubrique
        « Indicateurs » du catalogue.
     2. Case « Afficher l'indicateur — [nom] », seul contrôle lié à l'indicateur sur la carte de couche : cochée, la
        valeur de l'indicateur actif s'affiche sur chaque entité (texte abrégé, valeur absente sans texte) ; décochée,
        les valeurs sont masquées et l'indicateur reste mémorisé ; cochée par défaut dès qu'un indicateur est choisi, sur
        toutes les couches chargées, y compris celles chargées après ; aucun effet sur la coloration.
     3. « Libellés (nom) » et « Afficher l'indicateur » : deux textes indépendants (nom de l'entité, valeur de
        l'indicateur), jamais fusionnés, deux couches de rendu, aucun état ni logique partagés ; les quatre combinaisons
        fonctionnent.
     4. Règles inchangées : un seul indicateur actif à la fois (à revoir plus tard) ; hors périmètre : choix de
        l'entité par la barre territoriale, multi-indicateurs.
   - D-GD-33 (27 octobre 2026) — **régions et provinces construites à partir des communes** (constat du maître
     d'ouvrage : sur la préproduction, les limites de régions et de provinces, venues de geoBoundaries, traversaient les
     communes OpenStreetMap ; chaque couche était en outre simplifiée séparément) :
     1. Les niveaux supérieurs ne sont plus des contours indépendants : chaque commune OSM rattachée porte son code HCP de
        commune, de province (plus long code de province préfixe du sien) et de région (code de province sans ses trois
        derniers chiffres) ; une province / préfecture est l'**union des communes** de son code, une région l'**union des
        provinces** de son code. Une commune sans code ou au rattachement ambigu est signalée, jamais devinée.
     2. **Une seule simplification, sur la topologie partagée** (`scripts/geodata/construire_niveaux.py`, mapshaper 0.7.98 :
        accrochage, Visvalingam intervalle 20 m avec petites formes conservées, nettoyage) : une frontière commune n'existe
        qu'en un exemplaire, repris par les trois niveaux. Les tuiles de l'API et le contour du territoire ne simplifient
        plus séparément (quantification MVT seule) : les limites se superposent exactement à tous les zooms.
     3. geoBoundaries n'est plus utilisé pour aucun contour livré (régions, provinces) ; ses fiches de référence ne servent
        plus qu'au rattachement des communes par la géographie dans `preparer_hcp.py`. Les codes HCP restent la clé des
        indicateurs RGPH 2024 à chaque niveau (tableaux de valeurs inchangés).
     4. Comptes et contrôles (`docs/workstreams/geodata/CONTOURS-NIVEAUX.md`, régénéré par le script) : 12 régions, 75
        provinces / préfectures, 1 487 communes livrées ; 16 communes HCP sans contour OSM (listées, lacunes signalées, non
        comblées) ; 11 contours OSM sans unité HCP, entièrement inclus dans une commune rattachée, non livrés ; 0
        chevauchement à chaque niveau ; frontières de provinces et de régions entièrement incluses dans celles des
        communes (0 m hors) ; deux lacunes de couverture (105 km² dans la province d'Ifrane, 13 km² dans la province de
        Kénitra — secteur sans commune dans les deux sources, d'après les communes voisines la lagune de Moulay
        Bousselham) ; les 44 anneaux intérieurs des communes sont des enclaves d'autres communes.
     5. Le fichier des communes (OSM) peut être remplacé par un fichier officiel du HCP sans changer la logique : les
        provinces et les régions sont recalculées.
   - D-GD-34 (27 octobre 2026) — **sélection par nombre de clics, du plus élémentaire au plus global** (spécification du
     maître d'ouvrage ; avant : un clic sélectionnait toujours la région, couche la plus haute) :
     1. Des clics rapides au même endroit (600 ms au plus entre deux clics depuis le correctif du point 7, pointeur immobile à 16 px près) montrent les
        niveaux un par un : 1 clic → commune, 2 → province / préfecture, 3 → région. Le premier clic sélectionne tout de
        suite le plus petit niveau (aucun retard) ; chaque clic suivant remplace la sélection par le niveau au-dessus ;
        au-delà du dernier niveau, rien ne change ; un délai dépassé ou un pointeur déplacé recommence au plus petit.
     2. Couches de limites visibles sur la carte : seuls leurs niveaux comptent, du plus petit au plus grand (provinces et
        régions chargées : 1 clic → province, 2 → région ; un seul niveau : les clics suivants n'y changent rien).
        L'entité du premier clic est celle touchée dans la couche du plus petit niveau ; ses parents viennent de la
        hiérarchie des codes HCP lue en base (`ancetres` de `/territoires/version/:versionId/unites/:code`), jamais d'un
        second test géométrique.
     3. Carte vierge (aucune couche de limites) : les unités du **pays courant** de la barre territoriale qui contiennent
        le point (`GET /territoires/:pays/point?lon=&lat=`, de la plus élémentaire à la plus globale) ; l'entité
        sélectionnée est affichée seule (contour et mise en évidence, couche de rendu propre `gd-entite`), sans ajouter
        de couche à l'onglet Couches ; elle disparaît quand la sélection est effacée. Un clic hors du pays ou sur une
        zone sans entité efface la sélection.
     4. Le double-clic et la double-tape ne zooment plus (le zoom reste par les boutons, la molette et le pincement) ;
        mobile : même logique avec des tapes rapides. Ce que « sélectionner » déclenche (mise en évidence, fiche d'objet)
        est inchangé ; les clics d'un outil actif (dessin, mesure) servent à l'outil et ne sélectionnent rien.
     5. Précédences conservées : un objet d'une couche qui n'est pas une limite (point d'intérêt, ligne) garde la
        sélection simple ; sans couche de limites, une couche raster visible garde la lecture de sa valeur au point
        (D-GD-13). Logique pure `geodata-model/src/selection-clics.ts` (comptage, niveaux, rang du n-ième clic), testée.
     6. Téléphone (correctif du 28 octobre 2026) : la fiche d'objet recouvre la carte (volet du bas) ; elle ne s'ouvre
        qu'une fois la série de tapes terminée (≈350 ms après la dernière), la sélection restant immédiate, pour que la
        2ᵉ et la 3ᵉ tape atteignent encore la carte ; tolérance du pointeur portée à 16 px (un doigt).
     7. Délai de la série (second correctif du 28 octobre 2026, après un nouvel essai infructueux du maître d'ouvrage) :
        la fenêtre de 300 ms (double-clic du navigateur) était trop courte pour des tapes humaines — mesure en émulation
        tactile : 350 à 400 ms entre deux tapes nominalement espacées de 250 ms, le rendu de la première retardant la
        seconde ; chaque tape recommençait donc une série à la commune. `DELAI_CLICS_MS` passe à **600 ms** (fiche
        différée sur téléphone 650 ms après la dernière tape) ; la série est vérifiée à 250 et 400 ms de cadence.

## Conséquences

- `docs/architecture.md` et `module-registry.ts` déclarent GeoData une fois le code livré.
- Les critères GEO 01–13 sont prouvés par tests et recette ; GEO 12 sur appareils physiques et la recette par un
  utilisateur restent à faire par le maître d’ouvrage.
- Une décision contraire du maître d’ouvrage prime : elle se consigne dans une nouvelle ADR.

## Références

- [ADR-GEODATA-01](ADR-GEODATA-01.md) ; [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md).
- [Plan retenu](../../workstreams/geodata/PLAN-IMPLEMENTATION.md).
- Source pilote : https://www.geoboundaries.org/api/current/gbOpen/MAR/ADM1/ (licence ODbL 1.0).
