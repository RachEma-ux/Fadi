// Extension « Gabarits et servitudes » (catalogue des extensions de la Planche, cas 3 de la feuille de route, lot 4 ;
// protocole 1.6). Trois onglets de travail et un onglet de règles :
//   Gabarit (n° 5, D6-F20b-001 ; n° 15, D6-F20b-019) · Servitudes (n° 11, D6-S-011 ; n° 24, D6-F8-088) ·
//   Scénarios (n° 31, D6-F20b-011) · Règles.
//
// Aucune règle n'est écrite ici. Hauteur, retraits et prospects (PLU ou RNU), surface par place de stationnement :
// tout vient d'une table chargée par l'utilisateur, chaque valeur avec sa source, archivée en base ; sans table, le
// gabarit n'est pas construit et les places sont « non évaluées ». Les zones de servitude viennent d'un fichier GeoJSON
// fourni par l'utilisateur, chacune avec sa source et sa date ; elles sont posées depuis l'Emplacement saisi.

var VERSION = "1.0.0";
var PANNEAU = "gabarits";
var ONGLETS = ["gabarit", "servitudes", "scenarios", "regles"];
var FORMAT_REGLES = "fadi-regles-gabarit/1";
var NATURES_JEU = ["PLU", "RNU"];
var NATURES_ZONE = ["non-aedificandi", "alignement", "sup", "ppri", "hauteur", "autre"];
var MAX_JEUX = 10;
var MAX_ZONES = 200;
var MAX_POINTS_ZONE = 2000;
var RAYONS_PAR_ZONE = 400;
var LIGNES_PAR_PAGE = 80;
var RAYON_TERRE = 6378137; // demi-grand axe WGS 84 (m), pour le plan local tangent autour de l'Emplacement
var COULEURS_ZONE = { "non-aedificandi": "#c0392b", alignement: "#8e44ad", sup: "#d68910", ppri: "#2471a3", hauteur: "#117a65", autre: "#7f8c8d" };

