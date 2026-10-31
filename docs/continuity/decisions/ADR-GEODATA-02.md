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

   - D-GD-35 (28 octobre 2026) — **recherche de la carte déplacée dans une mini-barre** (spécification du maître
     d'ouvrage) :
     1. Nouvelle mini-barre verticale **indépendante** de la barre d'outils (`panneaux/BarreRecherche.tsx`), même style
        (fond blanc, coins arrondis, ombre, boutons de 40 px), placée sous elle à l'écart de ses groupes (8 px) et
        suivant ses déplacements ; une seule icône, la loupe « Rechercher » (raccourci Alt+R, règle d'or). La barre
        d'outils n'a reçu aucun bouton (13 outils) ; elle signale seulement son placement (`onPlacement`).
     2. La loupe ouvre une barre flottante à gauche de la mini-barre, alignée sur la loupe : même champ, même indication,
        même bouton, Entrée ; **même logique** (`lancerRecherche`, `choisirResultat` de la page, inchangés). Curseur dans
        le champ à l'ouverture ; fermeture par Échap, nouvel appui sur la loupe ou clic sur la carte (le clic garde son
        effet : sélection, outils) ; texte gardé jusqu'à la réouverture. Petit écran : toute la largeur libre à gauche
        de la mini-barre ; résultats ouverts vers le haut quand la loupe est dans la moitié basse.
     3. Placement pur et testé (`placerMiniBarre`, `placerRecherche`) : jamais sur l'échelle ni les sources du bas à
        droite — sans place sous la barre d'outils, la mini-barre se range à gauche de son bas.
     4. Barre au-dessus de la carte : champ et bouton Rechercher retirés ; Fond, Fournisseurs, état d'enregistrement,
        Enregistrer et menu ☰ inchangés ; la loupe de l'en-tête vert (recherche de la plateforme) n'est pas touchée.

   - D-GD-36 (28 octobre 2026) — **mini-barre (Enregistrer, Fond), menu ☰ « Cartes », concept « Collection »**
     (spécification du maître d'ouvrage) :
     1. Mini-barre : sous la loupe, **Enregistrer** (disquette ; même fonction `enregistrer()` et même condition
        d'activation que le bouton de la barre, même indicateur) et **Fond de carte** (couches et repère ; liste flottante
        des choix calculés une seule fois par la page, `choixFonds`, qui alimentent aussi le sélecteur Fond ; fond actif
        coché ; un clic applique et ferme ; Échap, nouvel appui ou clic sur la carte ferment ; vers le haut quand le
        bouton est dans la moitié basse). Icônes tracées dans le module, même trait que les autres. Barre au-dessus de la
        carte inchangée.
     2. Menu ☰ : « Mes cartes » devient la rubrique dépliable **Cartes** › Mes cartes (Nouveau, Ouvrir, Partager,
        Enregistrer, Enregistrer sous), Collection (Nouveau, Ouvrir, Enregistrer, Enregistrer sous), Fournisseurs
        (Nouveau, Gérer). Chaque entrée appelle une fonction existante ; **Partager**, sans fonction existante, est
        affiché désactivé « bientôt ». « Enregistrer sous » d'une carte ouverte = nouvelle carte, même composition
        (création existante) ; Fournisseurs › Nouveau ouvre le formulaire d'ajout existant des Paramètres.
     3. **Collection** = ensemble nommé et ordonné de références vers des cartes de l'espace (plusieurs collections par
        carte ; supprimer une collection ne supprime aucune carte). Le rattachement unique antérieur
        (`geodata_cartes.collection_id`) est repris dans la liaison ordonnée `geodata_collection_cartes` et n'est plus
        écrit. Révision attendue à chaque enregistrement (périmée → 409, jamais de perte silencieuse ; remarque de revue
        Codex). Concept, modèle de données et API : `docs/workstreams/geodata/COLLECTIONS.md`.

   - D-GD-37 (29 octobre 2026) — **barre blanche supprimée, cinq onglets, tableau de bord RGPH 2024** (spécification du
     maître d'ouvrage, étape 2 validée « Ok continue ») :
     1. La barre blanche ne porte plus Fond / Fournisseurs / Enregistrer ni l'état « Carte non enregistrée » : Fond et
        Enregistrer sont dans la mini-barre, Fournisseurs et Enregistrer dans ☰ › Cartes ; l'état est une pastille sur
        l'icône Enregistrer (infobulle « Carte non enregistrée »).
     2. Elle devient la **barre d'onglets** « Cartes thématiques · Chiffres clés 2024 · Tableaux RGPH 2024 · CEE 2024 ·
        Concepts et définitions », ☰ à droite ; une adresse par onglet (`/geodata`, `/geodata/chiffres-cles`,
        `/geodata/tableaux`, `/geodata/cee`, `/geodata/concepts`) ; la carte reste montée sous les autres onglets.
     3. Données : ligne nationale du fichier HCP d'indicateurs importée (fiche `hcp-rgph2024-royaume`, code `MA`,
        contour = union des 12 régions) ; taux d'urbanisation et totaux nationaux de la CEE **calculés** et marqués
        comme tels (nature `calcule`, méthode écrite) ; concepts du HCP (français) en base (`geodata_concepts`) ;
        définition des blocs en base (`geodata_tableaux_bord`, annexe de la fiche, aucune valeur). Séries 1960–2014,
        concepts en arabe et emplois CEE par secteur absents : « Donnée non disponible ». Graphiques en SVG interne,
        aucune nouvelle dépendance. Détail : `docs/workstreams/geodata/TABLEAU-DE-BORD.md`.

   - D-GD-38 (29 octobre 2026) — **fil de navigation administrative pliable, déplacé dans la mini-barre** (spécification
     du maître d'ouvrage) :
     1. Le fil (« Maroc › niveaux › Retour », composant `BarreTerritoriale` réutilisé sans réécriture) quitte le haut à
        gauche de la carte ; « Données » ne bouge pas.
     2. Mini-barre, de haut en bas : Loupe, Enregistrer, **≡ « Navigation administrative »**, Fond. ≡ plie / déplie le
        fil, ouvert en panneau flottant à gauche de la mini-barre, aligné sur ≡ (sur la largeur disponible au téléphone).
        Plié par défaut ; le fil reste monté et se tient à jour plié.
     3. Un seul panneau (recherche, fil, fonds) ouvert à la fois, état tenu par la page : en ouvrir un referme l'autre
        sans perdre son état (texte de recherche gardé). Le fil ne se ferme pas sur un clic de la carte (sélection par
        clics) ; ≡ ou Échap le ferment. Son état est conservé d'un onglet à l'autre. Enregistrer une carte jamais
        enregistrée ouvre la saisie du titre (Mes cartes, inchangé) et referme le panneau ouvert.

   - D-GD-39 (30 octobre 2026) — **fiche d'information : tableau croisé Milieu × Sexe** (spécification du maître
     d'ouvrage) :
     1. Tout indicateur sans modalité décliné par milieu et / ou par sexe (Population légale, Population municipale, taux,
        effectifs…) s'affiche en tableau croisé : lignes Urbain, Rural, puis Ensemble (en gras, séparée) ; colonnes
        Ensemble, Masculin, Féminin. Structure lue dans les déclinaisons en base (`tableauCroise`, geodata-model), jamais
        écrite pour un indicateur ; ligne ou colonne entièrement sans objet masquée ; donnée non publiée : convention
        actuelle (« . », « n.d. », motif au survol). Population légale : colonne Ensemble seule (non ventilée par sexe).
     2. Couleurs : palette partagée `--gd-cat-urbain|rural|ensemble|masculin|feminin` (geodata.css), utilisée par les
        tableaux (liseré des lignes, pastille des colonnes, barre de part sous Urbain et Rural) et par les légendes des
        graphiques (séries `--gd-serie-*` dérivées, catégories reconnues par leur libellé du modèle) ; l'impression relit
        ces jetons. Cellules neutres ; le libellé reste écrit. Fadi n'a pas de thème sombre : contraste vérifié en clair.
     3. Cohérence (indicateurs de compte seulement) : Urbain + Rural = Ensemble, Masculin + Féminin = Ensemble ; un écart
        est affiché sous le tableau, jamais corrigé. Données HCP : aucun écart sur la population légale ni municipale ;
        écarts de 1 (arrondis du HCP) sur 5 familles d'effectifs (population alphabète, active, inactive, active occupée,
        actifs occupés sédentaires). L'écart du constat (1 494 413 ≠ 1 487 236) venait du rapprochement de l'Ensemble de
        la population légale avec Masculin / Féminin de la population municipale : chaque cellule lit désormais son
        propre indicateur.
   - D-GD-40 (30 octobre 2026) — **lot « Lecture de l'emprise »** (demande du maître d'ouvrage, à partir de l'analyse
     `docs/workstreams/geodata/ANALYSE-FEENWAY.md`, propositions P1-1, P1-2, P1-3 et P1-5) :
     1. **Synthèse de la vue** (bouton de la barre d'outils, Alt+V) : pour chaque couche d'objets visible, objets qui
        recoupent la vue sur le total de la couche, lus en base (`GET /couches/:id/vue?bbox=`, géométrie de référence,
        filtre de la couche appliqué) ; avec un indicateur actif porté par la couche, minimum, moyenne **simple non
        pondérée** et maximum des entités évaluées, et nombre d'entités non évaluées (une absence n'est jamais comptée).
        Rien n'est lu tant que la synthèse est fermée ; relue à chaque arrêt de la carte.
     2. **Regroupement des points** (case « Regrouper les points » par couche de points, bouton de la barre, Alt+G) :
        calculé par le serveur dans les tuiles (`?regrouper=1`), grille Web Mercator de 8 × 8 cellules par tuile alignée
        sur les tuiles, jusqu'au zoom 13 ; au zoom 14 chaque point est servi seul. Grappes numérotées, un clic s'en
        rapproche de deux crans, aucune sélection. Enregistré dans la composition (`regrouper`, absent = non regroupé :
        une carte antérieure reste identique). Une couche filtrée n'est jamais regroupée.
     3. **État de la carte dans l'adresse** (fragment `#v=lon,lat,zoom,cap&carte=…&c=couche~version~m~g,…&i=…`), réécrit
        sans entrée d'historique ; une adresse prime sur la dernière carte du navigateur. Carte enregistrée : ses couches
        et styles font foi, la caméra du lien s'applique ; sinon couches du lien avec leur version figée et leur style par
        défaut. Le fragment n'est jamais envoyé au serveur ; il ne contient que des identifiants contrôlés à la lecture (une
        couche d'un autre espace reste refusée et est signalée). « Copier l'adresse de cette vue » (bouton, Alt+K) ;
        « Partager » (droits, destinataires) reste à spécifier (GEO-PARTAGE-CARTE).
     4. **Zoom courant affiché** en permanence à côté de l'échelle (déjà présente).

   - D-GD-41 (30 octobre 2026) — **lot « Zone d'étude qui filtre »** (demande du maître d'ouvrage, proposition P1-4 de
     `ANALYSE-FEENWAY.md`) :
     1. Une zone d'étude enregistrée (Études) peut devenir **le filtre de zone** : « Filtrer par cette zone » dans Études,
        puce « Zone d'étude : nom × » en haut de la carte, Alt+Z (retire le filtre, ou rétablit la dernière zone filtrée,
        sinon la plus récente). Une seule zone à la fois.
     2. Le filtre retient les objets qui **recoupent** la zone (intersection sur la géométrie de référence, en base) :
        carte (filtre de codes combiné aux autres filtres), table attributaire (`/couches/:id/table?zone=`) et synthèse de
        la vue (D-GD-40 : « N dans la vue sur T », T = objets de la zone). Codes lus par `/couches/:id/vue?zone=` (au plus
        5 000 par couche ; au-delà, la puce dit « partiel »).
     3. Le **tableau de bord** n'est pas filtré : ses chiffres portent sur des territoires entiers et une zone libre en
        recoupe des parties ; il le signale et renvoie à « Analyser » (analyse figée des Études), seule agrégation sur une
        zone libre, avec sa méthode écrite. Aucune valeur n'est répartie au prorata.
     4. La zone filtrée s'écrit dans l'adresse de la vue (`z=`) ; une zone d'un autre espace ou archivée répond 404 et le
        filtre est retiré avec un avis.

   - D-GD-42 (27 octobre 2026, intégré le 30 octobre 2026 après D-GD-42 à D-GD-41) — **niveaux infra-communaux sur tout le territoire, tout venant de la base** (demande du
     maître d'ouvrage ; détail : `docs/workstreams/geodata/DECOUPAGE-INFRA-COMMUNAL.md`) :
     1. Tables `geodata_niveaux_administratifs` (rang sans borne, du plus global au plus fin), `geodata_entites_administratives`
        (code HCP, noms, niveau, code du parent, type, source, période) et `geodata_decoupage_imports` ; aucune liste de
        territoires ni de niveaux dans le code (test). La hiérarchie se lit par le lien parent → enfant.
     2. Données lues dans le fichier HCP de la population légale RGPH 2024 (livré tel quel, archivé en base) par
        `scripts/geodata/decoupage_hcp.py` : 12 régions, 75 provinces / préfectures, 1 503 communes, 8 préfectures
        d'arrondissements, 41 arrondissements ; inventaire `INVENTAIRE-DECOUPAGE.md`.
     3. Import en base **unique**, sur le serveur, par l'exploitant (`geodata-reference.js --decoupage`), jamais au
        démarrage de l'API (consigne du 27 octobre 2026) ; relancé sur le même fichier, il ne fait rien ; un nouveau
        fichier met à jour par code, sans doublon, avec bilan (ajoutées, modifiées, retirées, sans parent).
     4. Contours de tous les niveaux par union de bas en haut suivant les liens (`construire_niveaux.py`), une seule
        simplification sur la topologie partagée ; couche « Préfectures d'arrondissements » (indicateurs RGPH 2024).
     5. Fiches : `territoire: { pays, nomPays, niveau: "<code>" }` (règle « decoupage ») ; la règle « codes-hcp » (parenté
        écrite dans le code) est retirée ; la règle « inclusion » reste pour un pays sans découpage importé.
     6. Interface : rang des couches, parents, sélection par clics (niveaux réels de l'endroit : 5 à Casablanca selon le
        fichier HCP, 4 dans les autres communes à arrondissements, 3 ailleurs), barre territoriale, fiche et catalogue
        « Limites administratives » (ordre de la table des niveaux) lus en base.
     7. À arbitrer : le fichier HCP range les préfectures d'arrondissements sous la commune de Casablanca (5 niveaux, la
        demande en comptait 4) ; la hiérarchie livrée suit le fichier.
   - D-GD-43 (30 octobre 2026) — **données « géoportail » du MTNRA** (fichiers fournis par le maître d'ouvrage) :
     1. `donnees-geoportail-open-data-2022.xlsx` est la ressource publiée sur data.gov.ma par le MTNRA (jeu
        « Coordonnées alphanumériques des administrations disponibles sur le portail maps.service-public.ma », mai 2022,
        ODbL) : empreinte du fichier fourni identique au téléchargement officiel (`7d1a4d30…a6f920`). La seconde copie
        fournie (`d1045bb5…`) a été réenregistrée par un tableur le 30 octobre 2026 (caractères `\x92` / `\x96` des
        adresses réécrits `_x0092_` / `_x0096_`) : non retenue, le script la refuse.
     2. Une couche par région du RGPH 2024 (borne de 5 000 objets ; aucune colonne de type : aucun classement deviné).
        Rattachement par le contour régional livré, sinon par la province publiée (province du RGPH de même nom, sinon
        région des autres points de la même province) ; rattachement écrit sur chaque objet. Doublons de la source :
        4 lignes strictement identiques à une précédente non reprises ; 16 paires « même nom, même point » aux autres
        champs différents gardées et marquées `doublon_probable`. Contrôle : la province
        publiée concorde avec la région retenue pour 17 356 points ; 4 discordances (coordonnées publiées dans une autre
        région) gardées telles quelles ; 113 points sans province du RGPH de même nom (M'diq-Fnidq, 2 vides).
     3. `hcp-douars2024-1.xlsx` est le fichier « Population et ménages par douars » déjà intégré (même empreinte
        `b04fa4f4…ae1b6`, annexe des douars de la fiche des communes, lot E). Sur suggestion du maître d'ouvrage, l'annexe
        reprend désormais **les deux feuilles, jointes par le code du douar** : 22 compléments (nationalité, inscription à
        l'état civil, population de 15 ans et plus et état matrimonial ; type de logement des ménages ; distances moyennes
        aux équipements). Les colonnes répétées (lieux, type, ménages, population) sont contrôlées identiques puis reprises
        une seule fois (33 189 douars, aucun écart). Base : colonne `geodata_douars.complements` (jsonb) ; fiche de la
        commune rurale : trois tableaux repliables. Les douars restent sans géométrie (aucune coordonnée publiée).
     4. **Fichiers d'origine archivés tels quels** (D-GD-29) : `donnees/hcp-rgph2024-douars-origine.xlsx` et
        `donnees/mtnra-services-publics-2022-origine.xlsx`, cités par leur fiche (`origine` : fichier, empreinte), donc
        copiés dans `geodata_fichiers` à chaque démarrage.
     5. **Rapprochement avec le découpage du RGPH**, consigné sans correction sur chaque point du MTNRA : `province_hcp`
        et `concordance` (`concorde` 17 356, `discorde` 4, `non-appariee` 113). Le contrôle par commune (point dans le
        contour communal contre la commune publiée) attend des contours communaux complets (16 communes du HCP sans
        contour, D-GD-33). L'exposition à un module « Concept Prix » n'est pas engagée : ce module n'existe pas dans le
        dépôt et attend une spécification du maître d'ouvrage.

   - D-GD-44 (30 octobre 2026) — **alignement des contours région / province / commune** (proposition du maître
     d'ouvrage) : `docs/workstreams/geodata/ALIGNEMENT-CONTOURS.md`.
     1. Diagnostic : les fichiers livrés depuis D-GD-33 sont alignés. Contrôle indépendant : 0 sommet de province ou de
        région hors des sommets des communes, parent = union exacte des enfants, construction reproductible à l'octet.
        Le décalage constaté correspond aux contours geoBoundaries d'avant D-GD-33 ; une carte enregistrée qui garde ces
        versions les affiche encore.
     2. Un parent construit sans toutes ses communes est **partiel** : propriétés `contour_complet` et
        `entites_sans_contour` (13 provinces, 8 régions), rapport et fiches.
     3. Mention de provenance dans les trois fiches : « géométries dérivées des contours communaux OpenStreetMap,
        agrégées selon les rattachements territoriaux HCP ; ce ne sont pas des contours officiels du HCP ».
     4. Une couche de limites administratives restée sur une version antérieure dans une carte affiche une alerte (et non
        plus un avis discret) : le mélange de versions entre niveaux n'est jamais silencieux.
     5. Contrôles en CI : ensembles de codes (12 régions, 75 provinces), sommets partagés, marques de contour partiel.
        Captures avant / après (Tétouan) dans `captures/d-gd-44/`.

   - D-GD-45 (30 octobre 2026) — **base des services publics fusionnée MTNRA + OpenStreetMap, aucun doublon** (décision du
     maître d'ouvrage, qui remplace la première idée d'un simple retrait des couches OSM) :
     1. Les extraits OSM « administrations », « hôpitaux et cliniques » et « gares » (2 495 objets) ne sont plus des couches :
        ce sont des entrées (`donnees/osm-extraits.json`) de la base `services-publics-*`, préparée par
        `scripts/geodata/preparer_services_publics.py` avec les 17 473 points du MTNRA.
     2. Appariement explicite, jamais deviné : à moins de 150 m, même famille (gare, santé, administration), même échelon
        (régional, provincial, central), natures de service compatibles, au moins la moitié des mots distinctifs en commun
        (Jaccard ≥ 0,5, hors noms de lieux, mots génériques et numéros), ou nom français ou arabe identique. Avec un seul
        candidat, l'objet OSM est fusionné dans le point du MTNRA, dont les attributs priment (`source` = `mtnra+osm`,
        référence `osm`) : 171 cas. Avec plusieurs candidats, il est gardé et marqué `doublon_probable` : 30 cas. Sans
        candidat, il est ajouté (`source` = `osm`) : 2 324 cas, dont 93 rattachés au contour régional le plus proche (lacunes
        des communes sans contour, distance consignée). Les 134 premières paires ont été relues à la main : les règles de
        nature, d'échelon et de numéro ont été ajoutées pour écarter les faux appariements relevés.
     3. 19 797 objets en 13 couches : une par région, Casablanca-Settat découpée par province (Préfecture de Casablanca ;
        autres provinces) sous la borne de 5 000 objets.
     4. Les couches OSM d'origine sont retirées du catalogue par retrait déclaré, à plusieurs remplaçantes (`remplacePar` en
        liste : retrait seulement une fois les 13 couches publiées). Leurs objets sont tous dans la base fusionnée (test :
        chaque objet OSM présent exactement une fois).

   - D-GD-46 (31 octobre 2026) — **bascule Plan / Satellite** (P1-6 de `ANALYSE-FEENWAY.md`, programme des lots restants
     demandé par le maître d'ouvrage) : un bouton de la mini-barre (globe, Alt+S) passe de l'imagerie (satellite, hybride)
     au plan du même fournisseur (sinon fond neutre), et d'un plan ou du fond neutre au satellite du même fournisseur
     (sinon le premier satellite réglé). Seuls les fonds réglés dans Paramètres sont proposés (D-GD-15) ; sans clé
     MapTiler, le bouton est désactivé et dit pourquoi. Logique pure : `fondBascule` (`fournisseurs.ts`).

   - D-GD-47 (31 octobre 2026) — **état d'affichage par couche** (P3-4) : le moteur relève, quand la carte est au repos ou
     qu'une source charge, l'état de chaque couche visible — « Chargement… », « Aucun objet dans la vue : déplacez ou
     dézoomez la carte. », ou le nombre d'objets distincts dessinés (un objet coupé entre deux tuiles compte une fois, une
     grappe compte ses points) — affiché sur la couche dans le panneau Couches. Compte d'affichage seulement : les comptes
     en base restent ceux de la synthèse de la vue (D-GD-40).

   - D-GD-48 (31 octobre 2026) — **pastilles de thème** (P2-1) : une pastille par catégorie gérée du catalogue (D-GD-14,
     en base), en bande à droite du bouton « Données » (repliable : bouton « Thèmes », Alt+T). Une pastille affiche toutes
     les couches de son thème (les absentes ajoutées, au plus 20 couches par carte : les autres sont comptées et
     annoncées) ou les masque (couches gardées, masquées) ; badge = objets dessinés dans la vue (D-GD-47) quand le thème
     est affiché, sinon nombre de couches. Les limites administratives n'ont pas de pastille (barre territoriale).
   - D-GD-49 (31 octobre 2026) — **proximité des équipements** (P2-5) : section « À proximité » de la fiche — pour l'objet,
     nombre d'objets de chaque couche de points affichée à moins d'un rayon choisi (250 m à 5 km), et le plus proche avec
     sa distance (cliquable). Distance géodésique en base (`ST_DWithin` / `ST_Distance` sur le géographique), versions
     publiées, rien d'enregistré ; une surface compte ce qui est dedans ou à moins du rayon de son bord. Route
     `GET /couches/:id/objets/:code/proximite?rayon=&couches=` (1 à 20 couches, couches inaccessibles signalées).
   - D-GD-50 (31 octobre 2026) — **synthèse d'une entité sur ses subdivisions** (P2-2) : dans la fiche d'une entité qui a
     des subdivisions (découpage en base, D-GD-42), pour l'indicateur actif porté par la couche des subdivisions : min,
     moyenne simple non pondérée et max des subdivisions évaluées, sur une échelle verticale (repère de la moyenne),
     nombre de subdivisions évaluées et non évaluées, valeur de l'entité donnée à part (un total n'est pas comparable à
     ses parties), source et période de la couche des subdivisions. Rien si cette couche ne porte pas l'indicateur.
   - D-GD-51 (31 octobre 2026) — **fiabilité déclarée** (P2-3) : la fiche affiche l'indice de confiance que la source
     déclare pour l'entité (propriété exposée `confiance`, `indice_confiance` ou `fiabilite`), la précision, la période
     et la date de récupération déclarées pour la version. GeoData ne calcule ni n'estime aucune confiance : ce qui n'est
     pas déclaré est « Non évalué ». Aucune source chargée à ce jour ne déclare d'indice par entité.
   - D-GD-52 (31 octobre 2026) — **barre du bas sur téléphone** (P3-1) : au téléphone (≤ 760 px), une barre fixe en bas
     de l'écran — Carte (panneaux et recherche fermés, Alt+X), Chercher (Alt+R), Couches (Alt+C), Enregistrer (Alt+E) —
     sous laquelle panneaux et volets s'arrêtent ; chaque bouton appelle la fonction existante de la page. Masquée au
     bureau. La barre d'outils et la mini-barre restent.
   - D-GD-53 (31 octobre 2026) — **pistes P3-2, P3-3 et P2-4 évaluées** :
     1. P3-2 (chargement par emprise des couches non tuilées) : **sans objet**. Toutes les couches d'objets sont servies
        en tuiles vectorielles, donc par emprise et par zoom ; seules les zones et annotations de l'espace (au plus 500,
        celles de l'utilisateur) sont lues en entier, ce qui ne justifie pas de lecture par emprise.
     2. P3-3 (écriture de droite à gauche sur la carte) : **sans objet tant que D-GD-24 tient**. Les libellés de la carte
        n'utilisent que les glyphes latins hébergés ; les noms en arabe (douars) s'affichent dans la fiche, dont le HTML
        gère la droite à gauche. L'arabe sur la carte demanderait d'héberger des glyphes arabes (Noto Sans Arabic, OFL) et
        le greffon RTL de MapLibre : décision du maître d'ouvrage (nouvelle dépendance et nouveaux fichiers servis).
     3. P2-4 (champ continu, qualité de l'air) : **bloqué faute de source qualifiée** (D-GD-29 : aucune donnée sans fiche
        de source qualifiée). Le support existe déjà (couches raster, D-GD-13 ; valeur au point) : une grille publiée par
        une source dont les droits sont établis (par exemple Copernicus / CAMS) s'importera comme les 17 rasters actuels.
   - D-GD-54 (31 octobre 2026, **décision du maître d'ouvrage**) — **prix des quartiers : source provisoire FeenWay et
     préparation des sources futures**. Demande : « Provisoirement on va 1. utiliser les prix de FeenWay pour cette étape
     de développement 2. tout préparer pour les futures sources de données ». Elle lève, pour l'étape de développement
     seulement, la réserve de l'analyse FeenWay (« données de marché reprises de FeenWay : droits non établis ») :
     1. **Qualification d'une source** : une fiche déclare `version.qualification` — absente = « qualifiée » ;
        « provisoire » exige un motif et une décision (`validerQualification`, modèle `qualification.ts`). Colonnes
        `qualification`, `qualification_motif`, `qualification_decision` de `geodata_versions` (contrainte : motif et
        décision obligatoires pour une version provisoire).
     2. **Garde d'environnement** : une source provisoire n'est importée, archivée en base, publiée **et servie** que si
        `GEODATA_SOURCES_PROVISOIRES=oui` (préproduction : `deploy/preprod/compose.yml`, réglable par
        `PREPROD_GEODATA_SOURCES_PROVISOIRES`) ; sans ce réglage (production), la chaîne d'import la refuse, la
        publication par l'API la refuse et `VERSION_CONSULTABLE` la cache (catalogue, couche, tuiles, table, fiche : 404),
        même si une version se trouvait en base. Les fiches provisoires vivent à part : `docs/geodata/sources/provisoires/`.
     3. **Signalement** : badge « Source provisoire » au catalogue et dans le panneau Couches (motif et décision en
        infobulle), ligne « Qualification » dans la fiche de la couche, avertissement dans la fiche d'information,
        attribution « source provisoire non qualifiée » sur la carte. L'impression d'une fiche suit le droit d'export de sa
        source (`refusImpressionFiche` : bouton désactivé et Alt+P refusé quand l'export est refusé), comme celle de la carte.
     4. **Couche** « Prix des quartiers (FeenWay, provisoire) » : 1 368 quartiers de 58 villes relevés le 31 octobre 2026
        par l'API publique de la carte FeenWay (`scripts/geodata/collecter_feenway.py`, réponse archivée telle quelle),
        prix moyen, minimal et maximal en DH/m² et indice de confiance 0–5 tels qu'affichés, sans recalcul ; thème
        « immobilier », catégorie « Immobilier et foncier » (semée une fois sur les bases existantes). Droits : consultation,
        stockage, calcul et tuiles admis à titre interne et provisoire ; usage commercial, partage, téléchargement et export
        **refusés**. Provenance, date et méthode des prix non déclarées par FeenWay : dit dans la fiche.
     5. **Sources futures** : schéma commun des prix de quartier (`code`, `nom`, `ville`, `prix_m2`, `prix_min_m2`,
        `prix_max_m2`, `indice_confiance` ; indicateurs du thème « Immobilier » de mêmes familles et même unité) produit par
        `scripts/geodata/preparer_prix_quartiers.py` depuis une **déclaration de source** (`scripts/geodata/sources-prix/`) ;
        une source qualifiée (ANCFCC, DGI, Bank Al-Maghrib…) ou une autre provisoire s'y branche sans changer le code ; la
        source FeenWay se retire alors par `donnees/retraits-sources.json` (procédure dans
        `scripts/geodata/sources-prix/README.md`).
   - D-GD-55 (1ᵉʳ novembre 2026, **demande du maître d'ouvrage** : « pas de prix, pas de légende » sur la carte des prix en
     préproduction) — **coloration selon l'indicateur actif et légende sur la carte** ; lève D-GD-32 en partie :
     1. Une couche qui porte l'indicateur actif est colorée selon ses valeurs **lues en base** : 5 classes par quantiles,
        palette séquentielle jaune → rouge, gris pour une valeur absente (jamais zéro) ; contours blancs. Case « Colorer
        selon l'indicateur » de la carte de couche (cochée par défaut) ; le style enregistré de la couche ne change pas ;
        une coloration choisie à la main décoche la case (le choix de l'utilisateur l'emporte). Légende aussi dans l'onglet
        « Légende » et dans l'image exportée ou imprimée ; au téléphone, panneau ouvert, elle n'est que dans l'onglet.
     2. Légende de l'indicateur sur la carte (en bas à gauche) : nom, unité, bornes des classes, nombre d'entités par
        classe, valeur absente, attribution et statut provisoire de la source.
     3. Afficher un thème par sa pastille, sans indicateur actif, active son indicateur principal (première valeur de la
        source dans l'ordre déclaré) : la pastille « Immobilier et foncier » montre directement le prix moyen au m², écrit
        sur chaque quartier et en couleurs.
     4. Correctif : la pastille rouge de la mini-barre (« carte non enregistrée ») réduisait toutes les pastilles de
        légende à un point rouge ; règle limitée à la mini-barre.

## Conséquences

- `docs/architecture.md` et `module-registry.ts` déclarent GeoData une fois le code livré.
- Les critères GEO 01–13 sont prouvés par tests et recette ; GEO 12 sur appareils physiques et la recette par un
  utilisateur restent à faire par le maître d’ouvrage.
- Une décision contraire du maître d’ouvrage prime : elle se consigne dans une nouvelle ADR.

## Références

- [ADR-GEODATA-01](ADR-GEODATA-01.md) ; [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md).
- [Plan retenu](../../workstreams/geodata/PLAN-IMPLEMENTATION.md).
- Source pilote : https://www.geoboundaries.org/api/current/gbOpen/MAR/ADM1/ (licence ODbL 1.0).
