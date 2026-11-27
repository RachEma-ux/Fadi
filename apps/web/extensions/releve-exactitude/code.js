// Extension « Relevé et exactitude » (catalogue des extensions de la Planche, cas 1 de la feuille de route, extension
// n° 2 ; maquette validée le 27 novembre 2026). Quatre onglets, un par entrée du catalogue :
//   Pièce hors d'équerre (n° 2, D1-F2-029) · Point par deux distances (n° 6, D1-F2-028) ·
//   Provenance de l'existant (n° 18, D4-F23-026) · Bulletin d'exactitude (n° 3, D1-F2-043).
//
// Rien n'est jamais corrigé : la tolérance de fermeture, le pas des longueurs et les seuils du bulletin sont déclarés
// par l'utilisateur ; l'extension montre l'écart et nomme la mesure en cause.

var VERSION = "1.0.0";
var PANNEAU = "releve";
var ONGLETS = ["piece", "point", "provenance", "bulletin"];
var REGLES = { piece: "piece-releve/1", point: "point-deux-distances/1", provenance: "provenance/1", bulletin: "bulletin-exactitude/1" };
var LIGNES_PAR_PAGE = 80;
var TAILLE_PAQUET = 3600;
var MAX_PAQUETS = 60;
var MAX_MARQUES = 3000;
var MAX_CONSTATS = 2000;
var MAX_COTES = 40;