var onglet = "gabarit";
var page = 0;
var langue = "fr";
var valeurs = { jeu: "", affichage: "", hauteur: "" };

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: { jeu: "Jeu de règles", affichage: "Hauteur d'affichage sans plafond (m)", hauteur: "Coupe au-dessus du niveau (m)" },
    aucunJeu: "aucune table chargée",
    jeuLibelle: function (j) { return j.nature + " " + j.commune + " (v" + j.version + ", " + j.date + ")"; },
    col: {
      gabarit: ["Limite", "Longueur", "Retrait", "Prospect"],
      servitudes: ["Zone", "Nature", "Plafond", "Contrôle"],
      scenarios: ["Scénario", "Emprise", "Surface coupée", "Places"],
      regles: ["Jeu de règles", "Version", "Date", "Relu"],
    },
    total: "Total",
    nonEvaluee: "non évaluée", nonEvalue: "non évalué", nonRenseignee: "non renseignée", aucun: "aucun",
    voie: "voie", separative: "séparative",
    aVerifier: "à vérifier",
    sansPlafond: "sans plafond",
    intrusion: function (e) { return "intrusion (+" + e + ")"; },
    libre: "aucune intrusion",
    encart: "Gabarit construit depuis la parcelle et les règles du jeu choisi, chacune avec sa source. Aucune valeur n'est inventée : une règle absente n'est pas appliquée et c'est dit.",
    sansTable: "Aucune table de règles : le gabarit n'est pas construit, les places sont non évaluées. Chargez une table sourcée et datée (onglet Règles).",
    note: {
      gabarit: "Parcelle : une face horizontale sélectionnée, convexe. Les limites sur voie sont les arêtes retenues ; les autres sont séparatives. Le volume suit, pour chaque limite, le retrait puis la pente du prospect (H ≤ hauteur à la limite + rapport × distance), plafonné à la hauteur maximale.",
      servitudes: "Zones lues d'un fichier GeoJSON (WGS 84) : nature, libellé, source et date obligatoires, plafond facultatif (m au-dessus du ±0,00). Elles sont posées depuis l'Emplacement (latitude, longitude, nord). Une zone avec plafond, ou non aedificandi, est contrôlée contre les volumes du projet.",
      scenarios: "Chaque balise dont le nom commence par « Scénario » est un scénario : emprise par projection au sol, surface coupée à chaque niveau, places selon la règle de stationnement du jeu choisi.",
      regles: "Table « " + FORMAT_REGLES + " » : un ou plusieurs jeux (PLU ou RNU, par commune), chaque règle avec sa source ; une règle non relue est « à vérifier ».",
    },
    vides: {
      gabarit: "Aucune parcelle retenue : sélectionnez la face de la parcelle, puis « Retenir la parcelle ».",
      servitudes: "Aucune zone posée : « Poser les zones (.geojson) ».",
      scenarios: "Aucune balise « Scénario … » dans le dessin.",
      regles: "Aucune table de règles chargée.",
    },
    res: {
      parcelle: "Parcelle", gabarit: "Gabarit", jeu: "Règles appliquées", hauteur: "Hauteur maximale",
      volume: "Volume du gabarit", emprise: "Emprise constructible au sol", absentes: "Règles absentes du jeu (non appliquées)",
      emplacement: "Emplacement", zones: "Zones posées", refusees: "Zones refusées (source, date ou contour manquant)", nonLues: "Objets non lus du fichier",
      intrusions: "Intrusions", nonControlees: "Zones non contrôlées (ni plafond ni non aedificandi)",
      regle: "Règle de stationnement", sources: "Sources des zones",
    },
    construit: function (n) { return "Gabarit construit : " + n + "."; },
    nomGabarit: function (j) { return "Gabarit " + j.nature + " " + j.commune + (j.relu ? "" : " (à vérifier)"); },
    rnuSeul: function (j) { return "Aucun jeu PLU : gabarit RNU proposé, à vérifier" + (j.article ? " (" + j.article + ")" : "") + "."; },
    sansRnu: "Aucun jeu dans la table : la Planche ne fournit aucune règle, PLU ni RNU.",
    parcelleRetenue: function (a) { return "Parcelle retenue : " + a + "."; },
    parcelleRefusee: "Sélectionnez une seule face horizontale et convexe : la parcelle.",
    voiesRetenues: function (n) { return n + (n > 1 ? " limites retenues" : " limite retenue") + " sur voie."; },
    voiesVides: "Sélectionnez les arêtes de la parcelle qui bordent la voie.",
    hauteurAbsente: "La règle de hauteur maximale est absente du jeu : gabarit non construit.",
    gabaritVide: "Les retraits ne laissent aucun volume constructible sur cette parcelle.",
    emplacementAbsent: "Emplacement non saisi (Info planche) : les zones ne peuvent pas être posées.",
    zonesPosees: function (n) { return n + (n > 1 ? " zones posées." : " zone posée."); },
    zonesRefusees: "Fichier refusé : ",
    controle: function (n) { return n ? n + (n > 1 ? " intrusions signalées." : " intrusion signalée.") : "Aucune intrusion."; },
    exporte: "Comparaison des scénarios enregistrée.",
    fichierCsv: "scenarios-capacite.csv",
    csvEntete: "Scénario;Emprise (m²);Surface coupée (m²);Places",
    reglesChargees: function (n) { return "Table chargée : " + n + (n > 1 ? " jeux de règles." : " jeu de règles."); },
    reglesRefusees: "Table refusée : ",
    archiveRefusee: "Chargement refusé : le fichier n'a pas pu être archivé en base (",
    motifsArchive: { indisponible: "archivage indisponible dans cette Planche", impossible: "archivage impossible", reseau: "réseau indisponible", connexion: "connexion requise", extension_inconnue: "extension non installée pour ce compte", trop_lourd: "fichier trop lourd", serveur: "refus du serveur", illisible: "réponse du serveur illisible" },
    modeleEnregistre: "Modèle de table enregistré : remplissez-le, citez chaque source, puis chargez-le.",
    fichierModele: "modele-regles-gabarit.json",
    natures: { "non-aedificandi": "non aedificandi", alignement: "alignement", sup: "servitude d'utilité publique", ppri: "zone PPRI", hauteur: "servitude de hauteur", autre: "autre" },
    balise: function (n) { return "Servitude — " + n; },
    erreurs: {
      json: "le fichier n'est pas un JSON lisible",
      format: "le format doit être « " + FORMAT_REGLES + " »",
      jeux: "la table doit contenir de 1 à " + MAX_JEUX + " jeux de règles",
      jeu: function (i) { return "jeu " + (i + 1) + " : identifiant, nature (PLU ou RNU), commune, version et date (AAAA-MM-JJ) sont attendus"; },
      regle: function (j, k) { return "jeu « " + j + " », règle « " + k + " » : valeur ou source manquante"; },
      geojson: "le fichier doit être un GeoJSON « FeatureCollection »",
      tropZones: "plus de " + MAX_ZONES + " zones",
    },
    op: { regles: "Table des règles de gabarit", parcelle: "Retenir la parcelle", voies: "Limites sur voie", gabarit: "Construire le gabarit", zones: "Poser les zones", controle: "Contrôler les servitudes" },
  },
  en: {
    champs: { jeu: "Rule set", affichage: "Display height without ceiling (m)", hauteur: "Cut above the storey (m)" },
    aucunJeu: "no table loaded",
    jeuLibelle: function (j) { return j.nature + " " + j.commune + " (v" + j.version + ", " + j.date + ")"; },
    col: {
      gabarit: ["Boundary", "Length", "Setback", "Height-to-distance"],
      servitudes: ["Zone", "Kind", "Ceiling", "Check"],
      scenarios: ["Scenario", "Footprint", "Cut area", "Spaces"],
      regles: ["Rule set", "Version", "Date", "Reviewed"],
    },
    total: "Total",
    nonEvaluee: "not assessed", nonEvalue: "not assessed", nonRenseignee: "not entered", aucun: "none",
    voie: "street", separative: "side",
    aVerifier: "to be checked",
    sansPlafond: "no ceiling",
    intrusion: function (e) { return "intrusion (+" + e + ")"; },
    libre: "no intrusion",
    encart: "Envelope built from the plot and the rules of the chosen set, each with its source. No value is made up: a missing rule is not applied, and this is stated.",
    sansTable: "No rules table: the envelope is not built and parking spaces are not assessed. Load a sourced and dated table (Rules tab).",
    note: {
      gabarit: "Plot: one selected horizontal, convex face. Street boundaries are the retained edges; the others are side boundaries. For each boundary the volume follows the setback, then the height-to-distance slope (H ≤ height at the boundary + ratio × distance), capped at the maximum height.",
      servitudes: "Zones read from a GeoJSON file (WGS 84): kind, label, source and date required, optional ceiling (m above ±0.00). They are placed from the Location (latitude, longitude, north). A zone with a ceiling, or a no-build zone, is checked against the project volumes.",
      scenarios: "Each tag whose name starts with “Scénario” is a scenario: footprint by ground projection, area cut at each storey, parking spaces from the parking rule of the chosen set.",
      regles: "Table “" + FORMAT_REGLES + "”: one or more sets (PLU or RNU, by municipality), each rule with its source; a rule not reviewed is “to be checked”.",
    },
    vides: {
      gabarit: "No plot retained: select the plot face, then “Retain the plot”.",
      servitudes: "No zone placed: “Place the zones (.geojson)”.",
      scenarios: "No “Scénario …” tag in the drawing.",
      regles: "No rules table loaded.",
    },
    res: {
      parcelle: "Plot", gabarit: "Envelope", jeu: "Rules applied", hauteur: "Maximum height",
      volume: "Envelope volume", emprise: "Buildable ground area", absentes: "Rules missing from the set (not applied)",
      emplacement: "Location", zones: "Zones placed", refusees: "Zones refused (source, date or outline missing)", nonLues: "File objects not read",
      intrusions: "Intrusions", nonControlees: "Zones not checked (no ceiling, not no-build)",
      regle: "Parking rule", sources: "Zone sources",
    },
    construit: function (n) { return "Envelope built: " + n + "."; },
    nomGabarit: function (j) { return "Gabarit " + j.nature + " " + j.commune + (j.relu ? "" : " (à vérifier)"); },
    rnuSeul: function (j) { return "No PLU set: RNU envelope proposed, to be checked" + (j.article ? " (" + j.article + ")" : "") + "."; },
    sansRnu: "No set in the table: the Planche provides no rule, neither PLU nor RNU.",
    parcelleRetenue: function (a) { return "Plot retained: " + a + "."; },
    parcelleRefusee: "Select one horizontal, convex face: the plot.",
    voiesRetenues: function (n) { return n + (n > 1 ? " boundaries retained" : " boundary retained") + " on the street."; },
    voiesVides: "Select the plot edges that border the street.",
    hauteurAbsente: "The maximum height rule is missing from the set: envelope not built.",
    gabaritVide: "The setbacks leave no buildable volume on this plot.",
    emplacementAbsent: "Location not entered (Plan info): the zones cannot be placed.",
    zonesPosees: function (n) { return n + (n > 1 ? " zones placed." : " zone placed."); },
    zonesRefusees: "File refused: ",
    controle: function (n) { return n ? n + (n > 1 ? " intrusions reported." : " intrusion reported.") : "No intrusion."; },
    exporte: "Scenario comparison saved.",
    fichierCsv: "scenarios-capacite.csv",
    csvEntete: "Scenario;Footprint (m²);Cut area (m²);Spaces",
    reglesChargees: function (n) { return "Table loaded: " + n + (n > 1 ? " rule sets." : " rule set."); },
    reglesRefusees: "Table refused: ",
    archiveRefusee: "Loading refused: the file could not be archived in the database (",
    motifsArchive: { indisponible: "archiving unavailable in this Planche", impossible: "archiving failed", reseau: "network unavailable", connexion: "sign-in required", extension_inconnue: "extension not installed for this account", trop_lourd: "file too large", serveur: "refused by the server", illisible: "unreadable server response" },
    modeleEnregistre: "Table template saved: fill it in, cite each source, then load it.",
    fichierModele: "modele-regles-gabarit.json",
    natures: { "non-aedificandi": "no-build", alignement: "building line", sup: "public utility easement", ppri: "flood plan zone", hauteur: "height easement", autre: "other" },
    balise: function (n) { return "Servitude — " + n; },
    erreurs: {
      json: "the file is not readable JSON",
      format: "the format must be “" + FORMAT_REGLES + "”",
      jeux: "the table must contain 1 to " + MAX_JEUX + " rule sets",
      jeu: function (i) { return "set " + (i + 1) + ": identifier, kind (PLU or RNU), municipality, version and date (YYYY-MM-DD) are expected"; },
      regle: function (j, k) { return "set “" + j + "”, rule “" + k + "”: value or source missing"; },
      geojson: "the file must be a GeoJSON “FeatureCollection”",
      tropZones: "more than " + MAX_ZONES + " zones",
    },
    op: { regles: "Envelope rules table", parcelle: "Retain the plot", voies: "Street boundaries", gabarit: "Build the envelope", zones: "Place the zones", controle: "Check the easements" },
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
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var m2 = function (v, sep) { return fixe(v, 2, sep) + " m²"; };
var m1 = function (v, sep) { return fixe(v, 2, sep) + " m"; };
var aujourdhui = function () { return new Date().toISOString().slice(0, 10); };
var positif = function (v) { return typeof v === "number" && isFinite(v) && v > 0; };
var finiPositifOuNul = function (v) { return typeof v === "number" && isFinite(v) && v >= 0; };

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

// ——————————————————————————————————————————————— Géométrie (plan, polyèdre convexe)

var sous = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
var vect = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
var scal = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
var aire2 = function (pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

/** Polygone plan convexe (sens direct) ou null : sommets alignés retirés. */
function convexe(pts) {
  var p = pts.slice();
  if (aire2(p) < 0) p.reverse();
  var l = [];
  for (var i = 0; i < p.length; i++) {
    var a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    var z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (z < -1e-9) return null;
    if (z > 1e-9) l.push(b);
  }
  return l.length >= 3 ? l : null;
}

/** Coupe un polygone 3D convexe par le demi-espace n·x ≤ d ; rend les sommets gardés et ceux posés sur le plan. */
function couperFace(face, n, d) {
  var sortie = [], surPlan = [];
  for (var i = 0; i < face.length; i++) {
    var p = face[i], q = face[(i + 1) % face.length];
    var dp = scal(n, p) - d, dq = scal(n, q) - d;
    if (dp <= 1e-9) sortie.push(p);
    if ((dp < -1e-9 && dq > 1e-9) || (dp > 1e-9 && dq < -1e-9)) {
      var t = dp / (dp - dq);
      var x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      sortie.push(x);
      surPlan.push(x);
    } else if (Math.abs(dp) <= 1e-9) surPlan.push(p);
  }
  return { face: sortie.length >= 3 ? sortie : null, surPlan: surPlan };
}

/** Polyèdre convexe (liste de faces) coupé par n·x ≤ d ; la face de coupe est ajoutée. */
function couperPolyedre(faces, n, d) {
  var gardees = [], points = [];
  faces.forEach(function (f) {
    var r = couperFace(f, n, d);
    if (r.face) gardees.push(r.face);
    points = points.concat(r.surPlan);
  });
  var uniques = [];
  points.forEach(function (p) { if (!uniques.some(function (q) { return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 1e-7; })) uniques.push(p); });
  if (uniques.length >= 3) {
    var c = [0, 0, 0];
    uniques.forEach(function (p) { c = [c[0] + p[0] / uniques.length, c[1] + p[1] / uniques.length, c[2] + p[2] / uniques.length]; });
    var u = sous(uniques[0], c);
    var lu = Math.sqrt(scal(u, u)) || 1;
    u = [u[0] / lu, u[1] / lu, u[2] / lu];
    var w = vect(n, u);
    uniques.sort(function (a, b) { var pa = sous(a, c), pb = sous(b, c); return Math.atan2(scal(pa, w), scal(pa, u)) - Math.atan2(scal(pb, w), scal(pb, u)); });
    gardees.push(uniques);
  }
  return gardees;
}

/** Triangles orientés vers l'extérieur d'un polyèdre convexe. */
function triangulerPolyedre(faces) {
  var c = [0, 0, 0], k = 0;
  faces.forEach(function (f) { f.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; k++; }); });
  c = [c[0] / k, c[1] / k, c[2] / k];
  var tris = [];
  faces.forEach(function (f) {
    for (var i = 1; i + 1 < f.length; i++) {
      var t = [f[0], f[i], f[i + 1]];
      var n = vect(sous(t[1], t[0]), sous(t[2], t[0]));
      if (Math.sqrt(scal(n, n)) < 1e-10) continue;
      tris.push(scal(n, sous(t[0], c)) < 0 ? [t[0], t[2], t[1]] : t);
    }
  });
  return tris;
}
function volumePolyedre(tris) {
  var v = 0;
  tris.forEach(function (t) { v += scal(t[0], vect(t[1], t[2])) / 6; });
  return Math.abs(v);
}

