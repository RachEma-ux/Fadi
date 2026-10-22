# Fadi Concept GeoData

**Module autonome de données géographiques et espace cartographique**

Version 1.0 | 22 octobre 2026 | Concept produit et orientations de conception

GeoData est un module natif de Fadi permettant de rechercher un territoire, consulter des données géographiques, composer des cartes et conserver des analyses territoriales. Il fonctionne totalement indépendamment des projets. Son entrée dans la navigation générale ouvre directement une carte interactive inspirée de l’organisation de Kharita.

Le nom GeoData, son indépendance vis-à-vis des projets et son accès cartographique direct constituent le périmètre demandé par le responsable. Le présent document précise le fonctionnement cible, les données, les responsabilités, les parcours et les critères de réception. Les choix techniques détaillés sont des propositions à confirmer lors de la conception. Cette version n’autorise aucune implémentation applicative, migration de base ou mise en production.

## 1 Finalité et résultat attendu

GeoData apporte à Fadi un espace de consultation et de travail géographique utilisable dès qu’un utilisateur dispose des droits nécessaires, même s’il n’a aucun projet. Il doit permettre de comprendre un territoire, comparer ses caractéristiques et produire une carte documentée.

Le parcours principal est : ouvrir GeoData, rechercher un lieu, activer des couches, consulter les informations, enregistrer la carte puis produire ou partager un résultat autorisé. L’utilisateur reste dans GeoData pendant tout ce parcours.

Le Maroc constitue le premier périmètre de données. Le modèle doit permettre l’ajout d’autres territoires sans imposer les codes, langues ou découpages administratifs marocains aux autres pays. Chaque jeu de données conserve son territoire de couverture et sa propre organisation administrative.

La carte Kharita sert de référence d’interaction pour le catalogue, les couches, la légende, la recherche et les fonds cartographiques. GeoData conserve l’identité visuelle de Fadi et ses propres données autorisées. Cette référence ne constitue pas une autorisation de copier le code, les données ou les contenus graphiques du fournisseur. [R1]

## 2 Indépendance du module

### 2.1 Autonomie fonctionnelle

L’accès proposé est `/geodata`, depuis une entrée GeoData dans le menu principal de Fadi. Aucun sélecteur, écran de création ou contexte de projet ne précède l’ouverture de la carte. La navigation des modules de projet n’apparaît pas dans cet espace.

GeoData possède son catalogue, ses cartes enregistrées, ses collections, ses annotations, ses analyses et ses exports. Ces objets appartiennent à un utilisateur ou à un espace GeoData identifié. Leur existence, leur durée de conservation et leurs autorisations sont gérées dans GeoData.

Créer, archiver ou supprimer un projet Fadi ne doit ni modifier ni supprimer une carte, une couche ou une analyse GeoData. L’absence de tout projet dans le compte doit laisser le parcours GeoData entièrement utilisable.

### 2.2 Autonomie des données et des interfaces

Le noyau GeoData ne comporte aucune référence obligatoire ou facultative à un projet. Ses routes, ses modèles métier et ses permissions ne prennent pas de `projectId`. Il ne dépend pas du contexte React d’un projet ni de ses contrôles d’accès.

Une éventuelle connexion future avec un autre module devra passer par un contrat d’échange explicite et séparé. Elle ne pourra devenir une condition de fonctionnement de GeoData. Les actions « associer au projet », « transmettre à la parcelle » et « modifier le modèle architectural » sont exclues du présent périmètre.

### 2.3 Services communs réutilisables

L’indépendance métier reste compatible avec l’authentification Fadi, les composants génériques d’interface, la traduction, la journalisation et l’infrastructure d’hébergement communes. La réutilisation de PostgreSQL/PostGIS est proposée avec un schéma ou un ensemble de tables GeoData clairement délimité.

GeoData dispose donc de sa propre base logique de données. Une instance physique de base séparée n’est pas une exigence de cette version. Ce choix devra être réexaminé si les volumes, l’exploitation ou les contraintes d’isolation le justifient. [R7]

