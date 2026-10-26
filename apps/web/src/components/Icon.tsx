/**
 * Icônes de l'enveloppe (barre latérale, accueil) : traits simples, 24 × 24,
 * dessinés ici plutôt qu'empruntés à une bibliothèque — même épaisseur de
 * trait partout, couleur héritée du texte (`currentColor`).
 */
export type IconName =
  | "home"
  | "organization"
  | "map"
  | "review"
  | "folder"
  | "route"
  | "atelier"
  | "file"
  | "book"
  | "sparkle"
  | "gear"
  | "upload"
  | "plus"
  | "cube"
  | "arrow-right"
  | "chevron-right"
  | "chevron-down"
  | "check"
  | "site"
  | "programme"
  | "design"
  | "proof"
  | "scale"
  | "flag"
  | "stairs"
  | "drop"
  | "search"
  | "people"
  | "admin"
  | "studio"
  | "studio-pointer"
  | "studio-line"
  | "studio-rectangle"
  | "studio-dimension"
  | "studio-move"
  | "studio-edit"
  | "studio-delete"
  | "studio-layer-add"
  | "studio-layer-edit"
  | "studio-layer-assign"
  | "studio-undo"
  | "studio-redo"
  | "studio-cancel"
  | "studio-save"
  | "studio-frame"
  | "studio-fullscreen"
  | "studio-select-all"
  | "studio-zoom-in"
  | "studio-zoom-out"
  | "studio-snap-vertex"
  | "studio-snap-grid"
  | "studio-snap-midpoint"
  | "studio-snap-center"
  | "studio-snap-quadrant"
  | "studio-snap-intersection"
  | "studio-snap-perpendicular"
  | "studio-snap-tangent"
  | "studio-snap-parallel"
  | "studio-snap-nearest"
  | "studio-track-ortho"
  | "studio-track-polar"
  | "studio-track-polar-step"
  | "studio-import-dxf"
  | "studio-export-svg"
  | "studio-export-dxf"
  | "studio-export-obj"
  | "studio-export-stl"
  | "studio-export-step"
  | "studio-export-ifc"
  | "studio-catalog"
  | "studio-palette"
  | "studio-extrude"
  | "studio-flatten"
  | "studio-view-3d"
  | "studio-sheet"
  | "studio-print"
  | "studio-sheet-svg"
  | "studio-sheet-pdf"
  | "studio-circle"
  | "studio-arc"
  | "studio-polyline"
  | "studio-offset"
  | "studio-polyline-finish"
  | "studio-polyline-close"
  | "studio-solid-box"
  | "studio-solid-prism"
  | "studio-solid-move"
  | "studio-solid-delete"
  | "studio-solid-push-pull"
  | "studio-solid-split-face"
  | "studio-solid-rotate"
  | "studio-solid-link"
  | "studio-solid-boolean"
  | "studio-nav-plan"
  | "studio-section-plane"
  | "studio-copy"
  | "studio-rotate"
  | "studio-mirror"
  | "studio-scale"
  | "studio-angular-dimension"
  | "studio-text"
  | "studio-wall"
  | "studio-opening"
  | "studio-architecture-edit"
  | "studio-architecture-delete"
  | "studio-property-set"
  | "console"
  | "studio-property-remove"
  | "studio-requirements"
  | "studio-scene-add"
  | "studio-scene-update"
  | "studio-scene-recall"
  | "studio-scene-delete"
  | "studio-appearance"
  | "studio-appearance-remove"
  | "studio-export-png"
  | "studio-dossier"
  | "studio-exchanges"
  | "studio-import-ifc"
  | "studio-external-models"
  | "studio-illustration"
  | "studio-agents"
  | "studio-non-native-keep"
  | "studio-non-native-remove"
  | "studio-graphic-add"
  | "studio-graphic-remove"
  | "studio-project-frame"
  | "studio-source-declare"
  | "studio-comments";

