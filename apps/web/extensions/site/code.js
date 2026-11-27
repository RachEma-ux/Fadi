// Extension « Site et terrain » (catalogue des extensions de la Planche, cas 1 de la feuille de route, extension n° 7 ;
// maquette validée le 27 novembre 2026). Cinq onglets, un par entrée du catalogue :
//   Terrain depuis des points (n° 8, N-D6-1) · Courbes de niveau (n° 26, S-D6-1) · Unité foncière (n° 23, D6-F8-107) ·
//   Pleine terre et biotope (n° 12, D6-F20b-016) · Volumes du contexte (n° 25, D6-F8-062).
//
// Rien n'est fourni par défaut : les points et les courbes viennent des fichiers de l'utilisateur, les contenances
// cadastrales et les coefficients de biotope sont saisis avec leur référence, les hauteurs du contexte viennent d'un
// attribut déclaré ou d'une valeur saisie. Une valeur absente est « non évaluée ». La surface mesurée dans le dessin et
// la contenance cadastrale sont toujours affichées à part, jamais confondues.

var VERSION = "1.0.0";
var PANNEAU = "site";
var ONGLETS = ["terrain", "courbes", "unite", "biotope", "volumes"];
var MAX_POINTS = 1000;
var MAX_CONTRAINTES = 200;
var MAX_SEGMENTS = 60000;
var SEGMENTS_PAR_APPEL = 20000;
var MAX_PARCELLES = 30;
var MAX_REVETEMENTS = 9;
var MAX_EMPRISES = 60;
var MAX_LIGNES_IGNOREES = 50;
var LIGNES_PAR_PAGE = 80;
var EPS = 1e-9;

