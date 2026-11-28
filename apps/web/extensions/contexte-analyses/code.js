// Extension « Contexte et analyses » (catalogue des extensions de la Planche, cas 3 de la feuille de route, lot 4 ;
// protocole 1.6). Trois onglets :
//   Contexte bâti (n° 12, D6-F8-059) · Couleurs d'analyse (n° 27, D9-F9b-008) · Vitrage par façade (n° 28, D9-F9b-002).
//
// Le contexte vient d'un fichier fourni par l'utilisateur (GeoJSON en WGS 84 ou OSM), posé depuis l'Emplacement saisi ;
// une hauteur absente n'est jamais devinée. Les couleurs suivent une palette lisible par les daltoniens, et la légende
// donne aussi le numéro et l'intervalle de chaque classe. Le ratio de vitrage compare à une part saisie avec sa source ;
// sans elle, il est « non évalué ».

var VERSION = "1.0.0";
var PANNEAU = "analyses";
var ONGLETS = ["contexte", "couleurs", "vitrage"];
var VALEURS_ANALYSE = ["orientation", "hauteur", "fichier"];
var MAX_BATIMENTS = 2000;
var MAX_ATTRIBUTS = 30;
var MAX_RESTAURER = 3000;
var PAR_PAQUET = 120;
var LIGNES_PAR_PAGE = 80;
var RAYON_TERRE = 6378137; // demi-grand axe WGS 84 (m), pour le plan local tangent autour de l'Emplacement
// Palette séquentielle à 5 classes, lisible par les daltoniens (« viridis ») ; la légende ne repose pas sur la couleur seule.
var PALETTE = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
var SECTEURS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
var SECTEURS_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

