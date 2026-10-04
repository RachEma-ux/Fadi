# Lot 6 — Échanges — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010).

Ouvrir : un projet, `?module=atelier`, menus « Exporter » (« Maquette IFC 4.3 · rapport ») et « Importer »
(« Maquette IFC… », « Plan DXF (2D)… ») de la barre. La maquette IFC figure aussi au module Documents, groupe
« Vues, feuilles, quantités et maquette IFC de l'Atelier ». Matrice : `docs/atelier/matrice-echanges.md`.
Décision : D-019.

## Fait

| Sujet | Résultat |
| --- | --- |
| Export IFC 4.3 | `packages/atelier-model/src/echanges/ifc.ts` : écriture directe du fichier STEP `IFC4X3_ADD2` (D-013), sans dépendance, du sous-ensemble de l'annexe C — projet, site (emprise de la parcelle), bâtiment, étages ; murs (`IfcWall` + `IfcWallType`, corps extrudé vidé par les `IfcOpeningElement`, axe), portes et fenêtres (`IfcRelVoidsElement`, `IfcRelFillsElement`), dalles, toitures (`IfcRoof` + `IfcSlab ROOF`, pentes en maillage), escaliers, poteaux, pièces et espaces (`IfcSpace` agrégés à l'étage, `Qto_SpaceBaseQuantities`), zones (`IfcZone`), solides (`IfcBuildingElementProxy`, rôle jamais reclassé), garde-corps (`IfcRailing`), composants, annotations ; hypothèses, sources et structure déclarée en `IfcPropertySet` avec statut. `IfcMapConversion` vers `IfcProjectedCRS` (EPSG de la parcelle) : `cadastral = local + origineLocale`. GlobalId déterministes ; octets identiques à la même révision. Rapport par classe (lus, écrits, entité, représentation, remarques ; références à réparer ; propriétés natives non portées). |
| Catalogue | `GET /projects/:id/documents/atelier/modele.ifc` produit par le serveur à la révision courante (horodatage = instant de la révision), inscrit au catalogue, à jour puis périmé après une commande. |
| Import IFC | `apps/api/src/lib/atelier-ifc.ts` (web-ifc 0.0.78, MPL-2.0) lit maillages, étages (contenance, agrégation, vides et remplissages), `IfcMapConversion` ; retour Z vers le haut appliqué une fois. `echanges/import-ifc.ts` (pur) : chaque produit → **représentation importée** (classe `objet-importe` : classe et GlobalId d'origine, maillage compacté, z relatif au niveau, emprise convexe) ; étages appariés par altitude (± 5 mm) ou créés « IFC · nom » ; repère converti seulement si le CRS est celui de la parcelle sans rotation ni échelle ; GlobalId déjà présent non réimporté ; produits sans maillage, vides et annotations comptés au rapport. `POST /projects/:id/atelier/import-ifc` : lots de 500 commandes dans une transaction (tout ou rien), droits d'écriture, journal. Plan : emprise en tirets (espaces en pointillés, ni coupés ni occultants dans les vues) ; 3D : maillage ; inspecteur : classe IFC d'origine, maillage résumé ; R16 : paramètres non modifiables, transformations et organisation admises ; réexport en `IfcBuildingElementProxy` avec le GlobalId d'origine. |
| Import DXF 2D | `echanges/import-dxf.ts` (pur, dans le navigateur, par commandes) : `LINE`, `LWPOLYLINE` (arrondis discrétisés), `POLYLINE` 2D, `CIRCLE`, `ARC`, `TEXT`, `MTEXT` → esquisses et textes, un calque « DXF · … » par calque du fichier ; fond de plan `reference-plan` (cadre englobant, calque « Référence DXF ») ; tout groupé pour un calage d'un geste. Unité `$INSUNITS`, sinon choix écrit comme hypothèse ; repère local ou cadastral converti explicitement ; `INSERT`, `HATCH`, `DIMENSION`, 3D comptés, jamais devinés ; second import du même fichier refusé. |
| Paquet natif | Manifeste `fadi-paquet-natif` 1 dans l'archive v2 (`packages/domain-model/src/archive.ts`, `apps/api/src/lib/project-archive.ts`) : schémas (archive, modèle, contrat de commandes, IFC), unités, repères (CRS, origine, formule), identités et empreinte du modèle, versions des catalogues. À l'import : manifeste d'une version future ou d'un contrat inconnu refusé (422) ; empreinte différente → avertissement, modèle revalidé. |
| Corpus et CI | `apps/api/test-corpus/ifc/generer.ts` : `petit.ifc` (toutes les classes de l'annexe C, comparé octet pour octet à `petit.attendu.ifc`), `p118.ifc`, puis `p118-reimporte.ifc` (relu par web-ifc, importé, réexporté) ; `valider.py` (IfcOpenShell 0.9.0 : schéma, règles EXPRESS, effectifs attendus, géométrie d'un échantillon). Étape CI « Corpus IFC validé par IfcOpenShell ». |
| Interface | `apps/web/src/modules/atelier/nouveau/panneaux/Echanges.tsx` : export IFC avec rapport, menu « Importer », dialogue DXF (fichier, niveau, unité si absente, repère), rapport de fidélité (tableau défilant au clavier) ; import désactivé sur l'exemple protégé et en lecture seule. |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 95, **atelier-model 84** dont 11 nouveaux —
  STEP, GlobalId, export P.118 et sa reproductibilité, import : étages, repères, doublons, lots bornés, espaces hors
  matière, R16, réexport ; DXF : unités, calques, fond de plan, cadastral, hypothèse d'unité — **API 68** : P.118
  exporté au catalogue, reproductible, réimporté dans un autre projet avec rapport, réimport sans doublon, droits,
  péremption ; manifeste à l'aller-retour, version future refusée — web 20) · `npm run build` ✅.
- IfcOpenShell 0.9.0 : `petit.ifc`, `p118.ifc` (3,4 Mo ; 220 murs, 84 portes, 126 fenêtres, 210 ouvertures,
  119 espaces, 13 zones…) et `p118-reimporte.ifc` (1 539 représentations) **valides** (schéma, règles EXPRESS,
  géométrie de l'échantillon).
- Recette `apps/web/e2e/atelier-echanges.mjs` (nouvelle, en CI) : **17 contrôles verts** — import désactivé sur la
  référence, export IFC (fichier, `IfcMapConversion`, rapport : 220 murs lus / écrits), catalogue à jour, import dans
  un autre projet (220 `IfcWall` importés, ouvertures et annotations déclarées, repère déclaré, 5 niveaux « IFC · »),
  plan, inspecteur, 3D, import DXF (unité du fichier, `INSERT` signalé, 8 m, calques, groupe), 390 px, axe-core,
  aucune erreur JavaScript.
- Recettes `atelier-nouveau.mjs` (41 ✓), `atelier-documents.mjs` (18 ✓) ; scénario complet `parcours-scenario.mjs` :
  326 contrôles verts, « Scénario conforme. » (catalogue : 42 documents sur la référence, 41 sur la variante).
- `⏱` : export IFC du P.118 en mémoire 0,2 s ; depuis l'Atelier (serveur, téléchargement, rapport) 0,9–1,1 s ;
  import du P.118 (lecture web-ifc 0,7 s, 4 lots, relecture du modèle) 3,4–3,9 s dans le navigateur.
- Acceptation du cahier : P.118 exporté ✅, validé en CI ✅, réimporté avec rapport ✅ ; **ouverture dans un
  visualiseur IFC tiers choisi par le maître d'ouvrage : constat à faire de sa part** (fichier : Atelier →
  Exporter → Maquette IFC 4.3, ou module Documents).

## Défauts corrigés pendant le lot

- Maillage d'un objet importé : indices décalés de la base du tampon (objets superposés sinon).
- Catalogue : l'empreinte du rapport des quantités était la concaténation de sept empreintes ; condensée (CI du
  lot 5 rouge sur le décompte des documents, corrigé et décompte mis à jour).
- Sélection au plan : garde-corps et objets importés n'étaient pas accrochables (contours ajoutés).

## Non fait / reporté

- Import des annotations IFC, des matériaux et des types ; reconnaissance d'objets paramétriques à l'import
  (jamais devinés, R16 : une extrusion IFC reste une représentation importée).
- IFC : `IfcMaterialLayerSet` (aucune composition connue), `IfcStairFlight`, calques de présentation, bibliothèques.
- DXF : blocs (`INSERT`) non décomposés, `XREF`, hachures, cotes ; DWG.
- Import IFC de très grands fichiers : borné à 60 lots de 500 commandes (30 000 commandes) et 64 Mo ; au-delà, refus
  explicite (413).
