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

## Conséquences

- `docs/architecture.md` et `module-registry.ts` déclarent GeoData une fois le code livré.
- Les critères GEO 01–13 sont prouvés par tests et recette ; GEO 12 sur appareils physiques et la recette par un
  utilisateur restent à faire par le maître d’ouvrage.
- Une décision contraire du maître d’ouvrage prime : elle se consigne dans une nouvelle ADR.

## Références

- [ADR-GEODATA-01](ADR-GEODATA-01.md) ; [Concept GeoData](../../../Fadi%20Concept/Fadi%20Concept%20-%20GeoData.md).
- [Plan retenu](../../workstreams/geodata/PLAN-IMPLEMENTATION.md).
- Source pilote : https://www.geoboundaries.org/api/current/gbOpen/MAR/ADM1/ (licence ODbL 1.0).