var onglet = "piece";
var page = 0;
var langue = "fr";
// Valeurs des formulaires, gardées pendant la séance.
var valeurs = {
  cotes: "", diagonales: "", tolerance: "5",
  d1: "", d2: "", cote: "gauche", triangle: "",
  pas: "1", angle: "0,2", sommets: "0,5",
};
var dernierBulletin = null;

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    regle: {
      piece: "Règle : sommets construits par triangles depuis le premier sommet (côtés, puis diagonales depuis le premier sommet) ; la diagonale en plus est redondante et donne l'écart de fermeture.",
      point: "Règle : intersection des deux cercles centrés sur les extrémités de l'arête choisie, du côté demandé ; un triangle se pose par ses trois côtés.",
      provenance: "Règle : chaque élément marqué porte sa provenance (mesuré, déduit, supposé, plan ancien) et sa précision déclarée en millimètres.",
      bulletin: "Règle : longueurs hors du pas, angles presque droits ou presque alignés, sommets presque confondus, aux seuils déclarés ; empreinte du dessin au 0,1 mm.",
    },
    note: {
      piece: "Au-delà de la tolérance, la pièce n'est pas posée : l'écart et la mesure en cause sont nommés.",
      point: "Sélectionnez une arête horizontale : ses extrémités sont les deux points connus, dans l'ordre de l'arête.",
      provenance: "Sélectionnez des éléments du dessin, puis « Marquer la sélection ». Un clic sur une ligne sélectionne l'élément.",
      bulletin: "Bulletin d'exactitude : longueurs hors du pas, angles à moins du seuil de 0° ou 90°, sommets à moins du seuil ; fichier .md daté à joindre à l'envoi. Rien n'est corrigé.",
    },
    champs: {
      cotes: "Côtés dans l'ordre du relevé (m)",
      diagonales: "Diagonales (m)",
      tolerance: "Tolérance de fermeture (mm)",
      d1: "Distance depuis le point 1 (m)",
      d2: "Distance depuis le point 2 (m)",
      cote: "Côté",
      triangle: "Triangle : côtés a ; b ; c (m)",
      pas: "Pas des longueurs (mm)",
      angle: "Seuil d'angle (°)",
      sommets: "Seuil des sommets (mm)",
    },
    gauche: "À gauche de l'arête",
    droite: "À droite de l'arête",
    redondante: "Mesure redondante",
    diagonale: function (k) { return "diagonale " + k; },
    aucune: "aucune : écart non évalué",
    ecart: "Écart de fermeture",
    angles: "Angles",
    surface: "Surface",
    sommet: "Sommet",
    lireNombres: function (quoi) { return "« " + quoi + " » : des nombres positifs séparés par « ; » sont attendus."; },
    pasAssez: function (n) { return "Il faut au moins 3 côtés (au plus " + n + ")."; },
    diagonalesAttendues: function (n) { return "Pour " + n + " côtés, il faut " + (n - 3) + (n - 3 > 1 ? " diagonales" : " diagonale") + " depuis le premier sommet (une de plus pour contrôler la fermeture)."; },
    impossible: function (k) { return "Les mesures ne ferment pas : le sommet " + k + " ne peut pas être construit (un côté est plus long que la somme des deux autres)."; },
    horsTolerance: function (ecart, tol, k) { return "Écart de fermeture de " + ecart + " mm au-delà de la tolérance de " + tol + " mm : mesure en cause, la diagonale " + k + ". La pièce n'est pas posée."; },
    toleranceInvalide: "La tolérance doit être un nombre positif en millimètres.",
    opPiece: "Poser la pièce relevée",
    piecePosee: "Pièce posée à droite du dessin : ",
    calculer: "Saisissez les côtés et les diagonales, puis l'écart et les angles s'affichent.",
    choisirArete: "Sélectionnez une seule arête : ses extrémités sont les deux points connus.",
    pasHorizontale: "Cette arête n'est pas horizontale : le point se construit dans le plan horizontal de l'arête.",
    distances: "Les deux distances doivent être des nombres positifs.",
    pasDIntersection: function (ab) { return "Les deux cercles ne se coupent pas : avec une base de " + ab + " m, ces distances ne forment pas de triangle."; },
    opPoint: "Construire un point par deux distances",
    pointConstruit: "Point construit : ",
    opTriangle: "Poser un triangle par ses trois côtés",
    trianglePose: "Triangle posé à droite du dessin.",
    triangleAttendu: "Trois côtés positifs a ; b ; c sont attendus.",
    point: "Point",
    base: "Base",
    // Provenance
    titreMarquer: "Marquer la provenance",
    provenance: "Provenance",
    precision: "Précision (mm)",
    noteMarque: "Note (facultative)",
    mesure: "Mesuré",
    deduit: "Déduit",
    suppose: "Supposé",
    planAncien: "Plan ancien",
    retirerMarque: "Retirer la marque",
    choisirElements: "Sélectionnez d'abord un ou plusieurs éléments du dessin.",
    marques: function (n) { return n + (n > 1 ? " éléments marqués" : " élément marqué"); },
    retirees: function (n) { return n + (n > 1 ? " marques retirées" : " marque retirée"); },
    tropMarques: "Trop d'éléments marqués : 3 000 au plus.",
    elements: function (n) { return n + (n > 1 ? " éléments" : " élément"); },
    face: "Face",
    arete: "Arête",
    objet: "Objet",
    introuvable: "introuvable dans le niveau ouvert",
    videProvenance: "Aucun élément marqué : sélectionnez des éléments, puis « Marquer la sélection ».",
    colProvenance: ["Élément", "Mesure", "Précision", "Note"],
    // Bulletin
    seuilsInvalides: "Les seuils doivent être des nombres positifs.",
    longueurs: "Longueurs hors du pas",
    anglesPresque: "Angles presque droits ou presque alignés",
    sommetsPresque: "Sommets presque confondus",
    empreinte: "Empreinte du dessin",
    constats: function (n) { return n + (n > 1 ? " constats" : " constat"); },
    aucunConstat: "aucun",
    colBulletin: ["Contrôle", "Élément", "Valeur"],
    controle: "Dessin contrôlé : ",
    videBulletin: "Lancez « Contrôler le dessin » : le bulletin s'affiche ici.",
    exporte: "Bulletin exporté.",
    controlerDabord: "Contrôlez d'abord le dessin.",
    perime: "Le dessin a changé depuis le contrôle : contrôlez-le à nouveau avant d'exporter.",
    fichier: function (d) { return "bulletin-exactitude-" + d + ".md"; },
    md: {
      titre: "Bulletin d'exactitude du dessin",
      date: "Date",
      version: "Règle",
      seuils: "Seuils déclarés",
      resume: "Résumé",
      details: "Constats",
      provenance: "Provenance de l'existant",
      verification: "Vérification par le destinataire : ouvrir le dessin reçu, lancer le bulletin avec les mêmes seuils et comparer l'empreinte. Une empreinte différente signale un dessin modifié depuis l'envoi.",
      rien: "Rien n'a été corrigé dans le dessin.",
      tronque: function (n) { return "… et " + n + " autres constats (liste limitée)."; },
    },
    ecartDe: function (v) { return "écart " + v; },
  },
  en: {
    regle: {
      piece: "Rule: vertices built as triangles from the first vertex (sides, then diagonals from the first vertex); the extra diagonal is redundant and gives the closure gap.",
      point: "Rule: intersection of the two circles centred on the chosen edge's ends, on the requested side; a triangle is laid from its three sides.",
      provenance: "Rule: each marked element carries its provenance (measured, deduced, assumed, old drawing) and its declared accuracy in millimetres.",
      bulletin: "Rule: lengths off the step, nearly square or nearly aligned angles, nearly coincident vertices, at the declared thresholds; drawing fingerprint at 0.1 mm.",
    },
    note: {
      piece: "Beyond the tolerance, the room is not laid: the gap and the measurement at fault are named.",
      point: "Select a horizontal edge: its ends are the two known points, in the edge's order.",
      provenance: "Select drawing elements, then « Mark the selection ». Clicking a line selects the element.",
      bulletin: "Accuracy report: lengths off the step, angles within the threshold of 0° or 90°, vertices within the threshold; dated .md file to attach when sending. Nothing is corrected.",
    },
    champs: {
      cotes: "Sides in survey order (m)",
      diagonales: "Diagonals (m)",
      tolerance: "Closure tolerance (mm)",
      d1: "Distance from point 1 (m)",
      d2: "Distance from point 2 (m)",
      cote: "Side",
      triangle: "Triangle: sides a ; b ; c (m)",
      pas: "Length step (mm)",
      angle: "Angle threshold (°)",
      sommets: "Vertex threshold (mm)",
    },
    gauche: "Left of the edge",
    droite: "Right of the edge",
    redondante: "Redundant measurement",
    diagonale: function (k) { return "diagonal " + k; },
    aucune: "none: gap not assessed",
    ecart: "Closure gap",
    angles: "Angles",
    surface: "Area",
    sommet: "Vertex",
    lireNombres: function (quoi) { return "« " + quoi + " »: positive numbers separated by « ; » are expected."; },
    pasAssez: function (n) { return "At least 3 sides are needed (at most " + n + ")."; },
    diagonalesAttendues: function (n) { return "For " + n + " sides, " + (n - 3) + (n - 3 > 1 ? " diagonals" : " diagonal") + " from the first vertex are needed (one more to check the closure)."; },
    impossible: function (k) { return "The measurements do not close: vertex " + k + " cannot be built (one side is longer than the sum of the other two)."; },
    horsTolerance: function (ecart, tol, k) { return "Closure gap of " + ecart + " mm beyond the " + tol + " mm tolerance: measurement at fault, diagonal " + k + ". The room is not laid."; },
    toleranceInvalide: "The tolerance must be a positive number in millimetres.",
    opPiece: "Lay the surveyed room",
    piecePosee: "Room laid to the right of the drawing: ",
    calculer: "Enter the sides and diagonals; the gap and angles then show.",
    choisirArete: "Select a single edge: its ends are the two known points.",
    pasHorizontale: "This edge is not horizontal: the point is built in the edge's horizontal plane.",
    distances: "Both distances must be positive numbers.",
    pasDIntersection: function (ab) { return "The two circles do not meet: with a " + ab + " m base, these distances do not form a triangle."; },
    opPoint: "Build a point from two distances",
    pointConstruit: "Point built: ",
    opTriangle: "Lay a triangle from its three sides",
    trianglePose: "Triangle laid to the right of the drawing.",
    triangleAttendu: "Three positive sides a ; b ; c are expected.",
    point: "Point",
    base: "Base",
    titreMarquer: "Mark the provenance",
    provenance: "Provenance",
    precision: "Accuracy (mm)",
    noteMarque: "Note (optional)",
    mesure: "Measured",
    deduit: "Deduced",
    suppose: "Assumed",
    planAncien: "Old drawing",
    retirerMarque: "Remove the mark",
    choisirElements: "Select one or more drawing elements first.",
    marques: function (n) { return n + (n > 1 ? " elements marked" : " element marked"); },
    retirees: function (n) { return n + (n > 1 ? " marks removed" : " mark removed"); },
    tropMarques: "Too many marked elements: 3,000 at most.",
    elements: function (n) { return n + (n > 1 ? " elements" : " element"); },
    face: "Face",
    arete: "Edge",
    objet: "Object",
    introuvable: "not found in the open level",
    videProvenance: "No marked element yet: select elements, then « Mark the selection ».",
    colProvenance: ["Element", "Size", "Accuracy", "Note"],
    seuilsInvalides: "The thresholds must be positive numbers.",
    longueurs: "Lengths off the step",
    anglesPresque: "Nearly square or nearly aligned angles",
    sommetsPresque: "Nearly coincident vertices",
    empreinte: "Drawing fingerprint",
    constats: function (n) { return n + (n > 1 ? " findings" : " finding"); },
    aucunConstat: "none",
    colBulletin: ["Check", "Element", "Value"],
    controle: "Drawing checked: ",
    videBulletin: "Run « Check the drawing »: the report shows here.",
    exporte: "Report exported.",
    controlerDabord: "Check the drawing first.",
    perime: "The drawing changed since the check: check it again before exporting.",
    fichier: function (d) { return "accuracy-report-" + d + ".md"; },
    md: {
      titre: "Drawing accuracy report",
      date: "Date",
      version: "Rule",
      seuils: "Declared thresholds",
      resume: "Summary",
      details: "Findings",
      provenance: "Provenance of existing elements",
      verification: "Check by the recipient: open the received drawing, run the report with the same thresholds and compare the fingerprint. A different fingerprint means the drawing changed after sending.",
      rien: "Nothing was corrected in the drawing.",
      tronque: function (n) { return "… and " + n + " more findings (list capped)."; },
    },
    ecartDe: function (v) { return "gap " + v; },
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var alerte = function (m) { return planche.message.afficher(m, "alerte"); };
var info = function (m) { return planche.message.afficher(m); };
var texte = function (v) { return v === undefined || v === null ? "" : String(v); };

// ——————————————————————————————————————————————— Nombres

/** Nombre écrit avec « , » ou « . » décimal. */
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(",", ".");
  return t === "" || !/^-?\d*\.?\d+$/.test(t) ? NaN : Number(t);
};
/** Liste « a ; b ; c » de nombres positifs, ou null si une valeur est illisible. */
var lireListe = function (s) {
  var t = texte(s).trim();
  if (!t) return [];
  var l = t.split(";").map(function (x) { return lireNombre(x); });
  return l.every(function (x) { return x > 0 && isFinite(x); }) ? l : null;
};
var fixe = function (v, n, sep) { return v.toFixed(n).replace(".", sep); };