var onglet = "terrain";
var page = 0;
var langue = "fr";
var choisie = null;
var valeurs = { recaler: "oui", calque: "", source: "attribut", etage: "", hauteur: "" };
// Fichiers chargés : gardés le temps de la session, jamais dans le dessin (trop gros pour ses données).
var releve = null;
var dxf = null;

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    onglets: { terrain: "Terrain depuis des points", courbes: "Courbes de niveau", unite: "Unité foncière", biotope: "Pleine terre et biotope", volumes: "Volumes du contexte" },
    champs: { recaler: "Recaler à l'origine", calque: "Calque", source: "Hauteur lue dans", etage: "Hauteur d'étage (m)", hauteur: "Hauteur unique (m)" },
    oui: "oui", non: "non",
    tousCalques: "tous les calques",
    sources: { attribut: "l'attribut déclaré", niveaux: "le nombre de niveaux", unique: "une hauteur unique" },
    col: {
      terrain: ["Ligne", "Motif"],
      courbes: ["Calque", "Polylignes", "Altitudes"],
      unite: ["Parcelle", "Surface mesurée", "Contenance", "Écart"],
      biotope: ["Revêtement", "Surface", "Coefficient", "Pondérée"],
      volumes: ["Emprise", "Aire", "Source", "Hauteur"],
    },
    note: {
      terrain: "Fichier texte ou CSV : sections « # points » (x y z, ou n° x y z), « # ruptures » et « # contour » (numéros de points). Séparateur point-virgule, tabulation ou espace.",
      courbes: "DXF de courbes (export GeoData ou autre) : chaque polyligne est posée à sa cote, dans un groupe. Le repère et la référence verticale du fichier sont rappelés, jamais convertis.",
      unite: "Sélectionnez la face d'une parcelle, déclarez-la avec sa référence et sa contenance cadastrale, puis réunissez les parcelles en une unité foncière.",
      biotope: "Peignez chaque surface horizontale d'une matière (pleine terre, dalle végétalisée, bâti…), puis saisissez les coefficients du règlement local.",
      volumes: "Sélectionnez les emprises (faces horizontales) : chacune est extrudée à sa propre hauteur, dans un groupe. Une emprise sans hauteur est signalée, jamais extrudée.",
    },
    encart: {
      terrain: "Les altitudes sont celles du fichier, sans conversion ; un recalage à l'origine est noté avec son décalage.",
      courbes: "Les courbes gardent leurs altitudes ; un recalage à l'origine est noté avec son décalage.",
      unite: "La surface mesurée vient du dessin, la contenance de l'acte ou du cadastre : les deux restent séparées.",
      biotope: "Les coefficients sont saisis depuis le règlement local, avec la référence de l'article ; rien n'est fourni par défaut.",
      volumes: "La hauteur vient d'un attribut déclaré ou d'une valeur saisie ; aucune hauteur n'est supposée.",
    },
    vide: {
      terrain: "Aucun relevé chargé : « Charger le relevé ».",
      courbes: "Aucun DXF chargé : « Charger le DXF ».",
      unite: "Aucune parcelle déclarée : sélectionnez sa face, puis « Déclarer la parcelle ».",
      biotope: "Aucune surface horizontale peinte d'une matière dans ce contexte.",
      volumes: "Sélectionnez une ou plusieurs emprises (faces horizontales).",
    },
    res: {
      fichier: "Fichier", points: "Points", ruptures: "Lignes de rupture", contour: "Contour", altitudes: "Altitudes", decalage: "Décalage appliqué",
      triangles: "Triangles", respectees: "Lignes de rupture respectées", airePlan: "Aire en plan", sansFace: "Triangles restés sans face",
      polylignes: "Polylignes", segments: "Segments", repere: "Repère horizontal", referenceVerticale: "Référence verticale", source: "Source", equidistance: "Équidistance",
      unite: "Unité foncière", mesuree: "Surface mesurée cumulée", contenance: "Contenance cadastrale cumulée",
      pleineTerre: "Pleine terre", biotope: "Coefficient de biotope", seuil: function (a) { return a ? "Seuil saisi (" + a + ")" : "Seuil saisi"; },
      emprises: "Emprises", extrudables: "Extrudables", sansHauteur: "Non extrudables",
    },
    oui1: "oui", aucun: "aucun", nonEvalue: "non évalué", nonEvaluee: "non évaluée",
    marge: function (v) { return "marge " + v; }, manque: function (v) { return "manque " + v; },
    total: "Total",
    effacee: "face effacée",
    lu: { fermee: "fermée" },
    motifs: {
      illisible: "ligne illisible", doublon: "numéro de point déjà lu", confondu: "point confondu en plan avec un autre", inconnu: function (n) { return "point « " + n + " » inconnu"; },
      court: "moins de deux points", tropDeRuptures: function (n) { return "au-delà de " + n + " lignes de rupture : non prise en compte"; }, contourCourt: "contour de moins de trois points", contourDouble: "un seul contour est lu",
    },
    trop: function (n) { return "Plus de " + n + " points : réduisez le semis (le tracé resterait trop lourd)."; },
    pasAssez: "Moins de trois points lus : rien à trianguler.",
    releveCharge: function (n) { return "Relevé chargé : " + n + " points."; },
    releveRefuse: "Relevé refusé : ",
    alignes: "Les points sont alignés : aucun triangle.",
    terrainTrace: function (t) { return "Terrain tracé : " + t + " triangles."; },
    nomTerrain: "Terrain naturel",
    sansReleve: "Chargez d'abord un relevé.",
    dxfCharge: function (n) { return "DXF chargé : " + n + " polylignes."; },
    dxfRefuse: "DXF refusé : ",
    dxfVide: "aucune ligne ni polyligne dans la section ENTITIES",
    dxfIllisible: "le fichier n'est pas un DXF texte (ASCII) lisible",
    sansDxf: "Chargez d'abord un DXF.",
    tropSegments: function (n) { return "Plus de " + n + " segments : choisissez un seul calque."; },
    courbesPosees: function (n) { return "Courbes posées : " + n + " polylignes."; },
    nomCourbes: function (c) { return "Courbes de niveau — " + c; },
    ignores: function (l) { return "Ignorés : " + l + "."; },
    arrondis: "arrondis de polyligne lus comme des segments droits",
    choisirFace: "Sélectionnez une seule face horizontale.",
    pasHorizontale: "La face choisie n'est pas horizontale.",
    declarerParcelle: "Déclarer la parcelle",
    champRef: "Référence cadastrale",
    champContenance: "Contenance cadastrale (m², vide = inconnue)",
    contenanceInvalide: "La contenance doit être un nombre positif, en m², ou vide.",
    refVide: "La référence cadastrale est attendue.",
    tropParcelles: "Trente parcelles au plus.",
    parcelleDeclaree: function (r) { return "Parcelle « " + r + " » déclarée."; },
    dejaDeclaree: "Cette face est déjà une parcelle déclarée : sa référence et sa contenance sont mises à jour.",
    reunir: "Réunir en unité foncière",
    champNomUnite: "Nom de l'unité foncière",
    nomUniteDefaut: function (refs) { return "Parcelles " + refs.join(", ") + " réunies"; },
    unePlusieurs: "Déclarez au moins deux parcelles pour les réunir.",
    reunies: function (n) { return n + " parcelles réunies."; },
    retiree: "Parcelle retirée.",
    coefficients: "Coefficients de biotope",
    champCoef: function (n) { return "Coefficient — " + n; },
    champPleine: "Matière de pleine terre",
    champArticle: "Référence de l'article",
    champSeuil: "Seuil (vide = aucun)",
    aucune: "aucune",
    tropRevetements: function (n) { return "Plus de " + n + " revêtements : regroupez les matières."; },
    coefInvalide: function (n) { return "Coefficient de « " + n + " » : nombre de 0 à 1, ou vide."; },
    seuilInvalide: "Le seuil doit être un nombre de 0 à 1, ou vide.",
    coefsSaisis: "Coefficients enregistrés.",
    declarerHauteur: "Déclarer la hauteur",
    champH: "Hauteur (m, vide = inconnue)",
    champNiveaux: "Nombre de niveaux (vide = inconnu)",
    hauteurInvalide: "Hauteur et niveaux : nombres positifs, ou vides.",
    hauteursDeclarees: function (n) { return n + (n > 1 ? " emprises déclarées." : " emprise déclarée."); },
    tropEmprises: function (n) { return "Plus de " + n + " emprises : sélectionnez-en moins."; },
    rienAExtruder: "Aucune emprise extrudable : déclarez l'attribut ou saisissez la hauteur (une emprise avec une ouverture n'est pas extrudée).",
    extrudes: function (n, k) { return n + (n > 1 ? " volumes posés" : " volume posé") + (k ? " ; " + k + " non extrudée" + (k > 1 ? "s" : "") : "") + "."; },
    nomVolume: function (h) { return "Volume — " + h + " m"; },
    emprise: function (i) { return "Emprise " + i; },
    srcAttribut: "attribut", srcNiveaux: function (n) { return n + " niveaux"; }, srcUnique: "saisie",
    attributAbsent: "non évaluée (attribut absent)",
    avecCour: "non extrudée (emprise avec une ouverture)",
    op: { terrain: "Tracer le terrain", courbes: "Poser les courbes de niveau", parcelle: "Déclarer une parcelle", unite: "Réunir les parcelles", retirer: "Retirer une parcelle", biotope: "Coefficients de biotope", hauteur: "Déclarer la hauteur des emprises", volumes: "Extruder le contexte" },
  },
  en: {
    onglets: { terrain: "Terrain from points", courbes: "Contour lines", unite: "Land unit", biotope: "Open ground and biotope", volumes: "Context volumes" },
    champs: { recaler: "Move to the origin", calque: "Layer", source: "Height read from", etage: "Storey height (m)", hauteur: "Single height (m)" },
    oui: "yes", non: "no",
    tousCalques: "all layers",
    sources: { attribut: "the declared attribute", niveaux: "the number of levels", unique: "a single height" },
    col: {
      terrain: ["Line", "Reason"],
      courbes: ["Layer", "Polylines", "Elevations"],
      unite: ["Parcel", "Measured area", "Legal area", "Difference"],
      biotope: ["Surface type", "Area", "Factor", "Weighted"],
      volumes: ["Footprint", "Area", "Source", "Height"],
    },
    note: {
      terrain: "Text or CSV file: sections « # points » (x y z, or no. x y z), « # ruptures » and « # contour » (point numbers). Semicolon, tab or space separator.",
      courbes: "DXF of contour lines (GeoData export or other): each polyline is laid at its elevation, in a group. The file's coordinate system and vertical datum are recalled, never converted.",
      unite: "Select a parcel's face, declare it with its cadastral reference and legal area, then join the parcels into a land unit.",
      biotope: "Paint each horizontal surface with a material (open ground, green roof slab, built…), then type the factors of the local regulation.",
      volumes: "Select the footprints (horizontal faces): each one is extruded to its own height, in a group. A footprint without a height is reported, never extruded.",
    },
    encart: {
      terrain: "Elevations are those of the file, unconverted; moving to the origin is noted with its offset.",
      courbes: "Contour lines keep their elevations; moving to the origin is noted with its offset.",
      unite: "The measured area comes from the drawing, the legal area from the deed or the cadastre: the two stay separate.",
      biotope: "The factors are typed from the local regulation, with the article reference; nothing is provided by default.",
      volumes: "The height comes from a declared attribute or a typed value; no height is assumed.",
    },
    vide: {
      terrain: "No survey loaded: « Load the survey ».",
      courbes: "No DXF loaded: « Load the DXF ».",
      unite: "No parcel declared: select its face, then « Declare the parcel ».",
      biotope: "No horizontal surface painted with a material in this context.",
      volumes: "Select one or more footprints (horizontal faces).",
    },
    res: {
      fichier: "File", points: "Points", ruptures: "Breaklines", contour: "Boundary", altitudes: "Elevations", decalage: "Offset applied",
      triangles: "Triangles", respectees: "Breaklines kept", airePlan: "Plan area", sansFace: "Triangles left without a face",
      polylignes: "Polylines", segments: "Segments", repere: "Horizontal coordinate system", referenceVerticale: "Vertical datum", source: "Source", equidistance: "Interval",
      unite: "Land unit", mesuree: "Total measured area", contenance: "Total legal area",
      pleineTerre: "Open ground", biotope: "Biotope factor", seuil: function (a) { return a ? "Threshold typed (" + a + ")" : "Threshold typed"; },
      emprises: "Footprints", extrudables: "Can be extruded", sansHauteur: "Cannot be extruded",
    },
    oui1: "yes", aucun: "none", nonEvalue: "not assessed", nonEvaluee: "not assessed",
    marge: function (v) { return "margin " + v; }, manque: function (v) { return "short by " + v; },
    total: "Total",
    effacee: "face erased",
    lu: { fermee: "closed" },
    motifs: {
      illisible: "unreadable line", doublon: "point number already read", confondu: "point at the same plan position as another", inconnu: function (n) { return "unknown point « " + n + " »"; },
      court: "fewer than two points", tropDeRuptures: function (n) { return "beyond " + n + " breaklines: not taken into account"; }, contourCourt: "boundary of fewer than three points", contourDouble: "only one boundary is read",
    },
    trop: function (n) { return "More than " + n + " points: thin out the survey (the drawing would stay too heavy)."; },
    pasAssez: "Fewer than three points read: nothing to triangulate.",
    releveCharge: function (n) { return "Survey loaded: " + n + " points."; },
    releveRefuse: "Survey refused: ",
    alignes: "The points are aligned: no triangle.",
    terrainTrace: function (t) { return "Terrain drawn: " + t + " triangles."; },
    nomTerrain: "Natural terrain",
    sansReleve: "Load a survey first.",
    dxfCharge: function (n) { return "DXF loaded: " + n + " polylines."; },
    dxfRefuse: "DXF refused: ",
    dxfVide: "no line or polyline in the ENTITIES section",
    dxfIllisible: "the file is not a readable text (ASCII) DXF",
    sansDxf: "Load a DXF first.",
    tropSegments: function (n) { return "More than " + n + " segments: choose a single layer."; },
    courbesPosees: function (n) { return "Contour lines laid: " + n + " polylines."; },
    nomCourbes: function (c) { return "Contour lines — " + c; },
    ignores: function (l) { return "Ignored: " + l + "."; },
    arrondis: "polyline arcs read as straight segments",
    choisirFace: "Select a single horizontal face.",
    pasHorizontale: "The chosen face is not horizontal.",
    declarerParcelle: "Declare the parcel",
    champRef: "Cadastral reference",
    champContenance: "Legal area (m², empty = unknown)",
    contenanceInvalide: "The legal area must be a positive number, in m², or empty.",
    refVide: "The cadastral reference is expected.",
    tropParcelles: "Thirty parcels at most.",
    parcelleDeclaree: function (r) { return "Parcel « " + r + " » declared."; },
    dejaDeclaree: "This face is already a declared parcel: its reference and legal area are updated.",
    reunir: "Join into a land unit",
    champNomUnite: "Name of the land unit",
    nomUniteDefaut: function (refs) { return "Parcels " + refs.join(", ") + " joined"; },
    unePlusieurs: "Declare at least two parcels to join them.",
    reunies: function (n) { return n + " parcels joined."; },
    retiree: "Parcel removed.",
    coefficients: "Biotope factors",
    champCoef: function (n) { return "Factor — " + n; },
    champPleine: "Open ground material",
    champArticle: "Article reference",
    champSeuil: "Threshold (empty = none)",
    aucune: "none",
    tropRevetements: function (n) { return "More than " + n + " surface types: group the materials."; },
    coefInvalide: function (n) { return "Factor of « " + n + " »: number from 0 to 1, or empty."; },
    seuilInvalide: "The threshold must be a number from 0 to 1, or empty.",
    coefsSaisis: "Factors saved.",
    declarerHauteur: "Declare the height",
    champH: "Height (m, empty = unknown)",
    champNiveaux: "Number of levels (empty = unknown)",
    hauteurInvalide: "Height and levels: positive numbers, or empty.",
    hauteursDeclarees: function (n) { return n + (n > 1 ? " footprints declared." : " footprint declared."); },
    tropEmprises: function (n) { return "More than " + n + " footprints: select fewer."; },
    rienAExtruder: "No footprint can be extruded: declare the attribute or type the height (a footprint with an opening is not extruded).",
    extrudes: function (n, k) { return n + (n > 1 ? " volumes laid" : " volume laid") + (k ? "; " + k + " not extruded" : "") + "."; },
    nomVolume: function (h) { return "Volume — " + h + " m"; },
    emprise: function (i) { return "Footprint " + i; },
    srcAttribut: "attribute", srcNiveaux: function (n) { return n + " levels"; }, srcUnique: "typed",
    attributAbsent: "not assessed (attribute missing)",
    avecCour: "not extruded (footprint with an opening)",
    op: { terrain: "Draw the terrain", courbes: "Lay the contour lines", parcelle: "Declare a parcel", unite: "Join the parcels", retirer: "Remove a parcel", biotope: "Biotope factors", hauteur: "Declare the footprints' height", volumes: "Extrude the context" },
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var alerte = function (m) { return planche.message.afficher(m, "alerte"); };
var info = function (m) { return planche.message.afficher(m); };
var texte = function (v) { return v === undefined || v === null ? "" : String(v); };
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(",", ".");
  return t === "" || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? NaN : Number(t);
};
// Arrondi au plus proche (le demi monte), sans l'écart binaire de toFixed ; milliers séparés par une espace fine.
var fixe = function (v, n, sep) {
  var f = Math.pow(10, n);
  var s = (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n);
  var p = s.split(".");
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return p.join(sep);
};
var aire = function (v, sep) { return fixe(v, 1, sep) + " m²"; };
var contenanceTexte = function (v, sep) { return fixe(v, v === Math.round(v) ? 0 : 2, sep) + " m²"; };

