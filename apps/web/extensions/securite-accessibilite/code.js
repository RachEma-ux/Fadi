// Extension « Sécurité et accessibilité » (catalogue des extensions de la Planche, cas 3 de la feuille de route, lot 5 ;
// protocole 1.7). Cinq onglets :
//   Garde-corps (n° 9, D4-F5-014) · Rives et trémies (n° 14, D4-F5-074) · Circulations (n° 13, D4-S-008) ·
//   Sanitaire accessible (n° 17, D4-F5-100) · Stationnement (n° 26, D9-F15e-018).
//
// Les objets se désignent par leurs balises (aucune n'est imposée). Toute valeur exigée (hauteur, largeur, diamètre,
// dimensions, nombre de places) est saisie avec sa source : sans elle, le contrôle est « non évalué ». Rien n'est
// corrigé : l'extension mesure et montre, l'utilisateur décide.

var VERSION = "1.0.0";
var PANNEAU = "securite";
var ONGLETS = ["garde-corps", "rives", "circulations", "sanitaire", "stationnement"];
var LIGNES_PAR_PAGE = 80;
var TOL = 1e-6;
var PAS_CERCLE = 0.05; // pas de recherche du cercle libre (m) : une précision de mesure, pas une exigence

var onglet = "garde-corps";
var page = 0;
var langue = "fr";
var choisie = null;
var valeurs = {
  gardes: "", hauteurGarde: "", zoneEscalade: "", sourceGarde: "",
  dalles: "", protections: "", distance: "",
  circulations: "", largeur: "", sourceCirculation: "",
  sanitaires: "", appareils: "", diametre: "", sourceSanitaire: "",
  places: "", placesPmr: "", longueurPlace: "", largeurPlace: "", largeurPmr: "", nombrePmr: "", sourcePlace: "",
};

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: {
      gardes: "Balises des garde-corps", hauteurGarde: "Hauteur protégée exigée (m)", zoneEscalade: "Hauteur de la zone escaladable depuis le sol (m)", sourceGarde: "Source des valeurs",
      dalles: "Balises des dalles", protections: "Balises des protections (garde-corps, murs, allèges)", distance: "Distance de recherche d'une protection (m)",
      circulations: "Balises des circulations", largeur: "Largeur minimale exigée (m)", sourceCirculation: "Source de la largeur",
      sanitaires: "Balises des sanitaires", appareils: "Balises des appareils et obstacles", diametre: "Diamètre du cercle de giration exigé (m)", sourceSanitaire: "Source du diamètre",
      places: "Balises des places", placesPmr: "Balises des places adaptées", longueurPlace: "Longueur minimale d'une place (m)", largeurPlace: "Largeur minimale d'une place (m)", largeurPmr: "Largeur minimale d'une place adaptée (m)", nombrePmr: "Nombre de places adaptées exigé", sourcePlace: "Source des valeurs",
    },
    col: {
      "garde-corps": ["Garde-corps", "Hauteur protégée", "Prise escaladable", "État"],
      rives: ["Dalle", "Bord", "Longueur", "Protection"],
      circulations: ["Circulation", "Passage le plus étroit", "Exigée", "État"],
      sanitaire: ["Sanitaire", "Plus grand cercle libre", "Exigé", "État"],
      stationnement: ["Place", "Longueur", "Largeur", "État"],
    },
    note: {
      "garde-corps": "Hauteur protégée : du sol sous le garde-corps (premier objet touché par un rayon vers le bas) au sommet du garde-corps. Prise escaladable : face horizontale du garde-corps dans la zone saisie au-dessus du sol.",
      rives: "Bords des faces supérieures des dalles : contour (rive) et trous (trémies). Un bord prolongé par un autre sol n'est pas une rive ; un bord est protégé quand un objet de protection se trouve à la distance saisie.",
      circulations: "Largeur : plus courte traversée de la face de sol de chaque circulation, mesurée perpendiculairement à ses bords, tous les 25 cm.",
      sanitaire: "Plus grand cercle qui tient sur le sol du sanitaire sans toucher ses bords ni l'emprise des appareils (recherche tous les 5 cm).",
      stationnement: "Dimensions de chaque place : longueur selon son plus grand côté, largeur perpendiculaire. Les places adaptées sont comptées à part.",
    },
    vides: {
      "garde-corps": "Nommez les balises des garde-corps.", rives: "Nommez les balises des dalles.", circulations: "Nommez les balises des circulations.", sanitaire: "Nommez les balises des sanitaires.", stationnement: "Nommez les balises des places.",
      aucun: "Aucun objet ne porte ces balises.",
    },
    res: {
      gardes: "Garde-corps contrôlés", sousHauteur: "Sous la hauteur exigée", prises: "Prises escaladables",
      bords: "Bords libres", sansProtection: "Bords sans protection",
      circulations: "Circulations contrôlées", etroites: "Plus étroites que l'exigé",
      sanitaires: "Sanitaires contrôlés",
      places: "Places", placesPmr: "Places adaptées", horsCote: "Places hors dimensions", source: "Source",
    },
    etats: { ok: "conforme", alerte: "insuffisant", nonEvalue: "non évalué" },
    protegee: "oui", nonProtegee: "aucune",
    rive: function (k) { return "Rive " + k; }, tremie: function (k) { return "Trémie " + k; },
    aucune: "aucune", prise: function (h) { return "à " + h; },
    nonEvalue: "non évalué",
    pmr: " (adaptée)",
  },
  en: {
    champs: {
      gardes: "Tags of the guardrails", hauteurGarde: "Required protected height (m)", zoneEscalade: "Height of the climbable zone above the floor (m)", sourceGarde: "Source of the values",
      dalles: "Tags of the slabs", protections: "Tags of the protections (guardrails, walls, parapets)", distance: "Search distance for a protection (m)",
      circulations: "Tags of the circulation areas", largeur: "Required minimum width (m)", sourceCirculation: "Source of the width",
      sanitaires: "Tags of the toilets", appareils: "Tags of the fixtures and obstacles", diametre: "Required turning circle diameter (m)", sourceSanitaire: "Source of the diameter",
      places: "Tags of the parking spaces", placesPmr: "Tags of the accessible spaces", longueurPlace: "Minimum space length (m)", largeurPlace: "Minimum space width (m)", largeurPmr: "Minimum accessible space width (m)", nombrePmr: "Required number of accessible spaces", sourcePlace: "Source of the values",
    },
    col: {
      "garde-corps": ["Guardrail", "Protected height", "Climbable hold", "Status"],
      rives: ["Slab", "Edge", "Length", "Protection"],
      circulations: ["Circulation", "Narrowest passage", "Required", "Status"],
      sanitaire: ["Toilet", "Largest free circle", "Required", "Status"],
      stationnement: ["Space", "Length", "Width", "Status"],
    },
    note: {
      "garde-corps": "Protected height: from the floor under the guardrail (first object hit by a downward ray) to the top of the guardrail. Climbable hold: horizontal face of the guardrail within the entered zone above the floor.",
      rives: "Edges of the top faces of the slabs: outline (edge) and holes (openings). An edge continued by another floor is not a free edge; an edge is protected when a protection object lies within the entered distance.",
      circulations: "Width: shortest crossing of the floor face of each circulation area, measured perpendicular to its edges, every 25 cm.",
      sanitaire: "Largest circle that fits on the toilet floor without touching its edges or the fixtures' footprints (searched every 5 cm).",
      stationnement: "Dimensions of each space: length along its longest side, width perpendicular to it. Accessible spaces are counted separately.",
    },
    vides: {
      "garde-corps": "Name the tags of the guardrails.", rives: "Name the tags of the slabs.", circulations: "Name the tags of the circulation areas.", sanitaire: "Name the tags of the toilets.", stationnement: "Name the tags of the parking spaces.",
      aucun: "No object carries these tags.",
    },
    res: {
      gardes: "Guardrails checked", sousHauteur: "Below the required height", prises: "Climbable holds",
      bords: "Free edges", sansProtection: "Edges without protection",
      circulations: "Circulation areas checked", etroites: "Narrower than required",
      sanitaires: "Toilets checked",
      places: "Spaces", placesPmr: "Accessible spaces", horsCote: "Spaces out of dimension", source: "Source",
    },
    etats: { ok: "compliant", alerte: "insufficient", nonEvalue: "not assessed" },
    protegee: "yes", nonProtegee: "none",
    rive: function (k) { return "Edge " + k; }, tremie: function (k) { return "Opening " + k; },
    aucune: "none", prise: function (h) { return "at " + h; },
    nonEvalue: "not assessed",
    pmr: " (accessible)",
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var alerte = function (m) { return planche.message.afficher(m, "alerte"); };
var texte = function (v) { return v === undefined || v === null ? "" : String(v); };
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(",", ".");
  return t === "" || !/^-?\d*\.?\d+$/.test(t) ? NaN : Number(t);
};
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var metres = function (v, sep) { return fixe(v, 2, sep) + " m"; };
var noms = function (s) { return texte(s).split(/[,;]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); };
var positif = function (s) { var n = lireNombre(s); return n > 0 ? n : null; };
var nomObjet = function (o) { return o.nom || o.id; };