// ——————————————————————————————————————————————— Pièce hors d'équerre

/** Troisième sommet d'un triangle : à distance r0 de p0 et r1 de p1, à gauche de p0 → p1 ; null s'il n'existe pas. */
function troisieme(p0, p1, r0, r1, aGauche) {
  var dx = p1[0] - p0[0];
  var dy = p1[1] - p0[1];
  var d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-12) return null;
  var a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  var h2 = r0 * r0 - a * a;
  // Tolérance d'arrondi : un triangle plat à 1e-9 près est admis.
  if (h2 < -1e-9) return null;
  var h = Math.sqrt(Math.max(0, h2));
  var ux = dx / d;
  var uy = dy / d;
  var s = aGauche ? 1 : -1;
  return [p0[0] + ux * a - s * uy * h, p0[1] + uy * a + s * ux * h];
}

/**
 * Pièce de n côtés (dans l'ordre P0 → P1 → … → P0) et de ses diagonales depuis P0 (P0P2, …, P0P(n-2)), plus au plus
 * une diagonale redondante P1P(n-1). Rend { points, ecart (m) ou null, angles (°), aire (m²) } ou { erreur }.
 */
function construirePiece(cotes, diagonales) {
  var x = tx();
  var n = cotes.length;
  if (n < 3 || n > MAX_COTES) return { erreur: x.pasAssez(MAX_COTES) };
  if (diagonales.length !== n - 3 && diagonales.length !== n - 2) return { erreur: x.diagonalesAttendues(n) };
  var p = [[0, 0], [cotes[0], 0]];
  for (var k = 2; k < n; k++) {
    // Pk : à distance de P0 (diagonale P0Pk, ou le dernier côté pour P(n-1)) et de P(k-1) (côté k-1).
    var r0 = k === n - 1 ? cotes[n - 1] : diagonales[k - 2];
    var q = troisieme(p[0], p[k - 1], r0, cotes[k - 1], true);
    if (!q) return { erreur: x.impossible(k + 1) };
    p.push(q);
  }
  var ecart = null;
  if (diagonales.length === n - 2 && n >= 4) {
    var dx = p[n - 1][0] - p[1][0];
    var dy = p[n - 1][1] - p[1][1];
    ecart = Math.abs(Math.sqrt(dx * dx + dy * dy) - diagonales[n - 3]);
  }
  var angles = p.map(function (c, i) {
    var a = p[(i + n - 1) % n];
    var b = p[(i + 1) % n];
    var v1 = [a[0] - c[0], a[1] - c[1]];
    var v2 = [b[0] - c[0], b[1] - c[1]];
    var ang = Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]) * (180 / Math.PI);
    // Contour dans le sens trigonométrique : l'angle intérieur va de l'arête sortante à l'arête entrante.
    return ang < 0 ? -ang : 360 - ang;
  });
  var aire = 0;
  for (var i = 0; i < n; i++) aire += p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1];
  return { points: p, ecart: ecart, angles: angles, aire: Math.abs(aire) / 2, redondante: diagonales.length === n - 2 ? n - 2 : null };
}