## 3 Utilisateurs et responsabilités

Un utilisateur consulte les couches auxquelles il a accès, organise ses cartes et conserve ses préférences. Il peut travailler dans son espace personnel sans appartenir à une équipe de projet.

Un gestionnaire de données prépare les imports, documente les sources, contrôle les géométries et propose des versions à publier. Un responsable de publication confirme les droits de diffusion et la qualité avant activation dans le catalogue commun. Ces responsabilités peuvent être attribuées à une même personne dans un petit déploiement, mais restent distinctes dans le modèle d’autorisation.

Un administrateur GeoData gère les espaces, les rôles, les fournisseurs et les limites de consommation. Un rôle administrateur de projet ne donne pas automatiquement ces droits.

| Profil ou rôle | Actions proposées | Limite |
| --- | --- | --- |
| Utilisateur personnel | Consulter, composer et enregistrer ses cartes | Accès limité aux sources et fonctions autorisées |
| Lecteur d’un espace | Lire les cartes et données partagées | Aucune modification des objets de l’espace |
| Contributeur d’un espace | Créer et modifier les cartes et annotations autorisées | Aucune publication dans le catalogue commun par défaut |
| Gestionnaire de données | Importer, contrôler et préparer des versions | Publication soumise au droit correspondant |
| Administrateur GeoData | Gérer les accès et la configuration du module | Actions sensibles journalisées |

Les droits de partage et d’export sont contrôlés séparément. Avoir accès à une couche ne donne pas nécessairement le droit de la télécharger ou de la redistribuer.

## 4 Page cartographique

### 4.1 Entrée et organisation

La page d’entrée est la carte elle-même. Il n’y a pas de tableau de bord intermédiaire obligatoire. Le premier affichage présente un territoire par défaut clairement défini, un fond autorisé et une configuration minimale lisible. Les ouvertures suivantes peuvent restaurer la dernière vue de l’utilisateur.

Le bandeau général de Fadi reste accessible. Le reste de l’écran est consacré à la carte, avec de petites marges cohérentes et des panneaux repliables. La position de la recherche, des commandes et des panneaux doit rester stable entre les états de consultation.

| Zone | Contenu et comportement |
| --- | --- |
| Carte centrale | Fonds, couches, sélection, échelle, orientation et attributions |
| Recherche | Lieux, unités administratives et coordonnées explicites |
| Panneau gauche | Catalogue, Couches et Légende dans trois onglets identifiables |
| Couches actives | Visibilité, ordre, opacité et accès aux styles autorisés |
| Fiche d’information | Attributs, indicateurs, unité, date, source et qualité de l’objet sélectionné |
| Barre d’outils | Navigation, localisation, sélection, mesures et dessin de zone d’étude |
| Table des attributs | Résultats consultables, filtrables et accessibles au clavier |
| Mes cartes | Ouvrir, nommer, dupliquer, classer et archiver une carte enregistrée |

Le changement de fond entre plan, satellite et topographie conserve la position et les couches actives. Chaque option dépend des fournisseurs et droits effectivement configurés ; un fond indisponible n’apparaît pas comme fonctionnel.

### 4.2 Consultation d’une couche

La fiche d’une couche présente son titre, sa description, son producteur, sa couverture, sa date d’observation, sa version, ses unités, sa résolution ou son échelle et ses conditions d’usage. Elle distingue les valeurs originales des résultats calculés.

Pour une carte thématique, le choix d’indicateur met à jour les couleurs et la légende ensemble. Les seuils de classification sont visibles et enregistrés avec la carte. Une valeur absente dispose d’un symbole et d’une explication propres ; elle n’est jamais remplacée par zéro.

### 4.3 Écrans mobiles et accessibilité

Sur téléphone, un seul panneau principal ou volet inférieur est ouvert à la fois. La recherche, le retour à la carte et la fermeture du volet restent directement accessibles. Les commandes principales disposent d’un libellé, d’une cible tactile suffisante et d’un accès au clavier lorsque pertinent.

