// Extension « Plans reçus et présentation » (catalogue des extensions de la Planche, cas 1 de la feuille de route,
// extension n° 8 ; maquette validée le 27 novembre 2026). Trois onglets, un par entrée du catalogue :
//   Calques du DXF (n° 21, D6-F8-037) · Maquette blanche (n° 34, D10-F14-003) · Silhouettes et arbres (n° 29, D8-F12-109).
//
// Rien n'est deviné : chaque calque reçoit un rôle choisi par l'utilisateur (aucun rôle tiré du nom du calque) ; la
// correspondance se garde comme modèle et se reprend au fichier suivant. La maquette blanche se construit après
// relecture, en un seul pas d'annulation ; un contour ouvert est listé, jamais extrudé ; sans hauteur saisie, aucune
// emprise n'est extrudée.

var VERSION = "1.0.0";
var PANNEAU = "plans";
var ONGLETS = ["calques", "maquette", "silhouettes"];
var ROLES = ["courbe", "point", "limite", "emprise", "arbre", "voirie", "ignorer"];
var LIGNES = { courbe: true, limite: true, voirie: true };
var GENRES = ["adulte", "enfant", "fauteuil", "arbre"];
var MAX_SEGMENTS = 60000;
var SEGMENTS_PAR_APPEL = 20000;
var MAX_EMPRISES = 300;
var MAX_MODELES = 20;
var LIGNES_PAR_PAGE = 80;

var onglet = "calques";
var page = 0;
var langue = "fr";
var choisie = null;
// La hauteur de l'adulte vient de la maquette validée (1,70 m) ; les autres hauteurs sont saisies.
var valeurs = { modele: "", hauteur: "", recaler: "oui", genre: "adulte", taille: "1,70", matiere: "" };
// DXF chargé et rôles de ses calques : gardés le temps de la session, jamais dans le dessin (trop gros pour ses données).
var dxf = null;
var roles = {};
var relecture = false;