function lirePiece() {
  var x = tx();
  var cotes = lireListe(valeurs.cotes);
  if (cotes === null) return { erreur: x.lireNombres(x.champs.cotes) };
  var diagonales = lireListe(valeurs.diagonales);
  if (diagonales === null) return { erreur: x.lireNombres(x.champs.diagonales) };
  var tol = lireNombre(valeurs.tolerance);
  if (!(tol > 0)) return { erreur: x.toleranceInvalide };
  if (!cotes.length) return { vide: true };
  var r = construirePiece(cotes, diagonales);
  r.tolerance = tol;
  return r;
}

async function xMax() {
  var m = await planche.modele.lire();
  var v = -Infinity;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  return v === -Infinity ? 0 : v;
}

/** Dessine un contour fermé (points du plan, z = 0) décalé de `dx` en x. */
async function contour(points, dx) {
  for (var i = 0; i < points.length; i++) {
    var a = points[i];
    var b = points[(i + 1) % points.length];
    await planche.modele.ligne([a[0] + dx, a[1], 0], [b[0] + dx, b[1], 0]);
  }
}

async function poserPiece() {
  var x = tx();
  var r = lirePiece();
  if (r.vide) return alerte(x.calculer);
  if (r.erreur) return alerte(r.erreur);
  if (r.ecart !== null && r.ecart * 1000 > r.tolerance + 1e-9) {
    var sep = (await planche.unites.lire()).separateur;
    return alerte(x.horsTolerance(fixe(r.ecart * 1000, 1, sep), fixe(r.tolerance, 1, sep).replace(/[,.]0$/, ""), r.redondante));
  }
  var dx = (await xMax()) + 2;
  await planche.operation.ouvrir(x.opPiece);
  try {
    await contour(r.points, dx);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  var s = (await planche.unites.lire()).separateur;
  return info(x.piecePosee + fixe(r.aire, 2, s) + " m²");
}

function etatPiece(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "cotes", libelle: c.cotes, valeur: valeurs.cotes },
    { id: "diagonales", libelle: c.diagonales, valeur: valeurs.diagonales },
    { id: "tolerance", libelle: c.tolerance, valeur: valeurs.tolerance },
  ];
  var r = lirePiece();
  var resultats = [];
  var encart = null;
  if (r.vide) encart = x.calculer;
  else if (r.erreur) encart = r.erreur;
  else {
    var dans = r.ecart === null ? null : r.ecart * 1000 <= r.tolerance + 1e-9;
    resultats.push({ libelle: x.redondante, valeur: r.redondante ? x.diagonale(r.redondante) : x.aucune });
    if (r.ecart !== null) resultats.push({ libelle: x.ecart, valeur: fixe(r.ecart * 1000, 1, sep) + " mm " + (dans ? "≤ " : "> ") + texte(valeurs.tolerance).trim() + " mm", ton: dans ? "ok" : "alerte" });
    resultats.push({ libelle: x.angles, valeur: r.angles.map(function (a) { return fixe(a, 1, sep) + "°"; }).join(" · ") });
    resultats.push({ libelle: x.surface, valeur: fixe(r.aire, 2, sep) + " m²" });
    if (dans === false) encart = x.horsTolerance(fixe(r.ecart * 1000, 1, sep), texte(valeurs.tolerance).trim(), r.redondante);
  }
  // Sans message propre, l'encart rappelle ce qui arrive au-delà de la tolérance (maquette validée).
  if (!encart) encart = x.note.piece;
  return { formulaire: formulaire, resultats: resultats, encart: encart };
}

