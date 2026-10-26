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
     2. **Arabe** : les **données** en arabe (noms des unités, libellés d'indicateurs) sont affichées telles quelles
        (`translate="no"`, compatible D-163) ; une interface arabe complète (droite à gauche) n'est pas engagée.
     3. **Contours des communes** : OpenStreetMap (déjà en base) ; un fichier officiel du HCP le remplacera s'il est fourni.
     4. **Rattachement** : valeurs HCP rattachées aux contours par une table de correspondance relisible
        (`docs/geodata/sources/correspondances/`), chaque lien contrôlé par la géographie (inclusion dans la région ou la
        province), nom approché seulement s'il est unique et nettement devant, rattachements manuels justifiés ligne à
        ligne ; une entité non rattachée garde « non appariée », jamais zéro. Lot A livré : population légale sur
        3 niveaux (12/12 régions, 75/75 provinces et préfectures, 1 487/1 498 contours communaux, 97,6 % de la population).
     5. **Suite** (lots B à G de l'analyse : navigation par niveaux, libellés, palettes et classes, fiche territoriale,
        arbre d'indicateurs, mini-carte et impression) : un lot à la fois, chacun consigné.

## Conséquences

- `docs/architecture.md` et `module-registry.ts` déclarent GeoData une fois le code livré.
- Les critères GEO 01–13 sont prouvés par tests et recette ; GEO 12 sur appareils physiques et la recette par un
  utilisateur restent à faire par le maître d’ouvrage.
- Une décision contraire du maître d’ouvrage prime : elle se consigne dans une nouvelle ADR.

## Références

- [ADR-GEODATA-01](ADR-GEODATA-01.md) ; [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md).
- [Plan retenu](../../workstreams/geodata/PLAN-IMPLEMENTATION.md).
- Source pilote : https://www.geoboundaries.org/api/current/gbOpen/MAR/ADM1/ (licence ODbL 1.0).
