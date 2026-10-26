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

## Conséquences

- `docs/architecture.md` et `module-registry.ts` déclarent GeoData une fois le code livré.
- Les critères GEO 01–13 sont prouvés par tests et recette ; GEO 12 sur appareils physiques et la recette par un
  utilisateur restent à faire par le maître d’ouvrage.
- Une décision contraire du maître d’ouvrage prime : elle se consigne dans une nouvelle ADR.

## Références

- [ADR-GEODATA-01](ADR-GEODATA-01.md) ; [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md).
- [Plan retenu](../../workstreams/geodata/PLAN-IMPLEMENTATION.md).
- Source pilote : https://www.geoboundaries.org/api/current/gbOpen/MAR/ADM1/ (licence ODbL 1.0).