// Silhouettes graphiques, en fraction de la hauteur (x horizontal, z vertical), tracées dans un plan vertical.
var PROFILS = {
  adulte: [[-0.09, 0], [-0.03, 0], [-0.02, 0.45], [0.02, 0.45], [0.03, 0], [0.09, 0], [0.07, 0.48], [0.12, 0.52], [0.13, 0.78], [0.08, 0.82], [0.04, 0.83], [0.05, 0.88], [0.05, 0.95], [0, 1], [-0.05, 0.95], [-0.05, 0.88], [-0.04, 0.83], [-0.08, 0.82], [-0.13, 0.78], [-0.12, 0.52], [-0.07, 0.48]],
  fauteuil: [[0, 0], [0.62, 0], [0.62, 0.08], [0.5, 0.1], [0.46, 0.42], [0.22, 0.44], [0.24, 0.62], [0.2, 0.8], [0.24, 0.84], [0.25, 0.94], [0.19, 1], [0.13, 0.95], [0.13, 0.85], [0.08, 0.8], [0.06, 0.48], [-0.02, 0.6], [-0.03, 0.57], [0.04, 0.42]],
  arbre: [[-0.04, 0], [0.04, 0], [0.04, 0.35], [0.25, 0.45], [0.32, 0.65], [0.25, 0.88], [0.08, 1], [-0.08, 1], [-0.25, 0.88], [-0.32, 0.65], [-0.25, 0.45], [-0.04, 0.35]],
};
PROFILS.enfant = PROFILS.adulte;

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    onglets: { calques: "Calques du DXF", maquette: "Maquette blanche", silhouettes: "Silhouettes et arbres" },
    champs: { modele: "Garder comme modèle", hauteur: "Hauteur des emprises (m)", recaler: "Recaler à l'origine", genre: "Silhouette", taille: "Hauteur (m)", matiere: "Matière (style)" },
    oui: "oui", non: "non", aucune: "aucune",
    roles: { "": "non affecté", courbe: "courbe de niveau", point: "point coté", limite: "limite", emprise: "emprise bâtie", arbre: "arbre", voirie: "voirie", ignorer: "ignorer" },
    genres: { adulte: "adulte", enfant: "enfant", fauteuil: "personne en fauteuil", arbre: "arbre" },
    col: {
      calques: ["Calque", "Entités", "Rôle"],
      maquette: ["Calque", "Rôle", "Fermés", "Ouverts", "Construit"],
      silhouettes: ["Silhouette", "Hauteur"],
    },
    construit: { volumes: function (h) { return "volumes " + h; }, sansHauteur: "non extrudé (hauteur absente)", lignes: "lignes", liste: "listé", ignore: "ignoré" },
    note: {
      calques: "Un clic sur un calque lui donne son rôle. La correspondance gardée comme modèle est reprise au prochain DXF : aucun geste si les calques sont les mêmes.",
      maquette: "Relisez ce qui sera construit : emprises bâties extrudées à la hauteur saisie, courbes, limites et voirie en lignes ; le reste est listé.",
      silhouettes: "La silhouette est posée au centre de la face sélectionnée, sinon à droite du dessin, comme composant ; la matière choisie l'assortit au style.",
    },
    encart: "Contours ouverts listés sans être extrudés ; tout tient en un seul pas d'annulation.",
    encartSilhouettes: "Silhouettes graphiques à l'échelle : la hauteur est saisie, la matière vient du dessin.",
    vide: {
      calques: "Aucun DXF chargé : « Charger le DXF ».",
      maquette: "Chargez un DXF et donnez un rôle à ses calques, puis « Construire après relecture ».",
      silhouettes: "Aucune silhouette posée dans ce contexte.",
    },
    res: {
      fichier: "Fichier", calques: "Calques", affectes: "Calques affectés", modele: "Modèle repris",
      volumes: "Volumes à construire", lignes: "Segments en lignes", ouverts: "Contours ouverts non extrudés", decalage: "Décalage appliqué",
    },
    roleDe: function (c) { return "Rôle du calque « " + c + " »"; },
    champRole: "Rôle",
    dxfCharge: function (n) { return "DXF chargé : " + n + " calques."; },
    uniteLue: function (u, declaree) { return "Coordonnées converties en mètres depuis l'unité " + (declaree ? "déclarée par le fichier" : "choisie") + " : " + u + "."; },
    arcsDecoupes: function (n) { return n + (n > 1 ? " segments courbes (renflements) découpés" : " segment courbe (renflement) découpé") + " en cordes de 7,5° au plus."; },
    titreUnite: "Unité du fichier DXF",
    champUnite: "Unité non déclarée : choisissez-la",
    unites: { m: "mètre", dm: "décimètre", cm: "centimètre", mm: "millimètre", ft: "pied", in: "pouce" },
    sansUnite: "l'unité des coordonnées n'est pas déclarée et n'a pas été choisie",
    modeleNonGarde: "Correspondance non gardée (place des modèles épuisée) ; la relecture continue.",
    dxfRefuse: "DXF refusé : ",
    dxfVide: "aucune entité dans la section ENTITIES",
    dxfIllisible: "le fichier n'est pas un DXF texte (ASCII) lisible",
    modeleRepris: function (n, k) { return "Correspondance « " + n + " » reprise : " + k + (k > 1 ? " calques." : " calque."); },
    modeleGarde: function (n) { return "Correspondance gardée comme modèle « " + n + " »."; },
    tropModeles: "Vingt modèles au plus : le plus ancien est remplacé.",
    sansDxf: "Chargez d'abord un DXF.",
    sansRole: "Aucun calque n'a de rôle à construire (emprise bâtie, courbe de niveau, limite ou voirie).",
    tropSegments: function (n) { return "Plus de " + n + " segments : ignorez des calques."; },
    tropEmprises: function (n) { return "Plus de " + n + " emprises : découpez le plan."; },
    construite: function (v, l) { return "Maquette blanche construite : " + v + (v > 1 ? " volumes, " : " volume, ") + l + " segments."; },
    nonFormees: function (n) { return n + (n > 1 ? " emprises non formées (contour non plan ou qui se croise)." : " emprise non formée (contour non plan ou qui se croise)."); },
    annule: "Relecture annulée : rien n'est construit.",
    oublie: "DXF et rôles oubliés.",
    nomMaquette: function (f) { return "Maquette blanche — " + f; },
    nomVolume: function (h) { return "Volume — " + h + " m"; },
    tailleInvalide: "La hauteur doit être un nombre positif, en mètres.",
    nomSilhouette: function (g, h) { return "Silhouette — " + g + " " + h + " m"; },
    posee: function (g) { return "Silhouette posée : " + g + "."; },
    op: { roles: "Rôles des calques", construire: "Construire la maquette blanche", silhouette: "Poser une silhouette" },
  },
  en: {
    onglets: { calques: "DXF layers", maquette: "White model", silhouettes: "Figures and trees" },
    champs: { modele: "Keep as a template", hauteur: "Footprint height (m)", recaler: "Move to the origin", genre: "Figure", taille: "Height (m)", matiere: "Material (style)" },
    oui: "yes", non: "no", aucune: "none",
    roles: { "": "not assigned", courbe: "contour line", point: "spot height", limite: "boundary", emprise: "building footprint", arbre: "tree", voirie: "roads", ignorer: "ignore" },
    genres: { adulte: "adult", enfant: "child", fauteuil: "wheelchair user", arbre: "tree" },
    col: {
      calques: ["Layer", "Entities", "Role"],
      maquette: ["Layer", "Role", "Closed", "Open", "Built"],
      silhouettes: ["Figure", "Height"],
    },
    construit: { volumes: function (h) { return "volumes " + h; }, sansHauteur: "not extruded (height missing)", lignes: "lines", liste: "listed", ignore: "ignored" },
    note: {
      calques: "One click on a layer gives it its role. The mapping kept as a template is reused on the next DXF: no step if the layers are the same.",
      maquette: "Review what will be built: building footprints extruded to the typed height, contour lines, boundaries and roads as lines; the rest is listed.",
      silhouettes: "The figure is laid at the centre of the selected face, otherwise to the right of the drawing, as a component; the chosen material matches the style.",
    },
    encart: "Open outlines listed without being extruded; everything fits in a single undo step.",
    encartSilhouettes: "Scaled graphic figures: the height is typed, the material comes from the drawing.",
    vide: {
      calques: "No DXF loaded: « Load the DXF ».",
      maquette: "Load a DXF and give its layers a role, then « Build after review ».",
      silhouettes: "No figure laid in this context.",
    },
    res: {
      fichier: "File", calques: "Layers", affectes: "Layers assigned", modele: "Template reused",
      volumes: "Volumes to build", lignes: "Segments as lines", ouverts: "Open outlines not extruded", decalage: "Offset applied",
    },
    roleDe: function (c) { return "Role of layer « " + c + " »"; },
    champRole: "Role",
    dxfCharge: function (n) { return "DXF loaded: " + n + " layers."; },
    uniteLue: function (u, declaree) { return "Coordinates converted to metres from the " + (declaree ? "unit declared by the file" : "chosen unit") + ": " + u + "."; },
    arcsDecoupes: function (n) { return n + (n > 1 ? " curved segments (bulges) split" : " curved segment (bulge) split") + " into chords of 7.5° at most."; },
    titreUnite: "DXF file unit",
    champUnite: "Unit not declared: choose it",
    unites: { m: "metre", dm: "decimetre", cm: "centimetre", mm: "millimetre", ft: "foot", in: "inch" },
    sansUnite: "the coordinate unit is not declared and was not chosen",
    modeleNonGarde: "Mapping not kept (template space used up); the review continues.",
    dxfRefuse: "DXF refused: ",
    dxfVide: "no entity in the ENTITIES section",
    dxfIllisible: "the file is not a readable text (ASCII) DXF",
    modeleRepris: function (n, k) { return "Mapping « " + n + " » reused: " + k + (k > 1 ? " layers." : " layer."); },
    modeleGarde: function (n) { return "Mapping kept as template « " + n + " »."; },
    tropModeles: "Twenty templates at most: the oldest is replaced.",
    sansDxf: "Load a DXF first.",
    sansRole: "No layer has a role to build (building footprint, contour line, boundary or roads).",
    tropSegments: function (n) { return "More than " + n + " segments: ignore some layers."; },
    tropEmprises: function (n) { return "More than " + n + " footprints: split the plan."; },
    construite: function (v, l) { return "White model built: " + v + (v > 1 ? " volumes, " : " volume, ") + l + " segments."; },
    nonFormees: function (n) { return n + (n > 1 ? " footprints not formed (outline not flat or self-crossing)." : " footprint not formed (outline not flat or self-crossing)."); },
    annule: "Review cancelled: nothing is built.",
    oublie: "DXF and roles forgotten.",
    nomMaquette: function (f) { return "White model — " + f; },
    nomVolume: function (h) { return "Volume — " + h + " m"; },
    tailleInvalide: "The height must be a positive number, in metres.",
    nomSilhouette: function (g, h) { return "Figure — " + g + " " + h + " m"; },
    posee: function (g) { return "Figure laid: " + g + "."; },
    op: { roles: "Layer roles", construire: "Build the white model", silhouette: "Lay a figure" },
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
// Arrondi au plus proche (le demi monte), sans l'écart binaire de toFixed ; milliers séparés par une espace.
var fixe = function (v, n, sep) {
  var f = Math.pow(10, n);
  var s = (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n);
  var p = s.split(".");
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return p.join(sep);
};

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

/** Abscisse au-delà de tout le dessin, contenu des groupes compris : on y trace avant de grouper, sans rien souder. */
async function bordDroit() {
  var m = await planche.modele.lire({ portee: "monde" });
  var x0 = 0;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  return x0 + 2;
}

// ——————————————————————————————————————————————— Lecture du DXF

/** Unités DXF ($INSUNITS) reconnues : facteur vers le mètre. Toute autre valeur (0 compris) n'est pas une déclaration. */
var UNITES = { m: 1, dm: 0.1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };
var INSUNITS = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m", 14: "dm" };
/** Pas angulaire maximal d'un segment courbe (renflement, code 42) découpé en cordes. */
var PAS_ARC = Math.PI / 24;

/**
 * Points d'un segment courbe de a vers b (renflement r = tan(angle / 4), positif dans le sens trigonométrique),
 * sans a et sans b : cordes d'au plus PAS_ARC.
 */
function pointsArc(a, b, r) {
  var dx = b[0] - a[0], dy = b[1] - a[1];
  var c = Math.sqrt(dx * dx + dy * dy);
  var theta = 4 * Math.atan(r);
  if (!(c > 0) || !isFinite(theta) || Math.abs(theta) < 1e-9) return [];
  var h = (c / 2) / Math.tan(theta / 2);
  var cx = (a[0] + b[0]) / 2 - dy / c * h, cy = (a[1] + b[1]) / 2 + dx / c * h;
  var rayon = Math.sqrt((a[0] - cx) * (a[0] - cx) + (a[1] - cy) * (a[1] - cy));
  var a0 = Math.atan2(a[1] - cy, a[0] - cx);
  var n = Math.max(2, Math.ceil(Math.abs(theta) / PAS_ARC));
  var l = [];
  for (var i = 1; i < n; i++) {
    var t = i / n;
    l.push([cx + rayon * Math.cos(a0 + theta * t), cy + rayon * Math.sin(a0 + theta * t), a[2] + (b[2] - a[2]) * t]);
  }
  return l;
}
/** Sommets d'une polyligne avec leurs renflements : les segments courbes sont découpés ; rend aussi leur nombre. */
function deplier(sommets, renflements, ferme) {
  var pts = [];
  var arcs = 0;
  for (var i = 0; i < sommets.length; i++) {
    pts.push(sommets[i]);
    var j = i + 1 < sommets.length ? i + 1 : ferme ? 0 : -1;
    if (j < 0 || !renflements[i]) continue;
    var q = pointsArc(sommets[i], sommets[j], renflements[i]);
    if (q.length) { arcs++; pts = pts.concat(q); }
  }
  return { points: pts, arcs: arcs };
}

/** Lecteur DXF texte : entités comptées par calque ; lignes et polylignes gardées, segments courbes découpés. */
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
  // Unité déclarée dans l'en-tête ($INSUNITS) : null si absente ou sans unité.
  var unite = null;
  for (var u = 0; u + 1 < paires.length; u++) {
    if (paires[u][0] === 9 && paires[u][1] === "$INSUNITS" && paires[u + 1][0] === 70) { unite = INSUNITS[Number(paires[u + 1][1])] || null; break; }
    if (paires[u][0] === 2 && paires[u][1] === "ENTITIES") break;
  }
  var debut = -1;
  for (var j = 0; j + 1 < paires.length; j++) if (paires[j][0] === 0 && paires[j][1] === "SECTION" && paires[j + 1][0] === 2 && paires[j + 1][1] === "ENTITIES") { debut = j + 2; break; }
  if (debut < 0) return { erreur: x.dxfVide };
  var calques = {};
  var calque = function (n) { return calques[n] || (calques[n] = { nom: n, entites: 0, polylignes: [] }); };
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var k = debut;
  var entite = function () {
    var e = { type: paires[k][1], g: [] };
    k++;
    while (k < paires.length && paires[k][0] !== 0) { e.g.push(paires[k]); k++; }
    return e;
  };
  var val = function (e, code) { for (var i = 0; i < e.g.length; i++) if (e.g[i][0] === code) return e.g[i][1]; return null; };
  var n = 0;
  var arcs = 0;
  while (k < paires.length) {
    if (paires[k][0] !== 0) { k++; continue; }
    if (paires[k][1] === "ENDSEC" || paires[k][1] === "EOF") break;
    var e = entite();
    var cq = calque((val(e, 8) || "0").slice(0, 60));
    cq.entites++;
    n++;
    if (e.type === "LINE") {
      cq.polylignes.push({ ferme: false, points: [[num(val(e, 10)), num(val(e, 20)), num(val(e, 30))], [num(val(e, 11)), num(val(e, 21)), num(val(e, 31))]] });
    } else if (e.type === "LWPOLYLINE") {
      var z = num(val(e, 38));
      var pts = [];
      var bul = [];
      e.g.forEach(function (g) {
        if (g[0] === 10) { pts.push([num(g[1]), 0, z]); bul.push(0); }
        else if (g[0] === 20 && pts.length) pts[pts.length - 1][1] = num(g[1]);
        else if (g[0] === 42 && pts.length) bul[bul.length - 1] = num(g[1]);
      });
      var fermeLw = (num(val(e, 70)) & 1) === 1;
      var dl = deplier(pts, bul, fermeLw);
      arcs += dl.arcs;
      if (pts.length >= 2) cq.polylignes.push({ ferme: fermeLw, points: dl.points });
    } else if (e.type === "POLYLINE") {
      var drap = num(val(e, 70));
      var trois = (drap & 8) === 8;
      var elev = num(val(e, 30));
      var sommets = [];
      var renf = [];
      while (k < paires.length && paires[k][0] === 0 && paires[k][1] === "VERTEX") {
        var v = entite();
        if ((num(val(v, 70)) & 16) === 16) continue;
        sommets.push([num(val(v, 10)), num(val(v, 20)), trois ? num(val(v, 30)) : elev]);
        renf.push(num(val(v, 42)));
      }
      if (k < paires.length && paires[k][1] === "SEQEND") entite();
      if ((drap & (16 | 64)) === 0 && sommets.length >= 2) {
        var dp = deplier(sommets, renf, (drap & 1) === 1);
        arcs += dp.arcs;
        cq.polylignes.push({ ferme: (drap & 1) === 1, points: dp.points });
      }
    }
  }
  if (!n) return { erreur: x.dxfVide };
  // Une polyligne fermée dont le dernier sommet répète le premier : le doublon est retiré.
  Object.keys(calques).forEach(function (c) {
    calques[c].polylignes.forEach(function (p) {
      var a = p.points[0], b = p.points[p.points.length - 1];
      if (p.points.length > 3 && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9) { p.points.pop(); p.ferme = true; }
    });
  });
  return { nom: nom, calques: calques, unite: unite, arcs: arcs };
}
/** Met toutes les coordonnées en mètres (facteur de l'unité déclarée ou choisie). */
function versMetres(d, unite) {
  var f = UNITES[unite];
  Object.keys(d.calques).forEach(function (c) {
    d.calques[c].polylignes.forEach(function (p) { p.points = p.points.map(function (q) { return [q[0] * f, q[1] * f, q[2] * f]; }); });
  });
}