var onglet = "contexte";
var page = 0;
var langue = "fr";
var valeurs = { etage: "", rayon: "", valeur: "orientation", baies: "", shab: "", part: "", source: "" };

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: { etage: "Hauteur d'un étage, si seul le nombre d'étages est donné (m)", rayon: "Rayon retenu autour de l'origine (m, vide = tout)", valeur: "Valeur", baies: "Matière ou balise des baies", shab: "Surface habitable saisie (m²)", part: "Part de baies exigée (fraction ou %)", source: "Source de la part exigée" },
    valeurs: { orientation: "Orientation des façades (°)", hauteur: "Hauteur des objets (m)", fichier: "Valeurs d'un fichier (.csv)" },
    col: {
      contexte: ["Objet du fichier", "Lus", "Posés", "Non posés"],
      couleurs: ["Classe", "Intervalle", "Couleur", "Éléments"],
      vitrage: ["Secteur", "Façade", "Baies", "Ratio"],
    },
    total: "Total",
    nonEvaluee: "non évaluée", nonEvalue: "non évalué", nonRenseignee: "non renseignée", nonRenseigne: "non renseigné",
    batiments: "bâtiments", voirie: "voirie", autres: function (t) { return t; },
    note: {
      contexte: "GeoJSON (WGS 84) ou OSM : emprises extrudées selon la hauteur (attribut height), ou selon le nombre d'étages (building:levels) multiplié par la hauteur saisie ; voirie (highway) en arêtes au sol. Attributs gardés sur chaque volume. Tout en un pas d'annulation.",
      couleurs: "Palette à cinq classes d'égale étendue, lisible par les daltoniens. Les matières d'origine sont gardées et rétablies en un pas d'annulation.",
      vitrage: "Façades : faces verticales tournées vers l'extérieur (un rayon lancé depuis leur centre ne touche rien), regroupées par secteur depuis le nord de l'Emplacement. Baies : faces de la matière ou de la balise nommée.",
    },
    vides: {
      contexte: "Aucun contexte posé : « Poser le contexte (.geojson, .osm) ».",
      couleurs: "Rien à colorer pour cette valeur.",
      vitrage: "Aucune façade extérieure dans le dessin.",
    },
    res: {
      emplacement: "Emplacement", pose: "Contexte posé", sansHauteur: "Bâtiments sans hauteur (emprise seule)", hors: "Hors du rayon retenu",
      appliquee: "Couleurs appliquées", nord: "Nord vrai", baies: "Total des baies", exige: "Baies exigées (part saisie × surface habitable)", marge: "Marge",
    },
    sansNord: "nord non renseigné (Emplacement)",
    emplacementAbsent: "Emplacement non saisi (Info planche) : le contexte ne peut pas être posé.",
    fichierRefuse: "Fichier refusé : ",
    pose: function (b, v) { return "Contexte posé : " + b + " bâtiments, " + v + " voies."; },
    appliquees: function (n) { return "Couleurs appliquées à " + n + " éléments."; },
    restaurees: "Matières d'origine rétablies.",
    rienARestaurer: "Aucune couleur d'analyse à retirer.",
    csvRefuse: "Valeurs refusées : ",
    valeursChargees: function (n) { return n + " valeurs chargées."; },
    sansBaies: "Nommez la matière ou la balise des baies.",
    archiveRefusee: "Chargement refusé : le fichier n'a pas pu être archivé en base (",
    motifsArchive: { indisponible: "archivage indisponible dans cette Planche", impossible: "archivage impossible", reseau: "réseau indisponible", connexion: "connexion requise", extension_inconnue: "extension non installée pour ce compte", trop_lourd: "fichier trop lourd", serveur: "refus du serveur", illisible: "réponse du serveur illisible" },
    nomContexte: "Contexte bâti", nomBatiment: function (n) { return n || "Bâtiment"; }, nomVoirie: "Voirie",
    matiereClasse: function (k) { return "Analyse " + (k + 1) + "/5"; },
    erreurs: {
      json: "le fichier n'est pas un JSON lisible",
      geojson: "le fichier doit être un GeoJSON « FeatureCollection » ou un fichier OSM",
      trop: "plus de " + MAX_BATIMENTS + " bâtiments",
      csv: "chaque ligne doit être « nom de l'objet ; valeur »",
    },
    op: { contexte: "Poser le contexte bâti", couleurs: "Couleurs d'analyse", restaurer: "Retirer les couleurs d'analyse", valeurs: "Valeurs d'analyse" },
  },
  en: {
    champs: { etage: "Storey height, if only the number of storeys is given (m)", rayon: "Radius kept around the origin (m, empty = all)", valeur: "Value", baies: "Material or tag of the openings", shab: "Living area entered (m²)", part: "Required share of openings (fraction or %)", source: "Source of the required share" },
    valeurs: { orientation: "Facade orientation (°)", hauteur: "Object height (m)", fichier: "Values from a file (.csv)" },
    col: {
      contexte: ["File object", "Read", "Placed", "Not placed"],
      couleurs: ["Class", "Range", "Colour", "Elements"],
      vitrage: ["Sector", "Facade", "Openings", "Ratio"],
    },
    total: "Total",
    nonEvaluee: "not assessed", nonEvalue: "not assessed", nonRenseignee: "not entered", nonRenseigne: "not entered",
    batiments: "buildings", voirie: "streets", autres: function (t) { return t; },
    note: {
      contexte: "GeoJSON (WGS 84) or OSM: footprints extruded by height (height attribute), or by the number of storeys (building:levels) times the entered height; streets (highway) as ground edges. Attributes kept on each volume. All in one undo step.",
      couleurs: "Five-class palette of equal range, readable by colour-blind people. The original materials are kept and restored in one undo step.",
      vitrage: "Facades: vertical faces facing outwards (a ray cast from their centre hits nothing), grouped by sector from the Location's north. Openings: faces with the named material or tag.",
    },
    vides: {
      contexte: "No context placed: “Place the context (.geojson, .osm)”.",
      couleurs: "Nothing to colour for this value.",
      vitrage: "No outside facade in the drawing.",
    },
    res: {
      emplacement: "Location", pose: "Context placed", sansHauteur: "Buildings without height (footprint only)", hors: "Outside the kept radius",
      appliquee: "Colours applied", nord: "True north", baies: "Total openings", exige: "Required openings (entered share × living area)", marge: "Margin",
    },
    sansNord: "north not entered (Location)",
    emplacementAbsent: "Location not entered (Plan info): the context cannot be placed.",
    fichierRefuse: "File refused: ",
    pose: function (b, v) { return "Context placed: " + b + " buildings, " + v + " streets."; },
    appliquees: function (n) { return "Colours applied to " + n + " elements."; },
    restaurees: "Original materials restored.",
    rienARestaurer: "No analysis colour to remove.",
    csvRefuse: "Values refused: ",
    valeursChargees: function (n) { return n + " values loaded."; },
    sansBaies: "Name the material or tag of the openings.",
    archiveRefusee: "Loading refused: the file could not be archived in the database (",
    motifsArchive: { indisponible: "archiving unavailable in this Planche", impossible: "archiving failed", reseau: "network unavailable", connexion: "sign-in required", extension_inconnue: "extension not installed for this account", trop_lourd: "file too large", serveur: "refused by the server", illisible: "unreadable server response" },
    nomContexte: "Contexte bâti", nomBatiment: function (n) { return n || "Bâtiment"; }, nomVoirie: "Voirie",
    matiereClasse: function (k) { return "Analyse " + (k + 1) + "/5"; },
    erreurs: {
      json: "the file is not readable JSON",
      geojson: "the file must be a GeoJSON “FeatureCollection” or an OSM file",
      trop: "more than " + MAX_BATIMENTS + " buildings",
      csv: "each line must be “object name ; value”",
    },
    op: { contexte: "Place the built context", couleurs: "Analysis colours", restaurer: "Remove the analysis colours", valeurs: "Analysis values" },
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var alerte = function (m) { return planche.message.afficher(m, "alerte"); };
var info = function (m) { return planche.message.afficher(m); };
var texte = function (v) { return v === undefined || v === null ? "" : String(v); };
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(",", ".");
  return t === "" || !/^-?\d*\.?\d+$/.test(t) ? NaN : Number(t);
};
/** Fraction « a/b », nombre de 0 à 1 ou pourcentage → part de 0 à 1, ou NaN. */
var lirePart = function (s) {
  var t = texte(s).replace(/\s/g, "").replace(",", ".");
  var f = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
  if (f) return Number(f[2]) > 0 ? Number(f[1]) / Number(f[2]) : NaN;
  var p = /^(\d+(?:\.\d+)?)%$/.exec(t);
  if (p) return Number(p[1]) / 100;
  var n = lireNombre(t);
  return n >= 0 && n <= 1 ? n : NaN;
};
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var m2 = function (v, sep) { return fixe(v, 2, sep) + " m²"; };

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
async function ouvrirArchive(types) {
  var x = tx();
  var f = await planche.fichiers.ouvrir(types, { archiver: true });
  if (!f) return null;
  if (!f.archive) {
    await alerte(x.archiveRefusee + (x.motifsArchive[f.archiveRefus] || x.motifsArchive.impossible) + ")");
    return null;
  }
  return f;
}
var refArchive = function (f) { return { id: f.archive.id, empreinte: f.archive.empreinte, nom: String(f.nom || "").slice(0, 80) }; };
async function donnees() { return (await planche.donnees.lire("projet")) || {}; }