/**
 * Gabarit : prisme de la parcelle (z0 → z0 + hauteur), coupé pour chaque limite par le retrait (plan vertical) et par le
 * prospect (z ≤ z0 + h0 + rapport × distance). Parcelle convexe : le volume est l'intersection de ces demi-espaces.
 */
function construireGabarit(parcelle, z0, voies, regles) {
  var h = regles.hauteur.valeur;
  var faces = [parcelle.map(function (p) { return [p[0], p[1], z0]; }).reverse(), parcelle.map(function (p) { return [p[0], p[1], z0 + h]; })];
  for (var i = 0; i < parcelle.length; i++) {
    var a = parcelle[i], b = parcelle[(i + 1) % parcelle.length];
    faces.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z0 + h], [a[0], a[1], z0 + h]]);
  }
  var limites = [];
  for (var j = 0; j < parcelle.length; j++) {
    var p = parcelle[j], q = parcelle[(j + 1) % parcelle.length];
    var dx = q[0] - p[0], dy = q[1] - p[1], l = Math.sqrt(dx * dx + dy * dy);
    var nin = [-dy / l, dx / l]; // intérieur à gauche (sens direct)
    var genre = voies[j] ? "voie" : "separative";
    var r = regles.limites[genre] || null;
    limites.push({ genre: genre, longueur: l, regle: r });
    if (!r) continue;
    // distance à la limite : nin·(x − p) ; retrait : nin·x ≥ nin·p + retrait  ⇔  −nin·x ≤ −(nin·p + retrait)
    var dp = nin[0] * p[0] + nin[1] * p[1];
    if (finiPositifOuNul(r.retrait)) faces = couperPolyedre(faces, [-nin[0], -nin[1], 0], -(dp + r.retrait));
    // prospect : z − z0 ≤ h0 + k (nin·x − dp)  ⇔  −k nin·x + z ≤ z0 + h0 − k dp
    if (positif(r.rapport)) faces = couperPolyedre(faces, [-r.rapport * nin[0], -r.rapport * nin[1], 1], z0 + (r.hauteurALimite || 0) - r.rapport * dp);
    if (faces.length < 4) return { tris: [], limites: limites };
  }
  var tris = triangulerPolyedre(faces);
  // Emprise constructible : la face basse restante.
  var base = faces.filter(function (f) { return f.every(function (x) { return Math.abs(x[2] - z0) < 1e-7; }); })[0];
  return { tris: tris, limites: limites, volume: volumePolyedre(tris), emprise: base ? Math.abs(aire2(base)) : 0 };
}