// ——————————————————————————————————————————————— Point par deux distances

async function areteChoisie() {
  var x = tx();
  var sel = await planche.selection.lire();
  var m = await planche.modele.lire();
  var e = sel.length === 1 ? m.aretes.filter(function (a) { return a.id === sel[0]; })[0] : null;
  if (!e) return { erreur: x.choisirArete };
  var a = e.points[0];
  var b = e.points[e.points.length - 1];
  if (Math.abs(a[2] - b[2]) > 1e-6) return { erreur: x.pasHorizontale };
  return { a: a, b: b };
}

function calculerPoint(ar) {
  var x = tx();
  var d1 = lireNombre(valeurs.d1);
  var d2 = lireNombre(valeurs.d2);
  if (!(d1 > 0) || !(d2 > 0)) return { erreur: x.distances };
  var q = troisieme(ar.a, ar.b, d1, d2, valeurs.cote !== "droite");
  if (!q) {
    var ab = Math.sqrt(Math.pow(ar.b[0] - ar.a[0], 2) + Math.pow(ar.b[1] - ar.a[1], 2));
    return { erreur: x.pasDIntersection, base: ab };
  }
  return { point: [q[0], q[1], ar.a[2]] };
}

async function construirePoint() {
  var x = tx();
  var ar = await areteChoisie();
  if (ar.erreur) return alerte(ar.erreur);
  var r = calculerPoint(ar);
  var sep = (await planche.unites.lire()).separateur;
  if (r.erreur) return alerte(r.base !== undefined ? r.erreur(fixe(r.base, 3, sep)) : r.erreur);
  await planche.operation.ouvrir(x.opPoint);
  try {
    await planche.modele.ligne(ar.a, r.point);
    await planche.modele.ligne(ar.b, r.point);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.pointConstruit + "(" + r.point.map(function (v) { return fixe(v, 3, sep); }).join(" ; ") + ")");
}

async function poserTriangle() {
  var x = tx();
  var l = lireListe(valeurs.triangle);
  if (!l || l.length !== 3) return alerte(x.triangleAttendu);
  var r = construirePiece(l, []);
  if (r.erreur) return alerte(r.erreur);
  var dx = (await xMax()) + 2;
  await planche.operation.ouvrir(x.opTriangle);
  try {
    await contour(r.points, dx);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.trianglePose);
}

async function etatPoint(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "d1", libelle: c.d1, valeur: valeurs.d1 },
    { id: "d2", libelle: c.d2, valeur: valeurs.d2 },
    { id: "cote", libelle: c.cote, valeur: valeurs.cote, choix: [{ valeur: "gauche", libelle: x.gauche }, { valeur: "droite", libelle: x.droite }] },
    { id: "triangle", libelle: c.triangle, valeur: valeurs.triangle },
  ];
  var resultats = [];
  var encart = null;
  var ar = await areteChoisie();
  if (ar.erreur) encart = ar.erreur;
  else {
    var ab = Math.sqrt(Math.pow(ar.b[0] - ar.a[0], 2) + Math.pow(ar.b[1] - ar.a[1], 2));
    resultats.push({ libelle: x.base, valeur: fixe(ab, 3, sep) + " m" });
    if (texte(valeurs.d1).trim() || texte(valeurs.d2).trim()) {
      var r = calculerPoint(ar);
      if (r.erreur) encart = r.base !== undefined ? r.erreur(fixe(r.base, 3, sep)) : r.erreur;
      else resultats.push({ libelle: x.point, valeur: "(" + r.point.map(function (v) { return fixe(v, 3, sep); }).join(" ; ") + ")", ton: "ok" });
    }
  }
  return { formulaire: formulaire, resultats: resultats, encart: encart };
}

// ——————————————————————————————————————————————— Provenance de l'existant

// Marque : [id, provenance, précision (mm), note]. Rangée par paquets « marques.0 », « marques.1 »…
var PROVENANCES = ["mesure", "deduit", "suppose", "plan"];
var libelleProvenance = function (p) {
  var x = tx();
  return p === "deduit" ? x.deduit : p === "suppose" ? x.suppose : p === "plan" ? x.planAncien : x.mesure;
};

async function lireMarques() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^marques\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(8)) - Number(b.slice(8)); });
  var marques = [];
  cles.forEach(function (k) {
    (Array.isArray(toutes[k]) ? toutes[k] : []).forEach(function (e) {
      if (Array.isArray(e) && typeof e[0] === "string") marques.push({ id: e[0], provenance: PROVENANCES.indexOf(e[1]) >= 0 ? e[1] : "mesure", precision: typeof e[2] === "number" ? e[2] : null, note: texte(e[3]) });
    });
  });
  return { marques: marques, cles: cles };
}