var nomsCalques = function () { return dxf ? Object.keys(dxf.calques).sort() : []; };

// ——————————————————————————————————————————————— Rôles des calques (n° 21)

/** Taille sérialisée d'un morceau des modèles, sous la borne d'une valeur de données (4 000 caractères). */
var TAILLE_MORCEAU = 3800;
var MAX_MORCEAUX = 40;
/** Modèles gardés : triplets [nom, calque, rôle] répartis sur des clés « modeles.N » bornées, remis en modèles. */
async function lireModeles() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^modeles\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(8)) - Number(b.slice(8)); });
  var l = [];
  var parNom = {};
  cles.forEach(function (k) {
    (Array.isArray(toutes[k]) ? toutes[k] : []).forEach(function (t) {
      if (!Array.isArray(t) || t.length !== 3) return;
      var m = parNom[t[0]];
      if (!m) { m = parNom[t[0]] = { nom: t[0], roles: {} }; l.push(m); }
      m.roles[t[1]] = t[2];
    });
  });
  return { modeles: l, cles: cles };
}
async function modelesGardes() {
  return (await lireModeles()).modeles;
}
/** Découpe des modèles en morceaux bornés par leur taille sérialisée ; null s'ils ne tiennent pas dans MAX_MORCEAUX. */
function morceauxModeles(l) {
  var morceaux = [];
  var cur = [];
  var taille = 2;
  for (var i = 0; i < l.length; i++) {
    var cs = Object.keys(l[i].roles);
    for (var j = 0; j < cs.length; j++) {
      var t = [l[i].nom, cs[j], l[i].roles[cs[j]]];
      var n = JSON.stringify(t).length;
      if (cur.length && taille + 1 + n > TAILLE_MORCEAU) { morceaux.push(cur); cur = []; taille = 2; }
      taille += (cur.length ? 1 : 0) + n;
      cur.push(t);
    }
  }
  if (cur.length) morceaux.push(cur);
  return morceaux.length > MAX_MORCEAUX ? null : morceaux;
}