La table et la fiche d’information fournissent une alternative aux interactions purement visuelles. Les couleurs ne sont pas le seul moyen de distinguer une sélection ou une donnée manquante. L’interface suit la convention français et anglais de Fadi ; les noms et valeurs des sources conservent leur langue, notamment l’arabe. [R8]

### 4.4 États explicites

Prévoir les états chargement, catalogue vide, aucune couverture, donnée manquante, accès refusé, fournisseur indisponible et quota atteint. Une erreur WebGL doit afficher un message utile et maintenir l’accès à la recherche, aux fiches et aux données déjà disponibles. Une animation de chargement ne peut rester affichée indéfiniment.

## 5 Périmètre fonctionnel

### 5.1 Première version utilisable

La première version couvre la recherche de lieux et de coordonnées, l’exploration du catalogue, l’affichage de couches, la légende, la sélection d’objets et la consultation des attributs. Elle ajoute la mesure indicative de distance et de surface ainsi que les cartes enregistrées côté serveur.

Une carte enregistrée contient sa caméra, son fond, ses couches et leurs versions, leur ordre, leurs styles, l’indicateur sélectionné, les filtres et la légende. Un simple déplacement de la carte ne publie pas une modification à d’autres utilisateurs. La sauvegarde est explicite et signale son état.

L’utilisateur peut dessiner une zone d’étude et des annotations dans GeoData. Ces objets ont une provenance et un système de coordonnées. Une zone dessinée reste indicative et ne devient pas une parcelle cadastrale officielle.

Le premier import utilisateur peut être limité à GeoJSON. L’import administratif des sources de référence privilégie des formats contrôlés comme GeoPackage. KML, KMZ et Shapefile pourront être ajoutés après validation de leurs règles de conversion et de contrôle.

L’export initial comprend la composition cartographique et une fiche de sources, dans les formats autorisés par les données et les fonds utilisés. Une exportation indisponible doit indiquer la raison. Le téléchargement des données brutes constitue une permission distincte.

### 5.2 Extensions organisées

Le partage nominatif en lecture, les espaces collectifs, les comparaisons temporelles, les requêtes spatiales avancées et les profils altimétriques sont préparés par le modèle mais peuvent être livrés progressivement.

La collaboration simultanée, la navigation routière, les traitements nationaux lourds de rasters, la 3D et les analyses réglementaires automatiques ne font pas partie du premier lot. Ils nécessitent leur propre cadrage, leurs données et leurs critères de réception.

## 6 Parcours de référence

### 6.1 Explorer un territoire

L’utilisateur ouvre GeoData, recherche une commune puis active une couche administrative et un indicateur. Il sélectionne une zone, lit sa fiche et consulte la source ainsi que la date des valeurs. Il peut changer de fond ou d’indicateur sans perdre son contexte de navigation.

### 6.2 Conserver une carte

L’utilisateur règle les couches, la légende et la position, puis choisit Enregistrer la carte. Il indique un nom et, si nécessaire, une collection. Après fermeture et nouvelle connexion, la carte retrouve sa composition et ses références de données. Une couche devenue inaccessible est signalée sans suppression silencieuse de sa référence.

### 6.3 Analyser une zone d’étude

L’utilisateur dessine ou importe une zone, confirme son système de coordonnées puis choisit une analyse disponible. Le résultat conserve la géométrie utilisée, les versions des couches, la méthode, les paramètres et la date. Une évolution des sources rend visible la possibilité de recalculer sans réécrire le résultat antérieur.

### 6.4 Partager et exporter

Lorsque le partage est disponible, le propriétaire choisit les destinataires et leurs droits. GeoData vérifie que les couches sont accessibles aux destinataires. Un lien ne contourne jamais les permissions. Avant un export, la composition est contrôlée et les attributions, dates et limites d’usage sont conservées dans le résultat.

## 7 Sources et qualité des données

### 7.1 Catalogue initial