async function ecrireMarques(marques, anciennes) {
  var paquets = [];
  var courant = [];
  var taille = 2;
  marques.forEach(function (m) {
    var e = [m.id, m.provenance, m.precision, m.note];
    var n = JSON.stringify(e).length + 1;
    if (courant.length && taille + n > TAILLE_PAQUET) {
      paquets.push(courant);
      courant = [];
      taille = 2;
    }
    courant.push(e);
    taille += n;
  });
  if (courant.length) paquets.push(courant);
  if (paquets.length > MAX_PAQUETS) throw new Error(tx().tropMarques);
  for (var i = 0; i < paquets.length; i++) await planche.donnees.ecrire("projet", "marques." + i, paquets[i]);
  for (var j = paquets.length; j < anciennes.length; j++) await planche.donnees.effacer("projet", "marques." + j);
}

async function marquer() {
  var x = tx();
  var sel = await planche.selection.lire();
  if (!sel.length) return alerte(x.choisirElements);
  var r = await planche.saisie.demander(x.titreMarquer, [
    { id: "provenance", libelle: x.provenance, genre: "choix", valeur: "mesure", choix: [
      { valeur: "mesure", libelle: x.mesure }, { valeur: "deduit", libelle: x.deduit }, { valeur: "suppose", libelle: x.suppose },
      { valeur: "plan", libelle: x.planAncien }, { valeur: "retirer", libelle: x.retirerMarque }] },
    { id: "precision", libelle: x.precision, genre: "nombre", valeur: 0, min: 0, max: 10000, unite: "mm" },
    { id: "note", libelle: x.noteMarque, genre: "texte", valeur: "" },
  ]);
  if (!r) return;
  var lus = await lireMarques();
  var choisis = {};
  sel.forEach(function (id) { choisis[id] = true; });
  var marques = lus.marques.filter(function (m) { return !choisis[m.id]; });
  if (r.provenance === "retirer") {
    await ecrireMarques(marques, lus.cles);
    return info(x.retirees(lus.marques.length - marques.length));
  }
  sel.forEach(function (id) { marques.push({ id: id, provenance: r.provenance, precision: r.precision > 0 ? r.precision : null, note: texte(r.note).trim().slice(0, 120) }); });
  if (marques.length > MAX_MARQUES) return alerte(x.tropMarques);
  await ecrireMarques(marques, lus.cles);
  return info(x.marques(sel.length));
}

/** Désignation courte et mesure d'un élément lu. */
function decrire(id, m, sep) {
  var x = tx();
  var f = m.faces[id];
  if (f) return { nom: x.face, mesure: fixe(f.aire, 2, sep) + " m²" };
  var e = m.aretes[id];
  if (e) return { nom: x.arete, mesure: fixe(e.longueur, 3, sep) + " m" };
  var o = m.objets[id];
  if (o) return { nom: o.nom || x.objet, mesure: "" };
  return null;
}

async function lireIndex() {
  var m = await planche.modele.lire();
  var idx = { faces: {}, aretes: {}, objets: {}, modele: m };
  m.faces.forEach(function (f) { idx.faces[f.id] = f; });
  m.aretes.forEach(function (e) { idx.aretes[e.id] = e; });
  m.objets.forEach(function (o) { idx.objets[o.id] = o; });
  return idx;
}

async function etatProvenance(sep, sel) {
  var x = tx();
  var lus = await lireMarques();
  if (!lus.marques.length) return { lignes: [], vide: x.videProvenance, colonnes: x.colProvenance };
  var idx = await lireIndex();
  var lignes = [];
  PROVENANCES.forEach(function (p) {
    var l = lus.marques.filter(function (m) { return m.provenance === p; });
    if (!l.length) return;
    lignes.push({ genre: "groupe", cellules: [libelleProvenance(p) + " · " + x.elements(l.length), ""] });
    l.forEach(function (m) {
      var d = decrire(m.id, idx, sep);
      var precision = m.precision === null ? "–" : "± " + fixe(m.precision, m.precision % 1 ? 1 : 0, sep) + " mm";
      lignes.push(d
        ? { genre: "ligne", id: m.id, choisi: sel.indexOf(m.id) >= 0, cellules: [d.nom, d.mesure || "–", precision, m.note || "–"] }
        : { genre: "introuvable", id: m.id, cellules: [x.introuvable, "–", precision, m.note || "–"] });
    });
  });
  return { lignes: lignes, colonnes: x.colProvenance, pied: [x.total + " · " + x.elements(lus.marques.length), ""] };
}
T.fr.total = "Total";
T.en.total = "Total";

// ——————————————————————————————————————————————— Bulletin d'exactitude

/** Empreinte du dessin : sommets des arêtes au 0,1 mm, triés, hachés (deux FNV-1a de 32 bits). */
function empreinte(m) {
  var cles = m.aretes.map(function (e) {
    var p = e.points.map(function (q) { return q.map(function (v) { return Math.round(v * 10000); }).join(","); });
    p.sort();
    return p.join("|");
  });
  cles.sort();
  var h1 = 0x811c9dc5;
  var h2 = 0x01000193 ^ 0x5bd1e995;
  var s = cles.join(";");
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 + 2) >>> 0;
  }
  var hex = function (h) { return ("00000000" + h.toString(16)).slice(-8); };
  return hex(h1) + hex(h2);
}

function lireSeuils() {
  var pas = lireNombre(valeurs.pas);
  var angle = lireNombre(valeurs.angle);
  var sommets = lireNombre(valeurs.sommets);
  if (!(pas > 0) || !(angle > 0) || !(sommets > 0)) return null;
  return { pas: pas, angle: angle, sommets: sommets };
}

