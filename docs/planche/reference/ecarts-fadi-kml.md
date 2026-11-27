# Écarts déclarés — KML / KMZ projetés dans le système du projet (cas 4, lot C4, étape 7b)

Capture du panneau livré (accord de Roch « Vas non stop », 27.11.2026) : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7b-kml.png`.
Catalogue : D10-R-003.

## Lecture
- Lecteur écrit pour Fadi, sans bibliothèque (`packages/sandbox-planche-model/src/kml.ts`, XML par `xml-mini.ts`, KMZ par
  `zip.ts`) : Placemark avec Point, LineString, LinearRing, Polygon (contour et trous), MultiGeometry ; dossiers gardés
  dans les noms (« Dossier / Repère »). Un KMZ est lu par son `doc.kml`, sinon son premier `.kml`.
- Non lus et signalés : superpositions d'images (GroundOverlay, ScreenOverlay, PhotoOverlay), modèles 3D, trajets
  horodatés (gx:Track), styles et descriptions. Les images d'un KMZ ne sont pas extraites.
- Altitudes : ignorées, tout est posé à plat (z = 0) ; signalé quand le fichier les déclare (`absolute`,
  `relativeToGround`).

## Projection
- Les coordonnées WGS84 sont projetées par l'API (`POST /sandbox/projections`, proj4 déjà présent côté serveur) dans le
  système du point de base, puis ramenées au dessin par le point de base (rotation comprise). Sans point de base,
  l'import est refusé avec son motif.
- Définition du système : celle que Fadi connaît déjà (`SITE_CRS_DEFINITIONS` : EPSG:2154, EPSG:26191), sinon le `.prj`
  fourni (Ctrl+Maj+Espace, Y). Fadi n'embarque aucun autre référentiel (D-GD-29) : un système inconnu sans `.prj` est
  refusé, jamais supposé.
- Un `.prj` qui porte un code d'autorité doit désigner le système du point de base, sinon il est refusé. Un `.prj` sans
  code (forme ESRI, par exemple « CH1903+_LV95 ») est accepté sur son nom affiché : la personne vérifie qu'il décrit
  bien le système du point de base.
- Le changement de datum suit la définition reçue (paramètres `TOWGS84` s'ils y sont) ; sans eux, l'écart de datum
  n'est pas corrigé. Aucune grille de correction n'est appliquée.

## Pose
- Polygone : un groupe par polygone, face trouée posée à plat (contour en sens direct, trous en sens inverse). Un contour
  qui se recoupe ou dégénère après projection est laissé de côté et compté dans la note.
- Ligne : un guide segment par tronçon et un texte repère à son premier point. Point : un point de guide et un texte
  repère. Noms coupés à 80 caractères.
- L'import est un seul pas, annulable.

## Données
- Le KML ou KMZ reçu et le `.prj` fourni sont archivés tels quels en base (`sandbox_references_fichiers`, formats `kml`,
  `kmz`, `prj`, signature contrôlée par l'API) avant la pose (D-GD-29). Seules les coordonnées partent vers la route de
  projection ; rien n'est gardé par elle.
- La contrainte des formats archivés est désormais une seule liste dans `init.sql` (rejouée à chaque migration) ; un
  test vérifie qu'une contrainte répétée sous le même nom est toujours `NOT VALID`.

## Raccourcis
En deux temps après Ctrl+Maj+Espace : W (KML / KMZ), Maj+W (importer), Y (définition du système, .prj).