| Famille | Usage visé | Source candidate ou mode d’acquisition |
| --- | --- | --- |
| Limites administratives | Localiser et agréger par territoire | Jeu qualifié avec codes, version et droits documentés |
| Population et indicateurs | Cartes thématiques et fiches territoriales | Publications HCP et adaptations autorisées |
| Routes et services | Contexte et proximité | Extraits OpenStreetMap avec obligations applicables |
| Fonds et imagerie | Orientation et lecture visuelle | Fournisseur cartographique sous conditions adaptées |
| Relief et occupation du sol | Analyse territoriale indicative | Produits qualifiés selon résolution et période |
| Données personnelles | Cartes, zones et annotations | Imports et créations des utilisateurs autorisés |
| Géologie et ressources minérales | Contexte thématique ultérieur | Sources qualifiées, avec âge et précision explicites |

Les liens Kharita, ArcGIS, Africa GeoPortal, SIG-Maroc et USGS sont des pistes de données ou d’interaction. Leur inscription au concept ne vaut ni validation de leurs géométries ni autorisation de réutilisation. Les sources prioritaires doivent être confrontées à leurs producteurs, à leurs métadonnées et à leurs conditions d’accès. [R1-R6]

Les données historiques de ressources minérales ne doivent pas être présentées comme un inventaire actuel de mines, de concessions ou de risques de construction. Les données de relief ou d’occupation du sol ne remplacent pas un relevé topographique ni un document réglementaire.

### 7.2 Fiche obligatoire de chaque version

Chaque version publiée conserve le producteur, l’URL source, la date de récupération, la période observée, le territoire, la licence, l’attribution, les usages permis, le système de coordonnées, la précision ou résolution, l’empreinte du fichier et les transformations réalisées.

Les décisions de droits distinguent consultation, stockage, calcul, production de tuiles, usage commercial, partage, téléchargement et export. Un droit inconnu reste à qualifier. La disponibilité publique d’une carte ne suffit pas à autoriser ces actions.

### 7.3 Réconciliation des territoires

Les jointures entre indicateurs et géométries utilisent des identifiants textuels stables, en conservant les zéros initiaux. Les noms traduits ne constituent pas une clé fiable. Les communes, arrondissements et autres niveaux restent distincts.

Avant publication, un rapport contrôle les doublons, les codes absents, les unités non appariées, les géométries invalides et les différences de couverture. Les découpages de dates différentes nécessitent une table de correspondance documentée. Les valeurs non résolues restent indisponibles au lieu d’être attribuées par approximation silencieuse.

## 8 Modèle de données GeoData

Le modèle logique proposé sépare le catalogue de référence, les espaces utilisateurs et les résultats calculés. Les tables GeoData n’ont aucune clé étrangère vers les projets. Les identités de comptes communes peuvent être référencées par un contrat explicite.

| Entité logique | Responsabilité |
| --- | --- |
| Espaces GeoData | Propriétaire, type personnel ou partagé et politique de conservation |
| Membres et autorisations | Compte, espace, rôle, permissions et durée éventuelle |
| Sources et jeux de données | Producteurs, thèmes, couverture et identité stable du jeu |
| Versions de données | Dates, fichiers, empreintes, droits, contrôles et état de publication |
| Couches | Version référencée, géométrie ou raster, attributs, style et échelles d’affichage |
| Unités administratives et correspondances | Codes, niveaux, parents, versions et relations entre découpages |
| Indicateurs et valeurs | Définition, unité, période, dénominateur et raison d’absence |
| Cartes et compositions | Espace, propriétaire, nom, caméra, couches, styles, filtres et révision |
| Collections | Classement des cartes et ressources au sein d’un espace |
| Zones et annotations | Géométrie, système de coordonnées, auteur, provenance et révision |
| Analyses et exports | Entrées figées, méthode, résultat, fichier produit et état de fraîcheur |
| Imports et journal d’activité | Traitement, contrôles, erreurs, publication et actions sensibles |