/** Contrôle du dessin ouvert ; rien n'est modifié. */
function controler(m, s, sep) {
  var x = tx();
  var constats = [];
  var nombres = { longueurs: 0, angles: 0, sommets: 0 };
  var ajouter = function (genre, id, nom, valeur) {
    nombres[genre]++;
    if (constats.length < MAX_CONSTATS) constats.push({ genre: genre, id: id, nom: nom, valeur: valeur });
  };
  // Longueurs hors du pas (au millionième de millimètre près).
  m.aretes.forEach(function (e) {
    var mm = e.longueur * 1000;
    var k = Math.round(mm / s.pas);
    if (Math.abs(mm - k * s.pas) > 1e-6) ajouter("longueurs", e.id, x.arete + " " + fixe(e.longueur, 4, sep) + " m", x.ecartDe(fixe(mm - k * s.pas, 3, sep) + " mm"));
  });
  // Sommets : arêtes qui se touchent (angles presque droits ou alignés) et sommets presque confondus.
  var parSommet = {};
  var cle = function (q) { return q.map(function (v) { return Math.round(v * 1e6); }).join(","); };
  var grille = {};
  var pas = s.sommets / 1000;
  var points = [];
  m.aretes.forEach(function (e) {
    [0, e.points.length - 1].forEach(function (i) {
      var q = e.points[i];
      var k = cle(q);
      if (!parSommet[k]) {
        parSommet[k] = { q: q, aretes: [] };
        points.push(parSommet[k]);
      }
      parSommet[k].aretes.push({ e: e, autre: e.points[i === 0 ? e.points.length - 1 : 0] });
    });
  });
  points.forEach(function (p) {
    var a = p.aretes;
    for (var i = 0; i < a.length; i++) {
      for (var j = i + 1; j < a.length; j++) {
        var u = [a[i].autre[0] - p.q[0], a[i].autre[1] - p.q[1], a[i].autre[2] - p.q[2]];
        var v = [a[j].autre[0] - p.q[0], a[j].autre[1] - p.q[1], a[j].autre[2] - p.q[2]];
        var lu = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
        var lv = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (lu < 1e-12 || lv < 1e-12) continue;
        var cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)));
        var ang = Math.acos(cos) * (180 / Math.PI);
        [0, 90, 180].forEach(function (cible) {
          var ecart = Math.abs(ang - cible);
          if (ecart > 1e-6 && ecart < s.angle) ajouter("angles", a[i].e.id, x.sommet + " (" + p.q.map(function (w) { return fixe(w, 3, sep); }).join(" ; ") + ")", fixe(ang, 3, sep) + "° (" + x.ecartDe(fixe(ecart, 3, sep) + "°") + ")");
        });
      }
    }
    // Grille de pas égal au seuil : un voisin plus proche que le seuil est dans une case voisine.
    var g = p.q.map(function (w) { return Math.floor(w / pas); });
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
      (grille[[g[0] + dx, g[1] + dy, g[2] + dz].join(",")] || []).forEach(function (o) {
        var d = Math.sqrt(Math.pow(o.q[0] - p.q[0], 2) + Math.pow(o.q[1] - p.q[1], 2) + Math.pow(o.q[2] - p.q[2], 2));
        if (d > 1e-9 && d < pas) ajouter("sommets", p.aretes[0].e.id, x.sommet + " (" + p.q.map(function (w) { return fixe(w, 4, sep); }).join(" ; ") + ")", fixe(d * 1000, 3, sep) + " mm");
      });
    }
    var cg = g.join(",");
    (grille[cg] = grille[cg] || []).push(p);
  });
  return { constats: constats, nombres: nombres, empreinte: empreinte(m), seuils: s, date: new Date().toISOString().slice(0, 10) };
}

async function controlerDessin() {
  var x = tx();
  var s = lireSeuils();
  if (!s) return alerte(x.seuilsInvalides);
  var m = await planche.modele.lire();
  var sep = (await planche.unites.lire()).separateur;
  dernierBulletin = controler(m, s, sep);
  var n = dernierBulletin.nombres;
  return info(x.controle + x.constats(n.longueurs + n.angles + n.sommets));
}

async function etatBulletin(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "pas", libelle: c.pas, valeur: valeurs.pas },
    { id: "angle", libelle: c.angle, valeur: valeurs.angle },
    { id: "sommets", libelle: c.sommets, valeur: valeurs.sommets },
  ];
  if (!dernierBulletin) return { formulaire: formulaire, lignes: [], vide: x.videBulletin, colonnes: x.colBulletin };
  var b = dernierBulletin;
  var actuel = empreinte(await planche.modele.lire());
  var n = b.nombres;
  var compte = function (k) { return n[k] ? x.constats(n[k]) : x.aucunConstat; };
  var resultats = [
    { libelle: x.longueurs, valeur: compte("longueurs"), ton: n.longueurs ? "alerte" : "ok" },
    { libelle: x.anglesPresque, valeur: compte("angles"), ton: n.angles ? "alerte" : "ok" },
    { libelle: x.sommetsPresque, valeur: compte("sommets"), ton: n.sommets ? "alerte" : "ok" },
    { libelle: x.empreinte, valeur: b.empreinte },
  ];
  var titres = { longueurs: x.longueurs, angles: x.anglesPresque, sommets: x.sommetsPresque };
  var lignes = b.constats.map(function (k) { return { genre: "ligne", id: k.id, cellules: [titres[k.genre], k.nom, k.valeur] }; });
  return { formulaire: formulaire, resultats: resultats, encart: actuel !== b.empreinte ? x.perime : null, lignes: lignes, colonnes: x.colBulletin };
}

