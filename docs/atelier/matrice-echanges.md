# Matrice d'échanges de l'Atelier

État au lot 6, complété (4 octobre 2026, D-025). Une ligne par classe du modèle typé, une colonne par format. Chaque échange produit
un rapport (par classe : effectifs source / cible, représentation, remarques ; pertes et références à réparer) :
rien n'est omis en silence. Code : `packages/atelier-model/src/echanges/`, `documents/`, `apps/api/src/lib/atelier-ifc.ts`.

Légende : **C** conservé · **T** transformé (dit au rapport) · **O** omis (dit au rapport) · — sans objet.

## Formats

| Format | Sens | Où | Producteur | Contrôle |
| --- | --- | --- | --- | --- |
| IFC 4.3 (`IFC4X3_ADD2`, ISO 16739-1:2024) | export | Atelier « Exporter → Maquette IFC 4.3 », catalogue (`/documents/atelier/modele.ifc`) | écriture directe, `exporterIfc` (D-013) | IfcOpenShell 0.9.0 en CI : schéma, règles EXPRESS, effectifs, géométrie d'un échantillon (`apps/api/test-corpus/ifc/`) |
| IFC (IFC2X3, IFC4, IFC4X3) | import | Atelier « Importer → Maquette IFC… », `POST /projects/:id/atelier/import-ifc` | lecture web-ifc 0.0.78 (MPL-2.0) côté serveur, `commandesImportIfc` | aller-retour P.118 en CI (relu, importé, réexporté, revalidé) ; test API |
| STEP AP242 (ISO 10303-21, écrit par OCCT 7.9 via occt-wasm 5.6.1) | export | fiche d'un `solide-exact` « Télécharger STEP », bouton « Exporter STEP » de la barre, `GET /projects/:id/atelier/solides-exacts/:objetId/export.step` (P2-1, D-182) | `MoteurExact.exporterStep` côté serveur (brep canonique + pose) | test API aller-retour (export relu par `importStep`, même volume à 1e-6 m³) ; recette `p2-noyau-exact.mjs` |
| STEP (AP203 / AP214 / AP242 lus par OCCT) | import | Échanges « Importer → Pièce STEP… », `POST /projects/:id/atelier/import-step?niveauId=…` (P2-1) | lecture serveur, un `solide-exact` par solide du fichier, opération `import-step` tracée | recette `p2-noyau-exact.mjs` (tube exporté puis réimporté, même volume) |
| DXF R12 ASCII | export | vues et feuilles (lot 5), plan de niveau (lot 4) | `dxfVue`, `dxfFeuille`, `dxfNiveau` | tests unitaires, reproductibilité |
| DXF ASCII (R12 à 2018) | import 2D | Atelier « Importer → Plan DXF (2D)… » | `commandesImportDxf` (navigateur, par commandes) | tests unitaires, recette e2e |
| PDF, SVG | export | vues, feuilles (lot 5) | `pdfVue`, `pdfFeuille`, `svgVue`, `svgFeuille` | reproductibilité octet pour octet |
| CSV, HTML | export | tableaux et quantités (lot 5) | `csvTableau`, `rapportQuantitesHtml` | identiques à la même révision |
| Paquet natif (archive JSON v2 + manifeste) | export / import | « Sauvegarder projet JSON » / « Importer projet JSON » | `exportProjectArchive`, `manifestePaquet`, `manifesteOf` | aller-retour à l'identique (test API), empreinte du modèle vérifiée |

## Classes × formats