async function enUnPas(nom, fn) {
  await planche.operation.ouvrir(nom);
  try {
    var r = await fn();
    await planche.operation.valider();
    return r;
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
}

// ——————————————————————————————————————————————— Géométrie

var orient = function (a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };

/** Normale d'un contour (méthode de Newell), unitaire. */
function normaleDe(points) {
  var n = [0, 0, 0];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    var q = points[(i + 1) % points.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
}
var horizontale = function (f) { return Math.abs(normaleDe(f.points)[2]) > 1 - 1e-6; };

function dansPolygone(p, poly) {
  var dedans = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i];
    var b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) dedans = !dedans;
  }
  return dedans;
}

/**
 * Triangulation de Delaunay (Bowyer–Watson) d'un semis en plan. Rend des triangles [i, j, k] tournant dans le sens
 * direct. Les coordonnées sont ramenées autour de leur centre pour garder la précision.
 */
function delaunay(P) {
  var n = P.length;
  var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  P.forEach(function (p) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); });
  var cx = (minx + maxx) / 2;
  var cy = (miny + maxy) / 2;
  var d = Math.max(maxx - minx, maxy - miny) || 1;
  var Q = P.map(function (p) { return [p[0] - cx, p[1] - cy]; });
  Q.push([-30 * d, -30 * d], [30 * d, -30 * d], [0, 30 * d]);
  var cercle = function (a, b, c) {
    var A = Q[a], B = Q[b], C = Q[c];
    var D = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
    var a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    var ux = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / D;
    var uy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / D;
    return { t: [a, b, c], x: ux, y: uy, r2: (A[0] - ux) * (A[0] - ux) + (A[1] - uy) * (A[1] - uy) };
  };
  var tris = [cercle(n, n + 1, n + 2)];
  for (var i = 0; i < n; i++) {
    var p = Q[i];
    var garde = [];
    var bord = {};
    tris.forEach(function (t) {
      var dx = p[0] - t.x, dy = p[1] - t.y;
      if (dx * dx + dy * dy < t.r2 * (1 - 1e-12)) {
        for (var k = 0; k < 3; k++) {
          var u = t.t[k], v = t.t[(k + 1) % 3];
          var inv = v + "," + u;
          if (bord[inv]) delete bord[inv];
          else bord[u + "," + v] = [u, v];
        }
      } else garde.push(t);
    });
    Object.keys(bord).forEach(function (k) { var e = bord[k]; if (Math.abs(orient(Q[e[0]], Q[e[1]], p)) > 0) garde.push(cercle(e[0], e[1], i)); });
    tris = garde;
  }
  return tris.filter(function (t) { return t.t[0] < n && t.t[1] < n && t.t[2] < n; }).map(function (t) { return t.t; });
}