async function exporterBulletin() {
  var x = tx();
  if (!dernierBulletin) return alerte(x.controlerDabord);
  var m = await planche.modele.lire();
  var b = dernierBulletin;
  if (empreinte(m) !== b.empreinte) return alerte(x.perime);
  var sep = (await planche.unites.lire()).separateur;
  var md = x.md;
  var c = x.champs;
  var n = b.nombres;
  var titres = { longueurs: x.longueurs, angles: x.anglesPresque, sommets: x.sommetsPresque };
  var l = ["# " + md.titre, "", "- " + md.date + " : " + b.date, "- " + md.version + " : " + REGLES.bulletin + " (" + VERSION + ")", "- " + x.empreinte + " : `" + b.empreinte + "`", "",
    "## " + md.seuils, "", "- " + c.pas + " : " + fixe(b.seuils.pas, 3, sep).replace(/[,.]?0+$/, ""), "- " + c.angle + " : " + fixe(b.seuils.angle, 3, sep).replace(/[,.]?0+$/, ""), "- " + c.sommets + " : " + fixe(b.seuils.sommets, 3, sep).replace(/[,.]?0+$/, ""), "",
    "## " + md.resume, "", "- " + x.longueurs + " : " + n.longueurs, "- " + x.anglesPresque + " : " + n.angles, "- " + x.sommetsPresque + " : " + n.sommets, ""];
  if (b.constats.length) {
    l.push("## " + md.details, "");
    b.constats.forEach(function (k) { l.push("- " + titres[k.genre] + " — " + k.nom + " — " + k.valeur); });
    var total = n.longueurs + n.angles + n.sommets;
    if (total > b.constats.length) l.push("", md.tronque(total - b.constats.length));
    l.push("");
  }
  var lus = await lireMarques();
  if (lus.marques.length) {
    var idx = await lireIndex();
    l.push("## " + md.provenance, "");
    PROVENANCES.forEach(function (p) {
      lus.marques.filter(function (k) { return k.provenance === p; }).forEach(function (k) {
        var d = decrire(k.id, idx, sep);
        l.push("- " + libelleProvenance(p) + " — " + (d ? d.nom + (d.mesure ? " " + d.mesure : "") : x.introuvable) + (k.precision === null ? "" : " — ± " + fixe(k.precision, k.precision % 1 ? 1 : 0, sep) + " mm") + (k.note ? " — " + k.note : ""));
      });
    });
    l.push("");
  }
  l.push(md.verification, "", md.rien, "");
  if (await planche.fichiers.enregistrer(x.fichier(b.date), l.join("\n"))) await info(x.exporte);
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var sel = await planche.selection.lire();
  var e;
  if (onglet === "point") e = await etatPoint(sep);
  else if (onglet === "provenance") e = await etatProvenance(sep, sel);
  else if (onglet === "bulletin") e = await etatBulletin(sep);
  else e = etatPiece(sep);
  var lignes = e.lignes || [];
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    regle: x.regle[onglet],
    // Pied du panneau : la règle de la pièce, la consigne des autres onglets.
    note: onglet === "piece" ? x.regle.piece : x.note[onglet],
    formulaire: e.formulaire || [],
    resultats: e.resultats || [],
    encart: e.encart || null,
    colonnes: e.colonnes || [],
    lignes: lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    pied: e.pied || null,
    vide: e.vide || null,
    page: page,
    pages: pages,
  };
}
async function rafraichir() {
  await planche.panneau.envoyer(PANNEAU, await etat());
}

/** Retient les valeurs du formulaire envoyées par la page (textes courts seulement). */
var retenirValeurs = function (d) {
  var v = d && d.valeurs;
  if (!v || typeof v !== "object") return;
  Object.keys(valeurs).forEach(function (k) { if (typeof v[k] === "string") valeurs[k] = v[k].slice(0, 400); });
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
action("choisir", async function (d) {
  var id = typeof d.id === "string" ? d.id : "";
  var idx = await lireIndex();
  if (idx.faces[id] || idx.aretes[id] || idx.objets[id]) await planche.selection.definir([id]);
  else await alerte(tx().introuvable);
});
action("poser-piece", poserPiece);
action("effacer-piece", function () { valeurs.cotes = ""; valeurs.diagonales = ""; });
action("construire-point", construirePoint);
action("poser-triangle", poserTriangle);
action("marquer-provenance", marquer);
action("controler-dessin", controlerDessin);
action("exporter-bulletin", exporterBulletin);

var commande = function (nom, ong, fn) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) page = 0;
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    try {
      if (fn) await fn();
    } catch (e) {
      await alerte(e && e.message ? e.message : String(e));
    }
    await rafraichir();
  });
};
commande("ouvrir-panneau", "piece", null);
commande("poser-piece", "piece", poserPiece);
commande("construire-point", "point", construirePoint);
commande("marquer-provenance", "provenance", marquer);
commande("controler-dessin", "bulletin", controlerDessin);
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