Les fichiers sources et rasters sont conservés dans un stockage de fichiers adapté ; leurs métadonnées et références sont enregistrées en base. Les géométries interrogeables utilisent PostGIS. Les index spatiaux et les filtres par espace ou version sont définis à partir des requêtes attendues.

Une mise à jour crée une nouvelle version de référence. Elle ne remplace pas les données ayant servi à une analyse ou à une carte figée. La suppression d’une ressource encore référencée suit une politique de retrait ou d’archivage explicite.

## 9 Architecture et échanges

### 9.1 Organisation proposée

GeoData constitue un module distinct dans l’application modulaire Fadi. Son interface charge le moteur cartographique à la demande. Son domaine métier, ses services d’import et son API possèdent des interfaces propres.

MapLibre GL JS est le candidat initial pour l’affichage de tuiles vectorielles et les styles thématiques. OpenLayers reste une alternative à évaluer si les formats professionnels et la reprojection interactive deviennent prioritaires. Le moteur sera choisi après une vérification sur les appareils cibles. PostgreSQL/PostGIS et l’API Express existante constituent les infrastructures proposées. [R7, R9, R10]

Les couches nationales sont servies par emprise et par niveau de zoom, sous forme de tuiles ou de réponses bornées. Les calculs utilisent la géométrie de référence, distincte des simplifications d’affichage. Un serveur de tuiles séparé sera introduit seulement si les mesures d’exploitation le justifient.

### 9.2 Familles de routes proposées

| Famille | Fonction |
| --- | --- |
| `/geodata/catalog` | Catalogue et actions visibles pour le compte |
| `/geodata/search` | Recherche locale et adaptateur de géocodage |
| `/geodata/layers` | Métadonnées, attributs et données bornées des couches |
| `/geodata/tiles` | Tuiles des versions autorisées |
| `/geodata/workspaces` | Espaces et autorisations GeoData |
| `/geodata/maps` | Cartes, compositions et révisions |
| `/geodata/annotations` | Zones d’étude et annotations |
| `/geodata/analyses` | Calculs bornés et résultats traçables |
| `/geodata/imports` et `/geodata/exports` | Échanges contrôlés et suivi des traitements |

Ces familles décrivent des contrats à concevoir, pas des routes déjà disponibles. Les contrôles sont réalisés côté serveur pour chaque ressource, même si l’interface masque déjà une action interdite.

### 9.3 Coordonnées et calculs

Les échanges géographiques utilisent des coordonnées longitude et latitude explicitement identifiées. Le système source, l’ordre des axes et la transformation sont conservés. Les mesures de surface et de distance utilisent un système métrique adapté ou les fonctions géographiques appropriées ; la projection d’affichage ne définit pas la méthode de mesure.

Les coordonnées géographiques, cadastrales et locales restent distinctes. Un import au système inconnu doit être clarifié ou refusé. Les altitudes portent aussi leur référence verticale et leur type de hauteur.

Les pourcentages ne sont agrégés que si leur définition et leurs dénominateurs le permettent. Une moyenne simple de pourcentages communaux n’est pas une règle par défaut. Une fraction géométrique de commune ne constitue pas une population mesurée.

## 10 Sécurité et continuité du travail

Les cartes personnelles sont privées par défaut. Le catalogue commun et les ressources privées suivent des règles séparées. Les fichiers, exports et tuiles privées ne sont pas placés dans un cache public. Les autorisations dépendent des espaces GeoData et des ressources, jamais des rôles d’un projet.

Une modification d’une carte porte sa révision. Deux modifications concurrentes ne doivent pas s’écraser silencieusement. L’utilisateur voit les états non enregistré, en cours d’enregistrement, enregistré et conflit à résoudre.

Les imports sont limités en taille, nombre d’objets et complexité géométrique. Les destinations des connecteurs sont contrôlées et les attributs importés sont affichés sans exécution de contenu actif. Les secrets des fournisseurs ne figurent ni dans les cartes partagées ni dans les documents exportés.