var cleArete = function (u, v) { return u < v ? u + "," + v : v + "," + u; };
var croisent = function (a, b, c, d) {
  var d1 = orient(a, b, c), d2 = orient(a, b, d), d3 = orient(c, d, a), d4 = orient(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** Découpe une contrainte aux points du semis posés exactement dessus. */
function decouperContrainte(P, a, b) {
  var A = P[a], B = P[b];
  var l2 = (B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1]);
  var sur = [];
  for (var i = 0; i < P.length; i++) {
    if (i === a || i === b) continue;
    var t = ((P[i][0] - A[0]) * (B[0] - A[0]) + (P[i][1] - A[1]) * (B[1] - A[1])) / l2;
    if (t > 1e-9 && t < 1 - 1e-9 && Math.abs(orient(A, B, P[i])) / Math.sqrt(l2) < 1e-6) sur.push({ i: i, t: t });
  }
  sur.sort(function (x, y) { return x.t - y.t; });
  var l = [a].concat(sur.map(function (s) { return s.i; }), [b]);
  var r = [];
  for (var k = 0; k + 1 < l.length; k++) r.push([l[k], l[k + 1]]);
  return r;
}

/** Table des arêtes d'une triangulation, tenue à jour à chaque bascule : clé « i,j » → triangles qui la portent. */
function tableAretes(T) {
  var A = {};
  var poser = function (i) { var t = T[i]; for (var k = 0; k < 3; k++) { var c = cleArete(t[k], t[(k + 1) % 3]); (A[c] = A[c] || []).push(i); } };
  var oter = function (i) {
    var t = T[i];
    for (var k = 0; k < 3; k++) {
      var c = cleArete(t[k], t[(k + 1) % 3]);
      var l = A[c].filter(function (j) { return j !== i; });
      if (l.length) A[c] = l;
      else delete A[c];
    }
  };
  for (var i = 0; i < T.length; i++) poser(i);
  return { A: A, poser: poser, oter: oter };
}

/**
 * Fait passer une arête (a, b) dans la triangulation (Sloan) : chaque arête qui la croise est basculée quand son
 * quadrilatère est convexe, sinon remise en file ; une diagonale nouvelle qui la croise encore revient en file.
 */
function forcerArete(P, T, E, a, b) {
  if (E.A[cleArete(a, b)]) return true;
  var file = Object.keys(E.A).filter(function (c) {
    var uv = c.split(",").map(Number);
    return uv[0] !== a && uv[0] !== b && uv[1] !== a && uv[1] !== b && croisent(P[a], P[b], P[uv[0]], P[uv[1]]);
  });
  var garde = 0;
  var sansBascule = 0;
  while (file.length && garde++ < 200000 && sansBascule <= file.length) {
    var c = file.shift();
    var tr = E.A[c];
    if (!tr || tr.length !== 2) continue;
    var uv = c.split(",").map(Number);
    var u = uv[0], v = uv[1];
    var p = T[tr[0]].filter(function (x) { return x !== u && x !== v; })[0];
    var q = T[tr[1]].filter(function (x) { return x !== u && x !== v; })[0];
    // Quadrilatère strictement convexe : ses deux diagonales se croisent.
    if (!croisent(P[u], P[v], P[p], P[q])) { file.push(c); sansBascule++; continue; }
    sansBascule = 0;
    var i1 = tr[0], i2 = tr[1];
    E.oter(i1);
    E.oter(i2);
    T[i1] = orient(P[p], P[q], P[u]) > 0 ? [p, q, u] : [q, p, u];
    T[i2] = orient(P[p], P[q], P[v]) > 0 ? [p, q, v] : [q, p, v];
    E.poser(i1);
    E.poser(i2);
    if (p !== a && p !== b && q !== a && q !== b && croisent(P[a], P[b], P[p], P[q])) file.push(cleArete(p, q));
  }
  return !!E.A[cleArete(a, b)];
}

// ——————————————————————————————————————————————— Terrain depuis des points (n° 8)

/** Champs d'une ligne : point-virgule ou tabulation, sinon espaces, sinon virgules ; virgule décimale admise. */
function champsDe(l) {
  var c = /[;\t]/.test(l) ? l.split(/[;\t]/) : l.trim().split(/\s+/);
  if (c.length === 1 && /,/.test(l)) c = l.split(",");
  return c.map(function (s) { return s.trim(); }).filter(function (s, i, t) { return s !== "" || i < t.length - 1; });
}

function lireReleve(nom, brut) {
  var x = tx();
  var lignes = texte(brut).replace(/^﻿/, "").split(/\r?\n/);
  var section = "points";
  var points = [];
  var ids = {};
  var plan = {};
  var chaines = { ruptures: [], contour: [] };
  var ignorees = [];
  var ignorer = function (n, m) { if (ignorees.length < MAX_LIGNES_IGNOREES) ignorees.push({ ligne: n, motif: m }); else ignorees.plus = (ignorees.plus || 0) + 1; };
  var enTete = true;
  for (var n = 0; n < lignes.length; n++) {
    var l = lignes[n].trim();
    if (!l) continue;
    var s = /^#\s*([a-zA-Zéè]+)/.exec(l);
    if (s) {
      var mot = s[1].toLowerCase();
      section = /^point/.test(mot) ? "points" : /^rupture|^breakline/.test(mot) ? "ruptures" : /^contour|^boundary/.test(mot) ? "contour" : "autre";
      enTete = true;
      continue;
    }
    if (section === "autre") continue;
    var c = champsDe(l);
    if (section === "points") {
      var v = c.map(lireNombre);
      var ok = (c.length === 3 && v.every(isFinite)) || (c.length === 4 && v.slice(1).every(isFinite) && c[0] !== "");
      if (!ok) {
        if (!enTete) ignorer(n + 1, x.motifs.illisible);
        enTete = false;
        continue;
      }
      enTete = false;
      var id = c.length === 4 ? c[0] : String(points.length + 1);
      var xyz = c.length === 4 ? v.slice(1) : v;
      if (Object.prototype.hasOwnProperty.call(ids, id)) { ignorer(n + 1, x.motifs.doublon); continue; }
      var k = Math.round(xyz[0] * 1e4) + ":" + Math.round(xyz[1] * 1e4);
      if (plan[k]) { ignorer(n + 1, x.motifs.confondu); continue; }
      if (points.length >= MAX_POINTS) return { erreur: x.trop(MAX_POINTS) };
      plan[k] = true;
      ids[id] = points.length;
      points.push(xyz);
    } else {
      enTete = false;
      chaines[section].push({ ligne: n + 1, ids: c });
    }
  }
  if (points.length < 3) return { erreur: x.pasAssez };
  var chaine = function (ch, min, motifCourt) {
    var inconnu = ch.ids.filter(function (i) { return !Object.prototype.hasOwnProperty.call(ids, i); })[0];
    if (inconnu !== undefined) { ignorer(ch.ligne, x.motifs.inconnu(inconnu)); return null; }
    var l = ch.ids.map(function (i) { return ids[i]; });
    if (l.length < min) { ignorer(ch.ligne, motifCourt); return null; }
    return l;
  };
  chaines.ruptures.slice(MAX_CONTRAINTES).forEach(function (ch) { ignorer(ch.ligne, x.motifs.tropDeRuptures(MAX_CONTRAINTES)); });
  var ruptures = chaines.ruptures.slice(0, MAX_CONTRAINTES).map(function (ch) { return chaine(ch, 2, x.motifs.court); }).filter(Boolean);
  var contour = null;
  chaines.contour.forEach(function (ch, i) {
    if (i > 0) return ignorer(ch.ligne, x.motifs.contourDouble);
    contour = chaine(ch, 3, x.motifs.contourCourt);
    if (contour && contour[0] === contour[contour.length - 1]) contour.pop();
  });
  return { nom: nom, points: points, ruptures: ruptures, contour: contour, ignorees: ignorees };
}

async function chargerReleve() {
  var x = tx();
  var f = await planche.fichiers.ouvrir([".csv", ".txt", ".tsv"]);
  if (!f) return;
  var r = lireReleve(f.nom, f.texte);
  if (r.erreur) return alerte(x.releveRefuse + r.erreur);
  releve = r;
  releve.trace = null;
  return info(x.releveCharge(r.points.length));
}

function aretesFinales(T) {
  var a = {};
  T.forEach(function (t) { for (var k = 0; k < 3; k++) a[cleArete(t[k], t[(k + 1) % 3])] = true; });
  return a;
}

/** Triangule le relevé : Delaunay, lignes de rupture et contour forcés, triangles hors du contour retirés. */
function triangulerReleve(r) {
  var P = r.points;
  var T = delaunay(P);
  if (!T.length) return null;
  var contraintes = [];
  r.ruptures.forEach(function (l) { for (var i = 0; i + 1 < l.length; i++) contraintes.push({ a: l[i], b: l[i + 1], rupture: true }); });
  if (r.contour) r.contour.forEach(function (a, i) { contraintes.push({ a: a, b: r.contour[(i + 1) % r.contour.length], rupture: false }); });
  var E = tableAretes(T);
  var parRupture = r.ruptures.map(function () { return true; });
  var k = 0;
  r.ruptures.forEach(function (l, ir) {
    for (var i = 0; i + 1 < l.length; i++, k++) {
      var morceaux = decouperContrainte(P, contraintes[k].a, contraintes[k].b);
      morceaux.forEach(function (m) { if (!forcerArete(P, T, E, m[0], m[1])) parRupture[ir] = false; });
    }
  });
  var contourForce = true;
  for (; k < contraintes.length; k++) {
    decouperContrainte(P, contraintes[k].a, contraintes[k].b).forEach(function (m) { if (!forcerArete(P, T, E, m[0], m[1])) contourForce = false; });
  }
  if (r.contour) {
    var poly = r.contour.map(function (i) { return P[i]; });
    T = T.filter(function (t) {
      var g = [(P[t[0]][0] + P[t[1]][0] + P[t[2]][0]) / 3, (P[t[0]][1] + P[t[1]][1] + P[t[2]][1]) / 3];
      return dansPolygone(g, poly);
    });
  }
  // Contrôle sur la triangulation finale : une rupture qui en croise une autre sans point commun peut avoir été défaite.
  var finales = aretesFinales(T);
  parRupture = r.ruptures.map(function (l) {
    for (var i = 0; i + 1 < l.length; i++) {
      var morceaux = decouperContrainte(P, l[i], l[i + 1]);
      if (!morceaux.every(function (m) { return finales[cleArete(m[0], m[1])]; })) return false;
    }
    return true;
  });
  var airePlan = T.reduce(function (s, t) { return s + Math.abs(orient(P[t[0]], P[t[1]], P[t[2]])) / 2; }, 0);
  return { triangles: T, respectees: parRupture.filter(Boolean).length, contourForce: contourForce, airePlan: airePlan };
}

var decalageDe = function (pts) {
  if (valeurs.recaler !== "oui") return [0, 0];
  var mx = Infinity, my = Infinity;
  pts.forEach(function (p) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); });
  return [mx, my];
};

/** Abscisse au-delà de tout le dessin du contexte : on y trace avant de grouper, pour ne rien souder au dessin. */
async function bordDroit() {
  var m = await planche.modele.lire();
  var x0 = 0;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  return { modele: m, x: x0 + 2 };
}
async function lignesEnLots(segments) {
  for (var i = 0; i < segments.length; i += SEGMENTS_PAR_APPEL) await planche.modele.lignes(segments.slice(i, i + SEGMENTS_PAR_APPEL));
}

/** Une face de trois arêtes qui n'est pas un triangle du terrain entoure au moins un point du semis. */
function entoureUnPoint(f, pts) {
  if (f.points.length !== 3) return true;
  var a = f.points[0], b = f.points[1], c = f.points[2];
  var aire2 = orient(a, b, c);
  if (Math.abs(aire2) < EPS) return false;
  var tol = 1e-6 * Math.abs(aire2);
  var minx = Math.min(a[0], b[0], c[0]), maxx = Math.max(a[0], b[0], c[0]), miny = Math.min(a[1], b[1], c[1]), maxy = Math.max(a[1], b[1], c[1]);
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (p[0] <= minx || p[0] >= maxx || p[1] <= miny || p[1] >= maxy) continue;
    var s1 = orient(a, b, p) * Math.sign(aire2), s2 = orient(b, c, p) * Math.sign(aire2), s3 = orient(c, a, p) * Math.sign(aire2);
    if (s1 > tol && s2 > tol && s3 > tol) return true;
  }
  return false;
}

var proche = function (p, q) { return Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6; };