var sous = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
var vect = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
var aire2 = function (pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
/** Normale (Newell) d'un polygone 3D. */
function normaleDe(pts) {
  var n = [0, 0, 0];
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i], q = pts[(i + 1) % pts.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
}

// ——————————————————————————————————————————————— Contexte bâti (n° 12)

/** Point WGS 84 → plan de la Planche : plan local tangent autour de l'Emplacement, tourné selon le nord vrai. */
function versPlan(e, lon, lat) {
  var rad = Math.PI / 180;
  var est = RAYON_TERRE * Math.cos(e.latitude * rad) * (lon - e.longitude) * rad;
  var nord = RAYON_TERRE * (lat - e.latitude) * rad;
  var a = e.nord * rad;
  return [nord * Math.sin(a) + est * Math.cos(a), nord * Math.cos(a) - est * Math.sin(a)];
}

/** Objets d'un fichier OSM (XML) : nœuds, chemins et leurs étiquettes, en entités de type GeoJSON. */
function osmVersEntites(brut) {
  var noeuds = {};
  var re = /<node\b([^>]*?)(\/>|>)/g, m;
  while ((m = re.exec(brut))) {
    var id = /\bid="([^"]+)"/.exec(m[1]), lat = /\blat="([^"]+)"/.exec(m[1]), lon = /\blon="([^"]+)"/.exec(m[1]);
    if (id && lat && lon) noeuds[id[1]] = [Number(lon[1]), Number(lat[1])];
  }
  var entites = [];
  var rw = /<way\b[^>]*>([\s\S]*?)<\/way>/g;
  while ((m = rw.exec(brut))) {
    var refs = [], tags = {}, r;
    var rn = /<nd\b[^>]*\bref="([^"]+)"/g;
    while ((r = rn.exec(m[1]))) refs.push(r[1]);
    var rt = /<tag\b[^>]*\bk="([^"]+)"[^>]*\bv="([^"]*)"/g;
    while ((r = rt.exec(m[1]))) tags[r[1]] = r[2];
    var pts = refs.map(function (k) { return noeuds[k]; }).filter(Boolean);
    if (pts.length !== refs.length || pts.length < 2) { entites.push({ type: "Feature", properties: tags, geometry: null }); continue; }
    var ferme = refs.length >= 4 && refs[0] === refs[refs.length - 1];
    entites.push({ type: "Feature", properties: tags, geometry: ferme && !tags.highway ? { type: "Polygon", coordinates: [pts] } : { type: "LineString", coordinates: pts } });
  }
  var ignores = (brut.match(/<relation\b/g) || []).length;
  for (var i = 0; i < ignores; i++) entites.push({ type: "Feature", properties: { relation: "oui" }, geometry: { type: "Relation" } });
  return entites;
}