async function chargerDxf() {
  var x = tx();
  var f = await planche.fichiers.ouvrir([".dxf"], { flux: true });
  if (!f) return;
  var r = lireDxf(f.nom, await f.texte());
  if (r.erreur) return alerte(x.dxfRefuse + r.erreur);
  // Unité : celle du fichier, sinon un choix explicite ; jamais supposée.
  var unite = r.unite;
  if (!unite) {
    var u = await planche.saisie.demander(x.titreUnite, [
      { id: "unite", libelle: x.champUnite, genre: "choix", valeur: "-", choix: [{ valeur: "-", libelle: "–" }].concat(Object.keys(UNITES).map(function (k) { return { valeur: k, libelle: x.unites[k] }; })) },
    ]);
    if (!u || !UNITES[u.unite]) return alerte(x.dxfRefuse + x.sansUnite);
    unite = u.unite;
  }
  versMetres(r, unite);
  dxf = r;
  roles = {};
  relecture = false;
  choisie = null;
  dxf.modele = null;
  await info(x.dxfCharge(nomsCalques().length));
  if (unite !== "m" || !r.unite) await info(x.uniteLue(x.unites[unite], !!r.unite));
  if (r.arcs) await info(x.arcsDecoupes(r.arcs));
  // Correspondance reprise : le modèle gardé qui couvre le plus de calques de ce fichier.
  var noms = nomsCalques();
  var meilleur = null;
  (await modelesGardes()).forEach(function (m) {
    var k = noms.filter(function (c) { return m.roles && ROLES.indexOf(m.roles[c]) >= 0; }).length;
    if (k && (!meilleur || k > meilleur.k)) meilleur = { m: m, k: k };
  });
  if (meilleur) {
    noms.forEach(function (c) { if (ROLES.indexOf(meilleur.m.roles[c]) >= 0) roles[c] = meilleur.m.roles[c]; });
    dxf.modele = meilleur.m.nom;
    valeurs.modele = meilleur.m.nom;
    await info(x.modeleRepris(meilleur.m.nom, meilleur.k));
  }
}