// ——————————————————————————————————————————————— Lecture des objets placés (protocole 1.7)

/** Objets portant une balise, avec la boîte englobante et les faces (normale, trous) de chacun, dans le modèle. */
async function lecture() {
  var balises = {};
  (await planche.balises.lire()).forEach(function (b) { balises[b.id] = b.nom.toLowerCase(); });
  var objets = (await planche.objets.lire()).objets.map(function (o) { return { id: o.id, nom: o.nom, parent: o.parent, balise: o.balise ? balises[o.balise] : null, faces: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; });
  var parId = {};
  objets.forEach(function (o) { parId[o.id] = o; });
  var monde = await planche.modele.lire({ portee: "monde", details: true });
  monde.faces.forEach(function (f) {
    f.chemin.forEach(function (id) {
      var o = parId[id];
      if (!o) return;
      o.faces.push(f);
      f.points.forEach(function (p) { for (var k = 0; k < 3; k++) { if (p[k] < o.min[k]) o.min[k] = p[k]; if (p[k] > o.max[k]) o.max[k] = p[k]; } });
    });
  });
  return { objets: objets, faces: monde.faces };
}
var tagues = function (lu, liste) { return lu.objets.filter(function (o) { return o.balise && liste.indexOf(o.balise) >= 0 && o.faces.length; }); };
/** Face supérieure d'un objet : la plus haute des faces tournées vers le haut. */
var dessus = function (o) {
  var r = null;
  o.faces.forEach(function (f) { if (f.normale[2] > 0.9 && (!r || f.points[0][2] > r.points[0][2])) r = f; });
  return r;
};

// ——————————————————————————————————————————————— Géométrie plane

var dans = function (x, y, poly) {
  var c = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
var distSegment = function (x, y, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  var t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
var distContour = function (x, y, poly) {
  var d = Infinity;
  for (var i = 0; i < poly.length; i++) d = Math.min(d, distSegment(x, y, poly[i], poly[(i + 1) % poly.length]));
  return d;
};
/** Distance du point (x, y) au premier bord du polygone dans la direction (dx, dy) ; Infinity si aucun. */
var traversee = function (x, y, dx, dy, contours) {
  var t = Infinity;
  contours.forEach(function (poly) {
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var ex = b[0] - a[0], ey = b[1] - a[1];
      var den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      var s = ((a[0] - x) * ey - (a[1] - y) * ex) / den;
      var u = ((a[0] - x) * dy - (a[1] - y) * dx) / den;
      if (s > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && s < t) t = s;
    }
  });
  return t;
};
var plan = function (pts) { return pts.map(function (p) { return [p[0], p[1]]; }); };

// ——————————————————————————————————————————————— Garde-corps (n° 9)

async function gardeCorps() {
  var G = noms(valeurs.gardes);
  if (!G.length) return { vide: "garde-corps" };
  var lu = await lecture();
  var gardes = tagues(lu, G);
  if (!gardes.length) return { vide: "aucun" };
  var idsGarde = {};
  gardes.forEach(function (g) { idsGarde[g.id] = true; });
  var autres = lu.objets.filter(function (o) { return o.parent === null && !idsGarde[o.id] && o.faces.length; }).map(function (o) { return o.id; });
  var rayons = gardes.map(function (g) { return { origine: [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2, g.min[2] + 0.01], direction: [0, 0, -1] }; });
  var impacts = autres.length ? (await planche.geometrie.rayon(rayons, { objets: autres, distanceMax: 1 })).impacts : rayons.map(function () { return null; });
  var exigee = lireNombre(valeurs.hauteurGarde), zone = lireNombre(valeurs.zoneEscalade);
  var source = !!valeurs.sourceGarde.trim();
  return {
    lignes: gardes.map(function (g, k) {
      var sol = impacts[k] ? impacts[k].point[2] : g.min[2];
      var hauteur = g.max[2] - sol;
      var prise = null;
      if (zone > 0) g.faces.forEach(function (f) {
        var h = f.points[0][2] - sol;
        if (f.normale[2] > 0.9 && h > 0.01 && h <= zone + 1e-9 && f.points[0][2] < g.max[2] - 0.01 && (prise === null || h < prise)) prise = h;
      });
      var etat = source && exigee > 0 ? (hauteur >= exigee - 1e-9 && prise === null ? "ok" : "alerte") : "nonEvalue";
      return { o: g, hauteur: hauteur, prise: prise, zone: zone > 0, etat: etat };
    }),
  };
}

// ——————————————————————————————————————————————— Rives et trémies (n° 14)

async function rives() {
  var D = noms(valeurs.dalles), P = noms(valeurs.protections);
  if (!D.length) return { vide: "rives" };
  var lu = await lecture();
  var dalles = tagues(lu, D);
  if (!dalles.length) return { vide: "aucun" };
  var protections = P.length ? tagues(lu, P) : [];
  var distance = lireNombre(valeurs.distance);
  var evalue = distance >= 0 && P.length > 0;
  var sols = lu.faces.filter(function (f) { return f.normale[2] > 0.9; });
  var lignes = [];
  dalles.forEach(function (d) {
    var f = dessus(d);
    if (!f) return;
    var z = f.points[0][2];
    var contours = [{ pts: f.points, trou: false }].concat((f.contoursTrous || []).map(function (t) { return { pts: t, trou: true }; }));
    var kr = 0, kt = 0;
    contours.forEach(function (c) {
      var poly = plan(c.pts);
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length];
        var l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 1e-3) continue;
        var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // Côté extérieur du bord : celui qui n'est pas sur la dalle.
        var n = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
        var ext = dans(m[0] + n[0] * 0.05, m[1] + n[1] * 0.05, plan(f.points)) && !(f.contoursTrous || []).some(function (t) { return dans(m[0] + n[0] * 0.05, m[1] + n[1] * 0.05, plan(t)); }) ? [-n[0], -n[1]] : n;
        var q = [m[0] + ext[0] * 0.05, m[1] + ext[1] * 0.05];
        // Un autre sol au même niveau prolonge le bord : ce n'est pas une rive.
        var prolonge = sols.some(function (s) { return s !== f && Math.abs(s.points[0][2] - z) < 0.02 && dans(q[0], q[1], plan(s.points)) && !(s.contoursTrous || []).some(function (t) { return dans(q[0], q[1], plan(t)); }); });
        if (prolonge) continue;
        var protege = evalue && protections.some(function (p) {
          return m[0] >= p.min[0] - distance && m[0] <= p.max[0] + distance && m[1] >= p.min[1] - distance && m[1] <= p.max[1] + distance && p.max[2] > z + 0.01 && p.min[2] <= z + distance + 0.01;
        });
        lignes.push({ o: d, bord: c.trou ? "tremie" : "rive", rang: c.trou ? ++kt : ++kr, longueur: l, etat: !evalue ? "nonEvalue" : protege ? "ok" : "alerte" });
      }
    });
  });
  return { lignes: lignes, evalue: evalue };
}