// ——————————————————————————————————————————————— Table des règles (sourcée, datée, archivée)

function lireValeur(v, k) {
  if (!v || typeof v.source !== "string" || !v.source.trim() || !(typeof v.valeur === "number" && isFinite(v.valeur) && v.valeur >= 0)) return null;
  return { valeur: v.valeur, source: v.source.trim().slice(0, 160), relu: v.relu === true, cle: k };
}
function lireLimite(v) {
  if (!v || typeof v.source !== "string" || !v.source.trim()) return null;
  var ok = function (x) { return x === undefined || x === null || finiPositifOuNul(x); };
  if (!ok(v.retrait) || !ok(v.rapport) || !ok(v.hauteurALimite)) return null;
  if (v.retrait == null && v.rapport == null) return null;
  return { retrait: typeof v.retrait === "number" ? v.retrait : null, rapport: typeof v.rapport === "number" ? v.rapport : null, hauteurALimite: typeof v.hauteurALimite === "number" ? v.hauteurALimite : null, source: v.source.trim().slice(0, 160), relu: v.relu === true };
}
function lireTable(brut) {
  var e = tx().erreurs;
  var d;
  try { d = JSON.parse(texte(brut).replace(/^﻿/, "")); } catch (err) { return { erreur: e.json }; }
  if (!d || d.format !== FORMAT_REGLES) return { erreur: e.format };
  if (!Array.isArray(d.jeux) || !d.jeux.length || d.jeux.length > MAX_JEUX) return { erreur: e.jeux };
  var jeux = [];
  for (var i = 0; i < d.jeux.length; i++) {
    var j = d.jeux[i];
    var ok = j && ["id", "commune", "version"].every(function (k) { return typeof j[k] === "string" && j[k].trim(); }) && NATURES_JEU.indexOf(j.nature) >= 0 && typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date);
    if (!ok) return { erreur: e.jeu(i) };
    var r = j.regles && typeof j.regles === "object" ? j.regles : {};
    var regles = { hauteur: null, limites: {}, stationnement: null };
    if (r.hauteur !== undefined) { regles.hauteur = lireValeur(r.hauteur, "hauteur"); if (!regles.hauteur) return { erreur: e.regle(j.id, "hauteur") }; }
    var lim = r.limites && typeof r.limites === "object" ? r.limites : {};
    for (var g = 0; g < 2; g++) {
      var k = g ? "separative" : "voie";
      if (lim[k] === undefined) continue;
      regles.limites[k] = lireLimite(lim[k]);
      if (!regles.limites[k]) return { erreur: e.regle(j.id, "limites." + k) };
    }
    if (r.stationnement !== undefined) {
      var s = r.stationnement;
      if (!s || !positif(s.surfaceParPlace) || typeof s.source !== "string" || !s.source.trim()) return { erreur: e.regle(j.id, "stationnement") };
      regles.stationnement = { surfaceParPlace: s.surfaceParPlace, source: s.source.trim().slice(0, 160), relu: s.relu === true };
    }
    var toutes = [regles.hauteur, regles.limites.voie, regles.limites.separative, regles.stationnement].filter(Boolean);
    jeux.push({ id: j.id.trim().slice(0, 40), nature: j.nature, commune: j.commune.trim().slice(0, 60), article: texte(j.article).trim().slice(0, 120), version: j.version.trim().slice(0, 20), date: j.date, regles: regles, relu: toutes.every(function (x) { return x.relu; }) });
  }
  return { jeux: jeux };
}