/** Triangles dont le centre ne tombe dans aucune face posée. */
function trianglesSansFace(T, pts, faces) {
  var boites = faces.map(function (f) {
    var xs = f.points.map(function (q) { return q[0]; }), ys = f.points.map(function (q) { return q[1]; });
    return { f: f, x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
  });
  return T.filter(function (t) {
    var g = [(pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3, (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3];
    return !boites.some(function (b) { return g[0] >= b.x0 && g[0] <= b.x1 && g[1] >= b.y0 && g[1] <= b.y1 && dansPolygone(g, b.f.points); });
  });
}

async function tracerTerrain() {
  var x = tx();
  if (!releve) return alerte(x.sansReleve);
  var t = triangulerReleve(releve);
  if (!t || !t.triangles.length) return alerte(x.alignes);
  var P = releve.points;
  var dec = decalageDe(P);
  var b = await bordDroit();
  var minx = Infinity;
  P.forEach(function (p) { minx = Math.min(minx, p[0] - dec[0]); });
  var ecart = Math.max(0, b.x - minx);
  var vu = {};
  var segments = [];
  var pt = function (i) { return [P[i][0] - dec[0] + ecart, P[i][1] - dec[1], P[i][2]]; };
  t.triangles.forEach(function (tr) {
    for (var k = 0; k < 3; k++) {
      var c = cleArete(tr[k], tr[(k + 1) % 3]);
      if (vu[c]) continue;
      vu[c] = true;
      segments.push([pt(tr[k]), pt(tr[(k + 1) % 3])]);
    }
  });
  var poses = P.map(function (q, i) { return pt(i); });
  var avant = {};
  var avantA = {};
  b.modele.faces.forEach(function (f) { avant[f.id] = true; });
  b.modele.aretes.forEach(function (a) { avantA[a.id] = true; });
  var sansFace = 0;
  var g = await enUnPas(x.op.terrain, async function () {
    await lignesEnLots(segments);
    // Trois arêtes qui entourent d'autres points forment parfois une face plane à la place des triangles qu'elles
    // entourent : cette face est effacée, puis les arêtes des triangles restés sans face sont retracées une à une.
    var nouvelles = [];
    for (var tour = 0; tour < 5; tour++) {
      var m2 = await planche.modele.lire();
      nouvelles = m2.faces.filter(function (f) { return !avant[f.id]; });
      var fantomes = nouvelles.filter(function (f) { return entoureUnPoint(f, poses); }).map(function (f) { return f.id; });
      if (fantomes.length) {
        await planche.modele.effacer(fantomes);
        nouvelles = nouvelles.filter(function (f) { return fantomes.indexOf(f.id) < 0; });
      }
      var manquants = trianglesSansFace(t.triangles, poses, nouvelles);
      sansFace = manquants.length;
      if (!sansFace || tour === 4) break;
      var aretes = m2.aretes.filter(function (a) { return !avantA[a.id]; });
      var ids = [];
      var aRetracer = [];
      manquants.forEach(function (tr) {
        for (var k = 0; k < 3; k++) {
          var A = poses[tr[k]], B = poses[tr[(k + 1) % 3]];
          var e = aretes.filter(function (a) { return (proche(a.points[0], A) && proche(a.points[1], B)) || (proche(a.points[0], B) && proche(a.points[1], A)); })[0];
          if (e && ids.indexOf(e.id) < 0) { ids.push(e.id); aRetracer.push([A, B]); }
        }
      });
      if (ids.length) await planche.modele.effacer(ids);
      for (var r = 0; r < aRetracer.length; r++) await planche.modele.ligne(aRetracer[r][0], aRetracer[r][1]);
    }
    var g2 = await planche.modele.grouper(nouvelles.map(function (f) { return f.id; }), x.nomTerrain);
    if (ecart) await planche.modele.deplacer([g2], [-ecart, 0, 0]);
    await planche.donnees.ecrire(g2, "terrain", { fichier: releve.nom.slice(0, 80), points: P.length, triangles: t.triangles.length, ruptures: releve.ruptures.length, respectees: t.respectees, contour: !!releve.contour, decalage: dec, sansFace: sansFace });
    return g2;
  });
  t.sansFace = sansFace;
  releve.trace = t;
  await planche.selection.definir([g]).catch(function () {});
  return info(x.terrainTrace(t.triangles.length));
}

function etatTerrain(sep) {
  var x = tx();
  var e = { lignes: [], resultats: [], vide: null };
  if (!releve) { e.vide = x.vide.terrain; return e; }
  var r = x.res;
  var z = releve.points.map(function (p) { return p[2]; });
  var dec = decalageDe(releve.points);
  e.resultats.push(
    { libelle: r.fichier, valeur: releve.nom },
    { libelle: r.points, valeur: String(releve.points.length) },
    { libelle: r.ruptures, valeur: String(releve.ruptures.length) },
    { libelle: r.contour, valeur: releve.contour ? x.oui1 : x.aucun },
    { libelle: r.altitudes, valeur: fixe(Math.min.apply(null, z), 2, sep) + " – " + fixe(Math.max.apply(null, z), 2, sep) + " m" }
  );
  if (dec[0] || dec[1]) e.resultats.push({ libelle: r.decalage, valeur: "x −" + fixe(dec[0], 2, sep) + " · y −" + fixe(dec[1], 2, sep) + " m" });
  if (releve.trace) {
    e.resultats.push(
      { libelle: r.triangles, valeur: String(releve.trace.triangles.length) },
      { libelle: r.respectees, valeur: releve.trace.respectees + " / " + releve.ruptures.length, ton: releve.trace.respectees === releve.ruptures.length ? "ok" : "alerte" },
      { libelle: r.airePlan, valeur: aire(releve.trace.airePlan, sep) }
    );
    if (releve.trace.sansFace) e.resultats.push({ libelle: r.sansFace, valeur: String(releve.trace.sansFace), ton: "alerte" });
  }
  e.lignes = releve.ignorees.map(function (i) { return { genre: "ligne", ton: "gris", cellules: [String(i.ligne), i.motif] }; });
  return e;
}

// ——————————————————————————————————————————————— Courbes de niveau DXF (n° 26)

/** Lecteur DXF texte réduit aux lignes et polylignes de la section ENTITIES ; commentaires 999 gardés (repère, source…). */
function lireDxf(nom, brut) {
  var x = tx();
  var l = texte(brut).replace(/^﻿/, "").split(/\r?\n/);
  if (l.length < 4) return { erreur: x.dxfIllisible };
  var paires = [];
  for (var i = 0; i + 1 < l.length; i += 2) {
    var c = Number(l[i].trim());
    if (!isFinite(c) || l[i].trim() === "") return { erreur: x.dxfIllisible };
    paires.push([c, l[i + 1].trim()]);
  }
  var meta = {};
  paires.forEach(function (p) {
    if (p[0] !== 999) return;
    var m = /^([^:]+?)\s*:\s*(.+)$/.exec(p[1]);
    if (!m) return;
    var k = m[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/^repere horizontal|^crs/.test(k)) meta.repere = m[2].slice(0, 80);
    else if (/^reference verticale|^vertical/.test(k)) meta.referenceVerticale = m[2].slice(0, 80);
    else if (/^source/.test(k)) meta.source = m[2].slice(0, 80);
    else if (/^equidistance|^interval/.test(k)) meta.equidistance = m[2].slice(0, 20);
  });
  var debut = -1;
  for (var j = 0; j + 1 < paires.length; j++) if (paires[j][0] === 0 && paires[j][1] === "SECTION" && paires[j + 1][0] === 2 && paires[j + 1][1] === "ENTITIES") { debut = j + 2; break; }
  if (debut < 0) return { erreur: x.dxfVide };
  var polylignes = [];
  var ignores = {};
  var arrondis = false;
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var k = debut;
  var entite = function () {
    var e = { type: paires[k][1], g: [] };
    k++;
    while (k < paires.length && paires[k][0] !== 0) { e.g.push(paires[k]); k++; }
    return e;
  };
  var val = function (e, code) { for (var i = 0; i < e.g.length; i++) if (e.g[i][0] === code) return e.g[i][1]; return null; };
  while (k < paires.length) {
    if (paires[k][0] !== 0) { k++; continue; }
    if (paires[k][1] === "ENDSEC" || paires[k][1] === "EOF") break;
    var e = entite();
    var calque = (val(e, 8) || "0").slice(0, 60);
    if (e.type === "LINE") {
      polylignes.push({ calque: calque, ferme: false, points: [[num(val(e, 10)), num(val(e, 20)), num(val(e, 30))], [num(val(e, 11)), num(val(e, 21)), num(val(e, 31))]] });
    } else if (e.type === "LWPOLYLINE") {
      var z = num(val(e, 38));
      var pts = [];
      e.g.forEach(function (g) {
        if (g[0] === 10) pts.push([num(g[1]), 0, z]);
        else if (g[0] === 20 && pts.length) pts[pts.length - 1][1] = num(g[1]);
        else if (g[0] === 42 && num(g[1]) !== 0) arrondis = true;
      });
      if (pts.length >= 2) polylignes.push({ calque: calque, ferme: (num(val(e, 70)) & 1) === 1, points: pts });
    } else if (e.type === "POLYLINE") {
      var drap = num(val(e, 70));
      var trois = (drap & 8) === 8;
      var elev = num(val(e, 30));
      var sommets = [];
      while (k < paires.length && paires[k][0] === 0 && paires[k][1] === "VERTEX") {
        var v = entite();
        if ((num(val(v, 70)) & 16) === 16) continue;
        if (num(val(v, 42)) !== 0) arrondis = true;
        sommets.push([num(val(v, 10)), num(val(v, 20)), trois ? num(val(v, 30)) : elev]);
      }
      if (k < paires.length && paires[k][1] === "SEQEND") entite();
      if ((drap & (16 | 64)) !== 0) ignores.POLYLINE = (ignores.POLYLINE || 0) + 1;
      else if (sommets.length >= 2) polylignes.push({ calque: calque, ferme: (drap & 1) === 1, points: sommets });
    } else {
      ignores[e.type] = (ignores[e.type] || 0) + 1;
    }
  }
  if (!polylignes.length) return { erreur: x.dxfVide };
  return { nom: nom, polylignes: polylignes, meta: meta, ignores: ignores, arrondis: arrondis };
}

async function chargerDxf() {
  var x = tx();
  var f = await planche.fichiers.ouvrir([".dxf"], { flux: true });
  if (!f) return;
  var r = lireDxf(f.nom, await f.texte());
  if (r.erreur) return alerte(x.dxfRefuse + r.erreur);
  dxf = r;
  valeurs.calque = "";
  var ign = Object.keys(r.ignores).map(function (k) { return r.ignores[k] + " " + k; });
  if (r.arrondis) ign.push(x.arrondis);
  await info(x.dxfCharge(r.polylignes.length));
  if (ign.length) await info(x.ignores(ign.join(", ")));
}

var polylignesChoisies = function () { return dxf ? dxf.polylignes.filter(function (p) { return !valeurs.calque || p.calque === valeurs.calque; }) : []; };
var segmentsDe = function (p) { return p.points.length - 1 + (p.ferme ? 1 : 0); };

async function poserCourbes() {
  var x = tx();
  if (!dxf) return alerte(x.sansDxf);
  var l = polylignesChoisies();
  var n = l.reduce(function (s, p) { return s + segmentsDe(p); }, 0);
  if (n > MAX_SEGMENTS) return alerte(x.tropSegments(MAX_SEGMENTS));
  var tous = [];
  l.forEach(function (p) { tous = tous.concat(p.points); });
  var dec = decalageDe(tous);
  var b = await bordDroit();
  var minx = Infinity;
  tous.forEach(function (p) { minx = Math.min(minx, p[0] - dec[0]); });
  var ecart = Math.max(0, b.x - minx);
  var pt = function (q) { return [q[0] - dec[0] + ecart, q[1] - dec[1], q[2]]; };
  var segments = [];
  l.forEach(function (p) {
    for (var i = 0; i + 1 < p.points.length; i++) segments.push([pt(p.points[i]), pt(p.points[i + 1])]);
    if (p.ferme) segments.push([pt(p.points[p.points.length - 1]), pt(p.points[0])]);
  });
  var avantF = {};
  var avantA = {};
  b.modele.faces.forEach(function (f) { avantF[f.id] = true; });
  b.modele.aretes.forEach(function (a) { avantA[a.id] = true; });
  var nom = x.nomCourbes(valeurs.calque || x.tousCalques);
  var g = await enUnPas(x.op.courbes, async function () {
    await lignesEnLots(segments);
    // Une courbe fermée forme une face : on l'efface, la courbe reste (ses arêtes).
    var m2 = await planche.modele.lire();
    var faces = m2.faces.filter(function (f) { return !avantF[f.id]; }).map(function (f) { return f.id; });
    if (faces.length) await planche.modele.effacer(faces);
    var m3 = await planche.modele.lire();
    var g2 = await planche.modele.grouper(m3.aretes.filter(function (a) { return !avantA[a.id]; }).map(function (a) { return a.id; }), nom);
    if (ecart) await planche.modele.deplacer([g2], [-ecart, 0, 0]);
    var meta = { fichier: dxf.nom.slice(0, 80), calque: valeurs.calque || null, polylignes: l.length, decalage: dec };
    Object.keys(dxf.meta).forEach(function (k) { meta[k] = dxf.meta[k]; });
    await planche.donnees.ecrire(g2, "courbes", meta);
    return g2;
  });
  await planche.selection.definir([g]).catch(function () {});
  return info(x.courbesPosees(l.length));
}

function etatCourbes(sep) {
  var x = tx();
  var e = { lignes: [], resultats: [], vide: null };
  if (!dxf) { e.vide = x.vide.courbes; return e; }
  var calques = {};
  dxf.polylignes.forEach(function (p) {
    var c = calques[p.calque] || (calques[p.calque] = { n: 0, zmin: Infinity, zmax: -Infinity });
    c.n++;
    p.points.forEach(function (q) { c.zmin = Math.min(c.zmin, q[2]); c.zmax = Math.max(c.zmax, q[2]); });
  });
  Object.keys(calques).sort().forEach(function (k) {
    var c = calques[k];
    var alt = c.zmin === c.zmax ? fixe(c.zmin, 2, sep) + " m" : fixe(c.zmin, 2, sep) + " – " + fixe(c.zmax, 2, sep) + " m";
    e.lignes.push({ genre: "ligne", id: "calque:" + k, choisi: valeurs.calque === k, cellules: [k, String(c.n), alt] });
  });
  var r = x.res;
  var l = polylignesChoisies();
  var tous = [];
  l.forEach(function (p) { tous = tous.concat(p.points); });
  var dec = decalageDe(tous);
  e.resultats.push({ libelle: r.fichier, valeur: dxf.nom }, { libelle: r.polylignes, valeur: String(l.length) }, { libelle: r.segments, valeur: String(l.reduce(function (s, p) { return s + segmentsDe(p); }, 0)) });
  ["repere", "referenceVerticale", "source", "equidistance"].forEach(function (k) { if (dxf.meta[k]) e.resultats.push({ libelle: r[k], valeur: dxf.meta[k] }); });
  if (dec[0] || dec[1]) e.resultats.push({ libelle: r.decalage, valeur: "x −" + fixe(dec[0], 2, sep) + " · y −" + fixe(dec[1], 2, sep) + " m" });
  e.calques = Object.keys(calques).sort();
  return e;
}

// ——————————————————————————————————————————————— Unité foncière (n° 23)

async function parcellesGardees() {
  var l = await planche.donnees.lire("projet", "parcelles");
  return Array.isArray(l) ? l : [];
}
async function faceChoisie() {
  var x = tx();
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  var f = m.faces.filter(function (y) { return sel.indexOf(y.id) >= 0; });
  if (f.length !== 1 || sel.length !== 1) { await alerte(x.choisirFace); return null; }
  if (!horizontale(f[0])) { await alerte(x.pasHorizontale); return null; }
  return f[0];
}

async function declarerParcelle() {
  var x = tx();
  var f = await faceChoisie();
  if (!f) return;
  var l = await parcellesGardees();
  var i = l.map(function (p) { return p.face; }).indexOf(f.id);
  if (i < 0 && l.length >= MAX_PARCELLES) return alerte(x.tropParcelles);
  var actuel = i >= 0 ? l[i] : null;
  var r = await planche.saisie.demander(x.declarerParcelle, [
    { id: "reference", libelle: x.champRef, genre: "texte", valeur: actuel ? actuel.reference : "" },
    { id: "contenance", libelle: x.champContenance, genre: "texte", valeur: actuel && typeof actuel.contenance === "number" ? String(actuel.contenance) : "" },
  ]);
  if (!r) return;
  var ref = texte(r.reference).trim().slice(0, 40);
  if (!ref) return alerte(x.refVide);
  var c = texte(r.contenance).trim() === "" ? null : lireNombre(r.contenance);
  if (c !== null && !(c > 0)) return alerte(x.contenanceInvalide);
  var p = { face: f.id, reference: ref, contenance: c, aire: f.aire };
  var n = l.slice();
  if (i >= 0) n[i] = p;
  else n.push(p);
  await enUnPas(x.op.parcelle, function () { return planche.donnees.ecrire("projet", "parcelles", n); });
  if (i >= 0) await info(x.dejaDeclaree);
  return info(x.parcelleDeclaree(ref));
}

async function reunirParcelles() {
  var x = tx();
  var l = await parcellesGardees();
  if (l.length < 2) return alerte(x.unePlusieurs);
  var actuel = await planche.donnees.lire("projet", "unite");
  var r = await planche.saisie.demander(x.reunir, [{ id: "nom", libelle: x.champNomUnite, genre: "texte", valeur: actuel && actuel.nom ? actuel.nom : x.nomUniteDefaut(l.map(function (p) { return p.reference; })).slice(0, 120) }]);
  if (!r) return;
  var nom = texte(r.nom).trim().slice(0, 120) || x.nomUniteDefaut(l.map(function (p) { return p.reference; })).slice(0, 120);
  await enUnPas(x.op.unite, function () { return planche.donnees.ecrire("projet", "unite", { nom: nom, parcelles: l.map(function (p) { return p.reference; }), date: new Date().toISOString().slice(0, 10) }); });
  return info(x.reunies(l.length));
}

async function retirerParcelle(d) {
  var x = tx();
  var l = await parcellesGardees();
  var i = typeof d.id === "string" ? l.map(function (p) { return p.face; }).indexOf(d.id) : -1;
  if (i < 0) return;
  var n = l.slice(0, i).concat(l.slice(i + 1));
  await enUnPas(x.op.retirer, async function () {
    await planche.donnees.ecrire("projet", "parcelles", n);
    var u = await planche.donnees.lire("projet", "unite");
    if (u && n.length < 2) await planche.donnees.effacer("projet", "unite");
    else if (u) await planche.donnees.ecrire("projet", "unite", { nom: u.nom, parcelles: n.map(function (p) { return p.reference; }), date: u.date });
  });
  choisie = null;
  return info(x.retiree);
}

/** Parcelles avec leur surface mesurée en direct (la face existe) ou effacée ; cumuls à part. */
async function uniteFonciere() {
  var l = await parcellesGardees();
  var m = await planche.modele.lire();
  var parId = {};
  m.faces.forEach(function (f) { parId[f.id] = f; });
  var lignes = l.map(function (p) { var f = parId[p.face]; return { face: p.face, reference: p.reference, contenance: p.contenance, aire: f ? f.aire : null }; });
  var mesuree = lignes.every(function (p) { return p.aire !== null; }) ? lignes.reduce(function (s, p) { return s + p.aire; }, 0) : null;
  var contenance = lignes.length && lignes.every(function (p) { return typeof p.contenance === "number"; }) ? lignes.reduce(function (s, p) { return s + p.contenance; }, 0) : null;
  return { parcelles: lignes, mesuree: mesuree, contenance: contenance, unite: await planche.donnees.lire("projet", "unite") };
}

function ecartTexte(mes, cont, sep) {
  if (mes === null || cont === null) return { texte: "–", ton: "" };
  var d = mes - cont;
  var pct = (d / cont) * 100;
  return { texte: (d >= 0 ? "+" : "−") + fixe(Math.abs(d), 1, sep) + " m² (" + (d >= 0 ? "+" : "−") + fixe(Math.abs(pct), 1, sep) + " %)", ton: "" };
}

async function etatUnite(sep) {
  var x = tx();
  var u = await uniteFonciere();
  var e = { lignes: [], resultats: [], vide: null, pied: null };
  if (!u.parcelles.length) { e.vide = x.vide.unite; return e; }
  u.parcelles.forEach(function (p) {
    var ec = ecartTexte(p.aire, typeof p.contenance === "number" ? p.contenance : null, sep);
    e.lignes.push({ genre: "ligne", id: p.face, choisi: choisie === p.face, ton: p.aire === null ? "gris" : "", cellules: [p.reference, p.aire === null ? x.effacee : aire(p.aire, sep), typeof p.contenance === "number" ? contenanceTexte(p.contenance, sep) : x.nonEvaluee, ec.texte] });
  });
  e.pied = [u.unite ? x.res.unite : x.total, u.mesuree === null ? "–" : aire(u.mesuree, sep), u.contenance === null ? "–" : contenanceTexte(u.contenance, sep), ecartTexte(u.mesuree, u.contenance, sep).texte];
  if (u.unite) e.resultats.push({ libelle: x.res.unite, valeur: u.unite.nom });
  e.resultats.push({ libelle: x.res.mesuree, valeur: u.mesuree === null ? x.nonEvaluee : aire(u.mesuree, sep) }, { libelle: x.res.contenance, valeur: u.contenance === null ? x.nonEvaluee : contenanceTexte(u.contenance, sep) });
  return e;
}

// ——————————————————————————————————————————————— Pleine terre et biotope (n° 12)

/** Surfaces horizontales peintes, par matière, mesurées en direct. */
async function revetements() {
  var m = await planche.modele.lire();
  var mats = await planche.matieres.lire();
  var nom = {};
  mats.forEach(function (x) { nom[x.id] = x.nom; });
  var par = {};
  var ordre = [];
  m.faces.forEach(function (f) {
    if (!f.matiere || !horizontale(f)) return;
    if (!par[f.matiere]) { par[f.matiere] = { id: f.matiere, nom: nom[f.matiere] || f.matiere, surface: 0, faces: [] }; ordre.push(f.matiere); }
    par[f.matiere].surface += f.aire;
    par[f.matiere].faces.push(f.id);
  });
  return ordre.map(function (k) { return par[k]; }).sort(function (a, b) { return b.surface - a.surface; });
}
async function biotopeGarde() {
  var b = await planche.donnees.lire("projet", "biotope");
  return b && typeof b === "object" ? b : { coefficients: {}, pleineTerre: null, article: "", seuil: null };
}

async function saisirCoefficients() {
  var x = tx();
  var l = await revetements();
  if (!l.length) return alerte(x.vide.biotope);
  if (l.length > MAX_REVETEMENTS) return alerte(x.tropRevetements(MAX_REVETEMENTS));
  var b = await biotopeGarde();
  var champs = l.map(function (r, i) {
    var c = b.coefficients[r.id];
    return { id: "c" + i, libelle: x.champCoef(r.nom.slice(0, 44)), genre: "texte", valeur: typeof c === "number" ? String(c) : "" };
  });
  champs.push(
    { id: "pleine", libelle: x.champPleine, genre: "choix", valeur: b.pleineTerre && l.some(function (r) { return r.id === b.pleineTerre; }) ? b.pleineTerre : "-", choix: [{ valeur: "-", libelle: x.aucune }].concat(l.map(function (r) { return { valeur: r.id, libelle: r.nom.slice(0, 60) }; })) },
    { id: "article", libelle: x.champArticle, genre: "texte", valeur: b.article || "" },
    { id: "seuil", libelle: x.champSeuil, genre: "texte", valeur: typeof b.seuil === "number" ? String(b.seuil) : "" }
  );
  var r = await planche.saisie.demander(x.coefficients, champs);
  if (!r) return;
  var coefficients = {};
  Object.keys(b.coefficients || {}).forEach(function (k) { coefficients[k] = b.coefficients[k]; });
  for (var i = 0; i < l.length; i++) {
    var s = texte(r["c" + i]).trim();
    if (s === "") { delete coefficients[l[i].id]; continue; }
    var v = lireNombre(s);
    if (!(v >= 0 && v <= 1)) return alerte(x.coefInvalide(l[i].nom));
    coefficients[l[i].id] = v;
  }
  var seuil = texte(r.seuil).trim() === "" ? null : lireNombre(r.seuil);
  if (seuil !== null && !(seuil >= 0 && seuil <= 1)) return alerte(x.seuilInvalide);
  var garde = { coefficients: coefficients, pleineTerre: texte(r.pleine) && r.pleine !== "-" ? texte(r.pleine) : null, article: texte(r.article).trim().slice(0, 60), seuil: seuil };
  await enUnPas(x.op.biotope, function () { return planche.donnees.ecrire("projet", "biotope", garde); });
  return info(x.coefsSaisis);
}

async function etatBiotope(sep) {
  var x = tx();
  var l = await revetements();
  var e = { lignes: [], resultats: [], vide: null, pied: null };
  if (!l.length) { e.vide = x.vide.biotope; return e; }
  var b = await biotopeGarde();
  var total = 0;
  var pondere = 0;
  var complet = true;
  l.forEach(function (r) {
    var c = b.coefficients[r.id];
    var a = typeof c === "number";
    total += r.surface;
    if (a) pondere += r.surface * c;
    else complet = false;
    e.lignes.push({ genre: "ligne", id: "mat:" + r.id, choisi: choisie === "mat:" + r.id, ton: a ? "" : "gris", cellules: [r.nom, aire(r.surface, sep), a ? fixe(c, 1, sep) : "–", a ? fixe(r.surface * c, 1, sep) : x.nonEvaluee] });
  });
  var u = await uniteFonciere();
  e.pied = [u.unite ? x.res.unite : x.total, aire(total, sep), "", complet ? fixe(pondere, 1, sep) : "–"];
  var pt = b.pleineTerre ? l.filter(function (r) { return r.id === b.pleineTerre; })[0] : null;
  e.resultats.push({ libelle: x.res.pleineTerre, valeur: b.pleineTerre ? fixe(((pt ? pt.surface : 0) / total) * 100, 1, sep) + " %" : x.nonEvaluee });
  var cbs = complet ? pondere / total : null;
  e.resultats.push({ libelle: x.res.biotope, valeur: cbs === null ? x.nonEvalue : fixe(cbs, 2, sep) });
  if (typeof b.seuil === "number") {
    var ok = cbs !== null && cbs >= b.seuil - EPS;
    e.resultats.push({ libelle: x.res.seuil(b.article), valeur: fixe(b.seuil, 2, sep) + (cbs === null ? "" : " · " + (ok ? x.marge(fixe(cbs - b.seuil, 2, sep)) : x.manque(fixe(b.seuil - cbs, 2, sep)))), ton: cbs === null ? "" : ok ? "ok" : "alerte" });
  }
  if (u.contenance !== null) e.resultats.push({ libelle: x.res.contenance, valeur: contenanceTexte(u.contenance, sep) });
  return e;
}

// ——————————————————————————————————————————————— Volumes du contexte (n° 25)

async function empriseesChoisies() {
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  return m.faces.filter(function (f) { return sel.indexOf(f.id) >= 0 && horizontale(f); });
}
async function attributsGardes() {
  var a = await planche.donnees.lire("projet", "emprises");
  return a && typeof a === "object" ? a : {};
}

async function declarerHauteurs() {
  var x = tx();
  var l = await empriseesChoisies();
  if (!l.length) return alerte(x.vide.volumes);
  if (l.length > MAX_EMPRISES) return alerte(x.tropEmprises(MAX_EMPRISES));
  var a = await attributsGardes();
  var actuel = l.length === 1 ? a[l[0].id] : null;
  var r = await planche.saisie.demander(x.declarerHauteur, [
    { id: "hauteur", libelle: x.champH, genre: "texte", valeur: actuel && typeof actuel.hauteur === "number" ? String(actuel.hauteur) : "" },
    { id: "niveaux", libelle: x.champNiveaux, genre: "texte", valeur: actuel && typeof actuel.niveaux === "number" ? String(actuel.niveaux) : "" },
  ]);
  if (!r) return;
  var h = texte(r.hauteur).trim() === "" ? null : lireNombre(r.hauteur);
  var n = texte(r.niveaux).trim() === "" ? null : lireNombre(r.niveaux);
  if ((h !== null && !(h > 0)) || (n !== null && !(n > 0 && n === Math.floor(n)))) return alerte(x.hauteurInvalide);
  var garde = {};
  // Les attributs des faces effacées depuis sont oubliés (lecture du modèle entier : une face dans un autre groupe
  // n'est pas effacée) ; la donnée reste petite.
  var m = await planche.modele.lire({ portee: "monde" });
  m.faces.forEach(function (f) { if (a[f.id]) garde[f.id] = a[f.id]; });
  l.forEach(function (f) { garde[f.id] = { hauteur: h, niveaux: n }; });
  await enUnPas(x.op.hauteur, function () { return planche.donnees.ecrire("projet", "emprises", garde); });
  return info(x.hauteursDeclarees(l.length));
}

/** Hauteur d'une emprise selon la source choisie ; `null` si elle n'est pas connue. */
function hauteurDe(f, attributs) {
  var x = tx();
  var a = attributs[f.id] || {};
  if (valeurs.source === "unique") {
    var h = lireNombre(valeurs.hauteur);
    return h > 0 ? { h: h, source: x.srcUnique } : null;
  }
  if (valeurs.source === "niveaux") {
    var e = lireNombre(valeurs.etage);
    return typeof a.niveaux === "number" && e > 0 ? { h: a.niveaux * e, source: x.srcNiveaux(a.niveaux) } : null;
  }
  return typeof a.hauteur === "number" ? { h: a.hauteur, source: x.srcAttribut } : null;
}

async function extruder() {
  var x = tx();
  var l = await empriseesChoisies();
  if (!l.length) return alerte(x.vide.volumes);
  if (l.length > MAX_EMPRISES) return alerte(x.tropEmprises(MAX_EMPRISES));
  var a = await attributsGardes();
  // Une emprise à cour intérieure (une ouverture) n'est pas extrudée : son volume comblerait la cour.
  var faire = l.map(function (f) { return { f: f, h: f.trous ? null : hauteurDe(f, a) }; }).filter(function (y) { return y.h; });
  if (!faire.length) return alerte(x.rienAExtruder);
  var sep = (await planche.unites.lire()).separateur;
  var b = await bordDroit();
  var groupes = await enUnPas(x.op.volumes, async function () {
    var g = [];
    var xc = b.x;
    for (var i = 0; i < faire.length; i++) {
      var f = faire[i].f;
      var h = faire[i].h.h;
      var minx = Infinity, maxx = -Infinity;
      f.points.forEach(function (q) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); });
      var ecart = xc - minx;
      xc += maxx - minx + 2;
      var m0 = await planche.modele.lire();
      var avant = {};
      m0.faces.forEach(function (y) { avant[y.id] = true; });
      var pts = f.points.map(function (q) { return [q[0] + ecart, q[1], q[2]]; });
      var segs = pts.map(function (q, k) { return [q, pts[(k + 1) % pts.length]]; });
      await planche.modele.lignes(segs);
      var m1 = await planche.modele.lire();
      var base = m1.faces.filter(function (y) { return !avant[y.id]; })[0];
      if (!base) continue;
      await planche.modele.pousser(base.id, normaleDe(base.points)[2] < 0 ? -h : h);
      var m2 = await planche.modele.lire();
      var gg = await planche.modele.grouper(m2.faces.filter(function (y) { return !avant[y.id]; }).map(function (y) { return y.id; }), x.nomVolume(fixe(h, 2, sep)));
      await planche.modele.deplacer([gg], [-ecart, 0, 0]);
      await planche.donnees.ecrire(gg, "volume", { hauteur: h, source: faire[i].h.source, emprise: f.id });
      g.push(gg);
    }
    return g;
  });
  if (groupes.length) await planche.selection.definir(groupes).catch(function () {});
  return info(x.extrudes(groupes.length, l.length - groupes.length));
}

async function etatVolumes(sep) {
  var x = tx();
  var l = await empriseesChoisies();
  var e = { lignes: [], resultats: [], vide: null };
  if (!l.length) { e.vide = x.vide.volumes; return e; }
  var a = await attributsGardes();
  var n = 0;
  l.slice(0, MAX_EMPRISES).forEach(function (f, i) {
    var h = f.trous ? null : hauteurDe(f, a);
    if (h) n++;
    e.lignes.push({ genre: "ligne", id: f.id, ton: h ? "" : f.trous ? "alerte" : "gris", cellules: [x.emprise(i + 1), aire(f.aire, sep), h ? h.source : "–", h ? fixe(h.h, 2, sep) + " m" : f.trous ? x.avecCour : x.attributAbsent] });
  });
  e.resultats.push({ libelle: x.res.emprises, valeur: String(l.length) }, { libelle: x.res.extrudables, valeur: String(n) });
  if (n < l.length) e.resultats.push({ libelle: x.res.sansHauteur, valeur: String(l.length - n), ton: "alerte" });
  return e;
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var formulaire = [];
  var ouiNon = [{ valeur: "oui", libelle: x.oui }, { valeur: "non", libelle: x.non }];
  var e;
  if (onglet === "terrain") {
    formulaire.push({ id: "recaler", libelle: x.champs.recaler, valeur: valeurs.recaler, choix: ouiNon });
    e = etatTerrain(sep);
  } else if (onglet === "courbes") {
    e = etatCourbes(sep);
    formulaire.push({ id: "calque", libelle: x.champs.calque, valeur: valeurs.calque, choix: [{ valeur: "", libelle: x.tousCalques }].concat((e.calques || []).map(function (c) { return { valeur: c, libelle: c }; })) });
    formulaire.push({ id: "recaler", libelle: x.champs.recaler, valeur: valeurs.recaler, choix: ouiNon });
  } else if (onglet === "unite") {
    e = await etatUnite(sep);
  } else if (onglet === "biotope") {
    e = await etatBiotope(sep);
  } else {
    formulaire.push({ id: "source", libelle: x.champs.source, valeur: valeurs.source, choix: ["attribut", "niveaux", "unique"].map(function (k) { return { valeur: k, libelle: x.sources[k] }; }) });
    if (valeurs.source === "niveaux") formulaire.push({ id: "etage", libelle: x.champs.etage, valeur: valeurs.etage });
    if (valeurs.source === "unique") formulaire.push({ id: "hauteur", libelle: x.champs.hauteur, valeur: valeurs.hauteur });
    e = await etatVolumes(sep);
  }
  var lignes = e.lignes;
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    note: x.note[onglet],
    formulaire: formulaire,
    resultats: e.resultats,
    encart: x.encart[onglet],
    colonnes: x.col[onglet],
    lignes: lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    choisie: choisie,
    pied: e.pied || null,
    vide: e.vide,
    page: page,
    pages: pages,
    version: VERSION,
  };
}
async function rafraichir() {
  await planche.panneau.envoyer(PANNEAU, await etat());
}