// ——————————————————————————————————————————————— Circulations (n° 13)

async function circulations() {
  var C = noms(valeurs.circulations);
  if (!C.length) return { vide: "circulations" };
  var lu = await lecture();
  var objets = tagues(lu, C);
  if (!objets.length) return { vide: "aucun" };
  var exigee = lireNombre(valeurs.largeur), source = !!valeurs.sourceCirculation.trim();
  return {
    lignes: objets.map(function (o) {
      var f = dessus(o);
      if (!f) return null;
      var contours = [plan(f.points)].concat((f.contoursTrous || []).map(plan));
      var ext = contours[0];
      var sens = (function () { var s = 0; for (var i = 0; i < ext.length; i++) { var p = ext[i], q = ext[(i + 1) % ext.length]; s += p[0] * q[1] - q[0] * p[1]; } return s >= 0 ? 1 : -1; })();
      var min = Infinity;
      contours.forEach(function (poly, k) {
        for (var i = 0; i < poly.length; i++) {
          var a = poly[i], b = poly[(i + 1) % poly.length];
          var l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (l < 1e-3) continue;
          // Normale vers l'intérieur de la surface (gauche d'un contour direct ; inversée pour un trou).
          var nx = (-(b[1] - a[1]) / l) * sens * (k === 0 ? 1 : -1), ny = ((b[0] - a[0]) / l) * sens * (k === 0 ? 1 : -1);
          var n = Math.max(1, Math.ceil(l / 0.25));
          for (var j = 0; j <= n; j++) {
            var t = (j + 0.5) / (n + 1);
            var x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
            var d = traversee(x, y, nx, ny, contours);
            if (d < min) min = d;
          }
        }
      });
      var etat = source && exigee > 0 ? (min >= exigee - 1e-9 ? "ok" : "alerte") : "nonEvalue";
      return { o: o, largeur: min, etat: etat };
    }).filter(Boolean),
    exigee: source && exigee > 0 ? exigee : null,
  };
}