async function donnees() { return (await planche.donnees.lire("projet")) || {}; }
async function jeuxGardes() {
  var toutes = await donnees();
  var cles = Object.keys(toutes).filter(function (k) { return /^gabarit\.regles\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.split(".")[2]) - Number(b.split(".")[2]); });
  return { jeux: cles.map(function (k) { return toutes[k]; }).filter(function (j) { return j && j.id; }), cles: cles };
}
/** Jeu choisi ; sans jeu PLU, le jeu RNU est proposé (n° 15), titré « à vérifier ». */
async function jeuChoisi() {
  var g = await jeuxGardes();
  var j = g.jeux.filter(function (x) { return x.id === valeurs.jeu; })[0] || g.jeux.filter(function (x) { return x.nature === "PLU"; })[0] || g.jeux[0] || null;
  if (j) valeurs.jeu = j.id;
  return { jeu: j, jeux: g.jeux };
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

async function chargerRegles() {
  var x = tx();
  var f = await ouvrirArchive([".json"]);
  if (!f) return;
  var r = lireTable(f.texte);
  if (r.erreur) return alerte(x.reglesRefusees + r.erreur);
  var anciens = await jeuxGardes();
  await enUnPas(x.op.regles, async function () {
    for (var i = 0; i < r.jeux.length; i++) await planche.donnees.ecrire("projet", "gabarit.regles." + i, r.jeux[i]);
    for (var k = r.jeux.length; k < anciens.cles.length; k++) await planche.donnees.effacer("projet", "gabarit.regles." + k);
    await planche.donnees.ecrire("projet", "gabarit.regles-archive", refArchive(f));
  });
  if (!r.jeux.some(function (j) { return j.id === valeurs.jeu; })) valeurs.jeu = r.jeux[0].id;
  return info(x.reglesChargees(r.jeux.length));
}

async function enregistrerModele() {
  var x = tx();
  var vide = function () { return { valeur: null, source: "", relu: false }; };
  var limite = function () { return { retrait: null, rapport: null, hauteurALimite: null, source: "", relu: false }; };
  var modele = {
    format: FORMAT_REGLES,
    jeux: [
      { id: "plu-1", nature: "PLU", commune: "", version: "1", date: aujourdhui(), regles: { hauteur: vide(), limites: { voie: limite(), separative: limite() }, stationnement: { surfaceParPlace: null, source: "", relu: false } } },
      { id: "rnu-1", nature: "RNU", commune: "", article: "", version: "1", date: aujourdhui(), regles: { hauteur: vide(), limites: { separative: limite() } } },
    ],
  };
  if (await planche.fichiers.enregistrer(x.fichierModele, JSON.stringify(modele, null, 2) + "\n")) await info(x.modeleEnregistre);
}

// ——————————————————————————————————————————————— Gabarit (n° 5, n° 15)

var cleSegment = function (a, b) {
  var r = function (p) { return Math.round(p[0] * 1000) + ":" + Math.round(p[1] * 1000); };
  var s = [r(a), r(b)].sort();
  return s[0] + "|" + s[1];
};

async function retenirParcelle() {
  var x = tx();
  var sel = await planche.selection.lire();
  var m = await planche.modele.lire();
  var f = sel.length === 1 ? m.faces.filter(function (y) { return y.id === sel[0]; })[0] : null;
  var horiz = f && f.trous === 0 && f.points.every(function (p) { return Math.abs(p[2] - f.points[0][2]) < 1e-6; });
  var poly = horiz ? convexe(f.points) : null;
  if (!poly) return alerte(x.parcelleRefusee);
  var sep = (await planche.unites.lire()).separateur;
  await enUnPas(x.op.parcelle, function () { return planche.donnees.ecrire("projet", "gabarit.parcelle", { face: f.id, points: poly.map(function (p) { return [p[0], p[1]]; }), z: f.points[0][2] }); });
  return info(x.parcelleRetenue(m2(Math.abs(aire2(poly)), sep)));
}

async function retenirVoies() {
  var x = tx();
  var sel = await planche.selection.lire();
  var m = await planche.modele.lire();
  var aretes = m.aretes.filter(function (a) { return sel.indexOf(a.id) >= 0 && a.points.length >= 2; });
  if (!aretes.length) return alerte(x.voiesVides);
  var cles = aretes.map(function (a) { return cleSegment(a.points[0], a.points[a.points.length - 1]); });
  await enUnPas(x.op.voies, function () { return planche.donnees.ecrire("projet", "gabarit.voies", { segments: cles.slice(0, 200) }); });
  return info(x.voiesRetenues(cles.length));
}

function voiesDe(parcelle, gardees) {
  var cles = (gardees && gardees.segments) || [];
  return parcelle.map(function (p, i) { return cles.indexOf(cleSegment(p, parcelle[(i + 1) % parcelle.length])) >= 0; });
}

/** Abscisse au-delà de tout le dessin : le gabarit y est tracé, groupé, puis ramené, sans se souder à la parcelle. */
async function bordDroit() {
  var m = await planche.modele.lire({ portee: "monde" });
  var x0 = 0;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { x0 = Math.max(x0, q[0]); }); });
  return x0 + 10;
}
async function groupeExiste(id) {
  if (!id) return false;
  var m = await planche.modele.lire();
  return m.objets.some(function (o) { return o.id === id; });
}

async function construire() {
  var x = tx();
  var d = await donnees();
  var c = await jeuChoisi();
  if (!c.jeux.length) return alerte(x.sansRnu);
  var jeu = c.jeu;
  if (!d["gabarit.parcelle"]) return alerte(x.vides.gabarit);
  if (!jeu.regles.hauteur) return alerte(x.hauteurAbsente);
  var p = d["gabarit.parcelle"];
  var g = construireGabarit(p.points, p.z, voiesDe(p.points, d["gabarit.voies"]), jeu.regles);
  if (!g.tris.length) return alerte(x.gabaritVide);
  var sep = (await planche.unites.lire()).separateur;
  var ancien = d["gabarit.objet"];
  var id = await enUnPas(x.op.gabarit, async function () {
    if (ancien && (await groupeExiste(ancien.id))) await planche.modele.effacer([ancien.id]);
    var ecart = await bordDroit();
    var avant = {};
    (await planche.modele.lire()).faces.forEach(function (f) { avant[f.id] = true; });
    await planche.modele.triangles(g.tris.map(function (t) { return t.map(function (q) { return [q[0] + ecart, q[1], q[2]]; }); }));
    var nouvelles = (await planche.modele.lire()).faces.filter(function (f) { return !avant[f.id]; }).map(function (f) { return f.id; });
    var gr = await planche.modele.grouper(nouvelles, x.nomGabarit(jeu));
    await planche.modele.deplacer([gr], [-ecart, 0, 0]);
    var mat = await planche.matieres.creer("Gabarit " + jeu.nature, jeu.nature === "PLU" ? "#3b6fd4" : "#c27c0e", null, 0.3);
    await planche.matieres.appliquer([gr], mat);
    var bal = await planche.balises.creer("Gabarit", "#3b6fd4");
    await planche.balises.appliquer([gr], bal);
    await planche.donnees.ecrire("projet", "gabarit.objet", { id: gr, jeu: jeu.id, volume: g.volume, emprise: g.emprise });
    return gr;
  });
  if (!id) return;
  if (jeu.nature === "RNU" && !c.jeux.some(function (j) { return j.nature === "PLU"; })) await info(x.rnuSeul(jeu));
  return info(x.construit(fixe(g.volume, 0, sep) + " m³"));
}

// ——————————————————————————————————————————————— Servitudes (n° 11, n° 24)

