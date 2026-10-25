# Matrice d’échanges de Studio

<!-- Généré depuis packages/atelier-model/src/studio/echanges/matrice-echanges.ts (studio-matrice-echanges/1, révision 3) : ne pas éditer à la main. -->

Établie le 2026-10-25 (révision 3, schéma `studio-matrice-echanges/1`), à partir de l’audit des exporteurs et importeurs Studio. Lots E.6-01 à E.6-05 du plan d’implémentation Studio V1.0 (§5.7).

**Aucune entrée n’est une déclaration de conformité** : « livré » dit ce que le code écrit ou lit et le contrôle qui le vérifie ; la conformité d’un format reste non évaluée. Un format reporté est inscrit « non livré » avec sa raison et sa source ; « renoncé » exige une décision Studio admise (aucune aujourd’hui).

Entrées : 40 — livrées : 21, non livrées : 19, renoncées : 0.

## Formats × sens

| Identifiant | Format | Version du format | Sens | Famille | Objet | Statut | Tâches | Limite de couverture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `natif-commandes` | Enveloppe de commandes Studio (JSON) | studio-commands/1 | import | natif | Commandes de document appliquées à une variante (seule écriture du modèle) | livré | E.6-02 | 500 commandes et 1 Mo par enveloppe ; chaque commande est revalidée par le serveur, qui fait seul autorité ; rejeu idempotent par requestId. |
| `natif-archive-export` | Archive de projet (section Studio, JSON) | fadi-studio-archive/1 (document studio-document/1) | export | natif | Études, variantes, révisions immuables, commentaires, observations, publications et leurs fichiers figés, exigences, journal du métré | livré | E.6-02 | Section signée (HMAC-SHA256 du manifeste, clé du serveur) ; empreintes de contenu conservées ; rien n’est recalculé. |
| `natif-archive-import` | Archive de projet (section Studio, JSON) | fadi-studio-archive/1 (document studio-document/1) | import | natif | Restauration de la section Studio dans un nouveau projet | livré | E.6-02 | Manifeste et empreintes contrôlés (refus 422) ; sans signature vérifiée par ce serveur, auteurs et approbations ne sont pas crus ; identifiant déjà présent : partie Studio non restaurée, réserve signalée. |
| `natif-file-locale` | File locale hors ligne (JSON) | fadi-studio-file-locale/1 | export | natif | Copie de secours d’une file locale de commandes non synchronisée | livré | E.6-02 | Export de secours seulement : Studio ne relit pas ce fichier ; la ligne exportée est relue du stockage, jamais de la mémoire. |
| `dessin-svg` | SVG | SVG (espace de noms W3C, aucune version déclarée dans le fichier) | export | dessin | Document d’une révision de variante (plan 2D) | livré | E.6-03 | Plan 2D seulement : solides et hauteurs absents ; calques masqués conservés sous display="none" ; aucun script ni ressource externe. |
| `dessin-dxf` | DXF ASCII | R12 (AC1009), CRLF, $INSUNITS = 6 (mètre) | export | dessin | Document d’une révision de variante (plan 2D) | livré | E.6-03 | R12 seulement ; $INSUNITS n’appartient pas à R12 (variable introduite avec AC1015) : l’unité n’est pas garantie chez un lecteur R12 strict ; ASCII strict (texte échappé, 250 caractères) ; cotes non associatives ; noms de calque réécrits (31 caractères ASCII) ; solides absents. |
| `maquette-ifc` | IFC (STEP physique, ISO 10303-21) | IFC4X3_ADD2, ViewDefinition [ReferenceView] | export | maquette | Objets extrudés, solides libres, murs et ouvertures, propriétés déclarées d’une révision | livré | E.6-03 | Seuls les éléments 3D sont écrits ; arcs discrétisés ; cotes, annotations et réglages de visualisation absents ; IfcDoor / IfcWindow seulement si le type est déclaré, sans représentation propre. |
| `dessin-dxf-import` | DXF ASCII | R12 et suivantes (codes de groupe), CRLF ou LF ; DXF binaire refusé | import | dessin | Plan 2D ajouté au brouillon d’une variante, par commandes | livré | E.6-03 | 5 Mo au plus ; unité lue dans $INSUNITS (16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue, choisie par l’utilisateur, jamais devinée) ; un calque déjà verrouillé dans le document (calque implicite compris) qui recevrait des objets fait échouer l’import ; Z ignoré (compté) ; tout le reste compté par type dans le rapport d’import, jamais écarté en silence. |
| `maquette-ifc-import` | IFC (STEP physique, ISO 10303-21) | IFC2X3, IFC4, IFC4X1 à IFC4X3 (FILE_SCHEMA lu) ; ifcXML et ifcZIP refusés | import | maquette | Maquette d’un autre logiciel ajoutée au brouillon d’une variante, par commandes | livré | E.6-04 | 5 Mo au plus ; lecteur STEP propre, sans web-ifc ; unité de longueur lue dans l’IfcUnitAssignment du projet (IfcSIUnit et son préfixe, ou IfcConversionBasedUnit dont le facteur est déclaré), absente : rien n’est importé, jamais supposée ; seules les extrusions verticales (IfcExtrudedAreaSolid d’un IfcRectangleProfileDef ou d’un IfcArbitraryClosedProfileDef droit) placées par IfcLocalPlacement tourné autour de z sont traduites ; toute autre entité ou géométrie est conservée comme élément non natif, et chaque information non reprise est comptée dans le rapport de pertes. |
| `modele-externe-ifc` | IFC (STEP physique, ISO 10303-21) | IFC2X3, IFC4, IFC4X1 à IFC4X3 (lecteur de l’import IFC) | import | coordination | Modèle d’un partenaire référencé, comparé à la révision courante, accepté ou refusé | livré | E.6-04 | Référence, auteur, discipline, version, unité et transformation déclarées par l’émetteur ; fichier relu par le serveur dans un document à part, jamais dans la variante ; comparaison par identifiant (GlobalId) avec la révision courante ; acceptation ou refus réservés au propriétaire et aux approbateurs, journalisés, un refus avec motif ; accepté, le modèle s’ajoute au brouillon seulement par une action explicite ; non repris par l’archive du projet. |
| `feuille-svg` | SVG | studio-sheet/1 (SVG en millimètres) | export | feuille | Feuille de présentation d’une révision (format, échelle, cartouche) | livré | E.6-02 | A4 à A1 ; échelle choisie ou ajustée ; dessin découpé au cadre ; valeur absente du cartouche imprimée « non évalué ». |
| `feuille-pdf` | PDF | PDF 1.4 (une page) | export | feuille | Feuille de présentation d’une révision | livré | E.6-02 | Mêmes primitives que la feuille SVG ; aucune conformité PDF/A déclarée. |
| `feuille-composee-svg` | SVG | studio-feuille-composee/1 (feuille studio-sheet/1 avec ligne de provenance) | export | feuille | Feuille composée enregistrée (vue source, révision épinglée) | livré | E.6-02 | Lit une révision enregistrée, jamais le brouillon ; provenance recalculée par le serveur (révision, empreintes du document et de la vue). |
| `feuille-composee-pdf` | PDF | PDF 1.4 (une page) | export | feuille | Feuille composée enregistrée | livré | E.6-02 | Mêmes primitives que la feuille composée SVG ; aucune conformité PDF/A déclarée. |
| `dossier-pdf` | PDF | PDF 1.4 (plusieurs pages) | export | dossier | Dossier de conception : feuilles ordonnées, métré, rapport de fidélité | livré | E.6-02 | Quantités brutes, déductions et nettes séparées ; valeur absente « non évalué » ; aucune conformité PDF/A déclarée. |
| `dossier-json` | JSON | studio-dossier-conception/1 | export | dossier | Dossier de conception (données natives du dossier) | livré | E.6-02 | Export seulement : aucun import de dossier ; empreinte du dossier portée en en-tête. |
| `tableau-metre-csv` | CSV | UTF-8 avec BOM, séparateur « ; », décimale « , » ou « . » | export | tableau | Tableau du métré d’une révision (brut, déductions, net, ajustements) | livré | E.6-02 | Export seulement ; statut de chaque ajustement écrit en clair ; refusé tant que le métré n’est pas à jour. |
| `rendu-png` | PNG | PNG (bloc iTXt « fadi:rendu » de provenance) | export | rendu | Rendu du modèle depuis la vue 3D d’une révision enregistrée | livré | E.6-02 | Image du canevas, pixels non modifiés ; refusé sur un brouillon non enregistré ou un maillage en cours ; provenance : étude, variante, révision, scène, caméra, date. |
| `paquet-publication` | Paquet de publication (SVG, DXF, IFC, feuille PDF) | studio-publication-manifest/1 | export | paquet | Fichiers figés d’une publication approuvée et diffusée | livré | E.6-02 | Fichiers du manifeste approuvé, identifiés par SHA-256 et vérifiables ; dessin 2D indépendant : sans IFC ; mêmes limites que chaque export. |
| `rapport-fidelite-json` | JSON | studio-rapport-fidelite/1 | export | rapport | Rapport de fidélité d’un export SVG, DXF ou IFC (même révision) | livré | E.6-03 | Décrit le fichier (jamais certifié) : exact, approché, non couvert, par type et par raison ; calques masqués et noms réécrits. |
| `diagnostic-releve-perf` | JSON | Relevé de performances Studio (sans schéma versionné) | export | diagnostic | Mesures de chargement et d’exécution de la session (hors modèle) | livré | E.6-02 | Diagnostic seulement : aucune donnée du projet ; non relu par Studio. |
| `dwg-import` | DWG | non évaluée | import | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `dwg-export` | DWG | non évaluée | export | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `dgn-import` | DGN | non évaluée | import | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `dgn-export` | DGN | non évaluée | export | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `bcf-import` | BCF | non évaluée (2.1 / 3.0) | import | coordination | Observations et sujets de coordination | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `bcf-export` | BCF | non évaluée (2.1 / 3.0) | export | coordination | Observations et sujets de coordination | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `step-import` | STEP (ISO 10303-21, AP203 / AP214 / AP242) | non évaluée | import | maquette | Solides exacts (brep) | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `step-export` | STEP (ISO 10303-21, AP203 / AP214 / AP242) | non évaluée | export | maquette | Solides exacts (brep) | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `obj-import` | OBJ (Wavefront) | non évaluée | import | maquette | Maillage 3D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `obj-export` | OBJ (Wavefront) | non évaluée | export | maquette | Maillage 3D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `stl-import` | STL | non évaluée (ASCII / binaire) | import | maquette | Maillage 3D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `stl-export` | STL | non évaluée (ASCII / binaire) | export | maquette | Maillage 3D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `gltf-export` | glTF | non évaluée (2.0) | export | maquette | Maillage 3D et apparences d’affichage | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `ifc-autres-versions-export` | IFC | IFC2X3, IFC4 | export | maquette | Document d’une révision | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `dxf-autres-versions-export` | DXF ASCII | AC1015 (2000) et suivantes | export | dessin | Document d’une révision | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `dxf-binaire-import` | DXF binaire | non évaluée | import | dessin | Plan 2D | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `svg-lecture-import` | SVG | non évaluée | import | dessin | Dessin 2D | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `pdf-lecture-import` | PDF | non évaluée | import | dessin | Fond de plan | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `nuage-points-import` | Nuage de points (LAS, E57, LAZ) | non évaluée | import | maquette | Relevé | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |

## Entrées livrées : entités, contrôles et preuves

### `natif-commandes` — Enveloppe de commandes Studio (JSON) (import)

- Version : studio-commands/1
- Objet : Commandes de document appliquées à une variante (seule écriture du modèle)
- Limite : 500 commandes et 1 Mo par enveloppe ; chaque commande est revalidée par le serveur, qui fait seul autorité ; rejeu idempotent par requestId.
- Route : `POST /projects/:projectId/studio/studies/:studyId/variants/:variantId/commands`
- Contrôle : Recette studio-persistance.mjs (rejeu, conflits, droits).
- Entité Toutes les entités du document : portée — Formes, cotes, annotations, solides, architecture, propriétés, scènes : par leurs outils du registre.
- Code : `apps/api/src/lib/studio-commands.ts` (`` submitStudioCommands ``)
- Tests : `apps/web/e2e/studio-persistance.mjs` (`` const replay = await owner('POST', `${variantPath(s)}/commands`, envelope) ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/commands ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `natif-archive-export` — Archive de projet (section Studio, JSON) (export)

- Version : fadi-studio-archive/1 (document studio-document/1)
- Objet : Études, variantes, révisions immuables, commentaires, observations, publications et leurs fichiers figés, exigences, journal du métré
- Limite : Section signée (HMAC-SHA256 du manifeste, clé du serveur) ; empreintes de contenu conservées ; rien n’est recalculé.
- Route : `GET /projects/:projectId/archive`
- Contrôle : Tests du manifeste d’archive ; recette studio-restauration.mjs (base neuve, comparaison avant / après).
- Entité Tables Studio du projet : portée — Lignes exportées telles quelles, manifeste et empreinte globale.
- Code : `apps/api/src/lib/studio-archive.ts` (`` exportStudioArchive ``)
- Tests : `apps/api/src/lib/studio-archive-manifest.test.ts` (`` STUDIO_ARCHIVE_SCHEMA ``) ; `apps/web/e2e/studio-restauration.mjs` (`` check('sauvegarde : section Studio présente (schéma, version, manifeste)' ``)
- Routes : `apps/api/src/routes/projects.ts` (`` /:projectId/archive ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, R.1-02` — Liste d’exécution Studio V1.0

### `natif-archive-import` — Archive de projet (section Studio, JSON) (import)

- Version : fadi-studio-archive/1 (document studio-document/1)
- Objet : Restauration de la section Studio dans un nouveau projet
- Limite : Manifeste et empreintes contrôlés (refus 422) ; sans signature vérifiée par ce serveur, auteurs et approbations ne sont pas crus ; identifiant déjà présent : partie Studio non restaurée, réserve signalée.
- Route : `POST /projects/import`
- Contrôle : Recette studio-restauration.mjs.
- Entité Tables Studio du projet : portée — Réinsérées telles quelles ; révisions et journaux insérés, jamais réécrits.
- Code : `apps/api/src/lib/studio-archive.ts` (`` importStudioArchive ``)
- Tests : `apps/api/src/lib/studio-archive-manifest.test.ts` (`` checkStudioArchive ``) ; `apps/web/e2e/studio-restauration.mjs` (`` const imported = await ownerB('POST', '/projects/import', archiveText) ``)
- Routes : `apps/api/src/routes/projects.ts` (`` "/import" ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, R.1-02` — Liste d’exécution Studio V1.0

### `natif-file-locale` — File locale hors ligne (JSON) (export)

- Version : fadi-studio-file-locale/1
- Objet : Copie de secours d’une file locale de commandes non synchronisée
- Limite : Export de secours seulement : Studio ne relit pas ce fichier ; la ligne exportée est relue du stockage, jamais de la mémoire.
- Contrôle : Tests de la file locale.
- Entité Brouillon local (commandes non envoyées) : portée — Ligne conservée telle quelle, avec la raison du blocage et la date d’export.
- Code : `apps/web/src/modules/studio/hors-ligne/AvisFileLocale.tsx` (`` preparerExportFileLocale ``)
- Tests : `apps/web/src/modules/studio/hors-ligne/file-locale.test.ts` (`` preparerExportFileLocale ``)
- Interface : `apps/web/src/modules/studio/hors-ligne/AvisFileLocale.tsx` (`` a.download = "studio-file-locale.json" ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `dessin-svg` — SVG (export)

- Version : SVG (espace de noms W3C, aucune version déclarée dans le fichier)
- Objet : Document d’une révision de variante (plan 2D)
- Limite : Plan 2D seulement : solides et hauteurs absents ; calques masqués conservés sous display="none" ; aucun script ni ressource externe.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=svg`
- Contrôle : Tests de l’export ; recette studio-persistance.mjs ; rapport de fidélité servi à côté du fichier.
- Couverture par entité : rapport de fidélité `svg` (tableau ci-dessous).
- Code : `packages/atelier-model/src/studio/export.ts` (`` exportStudioSvg ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export.test.ts` (`` exportStudioSvg ``) ; `apps/web/e2e/studio-persistance.mjs` (`` const svg = await owner('GET', `${exportPath}?format=svg`) ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-svg": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `dessin-dxf` — DXF ASCII (export)

- Version : R12 (AC1009), CRLF, $INSUNITS = 6 (mètre)
- Objet : Document d’une révision de variante (plan 2D)
- Limite : R12 seulement ; $INSUNITS n’appartient pas à R12 (variable introduite avec AC1015) : l’unité n’est pas garantie chez un lecteur R12 strict ; ASCII strict (texte échappé, 250 caractères) ; cotes non associatives ; noms de calque réécrits (31 caractères ASCII) ; solides absents.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=dxf`
- Contrôle : Tests de l’export ; recette studio-persistance.mjs ; rapport de fidélité servi à côté du fichier.
- Couverture par entité : rapport de fidélité `dxf` (tableau ci-dessous).
- Code : `packages/atelier-model/src/studio/export.ts` (`` exportStudioDxf ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export.test.ts` (`` exportStudioDxf ``) ; `apps/web/e2e/studio-persistance.mjs` (`` const dxf = await owner('GET', `${exportPath}?format=dxf`) ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-dxf": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `maquette-ifc` — IFC (STEP physique, ISO 10303-21) (export)

- Version : IFC4X3_ADD2, ViewDefinition [ReferenceView]
- Objet : Objets extrudés, solides libres, murs et ouvertures, propriétés déclarées d’une révision
- Limite : Seuls les éléments 3D sont écrits ; arcs discrétisés ; cotes, annotations et réglages de visualisation absents ; IfcDoor / IfcWindow seulement si le type est déclaré, sans représentation propre.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=ifc`
- Contrôle : Tests de l’export ; corpus validé par IfcOpenShell 0.9.0 en CI (schéma, règles EXPRESS, effectifs, propriétés) ; testé, jamais certifié.
- Couverture par entité : rapport de fidélité `ifc` (tableau ci-dessous).
- Entités IFC écrites `IfcProject`, `IfcSite`, `IfcBuilding`, `IfcBuildingStorey`, `IfcRelAggregates`, `IfcRelContainedInSpatialStructure` : Projet (unités SI, mètre), site nommé d’après l’étude, bâtiment nommé d’après la variante, un niveau de référence à z = 0 ; ni adresse, ni géoréférencement.
- Entités IFC écrites `IfcUnitAssignment`, `IfcSIUnit`, `IfcGeometricRepresentationContext`, `IfcGeometricRepresentationSubContext` : Unités SI (longueur, aire, volume, angle) ; contextes Body et Axis du repère local-3d.
- Entités IFC écrites `IfcCartesianPoint`, `IfcDirection`, `IfcAxis2Placement3D`, `IfcAxis2Placement2D`, `IfcLocalPlacement`, `IfcProductDefinitionShape`, `IfcShapeRepresentation`, `IfcPolyline` : Placements, représentations et courbes des éléments écrits.
- Entités IFC écrites `IfcWall`, `IfcExtrudedAreaSolid`, `IfcRectangleProfileDef`, `IfcArbitraryClosedProfileDef` : Mur d’architecture (emprise extrudée et axe) ; ligne extrudée avec épaisseur (profil rectangle longueur × épaisseur) ; arc extrudé avec épaisseur (couronne discrétisée) ; type prédéfini .NOTDEFINED.
- Entités IFC écrites `IfcBuildingElementProxy`, `IfcCircleProfileDef` : Prisme .NOTDEFINED. (SweptSolid) : rectangle, cercle (profil exact) et polyligne fermée extrudés, solides libres ; jamais une dalle ni un poteau devinés.
- Entités IFC écrites `IfcBuildingElementProxy`, `IfcTriangulatedFaceSet`, `IfcCartesianPointList3D` : Surface verticale ouverte .NOTDEFINED. (Tessellation) : ligne, arc ou polyligne ouverte extrudés sans épaisseur ; aucun solide.
- Entités IFC écrites `IfcOpeningElement`, `IfcRelVoidsElement` : Ouverture : boîte .OPENING. reliée au mur hôte, placée relativement au mur.
- Entités IFC écrites `IfcDoor`, `IfcWindow`, `IfcRelFillsElement` : Porte ou fenêtre seulement si son type est déclaré : remplit l’ouverture, sans représentation propre.
- Entités IFC écrites `IfcPropertySet`, `IfcPropertySingleValue`, `IfcRelDefinesByProperties` : Jeux de propriétés listés ci-dessous, valeurs saisies seulement.
- Entités IFC écrites `IfcPresentationLayerWithStyle` : Un calque par calque non vide : nom, identifiant Studio, visibilité, verrou ; calque masqué exporté éteint.
- Jeu de propriétés `Fadi_StudioExtrusion` : Objet extrudé : identifiant Studio, base, hauteur, épaisseur si saisie.
- Jeu de propriétés `Fadi_StudioFreeSolid` : Solide libre : identifiant, forme, origine, rotation, dimensions saisies.
- Jeu de propriétés `Fadi_StudioWall` : Mur : identifiant, épaisseur, hauteur, base, justification, longueur d’axe.
- Jeu de propriétés `Fadi_StudioOpening` : Ouverture : identifiant, mur hôte, position, largeur, hauteur, allège, type déclaré.
- Jeu de propriétés `Fadi_StudioExport` : Projet : document, révision, repère et effectifs (éléments écrits, objets non extrudés, cotes et annotations non exportées).
- Jeu de propriétés `Fadi_ProprietesDeclarees` : Propriétés déclarées valuées de chaque objet porteur ; les propriétés sans valeur sont comptées, jamais écrites.
- Code : `packages/atelier-model/src/studio/ifc.ts` (`` exportStudioIfc ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/ifc.test.ts` (`` exportStudioIfc ``) ; `apps/api/test-corpus/ifc/generer-studio.ts` (`` exportStudioIfc ``) ; `.github/workflows/ci.yml` (`` generer-studio.ts ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-ifc": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `dessin-dxf-import` — DXF ASCII (import)

- Version : R12 et suivantes (codes de groupe), CRLF ou LF ; DXF binaire refusé
- Objet : Plan 2D ajouté au brouillon d’une variante, par commandes
- Limite : 5 Mo au plus ; unité lue dans $INSUNITS (16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue, choisie par l’utilisateur, jamais devinée) ; un calque déjà verrouillé dans le document (calque implicite compris) qui recevrait des objets fait échouer l’import ; Z ignoré (compté) ; tout le reste compté par type dans le rapport d’import, jamais écarté en silence.
- Contrôle : Tests de l’import (modèle et interface) ; rapport d’import à l’aperçu.
- Entité LINE : portée — Ligne.
- Entité CIRCLE : portée — Cercle.
- Entité ARC : portée — Arc (angles ramenés en radians), cercle si ses angles se confondent.
- Entité LWPOLYLINE / POLYLINE 2D : partielle — Polyligne à renflements ; rectangle si fermée à 4 sommets parallèles aux axes ; sinon un segment droit par ligne.
- Entité Calques (table LAYER) : portée — Repris par nom ou créés, visibilité et verrouillage du fichier.
- Entité TEXT, INSERT, SPLINE, HATCH, DIMENSION, ELLIPSE… : absente — Non importés comme objets, comptés par type ; conservés comme éléments non natifs (type, handle, nom de bloc, raison) si l’option est cochée.
- Entité Polylignes 3D ou lissées, espace papier : absente — Non importées comme objets, comptées ; conservées comme éléments non natifs si l’option est cochée.
- Code : `packages/atelier-model/src/studio/import-dxf.ts` (`` lireDxfStudio ``)
- Tests : `packages/atelier-model/src/studio/import-dxf.test.ts` (`` lireDxfStudio ``) ; `apps/web/src/modules/studio/import/import-dxf.test.ts` (`` lireDxfStudio ``)
- Interface : `apps/web/src/modules/studio/import/DialogueImportDxf.tsx` (`` export function DialogueImportDxf( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `maquette-ifc-import` — IFC (STEP physique, ISO 10303-21) (import)

- Version : IFC2X3, IFC4, IFC4X1 à IFC4X3 (FILE_SCHEMA lu) ; ifcXML et ifcZIP refusés
- Objet : Maquette d’un autre logiciel ajoutée au brouillon d’une variante, par commandes
- Limite : 5 Mo au plus ; lecteur STEP propre, sans web-ifc ; unité de longueur lue dans l’IfcUnitAssignment du projet (IfcSIUnit et son préfixe, ou IfcConversionBasedUnit dont le facteur est déclaré), absente : rien n’est importé, jamais supposée ; seules les extrusions verticales (IfcExtrudedAreaSolid d’un IfcRectangleProfileDef ou d’un IfcArbitraryClosedProfileDef droit) placées par IfcLocalPlacement tourné autour de z sont traduites ; toute autre entité ou géométrie est conservée comme élément non natif, et chaque information non reprise est comptée dans le rapport de pertes.
- Contrôle : Tests du lecteur (fixture IFC2X3 écrite à la main, IFC4 en pieds, aller-retour avec l’export IFC4X3 de Studio) ; recette studio-echanges.mjs (import par l’interface, éléments non natifs visibles).
- Entité IfcWall, IfcWallStandardCase : partielle — Mur (axe, épaisseur, hauteur, cote de base lus ; justification déduite de l’axe Axis) si le corps est rectangulaire ; sinon prisme libre, perte comptée.
- Entité IfcOpeningElement, IfcRelVoidsElement : portée — Ouverture du mur importé : position, largeur, hauteur et allège lues de son corps.
- Entité IfcDoor, IfcWindow, IfcRelFillsElement : partielle — Type déclaré porte ou fenêtre de l’ouverture remplie ; géométrie propre du remplissage non reprise (perte comptée).
- Entité IfcSlab : partielle — Prisme libre à sa cote ; sémantique de dalle non reprise (perte comptée).
- Entité IfcBuildingStorey : partielle — Calque nommé d’après le niveau ; ses éléments y sont rangés ; l’élévation est portée par les placements.
- Entité IfcSpace, IfcColumn, IfcBeam, IfcBuildingElementProxy… : absente — Conservés comme éléments non natifs : type, GlobalId, nom, raison, empreinte lue ; non éditables, exclus des métrés.
- Entité IfcPropertySet, IfcRelAssociatesMaterial, IfcRelDefinesByType, IfcMapConversion, IfcSite, IfcBuilding… : absente — Comptés par type dans le rapport de pertes.
- Code : `packages/atelier-model/src/studio/import-ifc/import-ifc.ts` (`` lireIfcStudio ``)
- Tests : `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` (`` lireIfcStudio ``) ; `apps/web/src/modules/studio/import/import-ifc.test.ts` (`` lireIfcStudio ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Importer IFC : rapport de pertes ``)
- Interface : `apps/web/src/modules/studio/import/DialogueImportIfc.tsx` (`` export function DialogueImportIfc( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, TEST-028` — Liste d’exécution Studio V1.0

### `modele-externe-ifc` — IFC (STEP physique, ISO 10303-21) (import)

- Version : IFC2X3, IFC4, IFC4X1 à IFC4X3 (lecteur de l’import IFC)
- Objet : Modèle d’un partenaire référencé, comparé à la révision courante, accepté ou refusé
- Limite : Référence, auteur, discipline, version, unité et transformation déclarées par l’émetteur ; fichier relu par le serveur dans un document à part, jamais dans la variante ; comparaison par identifiant (GlobalId) avec la révision courante ; acceptation ou refus réservés au propriétaire et aux approbateurs, journalisés, un refus avec motif ; accepté, le modèle s’ajoute au brouillon seulement par une action explicite ; non repris par l’archive du projet.
- Route : `POST /projects/:projectId/studio/studies/:studyId/variants/:variantId/modeles-externes`
- Contrôle : Tests des règles (modèle et serveur) ; recette studio-echanges.mjs (réception, comparaison, acceptation journalisée).
- Entité Déclarations de l’émetteur : portée — Conservées telles quelles ; l’unité déclarée est comparée à l’unité lue, jamais substituée.
- Entité Fichier reçu : portée — Conservé tel quel avec son SHA-256 ; lecture et pertes comme l’import IFC.
- Entité Écarts avec la révision courante : portée — Objets, calques, cotes, murs et ouvertures, solides libres, éléments non natifs : ajoutés, supprimés, modifiés.
- Code : `packages/atelier-model/src/studio/echanges/modeles-externes.ts` (`` lireModeleExterne ``) ; `apps/api/src/lib/studio-modeles-externes.ts` (`` deciderReception ``)
- Tests : `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts` (`` passageModeleExterne ``) ; `apps/api/src/lib/studio-modeles-externes.test.ts` (`` deciderReception ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Modèle externe : accepté par le propriétaire ``)
- Routes : `apps/api/src/routes/studio-modeles-externes.ts` (`` /studies/:studyId/variants/:variantId/modeles-externes ``)
- Interface : `apps/web/src/modules/studio/echanges/PanneauModelesExternes.tsx` (`` export function PanneauModelesExternes( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, TR-EX-066` — Liste d’exécution Studio V1.0

### `feuille-svg` — SVG (export)

- Version : studio-sheet/1 (SVG en millimètres)
- Objet : Feuille de présentation d’une révision (format, échelle, cartouche)
- Limite : A4 à A1 ; échelle choisie ou ajustée ; dessin découpé au cadre ; valeur absente du cartouche imprimée « non évalué ».
- Contrôle : Tests de la feuille.
- Entité Dessin 2D par calque : partielle — Mêmes primitives que l’export SVG, découpées au cadre ; solides absents.
- Entité Cartouche, échelle graphique, nord : portée — Tracés sur la feuille.
- Code : `packages/atelier-model/src/studio/feuille.ts` (`` exportStudioSheetSvg ``) ; `packages/atelier-model/src/studio/feuille.ts` (`` studioSheetSvg ``)
- Tests : `packages/atelier-model/src/studio/feuille.test.ts` (`` exportStudioSheetSvg ``)
- Interface : `apps/web/src/modules/studio/feuille/PanneauFeuille.tsx` (`` data-studio-feuille-svg ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `feuille-pdf` — PDF (export)

- Version : PDF 1.4 (une page)
- Objet : Feuille de présentation d’une révision
- Limite : Mêmes primitives que la feuille SVG ; aucune conformité PDF/A déclarée.
- Contrôle : Tests de la feuille.
- Entité Feuille composée : portée — Primitives de la feuille SVG.
- Code : `packages/atelier-model/src/studio/feuille.ts` (`` studioSheetPdf ``)
- Tests : `packages/atelier-model/src/studio/feuille.test.ts` (`` studioSheetPdf ``)
- Interface : `apps/web/src/modules/studio/feuille/PanneauFeuille.tsx` (`` data-studio-feuille-pdf ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `feuille-composee-svg` — SVG (export)

- Version : studio-feuille-composee/1 (feuille studio-sheet/1 avec ligne de provenance)
- Objet : Feuille composée enregistrée (vue source, révision épinglée)
- Limite : Lit une révision enregistrée, jamais le brouillon ; provenance recalculée par le serveur (révision, empreintes du document et de la vue).
- Route : `GET /projects/:projectId/studio/studies/:studyId/sheets/:sheetId/files/svg`
- Contrôle : Tests du dossier de conception ; recette studio-dossier.mjs.
- Entité Vue documentaire (calques retenus) : partielle — Calques exclus listés ; solides absents.
- Code : `packages/atelier-model/src/studio/dossier-conception.ts` (`` studioFeuilleComposeeSvg ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioSheetFile ``)
- Tests : `packages/atelier-model/src/studio/dossier-conception.test.ts` (`` studioFeuilleComposeeSvg ``) ; `apps/web/e2e/studio-dossier.mjs` (`` await fichier(f1.files.svg) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${sheet}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` href={f.files.svg} download ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-02` — Liste d’exécution Studio V1.0

### `feuille-composee-pdf` — PDF (export)

- Version : PDF 1.4 (une page)
- Objet : Feuille composée enregistrée
- Limite : Mêmes primitives que la feuille composée SVG ; aucune conformité PDF/A déclarée.
- Route : `GET /projects/:projectId/studio/studies/:studyId/sheets/:sheetId/files/pdf`
- Contrôle : Recette studio-dossier.mjs.
- Entité Feuille composée : portée — Primitives de la feuille SVG.
- Code : `packages/atelier-model/src/studio/feuille.ts` (`` studioSheetPdf ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioSheetFile ``)
- Tests : `apps/web/e2e/studio-dossier.mjs` (`` await fichier(f1.files.pdf) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${sheet}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` href={f.files.pdf} download ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-02` — Liste d’exécution Studio V1.0

### `dossier-pdf` — PDF (export)

- Version : PDF 1.4 (plusieurs pages)
- Objet : Dossier de conception : feuilles ordonnées, métré, rapport de fidélité
- Limite : Quantités brutes, déductions et nettes séparées ; valeur absente « non évalué » ; aucune conformité PDF/A déclarée.
- Route : `GET /projects/:projectId/studio/studies/:studyId/dossiers/:dossierId/files/pdf`
- Contrôle : Tests du dossier de conception ; recette studio-dossier.mjs.
- Entité Feuilles composées : portée — Dans l’ordre du dossier.
- Entité Métré (brut, déductions, net) : portée — Épinglé sur une révision.
- Entité Rapport de fidélité : portée — Totaux par format, raisons.
- Code : `packages/atelier-model/src/studio/dossier-conception.ts` (`` pdfDossierConception ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioDossierFile ``)
- Tests : `packages/atelier-model/src/studio/dossier-conception.test.ts` (`` pdfDossierConception ``) ; `apps/web/e2e/studio-dossier.mjs` (`` await fichier(dos.files.pdf) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${dossier}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` data-studio-dossier-pdf ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-03` — Liste d’exécution Studio V1.0

### `dossier-json` — JSON (export)

- Version : studio-dossier-conception/1
- Objet : Dossier de conception (données natives du dossier)
- Limite : Export seulement : aucun import de dossier ; empreinte du dossier portée en en-tête.
- Route : `GET /projects/:projectId/studio/studies/:studyId/dossiers/:dossierId/files/json`
- Contrôle : Tests du dossier de conception ; recette studio-dossier.mjs.
- Entité Dossier (feuilles, métré, fidélité, empreintes) : portée — Objet du dossier tel qu’assemblé.
- Code : `packages/atelier-model/src/studio/dossier-conception.ts` (`` assemblerDossierConception ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioDossierFile ``)
- Tests : `packages/atelier-model/src/studio/dossier-conception.test.ts` (`` assemblerDossierConception ``) ; `apps/web/e2e/studio-dossier.mjs` (`` const json1 = await fichier(dos.files.json) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${dossier}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` data-studio-dossier-json ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-03` — Liste d’exécution Studio V1.0

### `tableau-metre-csv` — CSV (export)

- Version : UTF-8 avec BOM, séparateur « ; », décimale « , » ou « . »
- Objet : Tableau du métré d’une révision (brut, déductions, net, ajustements)
- Limite : Export seulement ; statut de chaque ajustement écrit en clair ; refusé tant que le métré n’est pas à jour.
- Contrôle : Tests du CSV ; recette studio-quantites.mjs.
- Entité Lignes du métré : portée — Quantité dérivée, ajustement, auteur, statut.
- Code : `apps/web/src/modules/studio/quantites/csv-quantites.ts` (`` csvQuantites ``)
- Tests : `apps/web/src/modules/studio/quantites/csv-quantites.test.ts` (`` csvQuantites ``) ; `apps/web/e2e/studio-quantites.mjs` (`` // 6. CSV : colonnes d'ajustement. ``)
- Interface : `apps/web/src/modules/studio/quantites/PanneauQuantites.tsx` (`` data-studio-quantites-csv ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-04` — Liste d’exécution Studio V1.0

### `rendu-png` — PNG (export)

- Version : PNG (bloc iTXt « fadi:rendu » de provenance)
- Objet : Rendu du modèle depuis la vue 3D d’une révision enregistrée
- Limite : Image du canevas, pixels non modifiés ; refusé sur un brouillon non enregistré ou un maillage en cours ; provenance : étude, variante, révision, scène, caméra, date.
- Contrôle : Tests du bloc de provenance ; recette studio-visualisation.mjs.
- Entité Vue 3D affichée : partielle — Image seulement : aucune donnée du modèle n’est relisible.
- Code : `apps/web/src/modules/studio/vue3d/scenes/png.ts` (`` insererTextePng ``)
- Tests : `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` (`` insererTextePng ``) ; `apps/web/e2e/studio-visualisation.mjs` (`` check("PNG : vrai fichier PNG tiré du canevas" ``)
- Interface : `apps/web/src/modules/studio/vue3d/Vue3DStudio.tsx` (`` lien.download = studioNomFichierRendu(p) ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.5-03` — Liste d’exécution Studio V1.0

### `paquet-publication` — Paquet de publication (SVG, DXF, IFC, feuille PDF) (export)

- Version : studio-publication-manifest/1
- Objet : Fichiers figés d’une publication approuvée et diffusée
- Limite : Fichiers du manifeste approuvé, identifiés par SHA-256 et vérifiables ; dessin 2D indépendant : sans IFC ; mêmes limites que chaque export.
- Route : `GET /projects/:projectId/studio/studies/:studyId/publications/:publicationId/files/:format`
- Contrôle : Recettes studio-publication.mjs et studio-dossier.mjs (empreintes recalculées).
- Entité Fichiers du paquet : portée — SVG, DXF, IFC et feuille PDF calculés par les exporteurs du modèle.
- Code : `apps/api/src/lib/studio-publications.ts` (`` studioPackageFiles ``) ; `apps/api/src/lib/studio-publications.ts` (`` readStudioPackageFile ``)
- Tests : `apps/web/e2e/studio-publication.mjs` (`` const file = await reader('GET', `${pubs}/${id3}/files/${f.format}` ``)
- Routes : `apps/api/src/routes/studio-publications.ts` (`` ${base}/files/:format ``)
- Interface : `apps/web/src/modules/studio/publication/PanneauPublications.tsx` (`` data-studio-publication-fichier ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.4-03` — Liste d’exécution Studio V1.0

### `rapport-fidelite-json` — JSON (export)

- Version : studio-rapport-fidelite/1
- Objet : Rapport de fidélité d’un export SVG, DXF ou IFC (même révision)
- Limite : Décrit le fichier (jamais certifié) : exact, approché, non couvert, par type et par raison ; calques masqués et noms réécrits.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export/rapport?format=svg|dxf|ifc`
- Contrôle : Tests du rapport de fidélité.
- Entité Éléments du document : portée — Chacun compté une fois ; liste inconnue comptée « non couverte ».
- Code : `packages/atelier-model/src/studio/echanges/rapport-fidelite.ts` (`` studioRapportFidelite ``)
- Tests : `packages/atelier-model/src/studio/echanges/rapport-fidelite.test.ts` (`` studioRapportFidelite ``) ; `apps/web/src/modules/studio/variante/rapport-export.test.ts` (`` studioRapportFidelite ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export/rapport ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `diagnostic-releve-perf` — JSON (export)

- Version : Relevé de performances Studio (sans schéma versionné)
- Objet : Mesures de chargement et d’exécution de la session (hors modèle)
- Limite : Diagnostic seulement : aucune donnée du projet ; non relu par Studio.
- Contrôle : Tests du relevé.
- Entité Mesures de la session : portée — Définitions, contexte, synthèse, journal.
- Code : `apps/web/src/modules/studio/chargement/perf.ts` (`` ReleveurPerf ``)
- Tests : `apps/web/src/modules/studio/chargement/perf.test.ts` (`` ReleveurPerf ``)
- Interface : `apps/web/src/modules/studio/chargement/PanneauRessources.tsx` (`` a.download = "studio-releve-perf.json" ``)
- Sources : `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, X.1-09` — Liste d’exécution Studio V1.0

## Sous-ensemble SVG / DXF / IFC retenu (E.6-03) : couverture par type

Raisons possibles du rapport de fidélité (`studioRapportFidelite`) pour chaque type d’élément du document ; statut entre parenthèses.

| Catégorie | Type | SVG | DXF R12 | IFC4X3_ADD2 |
| --- | --- | --- | --- | --- |
| objets | line | `trace-exact` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `extrusion-non-portee` (approche) | `extrusion-exacte` (exact), `surface-exacte` (exact), `non-extrude` (non-couvert) |
| objets | rectangle | `trace-exact` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `extrusion-non-portee` (approche) | `extrusion-exacte` (exact), `non-extrude` (non-couvert) |
| objets | circle | `trace-exact` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `extrusion-non-portee` (approche) | `profil-exact` (exact), `non-extrude` (non-couvert) |
| objets | arc | `arcs-exacts` (exact), `extrusion-non-portee` (approche) | `arcs-exacts` (exact), `extrusion-non-portee` (approche) | `arcs-discretises` (approche), `non-extrude` (non-couvert) |
| objets | polyline | `trace-exact` (exact), `arcs-exacts` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `renflements-exacts` (exact), `extrusion-non-portee` (approche) | `extrusion-exacte` (exact), `surface-exacte` (exact), `arcs-discretises` (approche), `non-extrude` (non-couvert) |
| cotes | dimension | `cote-tracee` (exact) | `cote-eclatee` (approche) | `cote-hors-ifc` (non-couvert) |
| annotations | angular-dimension | `cote-tracee` (exact) | `cote-eclatee` (approche) | `annotation-hors-ifc` (non-couvert) |
| annotations | text | `texte-police-generique` (approche) | `texte-exact` (exact), `texte-ascii-echappe` (approche), `texte-remplace` (approche), `texte-tronque` (approche) | `annotation-hors-ifc` (non-couvert) |
| solides | box | `solide-hors-2d` (non-couvert) | `solide-hors-2d` (non-couvert) | `profil-exact` (exact) |
| solides | prism | `solide-hors-2d` (non-couvert) | `solide-hors-2d` (non-couvert) | `profil-exact` (exact) |
| architecture | wall | `extrusion-non-portee` (approche) | `extrusion-non-portee` (approche) | `extrusion-exacte` (exact) |
| architecture | opening | `ouverture-en-lacune` (approche) | `ouverture-en-lacune` (approche) | `ouverture-evidee` (exact) |
| proprietes | propriete | `propriete-non-exportee` (non-couvert) | `propriete-non-exportee` (non-couvert) | `propriete-en-pset` (exact), `propriete-non-evaluee` (non-couvert) |
| scenes | scene | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) |
| scenes | appearance | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) |
| nonNatifs | non-native | `non-natif-hors-export` (non-couvert) | `non-natif-hors-export` (non-couvert) | `non-natif-hors-export` (non-couvert) |

## Formats reportés (E.6-04, E.6-05)

| Identifiant | Format | Sens | Statut | Raison | Sources |
| --- | --- | --- | --- | --- | --- |
| `dwg-import` | DWG | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. D-179 renonce au DWG pour l’Atelier P2 (libredwg GPL, ODA SDK commercial) ; elle ne vaut pas pour Studio, dont le choix reste au maître d’ouvrage. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-179` — DWG et DGN renoncés pour l’Atelier P2 seulement |
| `dwg-export` | DWG | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. D-179 renonce au DWG pour l’Atelier P2 (libredwg GPL, ODA SDK commercial) ; elle ne vaut pas pour Studio, dont le choix reste au maître d’ouvrage. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-179` — DWG et DGN renoncés pour l’Atelier P2 seulement |
| `dgn-import` | DGN | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. D-179 renonce au DGN pour l’Atelier P2 seulement. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-179` — DWG et DGN renoncés pour l’Atelier P2 seulement |
| `dgn-export` | DGN | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. D-179 renonce au DGN pour l’Atelier P2 seulement. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-179` — DWG et DGN renoncés pour l’Atelier P2 seulement |
| `bcf-import` | BCF | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Les observations Studio (E.2) n’ont pas de contrat BCF ; règle d’identité à tenir : un même identifiant BCF reçu dans un autre contexte n’écrase ni ne clôt une observation. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/workstreams/studio/task-register.json` — Cas négatif « Même BCF-ID » |
| `bcf-export` | BCF | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Les observations Studio (E.2) n’ont pas de contrat BCF ; règle d’identité à tenir : un même identifiant BCF reçu dans un autre contexte n’écrase ni ne clôt une observation. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/workstreams/studio/task-register.json` — Cas négatif « Même BCF-ID » |
| `step-import` | STEP (ISO 10303-21, AP203 / AP214 / AP242) | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Studio n’a pas de noyau exact ; l’échange STEP de l’Atelier (OCCT, P2-1, D-182) lui reste interdit par la frontière des modules. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `scripts/frontieres.json, ADR-STUDIO-NAV-01` — Studio n’importe pas l’Atelier |
| `step-export` | STEP (ISO 10303-21, AP203 / AP214 / AP242) | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Studio n’a pas de noyau exact ; l’échange STEP de l’Atelier (OCCT, P2-1, D-182) lui reste interdit par la frontière des modules. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `scripts/frontieres.json, ADR-STUDIO-NAV-01` — Studio n’importe pas l’Atelier |
| `obj-import` | OBJ (Wavefront) | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Le maillage de la vue 3D (studioMesh3d) existe, aucun écrivain ni lecteur OBJ. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `obj-export` | OBJ (Wavefront) | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Le maillage de la vue 3D (studioMesh3d) existe, aucun écrivain ni lecteur OBJ. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `stl-import` | STL | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun écrivain ni lecteur STL. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `stl-export` | STL | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun écrivain ni lecteur STL. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `gltf-export` | glTF | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun écrivain glTF. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `ifc-autres-versions-export` | IFC | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Seul IFC4X3_ADD2 est écrit. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `dxf-autres-versions-export` | DXF ASCII | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Seul R12 (AC1009) est écrit ; les fichiers récents sont lus à l’import. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `dxf-binaire-import` | DXF binaire | import | non livré | Refusé à l’import avec un message (« enregistrez le fichier en DXF ASCII ») ; aucun lecteur binaire. | `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 ; `packages/atelier-model/src/studio/import-dxf.ts` — Refus du DXF binaire |
| `svg-lecture-import` | SVG | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun lecteur SVG. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `pdf-lecture-import` | PDF | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun lecteur PDF. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `nuage-points-import` | Nuage de points (LAS, E57, LAZ) | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. La lecture LAS / XYZ / PTS de l’Atelier (P2-7) n’est pas un échange Studio. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `scripts/frontieres.json, ADR-STUDIO-NAV-01` — Studio n’importe pas l’Atelier |