function hauteurDe(pr, hEtage) {
  var h = lireNombre(texte(pr.height).replace(/m$/, ""));
  if (h > 0) return { h: h, selon: "height" };
  var n = lireNombre(pr["building:levels"]);
  if (n > 0 && hEtage > 0) return { h: n * hEtage, selon: "building:levels" };
  return null;
}

function lireContexte(brut, e, hEtage, rayon) {
  var x = tx();
  var t = texte(brut).replace(/^﻿/, "");
  var entites;
  if (/^\s*</.test(t)) {
    if (!/<osm\b/.test(t)) return { erreur: x.erreurs.geojson };
    entites = osmVersEntites(t);
  } else {
    var d;
    try { d = JSON.parse(t); } catch (err) { return { erreur: x.erreurs.json }; }
    if (!d || d.type !== "FeatureCollection" || !Array.isArray(d.features)) return { erreur: x.erreurs.geojson };
    entites = d.features;
  }
  var batiments = [], voies = [], compte = {};
  var compter = function (type, lu, pose) { compte[type] = compte[type] || { lus: 0, poses: 0 }; compte[type].lus += lu; compte[type].poses += pose; };
  var hors = 0;
  var dedans = function (pts) {
    if (!(rayon > 0)) return true;
    return pts.some(function (p) { return Math.sqrt(p[0] * p[0] + p[1] * p[1]) <= rayon; });
  };
  entites.forEach(function (f) {
    var g = f && f.geometry, pr = (f && f.properties) || {};
    var type = g ? g.type : "sans géométrie";
    if (g && (type === "Polygon" || type === "MultiPolygon") && pr.building !== undefined && pr.building !== "no") {
      var anneaux = type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map(function (p) { return p[0]; });
      anneaux.forEach(function (a) {
        if (!Array.isArray(a) || a.length < 4) { compter(x.batiments, 1, 0); return; }
        var pts = a.slice(0, a.length - 1).map(function (q) { return versPlan(e, Number(q[0]), Number(q[1])); });
        if (!dedans(pts)) { hors++; return; }
        if (Math.abs(aire2(pts)) < 1e-4) { compter(x.batiments, 1, 0); return; }
        var h = hauteurDe(pr, hEtage);
        var attributs = {};
        Object.keys(pr).slice(0, MAX_ATTRIBUTS).forEach(function (k) { if (/^[a-zA-Z][\w:.-]{0,40}$/.test(k)) attributs[k.replace(/:/g, "_")] = texte(pr[k]).slice(0, 80); });
        batiments.push({ points: pts, hauteur: h ? h.h : null, selon: h ? h.selon : null, nom: texte(pr.name).slice(0, 60), attributs: attributs });
        compter(x.batiments, 1, 1);
      });
    } else if (g && (type === "LineString" || type === "MultiLineString") && pr.highway !== undefined) {
      var lignes = type === "LineString" ? [g.coordinates] : g.coordinates;
      lignes.forEach(function (l) {
        var pts = l.map(function (q) { return versPlan(e, Number(q[0]), Number(q[1])); });
        if (!dedans(pts)) { hors++; return; }
        voies.push(pts);
        compter(x.voirie, 1, 1);
      });
    } else compter(pr.relation ? "relation" : type + (pr.place ? " (lieu-dit)" : ""), 1, 0);
  });
  if (batiments.length > MAX_BATIMENTS) return { erreur: x.erreurs.trop };
  return { batiments: batiments, voies: voies, compte: compte, hors: hors };
}

async function bordDroit() {
  var m = await planche.modele.lire({ portee: "monde" });
  var x0 = 0;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  return x0 + 10;
}