async function choisirRole(id) {
  var x = tx();
  var c = id.slice(7);
  if (!dxf || !dxf.calques[c]) return;
  choisie = id;
  var r = await planche.saisie.demander(x.roleDe(c).slice(0, 60), [
    { id: "role", libelle: x.champRole, genre: "choix", valeur: roles[c] || "-", choix: [{ valeur: "-", libelle: x.roles[""] }].concat(ROLES.map(function (k) { return { valeur: k, libelle: x.roles[k] }; })) },
  ]);
  if (!r) return;
  if (ROLES.indexOf(r.role) >= 0) roles[c] = r.role;
  else delete roles[c];
}

/** Garde la correspondance sous le nom saisi (le même nom la remplace). */
async function garderModele() {
  var x = tx();
  var nom = texte(valeurs.modele).trim().slice(0, 60);
  if (!nom || !Object.keys(roles).length) return;
  var g = await lireModeles();
  var l = g.modeles.filter(function (m) { return m.nom !== nom; });
  var garde = {};
  Object.keys(roles).slice(0, 80).forEach(function (c) { garde[c] = roles[c]; });
  l.push({ nom: nom, roles: garde });
  if (l.length > MAX_MODELES) { l = l.slice(l.length - MAX_MODELES); await info(x.tropModeles); }
  // Les plus anciens cèdent la place tant que l'ensemble ne tient pas dans les clés bornées.
  var morceaux = morceauxModeles(l);
  while (!morceaux && l.length > 1) { l = l.slice(1); morceaux = morceauxModeles(l); }
  if (!morceaux) return info(x.modeleNonGarde);
  await enUnPas(x.op.roles, async function () {
    for (var i = 0; i < morceaux.length; i++) await planche.donnees.ecrire("projet", "modeles." + i, morceaux[i]);
    for (var k = morceaux.length; k < g.cles.length; k++) await planche.donnees.effacer("projet", "modeles." + k);
  });
  await info(x.modeleGarde(nom));
}

