# Écarts déclarés — Formats des fabricants et relevé au capteur (cas 4, lot C4, étape 7a)

Capture du panneau livré (accord de Roch « Vas non stop », 27.11.2026) : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7a-fabricants.png`. Catalogue : D10-F14-038,
D10-F14-036, D10-F23a-012.

## Formats lus
- Lecteurs écrits pour Fadi, sans bibliothèque (`packages/sandbox-planche-model/src/formats-3d.ts`, XML par
  `xml-mini.ts`) : glTF 2.0 (`.glb` et `.gltf` aux tampons intégrés en base64), 3MF (archive lue par `zip.ts` et
  `inflate.ts`), COLLADA 1.4 / 1.5 (`.dae`), 3DS, PLY (texte, binaire petit et grand boutiste).
- Refusés avec leur motif, traduit : FBX (format propriétaire non publié), 3DM (bibliothèque OpenNURBS), USD et USDZ
  (bibliothèque OpenUSD). Leur lecture attend l'ajout d'une bibliothèque, prévu plus tard sur accord du maître
  d'ouvrage du 27 novembre 2026 (« prévoits l'ajout d'une bibliothèque plus tard »), dans une PR distincte.
- glTF : un `.gltf` qui renvoie à un `.bin` ou à des images externes est refusé (un seul fichier est choisi) ;
  compressions Draco, meshopt et positions quantifiées refusées ; accesseurs clairsemés refusés.
- COLLADA à axe X vertical refusé ; transformations `lookat` et `skew` ignorées et signalées.
- 3DS : sommets lus dans le repère du fichier (la matrice locale des objets n'est pas réappliquée, comme la plupart des
  lecteurs) ; aucune unité portée, à déclarer.
- Lecture vérifiée localement sur des fichiers écrits par trimesh 5.2.2 (GLB, glTF, 3MF, DAE, PLY : objets, triangles et
  dimensions attendus) ; ce contrôle ne tourne pas en CI. En CI, les tests unitaires construisent chaque format octet par
  octet.

## Ce qui n'est pas lu (signalé à la lecture)
- Textures, normales, coordonnées de texture, couleurs par sommet, animations, caméras, lumières, maillages animés.
- Les matières gardent leur nom et leur couleur de base seulement (glTF : `baseColorFactor` converti du linéaire au sRGB ;
  COLLADA : couleur diffuse ; 3MF : `displaycolor` des matières de base ; 3DS : couleur diffuse). 3MF : seule la matière
  de l'objet est gardée, pas celle de chaque triangle. Une matière de même nom et de même couleur déjà présente est
  reprise, pas dupliquée.
- Les messages de lecture d'un fichier mal formé viennent du modèle, en français, comme pour OBJ, STL et IFC.

## Unité, axe, hiérarchie
- Unité et axe vertical : lus quand le fichier les porte (glTF : mètre, Y ; COLLADA : `unit` et `up_axis` ; 3MF :
  `unit`, Z), sinon à déclarer dans le panneau (PLY, 3DS). Les dimensions de la boîte englobante sont affichées avant
  la pose pour vérifier l'unité et l'axe choisis.
- La hiérarchie est aplatie : un groupe par maillage posé (nom du nœud). Un maillage posé plusieurs fois par des poses
  rigides (rotation et translation) devient un composant, une définition et une occurrence par pose ; une pose avec
  échelle ou symétrie devient un groupe à part. Les nœuds vides ne créent pas de groupe.
- La construction se fait hors du fil principal (travailleur d'import existant de la Planche), bornée par le débit
  mesuré sur l'appareil ; la pose est un seul pas, annulable.

## Relevé au capteur
- Un relevé fait à la tablette ou au téléphone (PLY, GLB, glTF, 3MF, COLLADA, 3DS exportés par l'application de relevé)
  est posé en référence verrouillée (étape 3) : il reste à part du dessin, sans plafond de triangles du dessin, pour le
  contrôle de récolement. La fiche garde l'axe vertical choisi (Y) pour la relecture à l'ouverture.
- Aucune vérification automatique d'échelle : la personne contrôle une dimension connue (dimensions affichées) avant de
  redessiner. Les formats propriétaires des applications de relevé (USDZ notamment) restent refusés jusqu'à l'ajout
  d'une bibliothèque.

## Données
- Le fichier reçu est archivé tel quel en base (`sandbox_references_fichiers`, formats `gltf`, `glb`, `ply`, `3mf`, `dae`,
  `3ds`, signature contrôlée par l'API) avant toute pose, en objets comme en référence (D-GD-29).

## Raccourcis
En deux temps après Ctrl+Maj+Espace : N (formats des fabricants), Maj+N (importer en objets), U (relevé au capteur),
Maj+U (poser en référence).