// ——————————————————————————————————————————————— Sanitaire accessible (n° 17)

async function sanitaires() {
  var S = noms(valeurs.sanitaires), A = noms(valeurs.appareils);
  if (!S.length) return { vide: "sanitaire" };
  var lu = await lecture();
  var objets = tagues(lu, S);
  if (!objets.length) return { vide: "aucun" };
  var appareils = A.length ? tagues(lu, A) : [];
  var exige = lireNombre(valeurs.diametre), source = !!valeurs.sourceSanitaire.trim();
  return {
    lignes: objets.map(function (o) {
      var f = dessus(o);
      if (!f) return null;
      var ext = plan(f.points), trous = (f.contoursTrous || []).map(plan);
      var z = f.points[0][2];
      var obstacles = appareils.filter(function (a) { return a.max[2] > z + 0.01 && a.min[0] < o.max[0] && a.max[0] > o.min[0] && a.min[1] < o.max[1] && a.max[1] > o.min[1]; }).map(function (a) { return [[a.min[0], a.min[1]], [a.max[0], a.min[1]], [a.max[0], a.max[1]], [a.min[0], a.max[1]]]; });
      var mieux = 0;
      for (var x = o.min[0] + PAS_CERCLE / 2; x < o.max[0]; x += PAS_CERCLE) {
        for (var y = o.min[1] + PAS_CERCLE / 2; y < o.max[1]; y += PAS_CERCLE) {
          if (!dans(x, y, ext) || trous.some(function (t) { return dans(x, y, t); }) || obstacles.some(function (r) { return dans(x, y, r); })) continue;
          var r = distContour(x, y, ext);
          trous.forEach(function (t) { r = Math.min(r, distContour(x, y, t)); });
          obstacles.forEach(function (t) { r = Math.min(r, distContour(x, y, t)); });
          if (r > mieux) mieux = r;
        }
      }
      var diametre = 2 * mieux;
      var etat = source && exige > 0 ? (diametre >= exige - PAS_CERCLE ? "ok" : "alerte") : "nonEvalue";
      return { o: o, diametre: diametre, etat: etat };
    }).filter(Boolean),
    exige: source && exige > 0 ? exige : null,
  };
}