async function versRelecture() {
  var x = tx();
  if (!dxf) return alerte(x.sansDxf);
  // Garder le modèle ne bloque jamais la relecture : un échec d'écriture est signalé, la relecture continue.
  try {
    await garderModele();
  } catch (e) {
    await info(x.modeleNonGarde);
  }
  relecture = true;
  onglet = "maquette";
  page = 0;
  choisie = null;
}

function etatCalques() {
  var x = tx();
  var e = { lignes: [], resultats: [], vide: null };
  if (!dxf) { e.vide = x.vide.calques; return e; }
  nomsCalques().forEach(function (c) {
    var r = roles[c] || "";
    e.lignes.push({ genre: "ligne", id: "calque:" + c, choisi: choisie === "calque:" + c, ton: r === "" ? "gris" : r === "ignorer" ? "ignore" : "", cellules: [c, fixe(dxf.calques[c].entites, 0, ","), x.roles[r]] });
  });
  var affectes = nomsCalques().filter(function (c) { return roles[c]; }).length;
  e.resultats.push({ libelle: x.res.fichier, valeur: dxf.nom }, { libelle: x.res.calques, valeur: String(nomsCalques().length) }, { libelle: x.res.affectes, valeur: affectes + " / " + nomsCalques().length });
  if (dxf.modele) e.resultats.push({ libelle: x.res.modele, valeur: dxf.modele });
  return e;
}

// ——————————————————————————————————————————————— Maquette blanche (n° 34)

/** Ce qui sera construit, calque par calque. */
function plan() {
  var h = lireNombre(valeurs.hauteur);
  var p = { emprises: [], ouverts: 0, segments: [], calques: [], hauteur: h > 0 ? h : null, tous: [] };
  nomsCalques().forEach(function (c) {
    var r = roles[c] || "";
    var l = dxf.calques[c].polylignes;
    var fermes = l.filter(function (y) { return y.ferme && y.points.length >= 3; });
    var ouverts = l.length - fermes.length;
    var quoi;
    if (r === "emprise") {
      quoi = p.hauteur ? "volumes" : "sansHauteur";
      p.ouverts += ouverts;
      if (p.hauteur) fermes.forEach(function (y) { p.emprises.push(y.points); p.tous = p.tous.concat(y.points); });
    } else if (LIGNES[r]) {
      quoi = "lignes";
      l.forEach(function (y) {
        for (var i = 0; i + 1 < y.points.length; i++) p.segments.push([y.points[i], y.points[i + 1]]);
        if (y.ferme) p.segments.push([y.points[y.points.length - 1], y.points[0]]);
        p.tous = p.tous.concat(y.points);
      });
    } else quoi = r === "ignorer" || r === "" ? "ignore" : "liste";
    p.calques.push({ nom: c, role: r, fermes: fermes.length, ouverts: ouverts, quoi: quoi });
  });
  return p;
}

var decalageDe = function (pts) {
  if (valeurs.recaler !== "oui" || !pts.length) return [0, 0];
  var mx = Infinity, my = Infinity;
  pts.forEach(function (q) { mx = Math.min(mx, q[0]); my = Math.min(my, q[1]); });
  return [mx, my];
};

function etatMaquette(sep) {
  var x = tx();
  var e = { lignes: [], resultats: [], vide: null };
  if (!dxf || !relecture) { e.vide = x.vide.maquette; return e; }
  var p = plan();
  var h = p.hauteur ? fixe(p.hauteur, 2, sep) + " m" : "";
  p.calques.forEach(function (c) {
    var t = c.quoi === "volumes" ? x.construit.volumes(h) : x.construit[c.quoi];
    e.lignes.push({ genre: "ligne", ton: c.quoi === "sansHauteur" ? "alerte" : c.quoi === "ignore" ? "gris" : "", cellules: [c.nom, x.roles[c.role], String(c.fermes), String(c.ouverts), t] });
  });
  e.resultats.push({ libelle: x.res.volumes, valeur: String(p.emprises.length) }, { libelle: x.res.lignes, valeur: fixe(p.segments.length, 0, sep) });
  if (p.ouverts) e.resultats.push({ libelle: x.res.ouverts, valeur: String(p.ouverts), ton: "alerte" });
  var dec = decalageDe(p.tous);
  if (dec[0] || dec[1]) e.resultats.push({ libelle: x.res.decalage, valeur: "x −" + fixe(dec[0], 2, sep) + " · y −" + fixe(dec[1], 2, sep) + " m" });
  return e;
}