async function poserContexte() {
  var x = tx();
  var site = await planche.site.lire();
  if (!site.emplacement) return alerte(x.emplacementAbsent);
  var f = await ouvrirArchive([".geojson", ".osm", ".json"]);
  if (!f) return;
  var r = lireContexte(f.texte, site.emplacement, lireNombre(valeurs.etage), lireNombre(valeurs.rayon));
  if (r.erreur) return alerte(x.fichierRefuse + r.erreur);
  var d = await donnees();
  var ancien = d["contexte.objet"];
  var sansH = 0;
  await enUnPas(x.op.contexte, async function () {
    if (ancien && (await planche.modele.lire()).objets.some(function (o) { return o.id === ancien.id; })) await planche.modele.effacer([ancien.id]);
    var ecart = await bordDroit();
    var parts = [];
    for (var i = 0; i < r.batiments.length; i++) {
      var b = r.batiments[i];
      var m0 = await planche.modele.lire();
      var avant = {};
      m0.faces.forEach(function (y) { avant[y.id] = true; });
      var pts = b.points.map(function (q) { return [q[0] + ecart, q[1], 0]; });
      await planche.modele.lignes(pts.map(function (q, k) { return [q, pts[(k + 1) % pts.length]]; }));
      var base = (await planche.modele.lire()).faces.filter(function (y) { return !avant[y.id]; })[0];
      if (!base) continue;
      if (b.hauteur) await planche.modele.pousser(base.id, normaleDe(base.points)[2] < 0 ? -b.hauteur : b.hauteur);
      else sansH++;
      var faces = (await planche.modele.lire()).faces.filter(function (y) { return !avant[y.id]; }).map(function (y) { return y.id; });
      var g = await planche.modele.grouper(faces, x.nomBatiment(b.nom));
      await planche.donnees.ecrire(g, "attributs", Object.assign({ hauteur: b.hauteur, selon: b.selon }, b.attributs));
      parts.push(g);
    }
    if (r.voies.length) {
      var m3 = await planche.modele.lire();
      var avA = {}, avF = {};
      m3.aretes.forEach(function (y) { avA[y.id] = true; });
      m3.faces.forEach(function (y) { avF[y.id] = true; });
      var segs = [];
      r.voies.forEach(function (v) { for (var k = 0; k + 1 < v.length; k++) segs.push([[v[k][0] + ecart, v[k][1], 0], [v[k + 1][0] + ecart, v[k + 1][1], 0]]); });
      for (var s = 0; s < segs.length; s += 5000) await planche.modele.lignes(segs.slice(s, s + 5000));
      // Une voie fermée forme une face : on l'efface, la ligne reste.
      var m4 = await planche.modele.lire();
      var fv = m4.faces.filter(function (y) { return !avF[y.id]; }).map(function (y) { return y.id; });
      if (fv.length) await planche.modele.effacer(fv);
      var m5 = await planche.modele.lire();
      var aretes = m5.aretes.filter(function (y) { return !avA[y.id]; }).map(function (y) { return y.id; });
      if (aretes.length) {
        var gv = await planche.modele.grouper(aretes, x.nomVoirie);
        await planche.balises.appliquer([gv], await planche.balises.creer("Voirie", "#9a9a9a"));
        parts.push(gv);
      }
    }
    if (!parts.length) return null;
    var tout = await planche.modele.grouper(parts, x.nomContexte);
    if (ecart) await planche.modele.deplacer([tout], [-ecart, 0, 0]);
    await planche.balises.appliquer([tout], await planche.balises.creer("Contexte bâti", "#b0b0b0"));
    await planche.matieres.appliquer([tout], await planche.matieres.creer("Contexte bâti", "#d9d6cf"));
    await planche.donnees.ecrire("projet", "contexte.objet", { id: tout, archive: refArchive(f), compte: r.compte, hors: r.hors, sansHauteur: sansH });
    return tout;
  });
  return info(x.pose(r.batiments.length, r.voies.length));
}

// ——————————————————————————————————————————————— Couleurs d'analyse (n° 27)

/** Éléments à colorer et leur valeur : faces verticales (orientation), objets (hauteur, valeurs d'un fichier). */
async function elementsAnalyse(quoi, site) {
  if (quoi === "orientation") {
    if (!site.emplacement) return { elements: [], sansNord: true };
    var m = await planche.modele.lire({ portee: "monde" });
    var l = [];
    m.faces.forEach(function (f) {
      if (f.chemin.length > 1) return;
      var n = normaleDe(f.points);
      if (Math.abs(n[2]) > 0.05) return;
      l.push({ id: f.chemin.length ? null : f.id, objet: f.chemin[0] || null, face: f.id, valeur: azimut(n, site.emplacement.nord) });
    });
    // Seules les faces de la racine se peignent une à une ; celles d'un groupe se lisent mais le groupe garde sa matière.
    return { elements: l.filter(function (e) { return e.id; }) };
  }
  var lus = await planche.modele.lire();
  if (quoi === "hauteur") {
    var monde = await planche.modele.lire({ portee: "monde" });
    return { elements: lus.objets.map(function (o) {
      var zs = [];
      monde.faces.forEach(function (f) { if (f.chemin[0] === o.id) f.points.forEach(function (q) { zs.push(q[2]); }); });
      return zs.length ? { id: o.id, valeur: Math.max.apply(null, zs) - Math.min.apply(null, zs) } : null;
    }).filter(Boolean) };
  }
  var v = ((await donnees())["analyse.valeurs"] || {}).valeurs || {};
  return { elements: lus.objets.filter(function (o) { return typeof v[o.nom] === "number"; }).map(function (o) { return { id: o.id, valeur: v[o.nom] }; }) };
}
/** Azimut d'une normale horizontale, en degrés depuis le nord vrai, sens horaire. */
function azimut(n, nord) {
  var a = (Math.atan2(n[0], n[1]) * 180) / Math.PI - nord;
  return ((a % 360) + 360) % 360;
}
function classes(elements) {
  if (!elements.length) return null;
  var vs = elements.map(function (e) { return e.valeur; });
  var a = Math.min.apply(null, vs), b = Math.max.apply(null, vs);
  var pas = (b - a) / PALETTE.length || 1;
  var k = function (v) { return Math.min(PALETTE.length - 1, Math.floor((v - a) / pas + 1e-9)); };
  var n = PALETTE.map(function () { return 0; });
  elements.forEach(function (e) { e.classe = k(e.valeur); n[e.classe]++; });
  return { min: a, pas: pas, compte: n };
}