// ——————————————————————————————————————————————— Stationnement (n° 26)

async function stationnement() {
  var P = noms(valeurs.places), PMR = noms(valeurs.placesPmr);
  if (!P.length && !PMR.length) return { vide: "stationnement" };
  var lu = await lecture();
  var places = tagues(lu, P.concat(PMR));
  if (!places.length) return { vide: "aucun" };
  var lmin = lireNombre(valeurs.longueurPlace), larg = lireNombre(valeurs.largeurPlace), largPmr = lireNombre(valeurs.largeurPmr);
  var source = !!valeurs.sourcePlace.trim();
  var lignes = places.map(function (o) {
    var f = dessus(o);
    if (!f) return null;
    var pts = plan(f.points);
    var u = null, lu2 = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > lu2) { lu2 = l; u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
    }
    var su = pts.map(function (p) { return p[0] * u[0] + p[1] * u[1]; }), sv = pts.map(function (p) { return -p[0] * u[1] + p[1] * u[0]; });
    var longueur = Math.max.apply(null, su) - Math.min.apply(null, su), largeur = Math.max.apply(null, sv) - Math.min.apply(null, sv);
    var pmr = PMR.indexOf(o.balise) >= 0;
    var lexige = pmr ? largPmr : larg;
    var etat = source && lmin > 0 && lexige > 0 ? (longueur >= lmin - 1e-9 && largeur >= lexige - 1e-9 ? "ok" : "alerte") : "nonEvalue";
    return { o: o, longueur: longueur, largeur: largeur, pmr: pmr, etat: etat };
  }).filter(Boolean);
  return { lignes: lignes };
}