async function lignesEnLots(segments) {
  for (var i = 0; i < segments.length; i += SEGMENTS_PAR_APPEL) await planche.modele.lignes(segments.slice(i, i + SEGMENTS_PAR_APPEL));
}

async function construire() {
  var x = tx();
  if (!dxf || !relecture) return alerte(x.sansDxf);
  var p = plan();
  if (!p.emprises.length && !p.segments.length) return alerte(x.sansRole);
  if (p.segments.length > MAX_SEGMENTS) return alerte(x.tropSegments(MAX_SEGMENTS));
  if (p.emprises.length > MAX_EMPRISES) return alerte(x.tropEmprises(MAX_EMPRISES));
  var sep = (await planche.unites.lire()).separateur;
  var dec = decalageDe(p.tous);
  var bord = await bordDroit();
  var minx = Infinity;
  p.tous.forEach(function (q) { minx = Math.min(minx, q[0] - dec[0]); });
  var ecart = Math.max(0, bord - minx);
  var pt = function (q) { return [q[0] - dec[0] + ecart, q[1] - dec[1], q[2]]; };
  var nonFormees = 0;
  var g = await enUnPas(x.op.construire, async function () {
    var parts = [];
    // Emprises d'abord : chacune extrudée puis groupée, pour que les lignes posées ensuite ne s'y soudent pas.
    for (var i = 0; i < p.emprises.length; i++) {
      var m0 = await planche.modele.lire();
      var avant = {};
      m0.faces.forEach(function (y) { avant[y.id] = true; });
      var pts = p.emprises[i].map(pt);
      await planche.modele.lignes(pts.map(function (q, k) { return [q, pts[(k + 1) % pts.length]]; }));
      var m1 = await planche.modele.lire();
      var base = m1.faces.filter(function (y) { return !avant[y.id]; })[0];
      if (!base) { nonFormees++; continue; }
      await planche.modele.pousser(base.id, normaleDe(base.points)[2] < 0 ? -p.hauteur : p.hauteur);
      var m2 = await planche.modele.lire();
      parts.push(await planche.modele.grouper(m2.faces.filter(function (y) { return !avant[y.id]; }).map(function (y) { return y.id; }), x.nomVolume(fixe(p.hauteur, 2, sep))));
    }
    if (p.segments.length) {
      var m3 = await planche.modele.lire();
      var avF = {};
      var avA = {};
      m3.faces.forEach(function (y) { avF[y.id] = true; });
      m3.aretes.forEach(function (y) { avA[y.id] = true; });
      await lignesEnLots(p.segments.map(function (s) { return [pt(s[0]), pt(s[1])]; }));
      // Une limite ou une courbe fermée forme une face : on l'efface, la ligne reste.
      var m4 = await planche.modele.lire();
      var faces = m4.faces.filter(function (y) { return !avF[y.id]; }).map(function (y) { return y.id; });
      if (faces.length) await planche.modele.effacer(faces);
      var m5 = await planche.modele.lire();
      parts = parts.concat(m5.aretes.filter(function (y) { return !avA[y.id]; }).map(function (y) { return y.id; }));
    }
    if (!parts.length) return null;
    var g2 = await planche.modele.grouper(parts, x.nomMaquette(dxf.nom.slice(0, 60)));
    if (ecart) await planche.modele.deplacer([g2], [-ecart, 0, 0]);
    var r = {};
    Object.keys(roles).slice(0, 80).forEach(function (c) { r[c] = roles[c]; });
    await planche.donnees.ecrire(g2, "maquette", { fichier: dxf.nom.slice(0, 80), roles: r, hauteur: p.hauteur, volumes: p.emprises.length - nonFormees, segments: p.segments.length, decalage: dec });
    return g2;
  });
  if (!g) return alerte(x.nonFormees(nonFormees));
  relecture = false;
  await planche.selection.definir([g]).catch(function () {});
  await info(x.construite(p.emprises.length - nonFormees, p.segments.length));
  if (nonFormees) await alerte(x.nonFormees(nonFormees));
}

async function annuler() {
  var x = tx();
  if (onglet === "maquette") {
    relecture = false;
    return info(x.annule);
  }
  dxf = null;
  roles = {};
  relecture = false;
  choisie = null;
  return info(x.oublie);
}

// ——————————————————————————————————————————————— Silhouettes et arbres (n° 29)