async function appliquerCouleurs() {
  var x = tx();
  var site = await planche.site.lire();
  var a = await elementsAnalyse(valeurs.valeur, site);
  var c = classes(a.elements);
  if (!c) return alerte(x.vides.couleurs);
  var d = await donnees();
  var lus = await planche.modele.lire();
  var avant = d["analyse.legende"] ? null : [];
  if (avant) {
    // Matières d'origine, gardées une fois (une seconde application garde les premières).
    var mat = {};
    lus.faces.forEach(function (f) { mat[f.id] = f.matiere; });
    lus.objets.forEach(function (o) { mat[o.id] = o.matiere; });
    avant = a.elements.slice(0, MAX_RESTAURER).map(function (e) { return [e.id, mat[e.id] || null]; });
  }
  await enUnPas(x.op.couleurs, async function () {
    var ids = [];
    for (var k = 0; k < PALETTE.length; k++) {
      var de = a.elements.filter(function (e) { return e.classe === k; }).map(function (e) { return e.id; });
      if (!de.length) continue;
      await planche.matieres.appliquer(de, await planche.matieres.creer(x.matiereClasse(k), PALETTE[k]));
      ids = ids.concat(de);
    }
    // Matières d'origine par paquets (une donnée est bornée en taille) ; gardées à la première application seulement.
    var paquets = avant ? Math.ceil(avant.length / PAR_PAQUET) : (d["analyse.legende"].paquets || 0);
    if (avant) for (var q = 0; q < paquets; q++) await planche.donnees.ecrire("projet", "analyse.avant." + q, avant.slice(q * PAR_PAQUET, (q + 1) * PAR_PAQUET));
    await planche.donnees.ecrire("projet", "analyse.legende", { valeur: valeurs.valeur, min: c.min, pas: c.pas, compte: c.compte, paquets: paquets });
  });
  return info(x.appliquees(a.elements.length));
}

async function restaurer() {
  var x = tx();
  var d = await donnees();
  var leg = d["analyse.legende"];
  if (!leg) return alerte(x.rienARestaurer);
  var avant = [];
  for (var q = 0; q < (leg.paquets || 0); q++) avant = avant.concat(d["analyse.avant." + q] || []);
  var lus = await planche.modele.lire();
  var existe = {};
  lus.faces.forEach(function (f) { existe[f.id] = true; });
  lus.objets.forEach(function (o) { existe[o.id] = true; });
  await enUnPas(x.op.restaurer, async function () {
    var parMat = {};
    avant.forEach(function (p) { if (existe[p[0]]) (parMat[p[1] || ""] = parMat[p[1] || ""] || []).push(p[0]); });
    var cles = Object.keys(parMat);
    for (var i = 0; i < cles.length; i++) await planche.matieres.appliquer(parMat[cles[i]], cles[i] || null);
    for (var q2 = 0; q2 < (leg.paquets || 0); q2++) await planche.donnees.effacer("projet", "analyse.avant." + q2);
    await planche.donnees.effacer("projet", "analyse.legende");
  });
  return info(x.restaurees);
}