// ——————————————————————————————————————————————— Panneau

var CHAMPS = {
  "garde-corps": ["gardes", "hauteurGarde", "zoneEscalade", "sourceGarde"],
  rives: ["dalles", "protections", "distance"],
  circulations: ["circulations", "largeur", "sourceCirculation"],
  sanitaire: ["sanitaires", "appareils", "diametre", "sourceSanitaire"],
  stationnement: ["places", "placesPmr", "longueurPlace", "largeurPlace", "largeurPmr", "nombrePmr", "sourcePlace"],
};

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var e = { lignes: [], vide: null, resultats: [], pied: null };
  var ton = function (k) { return k === "ok" ? "ok" : k === "alerte" ? "alerte" : "gris"; };
  var ligne = function (l, cellules) { return { genre: "ligne", id: l.o.id, choisi: choisie === l.o.id, ton: ton(l.etat), cellules: cellules }; };
  var compte = function (ls, k) { return ls.filter(function (l) { return l.etat === k; }).length; };
  var r;
  if (onglet === "garde-corps") {
    r = await gardeCorps();
    if (!r.vide) {
      e.lignes = r.lignes.map(function (l) { return ligne(l, [nomObjet(l.o), metres(l.hauteur, sep), !l.zone ? x.nonEvalue : l.prise === null ? x.aucune : x.prise(metres(l.prise, sep)), x.etats[l.etat]]); });
      e.resultats.push({ libelle: x.res.gardes, valeur: String(r.lignes.length) });
      e.resultats.push({ libelle: x.res.sousHauteur, valeur: r.lignes.some(function (l) { return l.etat !== "nonEvalue"; }) ? String(compte(r.lignes, "alerte")) : x.nonEvalue, ton: compte(r.lignes, "alerte") ? "alerte" : "" });
      e.resultats.push({ libelle: x.res.source, valeur: valeurs.sourceGarde.trim() ? valeurs.sourceGarde.trim().slice(0, 60) : x.nonEvalue, ton: valeurs.sourceGarde.trim() ? "" : "limite" });
    }
  } else if (onglet === "rives") {
    r = await rives();
    if (!r.vide) {
      e.lignes = r.lignes.map(function (l) { return ligne(l, [nomObjet(l.o), l.bord === "tremie" ? x.tremie(l.rang) : x.rive(l.rang), metres(l.longueur, sep), l.etat === "nonEvalue" ? x.nonEvalue : l.etat === "ok" ? x.protegee : x.nonProtegee]); });
      e.resultats.push({ libelle: x.res.bords, valeur: String(r.lignes.length) });
      e.resultats.push({ libelle: x.res.sansProtection, valeur: r.evalue ? String(compte(r.lignes, "alerte")) : x.nonEvalue, ton: r.evalue ? (compte(r.lignes, "alerte") ? "alerte" : "ok") : "limite" });
    }
  } else if (onglet === "circulations") {
    r = await circulations();
    if (!r.vide) {
      e.lignes = r.lignes.map(function (l) { return ligne(l, [nomObjet(l.o), metres(l.largeur, sep), r.exigee === null ? x.nonEvalue : metres(r.exigee, sep), x.etats[l.etat]]); });
      e.resultats.push({ libelle: x.res.circulations, valeur: String(r.lignes.length) });
      e.resultats.push({ libelle: x.res.etroites, valeur: r.exigee === null ? x.nonEvalue : String(compte(r.lignes, "alerte")), ton: r.exigee === null ? "limite" : compte(r.lignes, "alerte") ? "alerte" : "ok" });
    }
  } else if (onglet === "sanitaire") {
    r = await sanitaires();
    if (!r.vide) {
      e.lignes = r.lignes.map(function (l) { return ligne(l, [nomObjet(l.o), "Ø " + metres(l.diametre, sep), r.exige === null ? x.nonEvalue : "Ø " + metres(r.exige, sep), x.etats[l.etat]]); });
      e.resultats.push({ libelle: x.res.sanitaires, valeur: String(r.lignes.length) });
      e.resultats.push({ libelle: x.res.source, valeur: valeurs.sourceSanitaire.trim() ? valeurs.sourceSanitaire.trim().slice(0, 60) : x.nonEvalue, ton: valeurs.sourceSanitaire.trim() ? "" : "limite" });
    }
  } else {
    r = await stationnement();
    if (!r.vide) {
      e.lignes = r.lignes.map(function (l) { return ligne(l, [nomObjet(l.o) + (l.pmr ? x.pmr : ""), metres(l.longueur, sep), metres(l.largeur, sep), x.etats[l.etat]]); });
      var pmr = r.lignes.filter(function (l) { return l.pmr; }).length;
      var exigees = lireNombre(valeurs.nombrePmr);
      var src = !!valeurs.sourcePlace.trim();
      e.resultats.push({ libelle: x.res.places, valeur: String(r.lignes.length) });
      e.resultats.push({ libelle: x.res.placesPmr, valeur: String(pmr) + (src && exigees >= 0 ? " / " + exigees : ""), ton: src && exigees >= 0 ? (pmr >= exigees ? "ok" : "alerte") : "" });
      e.resultats.push({ libelle: x.res.horsCote, valeur: r.lignes.some(function (l) { return l.etat !== "nonEvalue"; }) ? String(compte(r.lignes, "alerte")) : x.nonEvalue, ton: compte(r.lignes, "alerte") ? "alerte" : "" });
    }
  }
  if (r && r.vide) e.vide = x.vides[r.vide];
  var lignes = e.lignes;
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    note: x.note[onglet],
    formulaire: CHAMPS[onglet].map(function (k) { return { id: k, libelle: x.champs[k], valeur: valeurs[k] }; }),
    resultats: e.resultats,
    encart: "",
    colonnes: x.col[onglet],
    lignes: lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    pied: e.pied,
    vide: e.vide,
    page: page,
    pages: pages,
    choisie: choisie,
    version: VERSION,
  };
}
async function rafraichir() {
  await planche.panneau.envoyer(PANNEAU, await etat());
}

var retenirValeurs = function (d) {
  var v = d && d.valeurs;
  if (!v || typeof v !== "object") return;
  Object.keys(valeurs).forEach(function (k) { if (typeof v[k] === "string") valeurs[k] = v[k].slice(0, 160); });
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
action("choisir", async function (d) {
  var id = texte(d.id).slice(0, 200);
  if (!id) return;
  choisie = id;
  await planche.selection.definir([id]);
});

var commande = function (nom, ong) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) { page = 0; choisie = null; }
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    await rafraichir();
  });
};
commande("ouvrir-panneau", "garde-corps");
commande("garde-corps", "garde-corps");
commande("accessibilite", "circulations");
commande("stationnement", "stationnement");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