const PATHS: Record<IconName, string> = {
  search: "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2",
  // Administration : silhouette et bouclier (tracé inspiré de Tabler « user-shield », MIT) ; distincte de « people » (Collaboration).
  admin: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M6 21v-2a4 4 0 0 1 4-4h2m10 1c0 4-2.5 6-3.5 6S15 20 15 16c1 0 2.5-.5 3.5-1.5 1 1 2.5 1.5 3.5 1.5Z",
  home: "M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5h4v5",
  // Organisation (espace d'organisation, phase 5) : deux immeubles côte à côte, fenêtres en rangées.
  // Carte pliée en trois volets et repère : entrée GeoData de la barre latérale.
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14",
  organization: "M3 21h18M5 21V5h8v16M13 9h6v12M8 8h2M8 11h2M8 14h2M16 12h1M16 15h1M8 18h2",
  // Revue externe (phase 4) : feuille et loupe.
  review: "M6 3h8l4 4v6M6 3v18h7M14 3v4h4M15.5 19.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 18l3 3",
  folder: "M3 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7Z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h6.5a3.5 3.5 0 0 0 0-7H10a3 3 0 0 1 0-6h5",
  atelier: "M12 3 3 20h18L12 3Zm0 6v7m-3 1h6",
  file: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6M9 17h6",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H12v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Zm16 0A2.5 2.5 0 0 0 17.5 3H12v15h5.5a2.5 2.5 0 0 1 2.5 2.5V5.5Z",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M12 7c0 3 2 5 5 5-3 0-5 2-5 5 0-3-2-5-5-5 3 0 5-2 5-5Z",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.2-1.4-.2-1.4-2-.6-.8-1.9 1-1.8-2-2-1.8 1-1.9-.8-.6-2h-2.6l-.6 2-1.9.8-1.8-1-2 2 1 1.8-.8 1.9-2 .6-.2 1.4.2 1.4 2 .6.8 1.9-1 1.8 2 2 1.8-1 1.9.8.6 2h2.6l.6-2 1.9-.8 1.8 1 2-2-1-1.8.8-1.9 2-.6Z",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  plus: "M12 5v14M5 12h14",
  cube: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 18V12M4 7.5 12 12l8-4.5",
  "arrow-right": "M4 12h16m-6-6 6 6-6 6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  site: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  programme: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  design: "m4 20 4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16l-1 4Zm10.5-13.5 3 3",
  proof: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 4h8v3H8V7Zm0 6h2m3 0h2m-5 4h2m3 0h2",
  scale: "M12 3v18M4 7h16M6 7l-3 7a3 3 0 0 0 6 0L6 7Zm12 0-3 7a3 3 0 0 0 6 0l-3-7Z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  stairs: "M4 20h4v-4h4v-4h4V8h4M4 20V8",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z",
  studio: "M3 6h11v11H3V6Zm7 4h11v11H10V10Z",
  // Console de Studio : fenêtre de terminal (invite de commande et curseur).
  console: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 4 3 3-3 3m5 0h4",
  // Planche 2D de Studio : une icône propre par outil et par commande (règle d'or, D-202).
  "studio-pointer": "M5 3 19 12 12 13 9 20Z",
  "studio-line": "M5 19 19 5M3 17h4v4H3ZM17 3h4v4h-4Z",
  "studio-rectangle": "M4 6h16v12H4ZM2 4h4v4H2ZM18 16h4v4h-4Z",
  "studio-dimension": "M4 7v10M20 7v10M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3",
  "studio-move": "M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3",
  "studio-edit": "M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4",
  "studio-delete": "M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  "studio-layer-add": "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 4-2M18 15v6M15 18h6",
  "studio-layer-edit": "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 2-1M15 21l1-3 4-4 2 2-4 4-3 1Z",
  "studio-layer-assign": "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M12 22v-6M9 19l3 3 3-3",
  "studio-undo": "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3",
  "studio-redo": "M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h3",
  "studio-cancel": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 8l8 8M16 8l-8 8",
  "studio-save": "M5 4h11l3 3v13H5V4ZM8 4v5h7V4M8 20v-6h8v6",
  "studio-frame": "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9Z",
  "studio-fullscreen": "M3 8V3h5M3 3l6 6M21 8V3h-5M21 3l-6 6M3 16v5h5M3 21l6-6M21 16v5h-5M21 21l-6-6",
  "studio-select-all": "M3 3h4M10 3h4M17 3h4v4M21 10v4M21 17v4h-4M14 21h-4M7 21H3v-4M3 14v-4M3 7V3M8 8h8v8H8Z",
  "studio-zoom-in": "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5M10.5 7.5v6M7.5 10.5h6",
  "studio-zoom-out": "M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5M7.5 10.5h6",
  "studio-snap-vertex": "M4 20 12 6l8 14M9 3h6v6H9ZM12 9v2",
  "studio-snap-grid": "M3 3h18v18H3ZM9 3v18M15 3v18M3 9h18M3 15h18M13 13h4v4h-4Z",
  // Modes d'accrochage : le repère affiché sur la planche (triangle du milieu, rond du centre, losange du quadrant,
  // croix de l'intersection, équerre de la perpendiculaire, cercle et droite tangente, sablier du plus proche).
  "studio-snap-midpoint": "M3 19h18M12 9l4 7H8ZM3 17v4M21 17v4",
  "studio-snap-center": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM10 12h4M12 10v4",
  "studio-snap-quadrant": "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM20 9l3 3-3 3-3-3Z",
  "studio-snap-intersection": "M3 3l18 18M21 3 3 21M9 9h6v6H9Z",
  "studio-snap-perpendicular": "M3 20h18M12 20V4M12 15h5v5",
  "studio-snap-tangent": "M10 8a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM2 8h20M10 6v4",
  "studio-snap-parallel": "M4 18 14 6M10 18 20 6",
  "studio-snap-nearest": "M4 20 20 6M9 9h6l-6 6h6Z",
  // Repérage : équerre orthogonale ; rayons polaires depuis un point ; pas polaire (rayons et flèche de rotation).
  "studio-track-ortho": "M5 19h15M5 19V4M5 19l-2-2M9 15h2v2",
  "studio-track-polar": "M4 20h16M4 20 18 6M4 20l8-14M4 20A9 9 0 0 1 13 11",
  "studio-track-polar-step": "M4 20h16M4 20 16 8M8 20a4 4 0 0 0-1.2-2.8M14 20a10 10 0 0 0-3-7M18 3l2 3-3 1",
  // Fichier entré par la gauche (flèche vers le fichier) : import DXF dans le brouillon.
  "studio-import-dxf": "M9 3h7l4 4v14H9v-5M16 3v4h4M9 3v5M2 12h9M8 9l3 3-3 3M13 10h4M14 13h3M13 16h4",
  "studio-export-svg": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 11c2-3 6 3 8 0M17 15v6M14 18l3 3 3-3",
  "studio-export-dxf": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 9h6M8 12h3M11 9v6M17 15v6M14 18l3 3 3-3",
  // Fichier, petit volume (cube en perspective) et flèche de téléchargement : export IFC (modèle 3D).
  "studio-export-ifc": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 10l3-2 3 2v4l-3 2-3-2ZM8 10l3 2 3-2M11 12v4M17 15v6M14 18l3 3 3-3",
  // Exports 3D (E.6-04) : fichier et flèche de téléchargement, avec un maillage triangulé (OBJ), un triangle à facettes
  // (STL), un solide à arête arrondie (STEP, solide exact).
  "studio-export-obj": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 9h6v6H8ZM8 15l6-6M8 9l3 6M17 15v6M14 18l3 3 3-3",
  "studio-export-stl": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M7 16l4-8 4 8ZM11 8v8M9 12h4M17 15v6M14 18l3 3 3-3",
  "studio-export-step": "M6 3h8l4 4v6M14 3v4h4M6 3v18h6M8 9h4a2 2 0 0 1 2 2v4H8ZM12 9v2h2M17 15v6M14 18l3 3 3-3",
  "studio-catalog": "M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 16.5h7M16.5 13v7",
  "studio-palette": "M3 5h18v14H3ZM3 9h18M6 13l3 2-3 2M11 17h5",
  "studio-extrude": "M4 20h11l5-4H9l-5 4ZM9 16V6M12 3 9 6 6 3M15 20V10M20 16V6",
  "studio-flatten": "M4 18h11l5-3H9l-5 3ZM12 4v8M9 9l3 3 3-3",
  "studio-view-3d": "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9",
  // Feuille de présentation : cadre de la feuille, dessin et cartouche en bas à droite.
  "studio-sheet": "M3 5h18v14H3ZM5 7h14v6H5ZM12 15h7v4M12 17h7M7 11l3-2 3 2",
  "studio-print": "M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7ZM17 12h1",
  "studio-sheet-svg": "M3 4h14v10H3ZM9 11h8M9 11v3M6 9c2-3 4 2 6-1M19 14v7M16 18l3 3 3-3",
  "studio-sheet-pdf": "M3 4h14v10H3ZM9 11h8M9 11v3M6 7h3v3H6M19 14v7M16 18l3 3 3-3",
  // Courbes : cercle et son centre ; arc entre deux poignées ; polyligne brisée à poignées ; décalage (deux tracés parallèles).
  "studio-circle": "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM11 12h2",
  "studio-arc": "M5 19A14 14 0 0 1 19 5M3 17h4v4H3ZM17 3h4v4h-4Z",
  "studio-polyline": "M4 18 9 8l6 8 5-10M2 16h4v4H2ZM18 4h4v4h-4Z",
  "studio-offset": "M3 15c4-8 10-8 14-2M7 20c3-5 8-5 11-1M17 8l2 3-3 1",
  // Fin de polyligne : tracé ouvert et marque de validation ; fermeture : tracé refermé sur son premier sommet.
  "studio-polyline-finish": "M3 17 8 9l5 6M14 15l3 3 5-6",
  "studio-polyline-close": "M4 18 8 6l8 3 4 9ZM2 16h4v4H2Z",
  // Volume libre (vue 3D) : boîte posée sur la grille ; prisme d'un profil en L ; solide et flèche de translation ;
  // solide barré ; vue de dessus (œil au-dessus d'un plan) ; plan de coupe horizontal traversant un volume.
  "studio-solid-box": "M4 9l6-4 10 2v9l-6 4-10-2ZM4 9l10 2 6-4M14 11v9M2 22h20",
  "studio-solid-prism": "M4 8h7v4h5v8H4ZM4 8l3-3h7l-3 3M11 12l3-3h5l-3 3M16 20l3-3V9",
  "studio-solid-move": "M3 10l5-3 6 2v7l-5 3-6-2ZM3 10l6 2 5-3M9 12v7M16 6h6M19 3l3 3-3 3",
  "studio-solid-delete": "M3 9l6-3 8 2v8l-6 3-8-2ZM3 9l8 2 6-3M11 11v8M16 16l6 6M22 16l-6 6",
  // Lot F1 : face supérieure poussée (flèche verticale au-dessus d'un bloc) ; face partagée par un trait médian ;
  // bloc et flèche circulaire autour d'un axe vertical ; maillons de chaîne (lien au profil source).
  "studio-solid-push-pull": "M4 14l8-3 8 3-8 3ZM4 14v5l8 3 8-3v-5M12 2v7M9 5l3-3 3 3",
  "studio-solid-split-face": "M3 7h18v12H3ZM12 7v12M8 4h8M3 7l3-3h12l3 3",
  "studio-solid-rotate": "M7 9h10v10H7ZM12 2v5M5 5a9 4 0 0 1 14 0M19 5l-1 3",
  "studio-solid-link": "M9 15l6-6M7 11l-2 2a3 3 0 0 0 4 4l2-2M17 13l2-2a3 3 0 0 0-4-4l-2 2",
  // Lot F2 : deux blocs qui se recouvrent, la partie commune marquée (booléen exact : union, différence, intersection).
  "studio-solid-boolean": "M3 7h10v10H3ZM11 11h10v10H11ZM11 11h2v6h-2M15 3v4M13 5h4",
  "studio-nav-plan": "M3 17l9 4 9-4-9-4ZM12 3v7M9 7l3 3 3-3M7 3h10",
  "studio-section-plane": "M8 3h8v18H8ZM2 13l4-3h16l-4 3ZM2 13h16",
  // Transformations : deux carrés décalés (copier), flèche circulaire (rotation), axe et deux triangles opposés
  // (symétrie), petit carré et flèche diagonale vers un coin agrandi (échelle).
  "studio-copy": "M9 9h11v11H9ZM5 15H4V4h11v1",
  "studio-rotate": "M20 12a8 8 0 1 1-2.34-5.66M20 3v4h-4",
  "studio-mirror": "M12 2v3M12 9v6M12 19v3M9 6 3 18h6ZM15 6l6 12h-6Z",
  "studio-scale": "M3 21h7v-7H3ZM10 14l10-10M14 4h6v6",
  // Annotations : cote angulaire (deux rayons depuis un sommet, arc de cote fléché) ; texte (lettre T et ligne de base).
  "studio-angular-dimension": "M4 20h16M4 20 15 6M11 20a7 7 0 0 0-2.3-5.2M7.5 13.5l1.2 1.3-1.6.6",
  "studio-text": "M5 5h14M12 5v13M9 18h6M4 21h16",
  // Architecture (A.4) : mur en plan (deux faces et hachure) ; mur interrompu par une baie (deux montants) ; mur et
  // crayon ; mur barré avec sa baie (suppression en cascade).
  "studio-wall": "M3 8h18v8H3ZM7 8l-4 4M12 8l-8 8M17 8l-8 8M21 9l-7 7M21 13l-3 3",
  "studio-opening": "M2 8h7v8H2ZM15 8h7v8h-7ZM9 6v12M15 6v12M10.5 12h3",
  "studio-architecture-edit": "M2 13h11v6H2ZM6 13l-4 4M10 13l-6 6M14 14l7-7 2 2-7 7h-2Z",
  "studio-architecture-delete": "M2 9h6v6H2ZM12 9h6v6h-6ZM8 7v10M12 7v10M15 3l6 6M21 3l-6 6",
  // Propriétés et exigences (E.1) : étiquette et signe plus ; étiquette barrée ; liste cochée et balance (écart).
  "studio-property-set": "M3 4h9l8 8-8 8-9-9ZM7 8h.01M17 3v6M14 6h6",
  "studio-property-remove": "M3 4h9l8 8-8 8-9-9ZM7 8h.01M15 3l6 6M21 3l-6 6",
  "studio-requirements": "M4 5h9M4 10h9M4 15h5M15 4l1.5 1.5L19 3M12 20h9M16.5 13v7M13 16l3.5-3 3.5 3",
  // Visualisation (lot E.5) : caméra et plus (nouvelle scène) ; caméra et flèche circulaire (mettre à jour) ; caméra et
  // flèche de retour (rappeler) ; caméra barrée (supprimer) ; pot de peinture qui coule (apparence) ; nuancier barré
  // (retirer l'apparence) ; image et flèche de téléchargement (rendu PNG).
  "studio-scene-add": "M3 9h10v8H3ZM13 12l5-3v8l-5-3M19 2v5M16.5 4.5h5",
  "studio-scene-update": "M3 10h10v8H3ZM13 13l5-3v8l-5-3M15 6a3 3 0 1 1 3 3M15 3v3h3",
  "studio-scene-recall": "M8 9h10v8H8ZM18 12l4-3v8l-4-3M2 13h4M4 11l-2 2 2 2",
  "studio-scene-delete": "M3 9h10v8H3ZM13 12l5-3v8l-5-3M16 2l5 5M21 2l-5 5",
  "studio-appearance": "M5 11l6-6 7 7-6 6ZM5 11h13M20 15c0 2 1 3 1 4a1 1 0 0 1-2 0c0-1 1-2 1-4",
  "studio-appearance-remove": "M4 4h10v10H4ZM9 9h11v11H9ZM3 21 21 3",
  "studio-export-png": "M3 5h12v10H3ZM3 13l4-4 3 3 2-2 3 3M19 9v10M16 16l3 3 3-3",
  // Feuilles et dossier de conception (E.3) : chemise à onglet contenant une feuille lignée.
  "studio-dossier": "M3 6h6l2 2h10v12H3ZM7 11h10v6H7ZM9 13h6M9 15h4",
  // Matrice d'échanges (E.6) : grille de trois colonnes traversée par deux flèches opposées (import / export).
  "studio-exchanges": "M3 4h18v16H3ZM9 4v16M15 4v16M5 9h14M17 7l2 2-2 2M5 15h14M7 13l-2 2 2 2",
  // Import IFC (lot F3) : fichier, petit volume et flèche entrant par la gauche (le pendant de l’export IFC).
  "studio-import-ifc": "M9 3h7l4 4v14H9v-4M16 3v4h4M12 10l3-2 3 2v4l-3 2-3-2ZM12 10l3 2 3-2M15 12v4M2 13h7M6 10l3 3-3 3",
  // Modèles externes (lot F3) : deux maquettes côte à côte reliées par une coche de validation.
  "studio-external-models": "M3 8l4-2 4 2v5l-4 2-4-2ZM3 8l4 2 4-2M7 10v5M13 8l4-2 4 2v5l-4 2-4-2ZM13 8l4 2 4-2M17 10v5M9 19l2 2 4-4",
  // Illustration depuis la vue (lot F) : cadre de rendu et pinceau posé en diagonale (image séparée, jamais le modèle).
  "studio-illustration": "M3 4h13v11H3ZM3 12l3-3 3 3 2-2 3 3M14 21l7-7-2-2-7 7v2ZM17 14l2 2",
  // Agents (MCP, lot F) : tête de robot à antenne et coche de confirmation (rien n'est écrit sans la personne).
  "studio-agents": "M5 8h12v9H5ZM11 8V5M9.5 4h3M8 12h1M13 12h1M9 15h4M3 11v3M19 11v3M15 20l2 2 4-4",
  // Élément non natif conservé : boîte en pointillés tenue par une pince (gardée telle quelle).
  "studio-non-native-keep": "M4 8h3M10 8h4M17 8h3v3M20 14v3h-3M14 17h-4M7 17H4v-3M4 11V8M9 3h6v5H9ZM12 11v3",
  // Retirer les éléments non natifs : boîte en pointillés barrée d’une croix.
  "studio-non-native-remove": "M4 6h3M10 6h4M17 6h3v3M20 12v3h-3M14 15h-4M7 15H4v-3M4 9V6M9 18l4 4M13 18l-4 4M15 19h6",
  // Créer un graphisme (EX-055) : spline au-dessus d'un carré hachuré, signe plus.
  "studio-graphic-add": "M3 8c3-6 6-6 9 0s5 4 6 2M3 13h9v8H3ZM3 17l4-4M5 21l7-7M8 21l4-4M18 14v6M15 17h6",
  // Retirer les graphismes : carré hachuré et spline, croix.
  "studio-graphic-remove": "M3 7c3-5 6-5 9 0M3 11h9v9H3ZM3 15l4-4M5 20l7-7M15 14l6 6M21 14l-6 6",
  // Système de projet (EX-023) : axes du document et axes du projet tournés, origine déportée.
  // Déclarer une source importée (EX-014) : feuille de fichier avec empreinte (dièse) et flèche d'entrée.
  "studio-source-declare": "M6 2h8l4 4v6M14 2v4h4M6 2v20h7M9 10h2M8 13h4M10 9l-1 5M12 9l-1 5M15 19h7M19 16l3 3-3 3",
  "studio-project-frame": "M3 21V9M3 21h12M3 9l-1.5 2M3 9l1.5 2M15 21l-2-1.5M15 21l-2 1.5M12 12l8-6M12 12l5 7M20 6l-2.5.3M20 6l-.8 2.3M9 15l3-3",
  // Bascule du panneau des commentaires (barre de l’espace ; ni outil ni commande).
  "studio-comments": "M20.5 11.5c0 4.1-3.8 7.5-8.5 7.5-1.2 0-2.3-.2-3.3-.6L4 20l1.3-3.6C4.2 15 3.5 13.3 3.5 11.5 3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.5ZM8 10h8M8 13.5h5",
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
