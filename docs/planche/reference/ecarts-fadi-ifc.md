# Écarts déclarés — IFC structuré (cas 4, lot C4, étape 6)

Maquette : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-6-ifc.png`. Catalogue : D10-S-001, D10-F14-012,
N-D10-1, D10-R-002, D10-R-006, N-D10-2, D10-F14-124.

## Export
- Écrit pour Fadi, sans bibliothèque (`packages/sandbox-planche-model/src/ifc-structure.ts`) : schémas IFC2X3, IFC4 et
  IFC4X3_ADD2. Fichiers contrôlés localement avec IfcOpenShell 0.9 (`ifcopenshell.validate`, règles EXPRESS comprises) :
  0 erreur dans les trois schémas, pour les 14 classes écrites. Ce contrôle ne tourne pas en CI ; en CI et dans la
  Planche, le fichier émis est relu par Fadi et comparé avant chaque téléchargement (étages, objets, triangles,
  GlobalId, géoréférencement).
- Classes : un IfcBuildingStorey par niveau ; IfcWall pour un mur posé par l'outil Mur ; la classe et le GlobalId d'un
  objet importé d'un IFC structuré, si elle fait partie des 14 classes connues (IfcWall, IfcSlab, IfcBeam, IfcColumn,
  IfcDoor, IfcWindow, IfcRoof, IfcStair, IfcRailing, IfcCovering, IfcPlate, IfcMember, IfcFooting,
  IfcBuildingElementProxy), sinon IfcBuildingElementProxy (signalé par le contrôle) ; IfcBuildingElementProxy pour tout
  autre objet. Aucun type prédéfini, jeu de propriétés ni quantité n'est inventé (`NOTDEFINED`). Une copie d'un objet
  importé reçoit un nouveau GlobalId.
- Géométrie en coordonnées du projet, placement absolu : maillage triangulé (IfcTriangulatedFaceSet en IFC4 et IFC4X3,
  faces à IfcPolyLoop dans un IfcShellBasedSurfaceModel en IFC2X3, qui n'a pas de maillage indexé).
- Locaux : un IfcSpace par local (numéro, nom, usage), rattaché à l'étage mesuré, **sans géométrie**.
- Géoréférencement depuis le point de base (E, N, système, nord du quadrillage) et le niveau de référence de la Planche
  (H) : IfcMapConversion et IfcProjectedCRS en IFC4 et IFC4X3 ; en IFC2X3, jeux de propriétés ePset_MapConversion et
  ePset_ProjectedCRS posés sur le site (usage du guide buildingSMART). Aucune projection n'est calculée. Sans point de
  base ou sans niveau de référence : export non géoréférencé, signalé.
- IFC2X3 exige un historique (IfcOwnerHistory) : application « Fadi Planche », personne « Non renseigné ».
- `.ifczip` : archive ZIP **stockée** (sans compression : aucune dépendance ajoutée). Fichier reproductible : même
  modèle et même date, mêmes octets.
- Contrôle avant émission : constats seulement (géoréférencement, objets sans niveau, niveaux vides, objets non étanches,
  classes ramenées) ; seul un modèle vide bloque l'export. Rien n'est corrigé.

## Import
- Lecture STEP écrite pour Fadi (`ifc-step.ts`) ; `.ifczip` lu (entrées stockées ou compressées, `inflate.ts`).
- Étages en niveaux (nom, altitude ; hauteur = écart avec l'étage suivant, 3 m pour le dernier, à corriger dans le
  panneau Niveaux) ; objets rattachés à leur étage (IfcRelContainedInSpatialStructure, puis décomposition).
- Géométries lues : IfcTriangulatedFaceSet, IfcPolygonalFaceSet, faces à IfcPolyLoop (IfcFacetedBrep, modèles de
  surfaces), IfcExtrudedAreaSolid d'un profil rectangle ou polyligne, IfcMappedItem. Le premier opérande d'un
  IfcBooleanResult est pris tel quel : **les découpes (ouvertures, booléens) ne sont pas calculées**. Les autres
  géométries (CSG, B-rep courbes, profils courbes…) ne sont pas lues : comptées par classe, jamais ignorées en silence.
  Les faces polygonales sont triangulées en éventail (correct pour une face convexe).
- Les ouvertures (IfcOpeningElement) et les locaux (IfcSpace) ne sont pas posés comme objets.
- Trame (IfcGrid) : chaque axe devient un guide en ligne et un texte avec son étiquette, posé au début de l'axe.
- Géoréférencement lu (IfcMapConversion ou ePset d'IFC2X3) : posé en point de base sur demande, jamais à la place d'un
  point de base existant ; H n'est pas reporté (le niveau de référence reste celui de la Planche).
- Le fichier reçu est archivé tel quel en base (`sandbox_references_fichiers`, format `ifc` ou `ifczip`) avant la pose.
- La référence verrouillée de l'étape 3 reste le moyen de poser un IFC sans le modifier.

## Raccourcis
En deux temps après Ctrl+Maj+Espace : G (IFC structuré), Maj+G (exporter), V (contrôler), O (import IFC structuré),
Maj+O (importer).