/** Point WGS 84 → plan de la Planche : plan local tangent autour de l'Emplacement, tourné selon le nord vrai. */
function versPlan(e, lon, lat) {
  var rad = Math.PI / 180;
  var est = RAYON_TERRE * Math.cos(e.latitude * rad) * (lon - e.longitude) * rad;
  var nord = RAYON_TERRE * (lat - e.latitude) * rad;
  var a = e.nord * rad;
  return [nord * Math.sin(a) + est * Math.cos(a), nord * Math.cos(a) - est * Math.sin(a)];
}

function lireZones(brut, e) {
  var x = tx();
  var d;
  try { d = JSON.parse(texte(brut).replace(/^﻿/, "")); } catch (err) { return { erreur: x.erreurs.json }; }
  if (!d || d.type !== "FeatureCollection" || !Array.isArray(d.features)) return { erreur: x.erreurs.geojson };
  var zones = [], refusees = 0, nonLues = {};
  d.features.forEach(function (f) {
    var g = f && f.geometry;
    var t = g && g.type;
    if (t !== "Polygon" && t !== "MultiPolygon") { nonLues[t || "?"] = (nonLues[t || "?"] || 0) + 1; return; }
    var pr = (f && f.properties) || {};
    var nature = NATURES_ZONE.indexOf(pr.nature) >= 0 ? pr.nature : null;
    var source = texte(pr.source).trim(), date = texte(pr.date).trim();
    var plafond = pr.plafond === undefined || pr.plafond === null ? null : Number(pr.plafond);
    var anneaux = t === "Polygon" ? [g.coordinates && g.coordinates[0]] : (g.coordinates || []).map(function (p) { return p && p[0]; });
    if (!nature || !source || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (plafond !== null && !(plafond >= 0)) || !anneaux.length) { refusees += anneaux.length || 1; return; }
    anneaux.forEach(function (a) {
      if (!Array.isArray(a) || a.length < 4 || a.length > MAX_POINTS_ZONE || !a.every(function (q) { return Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]); })) { refusees++; return; }
      var pts = a.slice(0, a.length - 1).map(function (q) { return versPlan(e, q[0], q[1]); });
      if (Math.abs(aire2(pts)) < 1e-6) { refusees++; return; }
      zones.push({ nature: nature, libelle: texte(pr.libelle).trim().slice(0, 80) || x.natures[nature], source: source.slice(0, 160), date: date, plafond: plafond, alea: texte(pr.alea).trim().slice(0, 40), points: pts });
    });
  });
  if (zones.length > MAX_ZONES) return { erreur: x.erreurs.tropZones };
  return { zones: zones, refusees: refusees, nonLues: nonLues };
}

async function poserZones() {
  var x = tx();
  var site = await planche.site.lire();
  if (!site.emplacement) return alerte(x.emplacementAbsent);
  var f = await ouvrirArchive([".geojson", ".json"]);
  if (!f) return;
  var r = lireZones(f.texte, site.emplacement);
  if (r.erreur) return alerte(x.zonesRefusees + r.erreur);
  var hAff = lireNombre(valeurs.affichage);
  var d = await donnees();
  var anciennes = (d["servitudes.zones"] && d["servitudes.zones"].objets) || [];
  await enUnPas(x.op.zones, async function () {
    var existants = {};
    (await planche.modele.lire()).objets.forEach(function (o) { existants[o.id] = true; });
    var vieux = anciennes.filter(function (id) { return existants[id]; });
    if (vieux.length) await planche.modele.effacer(vieux);
    var ecart = await bordDroit();
    var liste = [];
    var balises = {}, matieres = {};
    for (var i = 0; i < r.zones.length; i++) {
      var z = r.zones[i];
      var m0 = await planche.modele.lire();
      var avant = {};
      m0.faces.forEach(function (y) { avant[y.id] = true; });
      var pts = z.points.map(function (q) { return [q[0] + ecart, q[1], 0]; });
      await planche.modele.lignes(pts.map(function (q, k) { return [q, pts[(k + 1) % pts.length]]; }));
      var base = (await planche.modele.lire()).faces.filter(function (y) { return !avant[y.id]; })[0];
      if (!base) continue;
      var h = z.plafond !== null ? z.plafond : hAff > 0 ? hAff : 0;
      if (h > 0) {
        var n = base.points.length >= 3 ? vect(sous(base.points[1], base.points[0]), sous(base.points[2], base.points[0])) : [0, 0, 1];
        await planche.modele.pousser(base.id, n[2] < 0 ? -h : h);
      }
      var m2b = await planche.modele.lire();
      var gr = await planche.modele.grouper(m2b.faces.filter(function (y) { return !avant[y.id]; }).map(function (y) { return y.id; }), z.libelle);
      if (!balises[z.nature]) balises[z.nature] = await planche.balises.creer(x.balise(x.natures[z.nature]), COULEURS_ZONE[z.nature]);
      if (!matieres[z.nature]) matieres[z.nature] = await planche.matieres.creer(x.balise(x.natures[z.nature]), COULEURS_ZONE[z.nature], null, 0.25);
      await planche.balises.appliquer([gr], balises[z.nature]);
      await planche.matieres.appliquer([gr], matieres[z.nature]);
      await planche.donnees.ecrire(gr, "zone", { nature: z.nature, libelle: z.libelle, source: z.source, date: z.date, plafond: z.plafond, alea: z.alea });
      liste.push({ objet: gr });
    }
    if (ecart && liste.length) await planche.modele.deplacer(liste.map(function (z) { return z.objet; }), [-ecart, 0, 0]);
    await planche.donnees.ecrire("projet", "servitudes.zones", { objets: liste.map(function (z) { return z.objet; }), refusees: r.refusees, nonLues: r.nonLues, archive: refArchive(f), controle: false });
  });
  return info(x.zonesPosees(r.zones.length));
}

/** Zones posées : leurs fiches sont gardées sur chaque groupe (une donnée par objet), la liste des groupes dans le projet. */
async function zonesPosees(d) {
  var g = d["servitudes.zones"];
  if (!g) return { g: null, liste: [] };
  var existants = {};
  (await planche.modele.lire()).objets.forEach(function (o) { existants[o.id] = true; });
  var liste = [];
  for (var i = 0; i < g.objets.length; i++) {
    if (!existants[g.objets[i]]) continue;
    var dz = (await planche.donnees.lire(g.objets[i])) || {};
    if (dz.zone) liste.push(Object.assign({ objet: g.objets[i], controle: dz.controle || null }, dz.zone));
  }
  return { g: g, liste: liste };
}