async function chargerValeurs() {
  var x = tx();
  var f = await ouvrirArchive([".csv"]);
  if (!f) return;
  var lignes = texte(f.texte).replace(/^﻿/, "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var v = {}, n = 0;
  for (var i = 0; i < lignes.length; i++) {
    var c = lignes[i].split(";").map(function (s) { return s.trim(); });
    var nb = lireNombre(c[1]);
    if (i === 0 && isNaN(nb)) continue;
    if (c.length < 2 || !c[0] || isNaN(nb)) return alerte(x.csvRefuse + x.erreurs.csv + " (" + (i + 1) + ")");
    if (n < 100) { v[c[0].slice(0, 60)] = nb; n++; }
  }
  await enUnPas(x.op.valeurs, function () { return planche.donnees.ecrire("projet", "analyse.valeurs", { valeurs: v, archive: refArchive(f) }); });
  valeurs.valeur = "fichier";
  return info(x.valeursChargees(n));
}

// ——————————————————————————————————————————————— Vitrage par façade (n° 28)

async function facades(site, baies) {
  var monde = await planche.modele.lire({ portee: "monde" });
  var noms = {};
  (await planche.matieres.lire()).forEach(function (m) { noms["m:" + m.id] = m.nom.toLowerCase(); });
  (await planche.balises.lire()).forEach(function (b) { noms["b:" + b.id] = b.nom.toLowerCase(); });
  var lus = await planche.modele.lire();
  var matObjet = {};
  lus.objets.forEach(function (o) { matObjet[o.id] = o.matiere; });
  var contexte = ((await donnees())["contexte.objet"] || {}).id || null;
  var cand = monde.faces.filter(function (f) { return f.chemin[0] !== contexte && Math.abs(normaleDe(f.points)[2]) <= 0.05 && f.aire > 1e-6; });
  var centre = function (f) { var c = [0, 0, 0]; f.points.forEach(function (q) { c = [c[0] + q[0] / f.points.length, c[1] + q[1] / f.points.length, c[2] + q[2] / f.points.length]; }); return c; };
  // Extérieure : un rayon lancé depuis le centre, le long de la normale, ne touche aucune face du projet.
  var dehors = [];
  for (var i = 0; i < cand.length; i += 2000) {
    var lot = cand.slice(i, i + 2000);
    var r = await planche.geometrie.rayon(lot.map(function (f) { var n = normaleDe(f.points), c = centre(f); return { origine: [c[0] + n[0] * 0.01, c[1] + n[1] * 0.01, c[2]], direction: n }; }));
    lot.forEach(function (f, k) {
      var im = r.impacts[k];
      if (!im || (contexte && im.chemin[0] === contexte)) dehors.push(f);
    });
  }
  var cible = texte(baies).trim().toLowerCase();
  var secteurs = SECTEURS.map(function () { return { facade: 0, baies: 0 }; });
  dehors.forEach(function (f) {
    var a = azimut(normaleDe(f.points), site.emplacement.nord);
    var s = Math.floor(((a + 22.5) % 360) / 45);
    var mat = f.matiere || matObjet[f.chemin[0]] || null;
    var estBaie = !!cible && (noms["m:" + mat] === cible || noms["b:" + f.balise] === cible);
    secteurs[s].facade += f.aire;
    if (estBaie) secteurs[s].baies += f.aire;
  });
  return { secteurs: secteurs, n: dehors.length };
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var d = await donnees();
  var site = await planche.site.lire();
  var em = site.emplacement;
  var formulaire = [];
  var e = { lignes: [], vide: null, resultats: [], pied: null };
  if (onglet === "contexte") {
    formulaire = [{ id: "etage", libelle: x.champs.etage, valeur: valeurs.etage }, { id: "rayon", libelle: x.champs.rayon, valeur: valeurs.rayon }];
    e.resultats.push({ libelle: x.res.emplacement, valeur: em ? fixe(em.latitude, 5, sep) + " ; " + fixe(em.longitude, 5, sep) + " · N " + fixe(em.nord, 1, sep) + "°" : x.nonRenseigne, ton: em ? "" : "limite" });
    var c = d["contexte.objet"];
    if (!c) e.vide = x.vides.contexte;
    else {
      e.lignes = Object.keys(c.compte).sort().map(function (k) { var v = c.compte[k]; return { genre: "ligne", ton: v.poses < v.lus ? "limite" : "", cellules: [k, String(v.lus), String(v.poses), String(v.lus - v.poses)] }; });
      e.resultats.push({ libelle: x.res.pose, valeur: c.archive.nom });
      if (c.sansHauteur) e.resultats.push({ libelle: x.res.sansHauteur, valeur: String(c.sansHauteur), ton: "limite" });
      if (c.hors) e.resultats.push({ libelle: x.res.hors, valeur: String(c.hors) });
    }
  } else if (onglet === "couleurs") {
    formulaire = [{ id: "valeur", libelle: x.champs.valeur, valeur: valeurs.valeur, choix: VALEURS_ANALYSE.map(function (k) { return { valeur: k, libelle: x.valeurs[k] }; }) }];
    var leg = d["analyse.legende"];
    var a = leg ? null : await elementsAnalyse(valeurs.valeur, site);
    var cl = leg || (a ? classes(a.elements) : null);
    if (a && a.sansNord) e.vide = x.sansNord;
    else if (!cl) e.vide = x.vides.couleurs;
    else {
      var unite = (leg ? leg.valeur : valeurs.valeur) === "orientation" ? "°" : (leg ? leg.valeur : valeurs.valeur) === "hauteur" ? " m" : "";
      var nb = function (v) { return fixe(v, unite === "°" ? 0 : 2, sep) + unite; };
      e.lignes = PALETTE.map(function (p, k) { return { genre: "ligne", cellules: [String(k + 1), nb(cl.min + k * cl.pas) + " – " + nb(cl.min + (k + 1) * cl.pas), p, String(cl.compte[k])] }; });
      e.resultats.push({ libelle: x.res.appliquee, valeur: leg ? x.valeurs[leg.valeur] : "–", ton: leg ? "ok" : "" });
    }
  } else {
    formulaire = [{ id: "baies", libelle: x.champs.baies, valeur: valeurs.baies }, { id: "shab", libelle: x.champs.shab, valeur: valeurs.shab }, { id: "part", libelle: x.champs.part, valeur: valeurs.part }, { id: "source", libelle: x.champs.source, valeur: valeurs.source }];
    e.resultats.push({ libelle: x.res.nord, valeur: em ? fixe(em.nord, 1, sep) + "°" : x.nonRenseigne, ton: em ? "" : "limite" });
    if (!em) e.vide = x.sansNord;
    else {
      var fz = await facades(site, valeurs.baies);
      var noms = langue === "en" ? SECTEURS_EN : SECTEURS;
      var tf = 0, tb = 0;
      e.lignes = fz.secteurs.map(function (s, k) {
        tf += s.facade; tb += s.baies;
        if (!s.facade) return null;
        var ratio = valeurs.baies.trim() ? fixe((s.baies / s.facade) * 100, 1, sep) + " %" : x.nonEvalue;
        return { genre: "ligne", ton: valeurs.baies.trim() ? "" : "gris", cellules: [noms[k], m2(s.facade, sep), valeurs.baies.trim() ? m2(s.baies, sep) : x.nonEvalue, ratio] };
      }).filter(Boolean);
      if (e.lignes.length) e.pied = [x.total, m2(tf, sep), valeurs.baies.trim() ? m2(tb, sep) : x.nonEvalue, valeurs.baies.trim() && tf ? fixe((tb / tf) * 100, 1, sep) + " %" : x.nonEvalue];
      else e.vide = x.vides.vitrage;
      var shab = lireNombre(valeurs.shab), part = lirePart(valeurs.part);
      var exige = shab > 0 && part >= 0 && valeurs.source.trim() ? shab * part : null;
      e.resultats.push({ libelle: x.res.baies, valeur: valeurs.baies.trim() ? m2(tb, sep) : x.nonEvalue });
      e.resultats.push({ libelle: x.res.exige, valeur: exige === null ? x.nonEvalue : m2(exige, sep) + " (" + valeurs.source.trim().slice(0, 60) + ")" });
      if (exige !== null && valeurs.baies.trim()) e.resultats.push({ libelle: x.res.marge, valeur: (tb - exige >= 0 ? "+" : "−") + m2(Math.abs(tb - exige), sep), ton: tb - exige >= -1e-9 ? "ok" : "alerte" });
    }
  }
  var lignes = e.lignes;
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    note: x.note[onglet],
    formulaire: formulaire,
    resultats: e.resultats,
    encart: "",
    colonnes: x.col[onglet],
    lignes: lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    pied: e.pied,
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
  Object.keys(valeurs).forEach(function (k) { if (typeof v[k] === "string") valeurs[k] = v[k].slice(0, 160); });
  if (VALEURS_ANALYSE.indexOf(valeurs.valeur) < 0) valeurs.valeur = "orientation";
};

var action = function (nom, fn) {
  planche.panneau.sur(PANNEAU, nom, async function (d) {
    retenirLangue(d);
    retenirValeurs(d);
    if (d && ONGLETS.indexOf(d.onglet) >= 0 && d.onglet !== onglet) {
      onglet = d.onglet;
      page = 0;
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
action("poser-contexte", poserContexte);
action("appliquer-couleurs", appliquerCouleurs);
action("retirer-couleurs", restaurer);
action("charger-valeurs", chargerValeurs);

var commande = function (nom, ong) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) page = 0;
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    await rafraichir();
  });
};
commande("ouvrir-panneau", "contexte");
commande("contexte", "contexte");
commande("couleurs", "couleurs");
commande("vitrage", "vitrage");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