var retenirValeurs = function (d) {
  var v = d && d.valeurs;
  if (!v || typeof v !== "object") return;
  Object.keys(valeurs).forEach(function (k) { if (typeof v[k] === "string") valeurs[k] = v[k].slice(0, 120); });
};

var action = function (nom, fn) {
  planche.panneau.sur(PANNEAU, nom, async function (d) {
    retenirLangue(d);
    retenirValeurs(d);
    if (d && ONGLETS.indexOf(d.onglet) >= 0 && d.onglet !== onglet) {
      onglet = d.onglet;
      page = 0;
      choisie = null;
    }
    try {
      if (fn) await fn(d || {});
    } catch (e) {
      await alerte(e && e.message ? e.message : String(e));
    }
    return etat();
  });
};

action("etat", null);
action("page", function (d) { page = Math.max(0, Math.floor(Number(d.page) || 0)); });
// Une ligne choisie : le calque à poser, la parcelle ou l'emprise dans le dessin, ou les surfaces d'un revêtement.
action("choisir", async function (d) {
  if (typeof d.id !== "string") return;
  choisie = d.id;
  if (d.id.indexOf("calque:") === 0) { valeurs.calque = d.id.slice(7); return; }
  var m = await planche.modele.lire();
  if (d.id.indexOf("mat:") === 0) {
    var mat = d.id.slice(4);
    var ids = m.faces.filter(function (f) { return f.matiere === mat && horizontale(f); }).map(function (f) { return f.id; });
    if (ids.length) await planche.selection.definir(ids);
    return;
  }
  if (onglet === "volumes") return;
  if (m.faces.some(function (f) { return f.id === d.id; })) await planche.selection.definir([d.id]);
});
action("charger-releve", chargerReleve);
action("tracer-terrain", tracerTerrain);
action("charger-dxf", chargerDxf);
action("poser-courbes", poserCourbes);
action("declarer-parcelle", declarerParcelle);
action("reunir-parcelles", reunirParcelles);
action("retirer-parcelle", retirerParcelle);
action("saisir-coefficients", saisirCoefficients);
action("declarer-hauteurs", declarerHauteurs);
action("extruder", extruder);

var commande = function (nom, ong) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) { page = 0; choisie = null; }
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    await rafraichir();
  });
};
commande("ouvrir-panneau", "terrain");
commande("terrain", "terrain");
commande("courbes", "courbes");
commande("unite-fonciere", "unite");
commande("biotope", "biotope");
commande("volumes", "volumes");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