/** Contour au sol d'une zone posée : sa face la plus basse, lue dans le modèle. */
async function contourZone(monde, objet) {
  var faces = monde.faces.filter(function (f) { return f.chemin[0] === objet && f.points.every(function (q) { return Math.abs(q[2] - f.points[0][2]) < 1e-6; }); });
  faces.sort(function (a, b) { return a.points[0][2] - b.points[0][2]; });
  return faces.length ? faces[0].points.map(function (q) { return [q[0], q[1]]; }) : null;
}

function dansPolygone(p, poly) {
  var dedans = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) dedans = !dedans;
  }
  return dedans;
}

/** Contrôle : rayons verticaux sur une grille de chaque zone, contre les volumes du projet seuls (zones et gabarit écartés). */
async function controler() {
  var x = tx();
  var d = await donnees();
  var zp = await zonesPosees(d);
  var liste = zp.liste;
  if (!liste.length) return alerte(x.vides.servitudes);
  var monde = await planche.modele.lire({ portee: "monde" });
  var exclus = {};
  liste.forEach(function (z) { exclus[z.objet] = true; });
  if (d["gabarit.objet"]) exclus[d["gabarit.objet"].id] = true;
  var projet = (await planche.modele.lire()).objets.filter(function (o) { return !exclus[o.id]; }).map(function (o) { return o.id; });
  var resultats = [];
  var n = 0;
  for (var i = 0; i < liste.length; i++) {
    var z = liste[i];
    var plafond = z.plafond !== null ? z.plafond : z.nature === "non-aedificandi" ? 0 : null;
    var contour = await contourZone(monde, z.objet);
    if (plafond === null || !projet.length || !contour) { resultats.push({ objet: z.objet, etat: plafond === null || !contour ? "non-controle" : "libre" }); continue; }
    z.points = contour;
    var xs = z.points.map(function (p) { return p[0]; }), ys = z.points.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var pas = Math.max((x1 - x0) / 20, (y1 - y0) / 20, 0.25);
    var rayons = [];
    for (var gx = x0 + pas / 2; gx < x1 && rayons.length < RAYONS_PAR_ZONE; gx += pas)
      for (var gy = y0 + pas / 2; gy < y1 && rayons.length < RAYONS_PAR_ZONE; gy += pas)
        if (dansPolygone([gx, gy], z.points)) rayons.push({ origine: [gx, gy, 1000], direction: [0, 0, -1] });
    var haut = null;
    if (rayons.length) {
      var r = await planche.geometrie.rayon(rayons, { objets: projet });
      r.impacts.forEach(function (im) { if (im && im.point[2] > plafond + 0.005 && (haut === null || im.point[2] > haut.z)) haut = { z: im.point[2], chemin: im.chemin }; });
    }
    if (haut) n++;
    resultats.push({ objet: z.objet, etat: haut ? "intrusion" : "libre", ecart: haut ? haut.z - plafond : 0, par: haut && haut.chemin.length ? haut.chemin[0] : null });
  }
  await enUnPas(x.op.controle, async function () {
    for (var k = 0; k < resultats.length; k++) await planche.donnees.ecrire(resultats[k].objet, "controle", { etat: resultats[k].etat, ecart: resultats[k].ecart || 0 });
    await planche.donnees.ecrire("projet", "servitudes.zones", Object.assign({}, zp.g, { controle: true }));
  });
  return info(x.controle(n));
}

// ——————————————————————————————————————————————— Scénarios (n° 31)

async function scenarios(jeu) {
  var balises = (await planche.balises.lire()).filter(function (b) { return /^sc[ée]nario/i.test(b.nom); });
  var h = lireNombre(valeurs.hauteur);
  var niveaux = (await planche.niveaux.lire()).niveaux;
  var regle = jeu && jeu.regles.stationnement;
  var l = [];
  for (var i = 0; i < balises.length; i++) {
    var autres = balises.filter(function (b, k) { return k !== i; }).map(function (b) { return b.id; });
    // Seuls les solides de cette balise : projection et coupes sans les autres scénarios ni les volumes sans balise.
    var p = await planche.geometrie.projection(null, autres);
    var propres = p.solides.filter(function (s) { return s.balise === balises[i].id; });
    var emprise = propres.length ? (await planche.geometrie.projection(propres.map(function (s) { return s.id; }))).aire : 0;
    var surface = null;
    if (h > 0 && niveaux.length && propres.length) {
      surface = 0;
      for (var k = 0; k < niveaux.length; k++) surface += (await planche.geometrie.coupe(niveaux[k].altitude + h, propres.map(function (s) { return s.id; }))).aire;
    }
    l.push({ nom: balises[i].nom, emprise: emprise, surface: surface, places: regle && surface !== null ? Math.ceil(surface / regle.surfaceParPlace - 1e-9) : null });
  }
  return { lignes: l, regle: regle || null };
}