| Classe | IFC export | IFC import | DXF export (vues) | DXF import | Paquet natif |
| --- | --- | --- | --- | --- | --- |
| element-bois (P2-4) | C `IfcMember` (PredefinedType par rôle : STUD, PLATE, POST, PURLIN, RAFTER, BRACE, STRUT) ou `IfcBeam` (.BEAM. / .JOIST.), corps tessellé ; essence en `IfcMaterial` ; section, source, longueur en `Fadi_Bois` | — (`objet-importe`) | T : bande de section ou section en plan | — | C |
| ossature (P2-4) | C `IfcElementAssembly` .USERDEFINED. (ObjectType `ossature:<genre>`) agrégeant ses pièces ; `Fadi_Ossature` | — | T : étiquette | — | C |
| panneau-clt (P2-4) | C `IfcWall` .SOLIDWALL. (vertical) ou `IfcSlab` .FLOOR. (plancher), ObjectType CLT, tessellé ; `Fadi_CLT` | — (`objet-importe`) | T : trait épais ou contour | — | C |
| assemblage-bois (P2-4) | T `IfcFastener` .USERDEFINED. (bois–bois, placé) ou `IfcDiscreteAccessory` .USERDEFINED. (bois–métal, platine tessellée) ; quincaillerie en `Fadi_AssemblageBois` | O / — | T : symbole | — | C |
| tole (P2-4) | C `IfcPlate` .SHEET. tessellée (face, zones pliées, ailes) ; plis et développé en `Fadi_Tole` | — (`objet-importe`) | T : face et emprise des ailes | — | C (développé recalculé) |
| segment-reseau (P2-5) | C `IfcPipeSegment` .RIGIDSEGMENT. / `IfcDuctSegment` .RIGIDSEGMENT. / `IfcCableCarrierSegment` (.CABLETRAYSEGMENT., .CONDUITSEGMENT.) tessellé (tube creux ou gaine balayés tronçon par tronçon) ; section, DN, source, fluide, sens, longueur en `Fadi_Reseau` ; matériau en `IfcMaterial` ; ports `IfcDistributionPort` (a, b) emboîtés par `IfcRelNests` | — (`objet-importe`) | T : tracé à la largeur de la section | — | C |
| raccord-reseau (P2-5) | C `IfcPipeFitting` / `IfcDuctFitting` (.BEND., .JUNCTION., .TRANSITION., .CONNECTOR.) ou `IfcCableCarrierFitting` (.BEND., .TEE., .CROSS., .REDUCER.) tessellé (un bras par port) ; ports emboîtés | — (`objet-importe`) | T : symbole | — | C |
| vanne (P2-5) | C `IfcValve` (.ISOLATING., .REGULATING., .CHECK., .SAFETYCUTOFF., .DIVERTING.) tessellée ; face à face, fluide en `Fadi_Reseau` ; ports 1, 2 (3) emboîtés | — (`objet-importe`) | T : symbole | — | C |
| equipement-reseau (P2-5) | C `IfcFlowTerminal` / `IfcFlowMovingDevice` / `IfcEnergyConversionDevice` / `IfcFlowStorageDevice` / `IfcFlowTreatmentDevice` / `IfcFlowController` selon la catégorie, boîte tessellée, type déclaré en ObjectType ; ports emboîtés avec système (.PIPE., .DUCT., .CABLECARRIER.) et sens (SOURCE, SINK, SOURCEANDSINK) | — (`objet-importe`) | T : emprise | — | C |
| support-reseau (P2-5) | T `IfcDiscreteAccessory` .USERDEFINED. (ObjectType support:<type>), symbole tessellé ; segment porté en `Fadi_Reseau` | — (`objet-importe`) | T : symbole | — | C |
| connexion de réseau (P2-5, relation `connecte`) | C `IfcRelConnectsPorts` entre les deux `IfcDistributionPort` ; réseaux connexes dérivés en `IfcDistributionSystem` .USERDEFINED. (ObjectType systèmes:fluides, membres par `IfcRelAssignsToGroup`) | — | — | — | C |
| plafond (P2-6) | C `IfcCovering` .CEILING. tessellé ; hauteur sous plafond, épaisseur, suspendu en `Fadi_Plafond` ; matériau en `IfcMaterial` | — (`objet-importe`) | T : contour en tirets | — | C |
| coque (P2-6) | C `IfcRoof` .FREEFORM. tessellé (dôme paraboloïdal déclaré) ; flèche, épaisseur en `Fadi_Coque` | — (`objet-importe`) | T : contour | — | C |
| rampe (P2-6) | C `IfcRamp` .STRAIGHT_RUN_RAMP. tessellée ; longueur, largeur, hauteur, pente dérivée en `Fadi_Rampe` | — (`objet-importe`) | T : axe à la largeur, flèche de montée | — | C |
| echelle (P2-6) | C `IfcStair` .LADDER. tessellée (montants, barreaux, crinoline) ; `Fadi_Echelle` | — (`objet-importe`) | T : symbole au pied | — | C |
| mur-rideau (P2-6) | C `IfcCurtainWall` tessellé (montants, traverses, remplissage) ; trame et comptes en `Fadi_MurRideau` | — (`objet-importe`) | T : axe à la profondeur des profils | — | C |
| terrain (P2-6) | C `IfcGeographicElement` .TERRAIN. tessellé (semis triangulé Delaunay) ; points, triangles, source en `Fadi_Terrain` | — (`objet-importe`) | T : emprise convexe et points | — | C |
| reservation (P2-6) | C `IfcOpeningElement` .OPENING. tessellé + `IfcRelVoidsElement` vers l'hôte exporté (sinon posée sous le niveau) ; statut, hôte, pour en `Fadi_Reservation` | — (`objet-importe`) | T : emprise colorée par statut | — | C |
| installation-chantier (P2-6) | T `IfcBuildingElementProxy` .PROVISIONFORSPACE. (ObjectType chantier:<type>) tessellé ; type, hauteur, période, phase en `Fadi_Chantier` ; hors métrés | — (`objet-importe`) | T : emprise | — | C |
| surface-libre (P2-6) | T `IfcBuildingElementProxy` tessellé (maillage subdivisé) ; sommets, faces, subdivisions, fermée, origine en `Fadi_SurfaceLibre` | — (`objet-importe`) | T : emprise convexe | — | C |
| annotation-fabrication (P2-7) | C `IfcAnnotation` .SYMBOL. (ObjectType `fabrication:<type>`, texte dérivé en `IfcTextLiteral`) ; le tracé du symbole est propre aux vues | — (`objet-importe`) | T : texte dérivé (TEXT) | T : symbole tracé en primitives (cadre, flèche, ligne de référence, coche) | C (texte) |
| cotation mécanique (P2-7, `prefixe`, `tolerance`) | O : texte tolérancé non porté par `IfcAnnotation` .DIMENSION. (déclaré) | — | T : texte « Ø1000 +0,1/−0,05 » | T : texte tolérancé sur la cote | C |
| étiquette intelligente (P2-7, `champ`) | C `IfcAnnotation` .TEXT. (texte résolu à l'export) | — | T : texte résolu | T : texte résolu | C |
| nuage-de-points (P2-7) | O : omis de l'IFC (relevé, pas un objet de l'ouvrage ; D-189) | — (lecture LAS / XYZ / PTS par `POST /atelier/nuages`, E57 et LAZ refusés) | O | T : croix fines de la tranche (5 000 au plus) | C (échantillon décimé, origine déclarée) |
| définitions `graphe` et `regle` (P2-8) | O : hors IFC (recettes de génération et règles du projet, pas des objets de l'ouvrage ; D-190) | — | — | — | C (archive du modèle, `verifierModele`) |
| poutre (P2-3) | C `IfcBeam` (.BEAM., rôles poutre / longrine) ou `IfcMember` (.BRACE. / .RAFTER. / .PURLIN. / .USERDEFINED.), corps tessellé du balayage de section ; rôle, section, profil, source, masse linéique, matériau en `Fadi_Structure` | — (`objet-importe`, classe d'origine conservée) | T : bande de la largeur de section et axe | — | C |
| trame (P2-3) | C `IfcGrid` .RECTANGULAR. (files = UAxes, rangs = VAxes, `IfcGridAxis` sur polylignes) | O : non relue (déclaré) | T : axes et bulles | — | C |
| plaque (P2-3) | C `IfcPlate` tessellée ; épaisseur, matériau, préfabriqué en `Fadi_Structure` | — (`objet-importe`) | T : contour | — | C |
| assemblage-structurel (P2-3) | T `IfcElementAssembly` .USERDEFINED. (ObjectType `assemblage-structurel:<type>`), platine et boulons tessellés dans un seul produit ; éléments, platine, boulons en `Fadi_AssemblageStructurel` (pas d'`IfcMechanicalFastener` unitaire) | — (`objet-importe`) | T : platine en plan | — | C |
| soudure (P2-3) | T `IfcFastener` .WELD. placé, sans volume ; type, gorge, longueur, éléments en `Fadi_Soudure` | O : non relue (sans volume) | T : symbole | — | C |
| assemblage soudé (dérivé, DA-10-10) | C `IfcElementAssembly` .WELDED. agrégeant ses éléments (`IfcRelAggregates`), `Fadi_AssemblageSoude` | — | — | — | — (recalculé) |
| armature (P2-3) | C `IfcReinforcingBar` (Ø nominal, aire, longueur développée, .MAIN. / .STIRRUP. / .LIGATURE.), une par objet, nombre et espacement en `Fadi_Armature` ; corps tessellé simplifié | — (`objet-importe`) | T : tracé pointillé | — | C |
| coulage (P2-3) | C `IfcGroup` (ObjectType coulage / lot-prefabrique) + `IfcRelAssignsToGroup` ; `Fadi_Coulage` | O | — | — | C |
| assemblage (P2-2) | C `IfcElementAssembly` (Tag = numéro) agrégeant ses pièces par `IfcRelAggregates` ; liaisons et diagnostic en `Fadi_Assemblage` | — (revient en représentations importées) | T : repère (croix et nom) | — | C (repère, pièces, liaisons) |
| piece-mecanique (P2-2) | T `IfcBuildingElementProxy` (ObjectType `piece-mecanique`, Tag = référence), maillage posé (`IfcTriangulatedFaceSet`) ; référence, numéro, matériau, volume, empreinte brep en `Fadi_Piece` | — (`objet-importe`) | T : emprise (enveloppe convexe) | — | C (brep, maillage, pose, provenance) ; STEP : via la source exacte |
| liaison (P2-2) | O : portée par `Fadi_Assemblage` (type, pièces, valeur), pas un produit | — | — | — | C |
| solide-exact (P2-1) | T `IfcBuildingElementProxy`, type `Fadi_SolideExact`, maillage dérivé (`IfcTriangulatedFaceSet`) ; brep, moteur, version et empreinte en propriétés | — (un solide IFC importé reste `objet-importe`) | T : emprise (enveloppe convexe) | — | C (brep, pose, provenance) ; STEP : C (brep exact + pose) |
| niveau | C `IfcBuildingStorey` (`Elevation`, placement) | C : même altitude ± 5 mm = niveau existant, sinon niveau « IFC · nom » créé | T : une vue par niveau | — (niveau d'accueil choisi) | C |
| mur | C `IfcWall` + `IfcWallType`, repère propre au mur ; corps `SweptSolid` (contour raccordé aux angles et tés) vidé par les ouvertures ; axe `Axis` ; `Pset_WallCommon` ; composition : `IfcMaterialLayerSet` (type) et `IfcMaterialLayerSetUsage` (mur cohérent) ; connexions `IfcRelConnectsPathElements` (extrémités, tés, croisements ; D-038) | T : représentation importée (maillage, vides déjà soustraits) | T : poché, contour de l'union | — | C |
| porte, fenêtre, ouverture | C `IfcDoor` / `IfcWindow` + `IfcOpeningElement`, `IfcRelVoidsElement`, `IfcRelFillsElement` ; porte au sens renseigné : repère propre et `OperationType` `SINGLE_SWING_LEFT` / `RIGHT`, `DOUBLE_DOOR_SINGLE_SWING`, `SLIDING_TO_LEFT` / `RIGHT` (D-037, D-047) | T : représentation importée ; `IfcOpeningElement` O (vide déjà dans l'hôte) | T : symbole conventionnel ; battant selon le sens renseigné, sinon convention signalée (D-037) | — | C |
| dalle | C `IfcSlab` `FLOOR`, profil à trous | T : représentation importée | T | — | C |
| toiture | C `IfcRoof` agrégeant `IfcSlab` `ROOF` (plate : extrusion ; en pente : `Tessellation`) | T : le pan importé ; `IfcRoof` sans corps O | T : contour, faîtage | — | C |
| escalier | C `IfcStair` `Tessellation`, `Pset_StairCommon` | T : représentation importée ; escalier sans corps O | T : foulée, flèche | — | C |
| poteau | C `IfcColumn` extrudé | T : représentation importée | T : poché | — | C |
| pièce, espace | C `IfcSpace` agrégé à l'étage, `Qto_SpaceBaseQuantities`, `Fadi_Piece` | T : représentation importée `IfcSpace` (ni coupée ni occultante dans les vues) | T : contour, code, nom, aire | — | C |
| zone | T `IfcZone` sans géométrie, membres par `IfcRelAssignsToGroup` | O (pas de géométrie) | T : contour | — | C |
| solide | C `IfcBuildingElementProxy`, rôle en `ObjectType` et `Fadi_Solide.Role` (jamais reclassé) | T : représentation importée | T | — | C |
| garde-corps | C `IfcRailing` `GUARDRAIL`, `Fadi_GardeCorps` | T : représentation importée | T | — | C |
| bloc (occurrence) | composant : C `IfcBuildingElementProxy` + `Fadi_Composant` ; bloc 2D : O | — | T : contenu dessiné à chaque occurrence | T : `INSERT` décomposé en esquisses et textes (point de base, échelles, rotation, réseau, blocs imbriqués ; le bloc n'est pas recréé) ; `XREF` : T si son fichier DXF est joint (unité convertie, calques « xref|calque »), sinon O signalée (D-036) | C |
| objet importé | T `IfcBuildingElementProxy`, GlobalId d'origine, classe d'origine en `ObjectType` et `Fadi_Import` | C : maillage, classe, GlobalId ; type, matériaux et propriétés simples en propriétés importées ; O si GlobalId déjà présent (pas de doublon) | T : coupé et vu comme toute matière | — | C |
| cotation | T `IfcAnnotation` `DIMENSION` (export seulement ; valeur et rattachements non portés) | T : `IfcAnnotation` → traits (esquisses) et textes, non associatifs | C | T : `DIMENSION` linéaires et alignées → cotes non associatives (texte imposé non repris) ; radiales et diamétrales → cotes linéaires (rayon, diamètre) ; angulaires → arc et texte de l'angle (D-031) ; d'ordonnée → ligne de rappel et texte de la valeur (D-035) | C |
| texte, étiquette | T `IfcAnnotation` `TEXT` | T `IfcTextLiteral` → `texte` (position, contenu) | C | C `TEXT`, `MTEXT`, `ATTRIB` → `texte` (position, contenu ; hauteur, rotation, style non portés) | C |
| esquisse | T `IfcAnnotation` (polylignes ; arcs, cercles et ellipses omis) | O | C | C `LINE`, `LWPOLYLINE` (arrondis discrétisés), `POLYLINE` 2D, `CIRCLE`, `ARC`, `ELLIPSE` (ellipse ; arcs d'ellipse discrétisés, D-046) ; `HATCH` → hachure (contour extérieur, motif nommé ; îlots, arêtes elliptiques ou splines : O) ; `SPLINE`, 3D : O comptés | C |
| référence de plan | O (fond de dessin) | — | T | C : cadre du dessin (`reference-plan`, calque « Référence DXF »), contenu groupé | C |
| contrainte, référence | O (comptées « à réparer » au rapport s'il y en a) | — | — | — | C |
| hypothèses, sources, structure déclarée | C `Fadi_Hypotheses`, `Fadi_Sources`, `Fadi_StructureDeclaree` (statut explicite, « à confirmer ») | — | — | — | C |
| propriétés d'import natif (`natif:*`) | O (comptées au rapport) | — | — | — | C |

## Repères (R5)

| Échange | Règle |
| --- | --- |
| IFC export | Le repère local est le système de coordonnées du fichier ; `IfcMapConversion` → `IfcProjectedCRS` (EPSG de la parcelle) : `cadastral = local + origineLocale`, sans rotation ni échelle ; hauteur orthogonale 0 écrite par convention (aucune altitude absolue dans le modèle) et dite au rapport. Sans parcelle : pas de conversion, dit au rapport. |
| IFC import | Même CRS que la parcelle, sans rotation ni échelle : `local = fichier + (E, N) − origineLocale`, explicite. CRS différent, rotation ou échelle, ou projet sans parcelle : coordonnées gardées telles quelles et rapport « à recaler ». Altitudes rendues relatives au niveau d'accueil. web-ifc rend Y vers le haut : retour `X = x′, Y = −z′, Z = y′`, appliqué une seule fois (`atelier-ifc.ts`). |
| DXF export | Repère local en mètres (vue) ou feuille en millimètres ; origine cadastrale en commentaire. |
| DXF import | Choix explicite : repère local, ou cadastral (CRS de la parcelle) converti par `local = cadastral − origineLocale`. Unité : `$INSUNITS` ; absente → choix de l'utilisateur, écrit comme hypothèse au rapport. |
| Paquet natif | Manifeste : repère local, CRS et origine, formule de conversion ; unités SI. |

## Identités

- Export IFC : GlobalId déterministe dérivé de l'identifiant du projet et de l'objet (`guidIfc`) — le même objet
  garde son GlobalId d'un export à l'autre ; l'identifiant Fadi est écrit en `Fadi_Identite.Identifiant`.
- Import IFC : identifiant Fadi `ifc-<GlobalId>` ; GlobalId et classe d'origine conservés ; un second import du même
  fichier n'ajoute rien (rapport « déjà présent »).
- Import DXF : identifiants `dxf-<fichier>-n` ; un second import du même nom de fichier est refusé.
- Paquet natif : identifiants Fadi inchangés ; empreinte du modèle au manifeste, vérifiée à l'import (avertissement si
  le modèle a été modifié hors de Fadi ; il est de toute façon revalidé objet par objet).

## Hors périmètre (déclaré)

`IfcStairFlight`, bibliothèques
(`IfcProjectLibrary`), calques IFC (`IfcPresentationLayerWithStyle`), `XREF` DXF dont le fichier n'est pas joint
(signalée au rapport), DWG. À l'import IFC, le type, les matériaux (couches et épaisseurs) et les propriétés simples sont
repris en propriétés importées « déclarées » des représentations, jamais réinterprétés.
Conformité IFC **testée**, jamais « certifiée » (D-006) ; l'ouverture dans un visualiseur tiers est un constat du
maître d'ouvrage (acceptation du lot 6).