async function poserSilhouette() {
  var x = tx();
  var genre = GENRES.indexOf(valeurs.genre) >= 0 ? valeurs.genre : "adulte";
  var h = lireNombre(valeurs.taille);
  if (!(h > 0)) return alerte(x.tailleInvalide);
  var sep = (await planche.unites.lire()).separateur;
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  var face = m.faces.filter(function (f) { return sel.indexOf(f.id) >= 0; })[0];
  // Point de pose : centre de la face choisie (à sa plus basse altitude), sinon à droite du dessin.
  var cible;
  if (face) {
    var c = [0, 0];
    face.points.forEach(function (q) { c[0] += q[0] / face.points.length; c[1] += q[1] / face.points.length; });
    cible = [c[0], c[1], Math.min.apply(null, face.points.map(function (q) { return q[2]; }))];
  }
  var bord = await bordDroit();
  if (!cible) cible = [bord, 0, 0];
  var ecart = [bord + 2 - cible[0], 0, 0];
  var profil = PROFILS[genre].map(function (q) { return [cible[0] + ecart[0] + q[0] * h, cible[1], cible[2] + q[1] * h]; });
  var avant = {};
  m.faces.forEach(function (f) { avant[f.id] = true; });
  var g = await enUnPas(x.op.silhouette, async function () {
    await planche.modele.lignes(profil.map(function (q, k) { return [q, profil[(k + 1) % profil.length]]; }));
    var m2 = await planche.modele.lire();
    var faces = m2.faces.filter(function (f) { return !avant[f.id]; }).map(function (f) { return f.id; });
    var g2 = await planche.modele.composant(faces, x.nomSilhouette(x.genres[genre], fixe(h, 2, sep)));
    await planche.modele.deplacer([g2], [-ecart[0], 0, 0]);
    if (valeurs.matiere) await planche.matieres.appliquer([g2], valeurs.matiere);
    await planche.donnees.ecrire(g2, "silhouette", { genre: genre, hauteur: h });
    return g2;
  });
  await planche.selection.definir([g]).catch(function () {});
  return info(x.posee(x.genres[genre]));
}

async function etatSilhouettes(sep) {
  var x = tx();
  var e = { lignes: [], resultats: [], vide: null };
  var m = await planche.modele.lire();
  for (var i = 0; i < m.objets.length; i++) {
    var d = await planche.donnees.lire(m.objets[i].id, "silhouette");
    if (d && GENRES.indexOf(d.genre) >= 0) e.lignes.push({ genre: "ligne", id: m.objets[i].id, choisi: choisie === m.objets[i].id, cellules: [x.genres[d.genre], fixe(d.hauteur, 2, sep) + " m"] });
  }
  if (!e.lignes.length) e.vide = x.vide.silhouettes;
  return e;
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var formulaire = [];
  var ouiNon = [{ valeur: "oui", libelle: x.oui }, { valeur: "non", libelle: x.non }];
  var e;
  if (onglet === "calques") {
    e = etatCalques();
    if (dxf) formulaire.push({ id: "modele", libelle: x.champs.modele, valeur: valeurs.modele });
  } else if (onglet === "maquette") {
    formulaire.push({ id: "hauteur", libelle: x.champs.hauteur, valeur: valeurs.hauteur }, { id: "recaler", libelle: x.champs.recaler, valeur: valeurs.recaler, choix: ouiNon });
    e = etatMaquette(sep);
  } else {
    var mats = await planche.matieres.lire();
    if (valeurs.matiere && !mats.some(function (y) { return y.id === valeurs.matiere; })) valeurs.matiere = "";
    formulaire.push(
      { id: "genre", libelle: x.champs.genre, valeur: valeurs.genre, choix: GENRES.map(function (k) { return { valeur: k, libelle: x.genres[k] }; }) },
      { id: "taille", libelle: x.champs.taille, valeur: valeurs.taille },
      { id: "matiere", libelle: x.champs.matiere, valeur: valeurs.matiere, choix: [{ valeur: "", libelle: x.aucune }].concat(mats.map(function (y) { return { valeur: y.id, libelle: y.nom }; })) }
    );
    e = await etatSilhouettes(sep);
  }
  var lignes = e.lignes;
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    note: x.note[onglet],
    formulaire: formulaire,
    resultats: e.resultats,
    encart: onglet === "silhouettes" ? x.encartSilhouettes : x.encart,
    colonnes: x.col[onglet],
    lignes: lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    choisie: choisie,
    pied: null,
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
// Une ligne choisie : un calque reçoit son rôle ; une silhouette est sélectionnée dans le dessin.
action("choisir", async function (d) {
  if (typeof d.id !== "string") return;
  if (d.id.indexOf("calque:") === 0) return choisirRole(d.id);
  choisie = d.id;
  var m = await planche.modele.lire();
  if (m.objets.some(function (o) { return o.id === d.id; })) await planche.selection.definir([d.id]);
});
action("charger-dxf", chargerDxf);
action("relire", versRelecture);
action("construire", construire);
action("annuler", annuler);
action("poser-silhouette", poserSilhouette);

var commande = function (nom, ong) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) { page = 0; choisie = null; }
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    await rafraichir();
  });
};
commande("ouvrir-panneau", "calques");
commande("calques", "calques");
commande("maquette", "maquette");
commande("silhouettes", "silhouettes");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