La localisation de l’appareil est facultative et demandée au moment de l’action. Aucun suivi continu n’est prévu. Les coordonnées d’une recherche ne deviennent pas une donnée publiée par simple consultation.

Le premier lot ne promet pas un fonctionnement cartographique intégral hors ligne. Les contenus disponibles localement sont identifiés, et les fonctions nécessitant un service distant signalent leur indisponibilité. Les futures sauvegardes devront inclure les tables GeoData, les fichiers et leurs liens, avec une restauration vérifiée sur une cible autorisée.

## 11 Séquence de réalisation proposée

| Étape | Livrable | Condition de sortie |
| --- | --- | --- |
| Cadrage documentaire | Concept, décisions et scénarios | Périmètre détaillé relu et accepté |
| Conception | Maquettes, contrats, droits et modèle logique | Parcours sans projet démontré dans la conception |
| Socle des données | Espaces, catalogue, versions et premier import | Source qualifiée et autorisations vérifiées |
| Carte utilisable | Recherche, couches, légende, attributs et sauvegarde | Parcours complet avec un compte sans projet |
| Production de résultats | Zones, analyses simples et exports autorisés | Résultats reproductibles et traçables |
| Réception et publication | Mesures, accessibilité, restauration et validation utilisateur | Décision explicite de mise à disposition |

La demande actuelle couvre la rédaction et le dépôt du concept. Toute réalisation applicative fera l’objet d’un lot autorisé ultérieurement. L’effort et le calendrier seront estimés après qualification des sources, choix des fonctions du premier lot et vérification de l’environnement de test.

Le pilote utilisera un petit catalogue maîtrisé et un territoire permettant de comparer une zone urbaine et une zone rurale. L’objectif initial est un parcours complet et reproductible avant l’extension du nombre de couches.

## 12 Critères de réception

| Code | Scénario vérifiable | Résultat attendu |
| --- | --- | --- |
| GEO 01 | Un compte sans projet ouvre GeoData | Carte et fonctions disponibles sans demande de projet |
| GEO 02 | L’utilisateur ouvre directement `/geodata` | Navigation générale et espace cartographique autonome |
| GEO 03 | Création puis suppression d’un projet sans rapport | Cartes et données GeoData préservées |
| GEO 04 | Audit des modèles, routes et permissions | Aucune dépendance du noyau à un `projectId` ou à un rôle de projet |
| GEO 05 | Modification puis réouverture d’une carte | Composition, sources et versions restaurées |
| GEO 06 | Consultation d’une valeur absente | Absence expliquée et distincte de zéro |
| GEO 07 | Utilisation d’un système de coordonnées inconnu | Refus ou clarification explicite avant traitement |
| GEO 08 | Accès direct à la carte privée d’un tiers | Refus côté serveur, y compris pour fichiers et exports |
| GEO 09 | Tentative d’export non autorisé | Blocage motivé ; attributions conservées dans les exports permis |
| GEO 10 | Mise à jour d’une source de référence | Résultats antérieurs conservés avec leur version |
| GEO 11 | Erreur WebGL ou fournisseur indisponible | État explicite et accès aux informations encore utilisables |
| GEO 12 | Consultation mobile et navigation au clavier | Commandes et informations principales accessibles |
| GEO 13 | Modifications concurrentes d’une carte | Conflit visible sans écrasement silencieux |

Les objectifs de performance seront fixés sur un jeu de données, des appareils, un réseau et une charge documentés. Une fonction décrite dans le concept n’est considérée réalisée qu’après preuve d’implémentation, vérification et réception selon la procédure Fadi.

## 13 Décisions établies et arbitrages à venir

Le périmètre établi comprend le nom GeoData, l’autonomie complète par rapport aux projets, l’accès direct à la carte et une interaction inspirée de Kharita. Le noyau conserve ses données, permissions et résultats propres. La décision de périmètre est consignée dans ADR-GEODATA-01.