async function exporterScenarios() {
  var x = tx();
  var c = await jeuChoisi();
  var s = await scenarios(c.jeu);
  var sep = (await planche.unites.lire()).separateur;
  var csv = [x.csvEntete].concat(s.lignes.map(function (l) { return [l.nom, fixe(l.emprise, 2, sep), l.surface === null ? x.nonEvaluee : fixe(l.surface, 2, sep), l.places === null ? x.nonEvaluee : String(l.places)].join(";"); })).join("\n") + "\n";
  if (await planche.fichiers.enregistrer(x.fichierCsv, csv)) await info(x.exporte);
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var c = await jeuChoisi();
  var d = await donnees();
  var formulaire = [{ id: "jeu", libelle: x.champs.jeu, valeur: valeurs.jeu, choix: c.jeux.length ? c.jeux.map(function (j) { return { valeur: j.id, libelle: x.jeuLibelle(j) }; }) : [{ valeur: "", libelle: x.aucunJeu }] }];
  var e = { lignes: [], vide: null, resultats: [], pied: null };
  if (onglet === "gabarit") {
    var p = d["gabarit.parcelle"];
    if (!p) e.vide = x.vides.gabarit;
    else {
      var voies = voiesDe(p.points, d["gabarit.voies"]);
      var jeu = c.jeu;
      e.lignes = p.points.map(function (q, i) {
        var r = q, s = p.points[(i + 1) % p.points.length];
        var lg = Math.sqrt((s[0] - r[0]) * (s[0] - r[0]) + (s[1] - r[1]) * (s[1] - r[1]));
        var genre = voies[i] ? "voie" : "separative";
        var regle = jeu && jeu.regles.limites[genre];
        var nom = (i + 1) + " · " + (voies[i] ? x.voie : x.separative);
        if (!regle) return { genre: "ligne", ton: "gris", cellules: [nom, m1(lg, sep), x.nonEvalue, x.nonEvalue] };
        var pro = regle.rapport === null ? x.aucun : "H ≤ " + fixe(regle.hauteurALimite || 0, 2, sep) + " + " + fixe(regle.rapport, 2, sep) + " × L";
        return { genre: "ligne", ton: regle.relu ? "" : "limite", cellules: [nom, m1(lg, sep), regle.retrait === null ? x.aucun : m1(regle.retrait, sep), pro] };
      });
      e.resultats.push({ libelle: x.res.parcelle, valeur: m2(Math.abs(aire2(p.points)), sep) });
      if (jeu) {
        e.resultats.push({ libelle: x.res.jeu, valeur: jeu.nature + " " + jeu.commune + (jeu.article ? " · " + jeu.article : "") + (jeu.relu ? "" : " (" + x.aVerifier + ")"), ton: jeu.relu ? "" : "limite" });
        e.resultats.push({ libelle: x.res.hauteur, valeur: jeu.regles.hauteur ? m1(jeu.regles.hauteur.valeur, sep) : x.nonRenseignee });
        var absentes = ["voie", "separative"].filter(function (k) { return !jeu.regles.limites[k]; }).map(function (k) { return k === "voie" ? x.voie : x.separative; });
        if (absentes.length) e.resultats.push({ libelle: x.res.absentes, valeur: absentes.join(", "), ton: "limite" });
      }
      var o = d["gabarit.objet"];
      var present = o && (await groupeExiste(o.id));
      e.resultats.push({ libelle: x.res.volume, valeur: present ? fixe(o.volume, 0, sep) + " m³" : x.nonEvalue, ton: present ? "ok" : "" });
      e.resultats.push({ libelle: x.res.emprise, valeur: present ? m2(o.emprise, sep) : x.nonEvaluee });
    }
  } else if (onglet === "servitudes") {
    formulaire = [{ id: "affichage", libelle: x.champs.affichage, valeur: valeurs.affichage }];
    var site = await planche.site.lire();
    var em = site.emplacement;
    e.resultats.push({ libelle: x.res.emplacement, valeur: em ? fixe(em.latitude, 5, sep) + " ; " + fixe(em.longitude, 5, sep) + " · N " + fixe(em.nord, 1, sep) + "°" : x.nonRenseignee, ton: em ? "" : "limite" });
    var zp2 = await zonesPosees(d);
    var g = zp2.g;
    var liste = zp2.liste;
    if (!liste.length) e.vide = x.vides.servitudes;
    var ctl = {};
    liste.forEach(function (z) { if (z.controle) ctl[z.objet] = z.controle; });
    var intrus = 0, nonC = 0;
    e.lignes = liste.map(function (z) {
      var r = ctl[z.objet];
      var etatZ = !r ? x.nonEvalue : r.etat === "intrusion" ? x.intrusion(m1(r.ecart, sep)) : r.etat === "libre" ? x.libre : x.nonEvalue;
      if (r && r.etat === "intrusion") intrus++;
      if (r && r.etat === "non-controle") nonC++;
      return { genre: "ligne", ton: !r ? "gris" : r.etat === "intrusion" ? "alerte" : r.etat === "libre" ? "ok" : "gris", cellules: [z.libelle + " (" + z.date + ")", x.natures[z.nature] + (z.alea ? " (" + z.alea + ")" : ""), z.plafond === null ? x.sansPlafond : m1(z.plafond, sep), etatZ] };
    });
    if (g) {
      e.resultats.push({ libelle: x.res.zones, valeur: String(liste.length) });
      var sources = [];
      liste.forEach(function (z) { if (sources.indexOf(z.source) < 0) sources.push(z.source); });
      if (sources.length) e.resultats.push({ libelle: x.res.sources, valeur: sources.slice(0, 5).join(" ; ") + (sources.length > 5 ? " …" : "") });
      if (g.refusees) e.resultats.push({ libelle: x.res.refusees, valeur: String(g.refusees), ton: "limite" });
      var nl = Object.keys(g.nonLues || {});
      if (nl.length) e.resultats.push({ libelle: x.res.nonLues, valeur: nl.map(function (k) { return k + " × " + g.nonLues[k]; }).join(", "), ton: "limite" });
      if (g.controle) {
        e.resultats.push({ libelle: x.res.intrusions, valeur: String(intrus), ton: intrus ? "alerte" : "ok" });
        if (nonC) e.resultats.push({ libelle: x.res.nonControlees, valeur: String(nonC), ton: "limite" });
      }
    }
  } else if (onglet === "scenarios") {
    formulaire.push({ id: "hauteur", libelle: x.champs.hauteur, valeur: valeurs.hauteur });
    var s = await scenarios(c.jeu);
    var te = 0, ts = 0, tp = 0, sansS = false, sansP = false;
    e.lignes = s.lignes.map(function (l) {
      te += l.emprise;
      if (l.surface === null) sansS = true; else ts += l.surface;
      if (l.places === null) sansP = true; else tp += l.places;
      return { genre: "ligne", ton: l.surface === null ? "gris" : "", cellules: [l.nom, m2(l.emprise, sep), l.surface === null ? x.nonEvaluee : m2(l.surface, sep), l.places === null ? x.nonEvaluee : String(l.places)] };
    });
    e.resultats.push({ libelle: x.res.regle, valeur: s.regle ? fixe(s.regle.surfaceParPlace, 1, sep) + " m² / place" + (s.regle.relu ? "" : " (" + x.aVerifier + ")") : x.nonRenseignee, ton: s.regle ? (s.regle.relu ? "" : "limite") : "" });
    e.vide = s.lignes.length ? null : x.vides.scenarios;
  } else {
    e.lignes = c.jeux.map(function (j) { return { genre: "ligne", cellules: [j.nature + " " + j.commune, j.version, j.date, j.relu ? "oui" : x.aVerifier] }; });
    e.vide = c.jeux.length ? null : x.vides.regles;
  }
  var lignes = e.lignes;
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    note: x.note[onglet],
    formulaire: formulaire,
    resultats: e.resultats,
    encart: c.jeux.length ? x.encart : x.sansTable,
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
action("retenir-parcelle", retenirParcelle);
action("retenir-voies", retenirVoies);
action("construire", construire);
action("poser-zones", poserZones);
action("controler", controler);
action("exporter-scenarios", exporterScenarios);
action("charger-regles", chargerRegles);
action("modele-regles", enregistrerModele);

var commande = function (nom, ong) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) page = 0;
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    await rafraichir();
  });
};
commande("ouvrir-panneau", "gabarit");
commande("gabarit", "gabarit");
commande("servitudes", "servitudes");
commande("scenarios", "scenarios");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