Restent à confirmer : la source des limites administratives, les droits des jeux retenus, le fournisseur de fond et de géocodage, le moteur cartographique, les formats d’échange du premier lot, l’étendue du partage, la conservation des versions et les moyens d’exploitation.

Le choix de réutiliser l’infrastructure existante, le modèle logique et les familles de routes présentés ici sont des orientations de conception. Ils ne déclarent pas un module déjà intégré au code ou à l’architecture exécutée.

## 14 Références

- **R1** [Kharita carte de référence](https://lekharita.com/cartes#c=10.17/33.73818/-7.36937&l=indicateurs-socio-economiques-communes-maroc-rgph-2024&b=satellite). Référence d’organisation de l’espace cartographique.
- **R2** [ArcGIS découpage administratif du Maroc](https://www.arcgis.com/home/item.html?id=21bcbcaa915c433ba7c7850bafeede7b#overview) et [présentation Africa GeoPortal](https://morocco.africageoportal.com/maps/21bcbcaa915c433ba7c7850bafeede7b/explore?location=33.741691%2C-6.209447%2C11). Candidats à qualifier ; même identifiant d’item.
- **R3** [SIG-Maroc catalogue](https://www.sig-maroc.com/donnees/catalogue), [recherche de données](https://sig-maroc.com/donnees/) et [conditions d’utilisation](https://www.sig-maroc.com/legales/conditions-utilisation). Sources potentielles et règles à vérifier pour les usages retenus.
- **R4** [HCP population légale RGPH 2024](https://www.hcp.ma/Population-legale-du-Royaume-du-Maroc-repartie-par-regions-provinces-et-prefectures-et-communes-selon-les-resultats-du_a3974.html). Publication primaire à examiner pour les indicateurs territoriaux.
- **R5** [OpenStreetMap droits et attribution](https://www.openstreetmap.org/copyright). Référence pour les obligations des données ouvertes candidates.
- **R6** [USGS Maroc](https://www.usgs.gov/centers/national-minerals-information-center/morocco), [publication DS20](https://pubs.usgs.gov/publication/ds20) et [notice MRDS](https://www.usgs.gov/publications/mineral-resources-data-system-mrds). Documentation thématique à qualifier par date, couverture et précision.
- **R7** [Architecture Fadi au commit étudié](https://github.com/RachEma-ux/Fadi/blob/7717f9f15d315aaa568bc1fc2336d22a01dbc9b4/docs/architecture.md). Infrastructure et organisation modulaire existantes ; GeoData reste à concevoir et réaliser.
- **R8** [Règles Fadi au commit étudié](https://github.com/RachEma-ux/Fadi/blob/7717f9f15d315aaa568bc1fc2336d22a01dbc9b4/AGENTS.md). Langues, coordonnées, vérification et continuité.
- **R9** [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/). Candidat pour le moteur cartographique.
- **R10** [OpenLayers](https://openlayers.org/). Alternative à examiner selon les formats et usages.
- **R11** [Procédure des concepts Fadi](https://github.com/RachEma-ux/Fadi/blob/7717f9f15d315aaa568bc1fc2336d22a01dbc9b4/Fadi%20Concept/README.md) et [continuité documentaire](https://github.com/RachEma-ux/Fadi/blob/7717f9f15d315aaa568bc1fc2336d22a01dbc9b4/docs/continuity/README.md). Gestion de la paire MD/DOCX, index, branche, PR et preuves.
- **R12** [Issue de cadrage et de dépôt GeoData](https://github.com/RachEma-ux/Fadi/issues/243). Traçabilité de la demande, livrables et critères documentaires.

## 15 Historique des versions

| Version | Date | Objet |
| --- | --- | --- |
| 1.0 | 22 octobre 2026 | Première définition de GeoData comme module autonome sans dépendance aux projets, avec accès cartographique direct |

Le Markdown constitue la source éditable ; le Word restitue le même contenu substantiel et la même version. Toute révision future doit conserver la paire précédente dans les archives prévues par la procédure, puis actualiser ensemble les deux formats.
