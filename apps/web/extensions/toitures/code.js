// Extension « Toitures et combles » (catalogue des extensions de la Planche, cas 1 de la feuille de route, extension
// n° 4 ; maquette validée le 27 novembre 2026). Quatre onglets, un par entrée du catalogue :
//   Toiture à pans (n° 27, D4-F5-016) · Variantes (n° 33, D4-F5-076) · Pente minimale (n° 36, D4-F5-111) ·
//   Ligne 1,80 m (n° 4, D9-F15e-004).
//
// Le contour est une face horizontale rectangulaire, sélectionnée dans le dessin (pignons sur les petits côtés). Les
// contours en L ou en T, qui demandent des noues, ne sont pas encore pris en charge : ils sont refusés et nommés.
// Aucune pente minimale n'est écrite ici : elles viennent d'une table chargée par l'utilisateur, où chaque ligne cite sa
// source ; sans table, le contrôle est « non évaluable ». Les altitudes sont relatives à l'origine du dessin.

var VERSION = "1.0.0";
var PANNEAU = "toitures";
var ONGLETS = ["pans", "variantes", "pente", "ligne"];
var FORMAT_TABLE = "fadi-regles-pentes/1";
var TYPES = ["2", "4", "1"];
var MAX_ENTREES = 200;
var MAX_VARIANTES = 8;
var TAILLE_MORCEAU = 3800;
var LIGNES_PAR_PAGE = 80;
var EPS = 1e-6;
var LETTRES = "ABCDEFGH";

var onglet = "pans";
var page = 0;
var langue = "fr";
var choisie = null;
var valeurs = { type: "2", pente: "", unite: "%", debord: "", materiau: "", zone: "", situation: "", hauteur: "1,80", matiere: "" };

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: {
      type: "Type", pente: "Pente", unite: "Unité de pente", debord: "Débord (m, vide = aucun)",
      materiau: "Matériau de couverture", zone: "Zone", situation: "Situation",
      hauteur: "Hauteur sous rampants (m)", matiere: "Matière de la bande",
    },
    types: { "2": "2 pans", "4": "4 pans", "1": "1 pan" },
    typesLongs: { "2": "2 pans (pignons sur les petits côtés)", "4": "4 pans (croupes)", "1": "1 pan (appentis)" },
    unites: { "%": "%", "°": "degrés" },
    aucuneMatiere: "aucune",
    contour: "Contour",
    egout: "Égout", faitage: "Faîtage", couverture: "Couverture", comble: "Comble",
    colVariantes: ["Variante", "Pente", "Couverture", "Égout", "Faîtage", "Comble"],
    pente: "Pente du pan",
    penteMin: function (l) { return "Pente minimale (" + l + ")"; },
    sansTable: "aucune table chargée",
    choisirLigne: "choisir dans l'onglet Pente minimale",
    resultat: "Résultat", source: "Source",
    origineToiture: function (n) { return "toiture sélectionnée « " + n + " »"; },
    origineFormulaire: "onglet Toiture à pans",
    origineVariante: function (l) { return "variante " + l; },
    nonEvaluable: "non évaluable", conforme: "conforme", nonConforme: "non conforme", aVerifier: "à vérifier",
    tableAbsente: "La table des pentes minimales n'est pas encore chargée : le contrôle dit « non évaluable » au lieu d'inventer une valeur.",
    tableChargee: function (n, f) { return "Table chargée : " + n + (n > 1 ? " lignes" : " ligne") + (f ? " (" + f + ")" : "") + ". Chaque ligne cite sa source, « à vérifier » tant que le texte n'a pas été relu."; },
    pasDeLigne: "aucune ligne de la table pour ce choix",
    sousLigne: function (h) { return "Sous " + h + " m"; },
    surLigne: function (h) { return "À " + h + " m et plus"; },
    toitureChoisie: "Toiture",
    aucuneToiture: "Sélectionnez une toiture générée par cette extension : la ligne se trace dans son comble.",
    selectionnerContour: "Sélectionnez une face horizontale rectangulaire (le contour à couvrir), ou une toiture générée.",
    contourRefuse: {
      pasFace: "Sélectionnez une seule face : le contour à couvrir.",
      pasHorizontal: "Le contour doit être une face horizontale.",
      pasRectangle: "Le contour doit être un rectangle : les contours en L ou en T, qui demandent des noues, ne sont pas encore pris en charge.",
      trous: "Le contour a une ouverture : les surfaces et le comble ne la prendraient pas en compte. Choisissez une face sans ouverture.",
    },
    placementInconnu: "La place de cette toiture n'est plus reconnue (copiée ou modifiée) : générez-la de nouveau sur son contour.",
    toitureInclinee: "Cette toiture a été basculée hors de l'horizontale : générez-la de nouveau sur son contour.",
    videVariantes: "Aucune variante : sélectionnez le contour, puis « Comparer une autre pente ».",
    note: {
      pans: "La toiture est posée sur le contour sélectionné, dans un groupe nommé qui garde ses paramètres. Couverture : surface en pente, débords compris ; comble : volume sous la toiture, au-dessus du contour, entre les murs. Altitudes relatives à l'origine du dessin.",
      variantes: "Choisir une ligne, puis « Garder la variante » : la toiture est posée sur le contour en un seul pas d'annulation. Altitudes relatives à l'origine du dessin.",
      pente: "La pente contrôlée est celle de la toiture sélectionnée, sinon celle de l'onglet Toiture à pans. La table des pentes minimales est un fichier chargé par l'utilisateur, gardé avec le dessin.",
      ligne: "Le plancher du comble est pris au niveau du contour. La bande sous la hauteur et la partie au-dessus sont deux faces nommées avec leur aire ; la bande prend la matière choisie.",
    },
    opToiture: "Toiture à pans", opVariante: "Garder une variante", opLigne: "Ligne de hauteur sous rampants", opTable: "Table des pentes minimales",
    genere: function (n, f) { return "Toiture posée : " + n + ", faîtage " + f + "."; },
    nomToiture: function (t, p) { return "Toiture " + t + " " + p; },
    nomBandeSous: function (h, a) { return "Comble sous " + h + " m — " + a + " m²"; },
    nomPartieSur: function (h, a) { return "Comble à " + h + " m et plus — " + a + " m²"; },
    nomLigne: function (h) { return "Ligne h = " + h + " m"; },
    ligneTracee: function (h, a, b) { return "Ligne h = " + h + " m tracée : " + a + " m² sous la ligne, " + b + " m² au-dessus."; },
    rienAuDessus: function (h) { return "Le comble n'atteint pas " + h + " m : tout est sous la ligne."; },
    penteInvalide: "La pente doit être un nombre positif (au plus 1000 %, ou moins de 85 degrés).",
    debordInvalide: "Le débord doit être un nombre positif ou nul, en mètres.",
    hauteurInvalide: "La hauteur doit être un nombre positif, en mètres.",
    tropDeVariantes: "Huit variantes au plus : gardez-en une, ou recommencez sur un autre contour.",
    nouveauContour: "Nouveau contour : les variantes précédentes sont remplacées.",
    varianteAjoutee: function (l) { return "Variante " + l + " ajoutée."; },
    titreVariante: "Comparer une autre pente",
    varianteIntrouvable: "Choisissez d'abord une variante dans le tableau.",
    contourDisparu: "Le contour des variantes n'est plus dans le dessin : sélectionnez-le à nouveau.",
    toitureNonFormee: "La toiture n'a pas pu être formée sur ce contour.",
    tableRefusee: "Table refusée : ",
    archiveRefusee: "Chargement refusé : le fichier n'a pas pu être archivé en base (",
    motifsArchive: { indisponible: "archivage indisponible dans cette Planche", impossible: "archivage impossible", reseau: "réseau indisponible", connexion: "connexion requise", extension_inconnue: "extension non installée pour ce compte", trop_lourd: "fichier trop lourd", serveur: "refus du serveur", illisible: "réponse du serveur illisible" },
    tableEnregistree: "Table des pentes chargée : ",
    modeleEnregistre: "Modèle de table enregistré : remplissez-le, citez chaque source, puis chargez-le.",
    fichierModele: "modele-pentes-minimales.json",
    erreurs: {
      json: "le fichier n'est pas un JSON lisible",
      format: "le format doit être « " + FORMAT_TABLE + " »",
      entrees: "la table doit contenir de 1 à " + MAX_ENTREES + " lignes",
      entree: function (i) { return "ligne " + (i + 1) + " : matériau, zone, situation, pente (nombre positif), unité (« % » ou « ° ») et source sont attendus"; },
    },
  },
  en: {
    champs: {
      type: "Type", pente: "Pitch", unite: "Pitch unit", debord: "Overhang (m, empty = none)",
      materiau: "Roofing material", zone: "Zone", situation: "Situation",
      hauteur: "Height under rafters (m)", matiere: "Band material",
    },
    types: { "2": "2 slopes", "4": "4 slopes", "1": "1 slope" },
    typesLongs: { "2": "2 slopes (gables on the short sides)", "4": "4 slopes (hips)", "1": "1 slope (lean-to)" },
    unites: { "%": "%", "°": "degrees" },
    aucuneMatiere: "none",
    contour: "Outline",
    egout: "Eaves", faitage: "Ridge", couverture: "Roof area", comble: "Attic",
    colVariantes: ["Variant", "Pitch", "Roof area", "Eaves", "Ridge", "Attic"],
    pente: "Slope pitch",
    penteMin: function (l) { return "Minimum pitch (" + l + ")"; },
    sansTable: "no table loaded",
    choisirLigne: "choose in the Minimum pitch tab",
    resultat: "Result", source: "Source",
    origineToiture: function (n) { return "selected roof « " + n + " »"; },
    origineFormulaire: "Pitched roof tab",
    origineVariante: function (l) { return "variant " + l; },
    nonEvaluable: "not assessable", conforme: "compliant", nonConforme: "not compliant", aVerifier: "to be checked",
    tableAbsente: "The minimum pitch table is not loaded yet: the check says « not assessable » instead of inventing a value.",
    tableChargee: function (n, f) { return "Table loaded: " + n + (n > 1 ? " rows" : " row") + (f ? " (" + f + ")" : "") + ". Each row cites its source, « to be checked » until the text has been read again."; },
    pasDeLigne: "no table row for this choice",
    sousLigne: function (h) { return "Under " + h + " m"; },
    surLigne: function (h) { return "At " + h + " m and above"; },
    toitureChoisie: "Roof",
    aucuneToiture: "Select a roof generated by this extension: the line is drawn in its attic.",
    selectionnerContour: "Select a horizontal rectangular face (the outline to cover), or a generated roof.",
    contourRefuse: {
      pasFace: "Select a single face: the outline to cover.",
      pasHorizontal: "The outline must be a horizontal face.",
      pasRectangle: "The outline must be a rectangle: L or T outlines, which need valleys, are not supported yet.",
      trous: "The outline has an opening: the areas and the attic would not account for it. Choose a face without an opening.",
    },
    placementInconnu: "This roof's placement is no longer recognised (copied or changed): generate it again on its outline.",
    toitureInclinee: "This roof was tilted out of the horizontal: generate it again on its outline.",
    videVariantes: "No variant: select the outline, then « Compare another pitch ».",
    note: {
      pans: "The roof is laid on the selected outline, in a named group that keeps its parameters. Roof area: sloped area, overhangs included; attic: volume under the roof, above the outline, between the walls. Levels relative to the drawing origin.",
      variantes: "Choose a row, then « Keep the variant »: the roof is laid on the outline in a single undo step. Levels relative to the drawing origin.",
      pente: "The pitch checked is the selected roof's, otherwise the Pitched roof tab's. The minimum pitch table is a file loaded by the user, kept with the drawing.",
      ligne: "The attic floor is taken at the outline level. The band under the height and the part above are two named faces with their area; the band takes the chosen material.",
    },
    opToiture: "Pitched roof", opVariante: "Keep a variant", opLigne: "Headroom line under rafters", opTable: "Minimum pitch table",
    genere: function (n, f) { return "Roof laid: " + n + ", ridge " + f + "."; },
    nomToiture: function (t, p) { return "Roof " + t + " " + p; },
    nomBandeSous: function (h, a) { return "Attic under " + h + " m — " + a + " m²"; },
    nomPartieSur: function (h, a) { return "Attic at " + h + " m and above — " + a + " m²"; },
    nomLigne: function (h) { return "Line h = " + h + " m"; },
    ligneTracee: function (h, a, b) { return "Line h = " + h + " m drawn: " + a + " m² under the line, " + b + " m² above."; },
    rienAuDessus: function (h) { return "The attic does not reach " + h + " m: everything is under the line."; },
    penteInvalide: "The pitch must be a positive number (at most 1000 %, or under 85 degrees).",
    debordInvalide: "The overhang must be a positive number or zero, in metres.",
    hauteurInvalide: "The height must be a positive number, in metres.",
    tropDeVariantes: "Eight variants at most: keep one, or start again on another outline.",
    nouveauContour: "New outline: the previous variants are replaced.",
    varianteAjoutee: function (l) { return "Variant " + l + " added."; },
    titreVariante: "Compare another pitch",
    varianteIntrouvable: "Choose a variant in the table first.",
    contourDisparu: "The variants' outline is no longer in the drawing: select it again.",
    toitureNonFormee: "The roof could not be formed on this outline.",
    tableRefusee: "Table refused: ",
    archiveRefusee: "Loading refused: the file could not be archived in the database (",
    motifsArchive: { indisponible: "archiving unavailable in this Planche", impossible: "archiving failed", reseau: "network unavailable", connexion: "sign-in required", extension_inconnue: "extension not installed for this account", trop_lourd: "file too large", serveur: "refused by the server", illisible: "unreadable server response" },
    tableEnregistree: "Pitch table loaded: ",
    modeleEnregistre: "Table template saved: fill it in, cite each source, then load it.",
    fichierModele: "minimum-pitch-template.json",
    erreurs: {
      json: "the file is not readable JSON",
      format: "the format must be « " + FORMAT_TABLE + " »",
      entrees: "the table must hold 1 to " + MAX_ENTREES + " rows",
      entree: function (i) { return "row " + (i + 1) + ": material, zone, situation, pitch (positive number), unit (« % » or « ° ») and source are expected"; },
    },
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
// Arrondi au plus proche (le demi monte), sans l'écart binaire de toFixed.
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var altitude = function (v, sep) { var s = fixe(v, 2, sep); return (s.charAt(0) === "-" ? "−" + s.slice(1) : "+" + s); };
var nombreLibre = function (v, sep) { return fixe(v, 2, sep).replace(/[,.]?0+$/, ""); };

// ——————————————————————————————————————————————— Pente

/** Pente lue : { t (tangente), valeur, unite } ou null. */
function lirePente(valeur, unite) {
  var v = typeof valeur === "number" ? valeur : lireNombre(valeur);
  if (!(v > 0)) return null;
  if (unite === "°") return v < 85 ? { t: Math.tan((v * Math.PI) / 180), valeur: v, unite: "°" } : null;
  return v <= 1000 ? { t: v / 100, valeur: v, unite: "%" } : null;
}
var penteTexte = function (p, sep) { return nombreLibre(p.valeur, sep) + (p.unite === "°" ? "°" : " %"); };
var degres = function (t) { return (Math.atan(t) * 180) / Math.PI; };

// ——————————————————————————————————————————————— Contour

var sous = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
var scal = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
var norme = function (a) { return Math.sqrt(scal(a, a)); };

/** Rectangle horizontal { o, u, v, L, W, z } d'un contour de face (u le long du grand côté), ou { erreur }. */
function rectangleDe(points) {
  var e = tx().contourRefuse;
  var p = [];
  points.forEach(function (q) {
    var d = p.length ? p[p.length - 1] : null;
    if (!d || norme(sous(q, d)) > EPS) p.push(q);
  });
  if (p.length > 1 && norme(sous(p[0], p[p.length - 1])) < EPS) p.pop();
  if (p.some(function (q) { return Math.abs(q[2] - p[0][2]) > EPS; })) return { erreur: e.pasHorizontal };
  // Sommets alignés retirés : un rectangle dont un côté porte un point reste un rectangle.
  var r = p.filter(function (q, i) {
    var a = p[(i + p.length - 1) % p.length];
    var b = p[(i + 1) % p.length];
    var u = sous(q, a);
    var w = sous(b, q);
    return Math.abs(u[0] * w[1] - u[1] * w[0]) > EPS * Math.max(1, norme(u) * norme(w));
  });
  if (r.length !== 4) return { erreur: e.pasRectangle };
  var a = sous(r[1], r[0]);
  var b = sous(r[3], r[0]);
  var c = sous(r[2], r[1]);
  if (Math.abs(scal(a, b)) > EPS * norme(a) * norme(b) || norme(sous(c, b)) > 1e-5) return { erreur: e.pasRectangle };
  var la = norme(a);
  var lb = norme(b);
  var u = la >= lb ? a : b;
  var v = la >= lb ? b : a;
  return { o: [r[0][0], r[0][1], r[0][2]], u: [u[0] / norme(u), u[1] / norme(u), 0], v: [v[0] / norme(v), v[1] / norme(v), 0], L: Math.max(la, lb), W: Math.min(la, lb), z: r[0][2] };
}

var monde = function (R, s, r, z) { return [R.o[0] + s * R.u[0] + r * R.v[0], R.o[1] + s * R.u[1] + r * R.v[1], z]; };
var local = function (R, q) { var d = sous(q, R.o); return { s: scal(d, R.u), r: scal(d, R.v), z: q[2] }; };

// ——————————————————————————————————————————————— Placement d'un objet généré, suivi après déplacement

var r_moins = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
var r_vect = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
var r_unit = function (a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; };

/**
 * Repère d'un objet qui vient d'être posé : une face de son contenu (identifiée par son chemin d'occurrences et son
 * identifiant, qui ne changent pas quand l'objet est déplacé ou tourné) et trois de ses sommets, en coordonnées du dessin.
 */
async function repereDe(g) {
  var m = await planche.modele.lire({ portee: "monde" });
  var f = m.faces.filter(function (y) { return y.chemin[0] === g && y.points.length >= 3; })[0];
  if (!f) return null;
  // Trois sommets formant le plus grand triangle : jamais alignés.
  var best = null;
  for (var i = 0; i < f.points.length; i++) for (var j = i + 1; j < f.points.length; j++) for (var k = j + 1; k < f.points.length; k++) {
    var n = r_vect(r_moins(f.points[j], f.points[i]), r_moins(f.points[k], f.points[i]));
    var a = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
    if (!best || a > best.a) best = { a: a, k: [i, j, k] };
  }
  if (!best || best.a < 1e-12) return null;
  return { chemin: f.chemin.slice(1), face: f.id, indices: best.k, points: best.k.map(function (i) { return f.points[i]; }) };
}

var r_cadre = function (p) {
  var e1 = r_unit(r_moins(p[1], p[0]));
  var e3 = e1 && r_unit(r_vect(e1, r_moins(p[2], p[0])));
  return e1 && e3 ? [e1, r_vect(e3, e1), e3] : null;
};

/**
 * Rotation R et translation t qui mènent le repère gardé à la position actuelle de l'objet `id` :
 * `{ R, t, axe, degres }`, `{ immobile: true }` s'il n'a pas bougé, `{ inconnu: true }` si son contenu n'est plus
 * reconnu (copie, contenu modifié).
 */
async function deplacementDepuis(id, r) {
  if (!r || !Array.isArray(r.points) || !Array.isArray(r.indices)) return { inconnu: true };
  var m = await planche.modele.lire({ portee: "monde" });
  var chemin = [id].concat(r.chemin || []);
  var f = m.faces.filter(function (y) { return y.id === r.face && y.chemin.length === chemin.length && y.chemin.every(function (c, i) { return c === chemin[i]; }); })[0];
  if (!f) return { inconnu: true };
  var q = r.indices.map(function (i) { return f.points[i]; });
  if (q.some(function (v) { return !v; })) return { inconnu: true };
  var A = r_cadre(r.points);
  var B = r_cadre(q);
  if (!A || !B) return { inconnu: true };
  var R = [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return B[0][i] * A[0][j] + B[1][i] * A[1][j] + B[2][i] * A[2][j]; }); });
  var t = r_moins(q[0], appliquerR(R, r.points[0]));
  var c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2));
  var angle = Math.acos(c);
  if (angle < 1e-9 && Math.abs(t[0]) + Math.abs(t[1]) + Math.abs(t[2]) < 1e-9) return { immobile: true };
  var axe = [0, 0, 1];
  if (angle > 1e-9) {
    var u = Math.sin(angle) > 1e-6 ? r_unit([R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]) : null;
    if (u) axe = u;
    else {
      // Demi-tour : l'axe est la colonne la plus forte de (R + I) / 2.
      var cols = [0, 1, 2].map(function (j) { return [0, 1, 2].map(function (i) { return (R[i][j] + (i === j ? 1 : 0)) / 2; }); });
      cols.sort(function (a, b) { return (b[0] * b[0] + b[1] * b[1] + b[2] * b[2]) - (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); });
      axe = r_unit(cols[0]) || [0, 0, 1];
    }
  }
  return { R: R, t: t, axe: axe, degres: (angle * 180) / Math.PI };
}
function appliquerR(R, p) { return [0, 1, 2].map(function (i) { return R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2]; }); }

/** Toiture générée par cette extension, sélectionnée seule ; null sinon. */
async function toitureChoisie(m, sel) {
  var objets = m.objets.filter(function (o) { return sel.indexOf(o.id) >= 0; });
  if (sel.length !== 1 || objets.length !== 1) return null;
  var d = await planche.donnees.lire(objets[0].id, "toiture");
  if (!d || TYPES.indexOf(d.type) < 0 || !d.rect) return null;
  // Toiture déplacée, tournée ou copiée avec la Planche : son rectangle suit sa place actuelle, ou elle est refusée
  // pour tout ce qui en dépend (tracé de la ligne, nouvelle toiture sur son contour).
  var dep = await deplacementDepuis(objets[0].id, d.repere);
  var placement = null;
  if (dep.inconnu) placement = tx().placementInconnu;
  else if (dep.R) {
    var R = d.rect;
    var u = appliquerR(dep.R, R.u);
    var v = appliquerR(dep.R, R.v);
    var o = appliquerR(dep.R, R.o);
    o = [o[0] + dep.t[0], o[1] + dep.t[1], o[2] + dep.t[2]];
    if (Math.abs(u[2]) > 1e-6 || Math.abs(v[2]) > 1e-6) placement = tx().toitureInclinee;
    else d.rect = { o: o, u: u, v: v, L: R.L, W: R.W, z: o[2] };
  }
  return { id: objets[0].id, nom: objets[0].nom, p: d, placement: placement };
}

/** Contour courant : la face sélectionnée, ou le contour de la toiture sélectionnée ; { R, face } ou { erreur }. */
async function contourCourant() {
  var x = tx();
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  var toit = await toitureChoisie(m, sel);
  if (toit) return toit.placement ? { erreur: toit.placement } : { R: toit.p.rect, toiture: toit };
  if (!sel.length) return { erreur: x.selectionnerContour };
  var faces = m.faces.filter(function (f) { return sel.indexOf(f.id) >= 0; });
  if (sel.length !== 1 || faces.length !== 1) return { erreur: x.contourRefuse.pasFace };
  // Une ouverture dans le contour n'est pas prise en compte par les calculs : le contour est refusé.
  if (faces[0].trous > 0) return { erreur: x.contourRefuse.trous };
  var R = rectangleDe(faces[0].points);
  if (R.erreur) return R;
  return { R: R, face: faces[0].id };
}

// ——————————————————————————————————————————————— Toiture

/** Mesures d'une toiture { type, t, d } sur le rectangle R. */
function mesurer(R, type, t, d) {
  var L = R.L;
  var W = R.W;
  var h = (W * t) / 2;
  var volume = type === "1" ? (L * W * W * t) / 2 : type === "4" ? (h * W * (3 * L - W)) / 6 : (L * W * h) / 2;
  return {
    egout: R.z - d * t,
    faitage: type === "1" ? R.z + (W + d) * t : R.z + h,
    couverture: (L + 2 * d) * (W + 2 * d) * Math.sqrt(1 + t * t),
    comble: volume,
  };
}

/** Pans de la toiture, en coordonnées locales (s le long du grand côté, r du petit, z altitude). */
function pans(R, type, t, d) {
  var L = R.L;
  var W = R.W;
  var ze = R.z - d * t;
  if (type === "1") return [[[-d, -d, ze], [L + d, -d, ze], [L + d, W + d, R.z + (W + d) * t], [-d, W + d, R.z + (W + d) * t]]];
  var zf = R.z + (W * t) / 2;
  if (type === "2") {
    return [
      [[-d, -d, ze], [L + d, -d, ze], [L + d, W / 2, zf], [-d, W / 2, zf]],
      [[-d, W + d, ze], [-d, W / 2, zf], [L + d, W / 2, zf], [L + d, W + d, ze]],
    ];
  }
  var demi = W / 2 + d;
  var s0 = -d + demi;
  var s1 = L + d - demi;
  var faitiere = s1 - s0 > EPS;
  var bas = [[-d, -d, ze], [L + d, -d, ze]];
  var haut = [[L + d, W + d, ze], [-d, W + d, ze]];
  var f0 = [s0, W / 2, zf];
  var f1 = [s1, W / 2, zf];
  return [
    faitiere ? bas.concat([f1, f0]) : bas.concat([f0]),
    faitiere ? haut.concat([f0, f1]) : haut.concat([f0]),
    [[-d, W + d, ze], [-d, -d, ze], f0],
    [[L + d, -d, ze], [L + d, W + d, ze], faitiere ? f1 : f0],
  ];
}

async function xMax(m) {
  var v = -Infinity;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  return v === -Infinity ? 0 : v;
}

/**
 * Trace des segments (coordonnées du monde) à l'écart de tout le dessin, décalés de X le long de x : rien ne s'y soude.
 * Rend les faces nouvelles (reconnues par leurs identifiants, jamais par leurs coordonnées) et le décalage X, que
 * l'appelant reprend en déplaçant le groupe formé.
 */
async function tracerAEcart(segments) {
  var m0 = await planche.modele.lire();
  var avant = {};
  m0.faces.forEach(function (f) { avant[f.id] = true; });
  var min = Infinity;
  segments.forEach(function (s) { min = Math.min(min, s[0][0], s[1][0]); });
  var X = (await xMax(m0)) + 2 - min;
  var vus = {};
  for (var i = 0; i < segments.length; i++) {
    var a = [segments[i][0][0] + X, segments[i][0][1], segments[i][0][2]];
    var b = [segments[i][1][0] + X, segments[i][1][1], segments[i][1][2]];
    var k = [a, b].map(function (q) { return q.map(function (w) { return Math.round(w * 1e6); }).join(","); }).sort().join("|");
    if (vus[k]) continue;
    vus[k] = true;
    await planche.modele.ligne(a, b);
  }
  var m = await planche.modele.lire();
  return { faces: m.faces.filter(function (f) { return !avant[f.id]; }), X: X };
}

/** Pose la toiture { type, t, valeur, unite, d } sur R ; rend le groupe. Appelé dans une opération ouverte. */
async function poserToiture(R, p) {
  var x = tx();
  var segments = [];
  var polys = pans(R, p.type, p.t, p.d).map(function (poly) { return poly.map(function (q) { return monde(R, q[0], q[1], q[2]); }); });
  polys.forEach(function (poly) {
    for (var i = 0; i < poly.length; i++) segments.push([poly[i], poly[(i + 1) % poly.length]]);
  });
  var r = await tracerAEcart(segments);
  // Les égouts d'une toiture à croupes ferment un rectangle horizontal : cette face de dessous n'est pas un pan.
  var plates = r.faces.filter(function (f) { return f.points.every(function (q) { return Math.abs(q[2] - f.points[0][2]) < EPS; }); });
  if (plates.length) await planche.modele.effacer(plates.map(function (f) { return f.id; }));
  r.faces = r.faces.filter(function (f) { return plates.indexOf(f) < 0; });
  if (r.faces.length !== polys.length) throw new Error(x.toitureNonFormee);
  var sep = (await planche.unites.lire()).separateur;
  var g = await planche.modele.grouper(r.faces.map(function (f) { return f.id; }), x.nomToiture(x.types[p.type], penteTexte(p, sep)));
  await planche.modele.deplacer([g], [-r.X, 0, 0]);
  await planche.donnees.ecrire(g, "toiture", { type: p.type, t: p.t, valeur: p.valeur, unite: p.unite, d: p.d, rect: R, repere: await repereDe(g) });
  return g;
}

function lireToitureFormulaire() {
  var x = tx();
  var pente = lirePente(valeurs.pente, valeurs.unite);
  if (!pente) return { erreur: x.penteInvalide };
  var d = texte(valeurs.debord).trim() === "" ? 0 : lireNombre(valeurs.debord);
  if (!(d >= 0) || d > 5) return { erreur: x.debordInvalide };
  return { type: TYPES.indexOf(valeurs.type) >= 0 ? valeurs.type : "2", t: pente.t, valeur: pente.valeur, unite: pente.unite, d: d };
}

async function genererToiture() {
  var x = tx();
  var c = await contourCourant();
  if (c.erreur) return alerte(c.erreur);
  var p = lireToitureFormulaire();
  if (p.erreur) return alerte(p.erreur);
  var g = await poserEnUnPas(x.opToiture, c.R, p);
  var sep = (await planche.unites.lire()).separateur;
  await planche.selection.definir([g]).catch(function () {});
  return info(x.genere(x.types[p.type] + " " + penteTexte(p, sep), altitude(mesurer(c.R, p.type, p.t, p.d).faitage, sep)));
}

async function poserEnUnPas(nom, R, p) {
  await planche.operation.ouvrir(nom);
  try {
    var g = await poserToiture(R, p);
    await planche.operation.valider();
    return g;
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
}

// ——————————————————————————————————————————————— Variantes

async function variantesGardees() {
  var v = await planche.donnees.lire("projet", "variantes");
  return v && v.R && Array.isArray(v.liste) ? v : null;
}

var memeRectangle = function (a, b) {
  return !!a && !!b && Math.abs(a.L - b.L) < EPS && Math.abs(a.W - b.W) < EPS && Math.abs(a.z - b.z) < EPS && norme(sous(a.o, b.o)) < EPS && norme(sous(a.u, b.u)) < EPS;
};

async function comparerAutrePente() {
  var x = tx();
  var gardees = await variantesGardees();
  var c = await contourCourant();
  if (c.erreur && !gardees) return alerte(c.erreur);
  var R = c.erreur ? gardees.R : c.R;
  var neuf = !gardees || !memeRectangle(gardees.R, R);
  var liste = neuf ? [] : gardees.liste;
  if (liste.length >= MAX_VARIANTES) return alerte(x.tropDeVariantes);
  var proposition = lireToitureFormulaire();
  var r = await planche.saisie.demander(x.titreVariante, [
    { id: "type", libelle: x.champs.type, genre: "choix", valeur: proposition.type || valeurs.type, choix: TYPES.map(function (t) { return { valeur: t, libelle: x.typesLongs[t] }; }) },
    { id: "pente", libelle: x.champs.pente, genre: "nombre", valeur: proposition.valeur || 0, min: 0, max: 1000, unite: null },
    { id: "unite", libelle: x.champs.unite, genre: "choix", valeur: valeurs.unite === "°" ? "°" : "%", choix: [{ valeur: "%", libelle: x.unites["%"] }, { valeur: "°", libelle: x.unites["°"] }] },
    { id: "debord", libelle: x.champs.debord, genre: "nombre", valeur: proposition.d || 0, min: 0, max: 5, unite: "m" },
  ]);
  if (!r) return;
  var pente = lirePente(r.pente, r.unite === "°" ? "°" : "%");
  if (!pente) return alerte(x.penteInvalide);
  var d = typeof r.debord === "number" && r.debord >= 0 && r.debord <= 5 ? r.debord : NaN;
  if (!(d >= 0)) return alerte(x.debordInvalide);
  liste = liste.concat([{ type: TYPES.indexOf(r.type) >= 0 ? r.type : "2", t: pente.t, valeur: pente.valeur, unite: pente.unite, d: d }]);
  await planche.operation.ouvrir(x.titreVariante);
  try {
    await planche.donnees.ecrire("projet", "variantes", { R: R, liste: liste });
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  choisie = "v" + (liste.length - 1);
  if (neuf && gardees) await info(x.nouveauContour);
  return info(x.varianteAjoutee(LETTRES.charAt(liste.length - 1)));
}

async function garderVariante(id) {
  var x = tx();
  var g = await variantesGardees();
  var i = typeof id === "string" && /^v\d$/.test(id) ? Number(id.slice(1)) : -1;
  if (!g || !g.liste[i]) return alerte(x.varianteIntrouvable);
  var gg = await poserEnUnPas(x.opVariante, g.R, g.liste[i]);
  await planche.selection.definir([gg]).catch(function () {});
  var sep = (await planche.unites.lire()).separateur;
  var p = g.liste[i];
  return info(x.genere(x.types[p.type] + " " + penteTexte(p, sep), altitude(mesurer(g.R, p.type, p.t, p.d).faitage, sep)));
}

// ——————————————————————————————————————————————— Table des pentes minimales (fichier sourcé, gardé avec le dessin)

function lireTable(brut) {
  var e = tx().erreurs;
  var d;
  try {
    d = JSON.parse(texte(brut).replace(/^﻿/, ""));
  } catch (err) {
    return { erreur: e.json };
  }
  if (!d || d.format !== FORMAT_TABLE) return { erreur: e.format };
  if (!Array.isArray(d.entrees) || !d.entrees.length || d.entrees.length > MAX_ENTREES) return { erreur: e.entrees };
  var entrees = [];
  for (var i = 0; i < d.entrees.length; i++) {
    var l = d.entrees[i];
    var ok = l && ["materiau", "zone", "situation", "source"].every(function (k) { return typeof l[k] === "string" && l[k].trim(); });
    if (!ok || (l.unite !== "%" && l.unite !== "°") || !lirePente(l.pente, l.unite)) return { erreur: e.entree(i) };
    entrees.push({ materiau: l.materiau.trim().slice(0, 60), zone: l.zone.trim().slice(0, 40), situation: l.situation.trim().slice(0, 60), pente: l.pente, unite: l.unite, source: l.source.trim().slice(0, 160), relu: l.relu === true });
  }
  return { entrees: entrees };
}

async function tableGardee() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^pentes\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(7)) - Number(b.slice(7)); });
  var entrees = [];
  cles.forEach(function (k) { if (Array.isArray(toutes[k])) entrees = entrees.concat(toutes[k]); });
  return { entrees: entrees, cles: cles, fichier: texte(toutes["pentes-fichier"]) };
}

async function chargerTable() {
  var x = tx();
  // Protocole 1.2 : le fichier chargé est archivé tel quel en base ; sans archive, il n'est pas chargé.
  var f = await planche.fichiers.ouvrir([".json"], { archiver: true });
  if (!f) return;
  if (!f.archive) return alerte(x.archiveRefusee + (x.motifsArchive[f.archiveRefus] || x.motifsArchive.impossible) + ")");
  var r = lireTable(f.texte);
  if (r.erreur) return alerte(x.tableRefusee + r.erreur);
  var anciennes = await tableGardee();
  var morceaux = [];
  // Morceaux bornés par leur taille écrite (une valeur gardée fait 4 000 caractères au plus), pas par un nombre de lignes.
  var courant = [];
  r.entrees.forEach(function (e) {
    if (courant.length && JSON.stringify(courant.concat([e])).length > TAILLE_MORCEAU) { morceaux.push(courant); courant = []; }
    courant.push(e);
  });
  if (courant.length) morceaux.push(courant);
  await planche.operation.ouvrir(x.opTable);
  try {
    for (var j = 0; j < morceaux.length; j++) await planche.donnees.ecrire("projet", "pentes." + j, morceaux[j]);
    for (var k = morceaux.length; k < anciennes.cles.length; k++) await planche.donnees.effacer("projet", "pentes." + k);
    await planche.donnees.ecrire("projet", "pentes-fichier", texte(f.nom).slice(0, 80));
    await planche.donnees.ecrire("projet", "pentes-archive", { id: f.archive.id, empreinte: f.archive.empreinte, nom: texte(f.nom).slice(0, 80) });
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.tableEnregistree + r.entrees.length);
}

async function enregistrerModeleTable() {
  var x = tx();
  var modele = { format: FORMAT_TABLE, entrees: [{ materiau: "", zone: "", situation: "", pente: null, unite: "%", source: "", relu: false }] };
  if (await planche.fichiers.enregistrer(x.fichierModele, JSON.stringify(modele, null, 2) + "\n")) await info(x.modeleEnregistre);
}

var uniques = function (l, k) { var v = []; l.forEach(function (e) { if (v.indexOf(e[k]) < 0) v.push(e[k]); }); return v; };

/** Choix de matériau, zone et situation tenus dans la table : un choix absent de la table revient au premier. */
function choixTable(table) {
  var l = table.entrees;
  if (!l.length) return null;
  var mats = uniques(l, "materiau");
  if (mats.indexOf(valeurs.materiau) < 0) valeurs.materiau = mats[0];
  var dans = l.filter(function (e) { return e.materiau === valeurs.materiau; });
  var zones = uniques(dans, "zone");
  if (zones.indexOf(valeurs.zone) < 0) valeurs.zone = zones[0];
  dans = dans.filter(function (e) { return e.zone === valeurs.zone; });
  var sits = uniques(dans, "situation");
  if (sits.indexOf(valeurs.situation) < 0) valeurs.situation = sits[0];
  return { materiaux: mats, zones: zones, situations: sits, entree: dans.filter(function (e) { return e.situation === valeurs.situation; })[0] || null };
}

/** Jugement d'une pente (tangente) sur la table : { libelle, valeur, ton, source }. */
function jugerPente(t, table, sep) {
  var x = tx();
  var c = choixTable(table);
  if (!c) return { libelle: x.penteMin(x.sansTable), valeur: x.nonEvaluable, ton: "", source: null, min: null };
  var libelle = x.penteMin([c.entree ? c.entree.materiau : valeurs.materiau, valeurs.zone, valeurs.situation].join(", "));
  if (!c.entree) return { libelle: libelle, valeur: x.pasDeLigne, ton: "", source: null, min: null };
  var min = lirePente(c.entree.pente, c.entree.unite);
  var e = c.entree;
  if (typeof t !== "number") return { libelle: libelle, valeur: penteTexte(min, sep), ton: "", source: e, min: min };
  var ok = degres(t) >= degres(min.t) - 1e-9;
  return { libelle: libelle, valeur: (ok ? x.conforme : x.nonConforme) + (e.relu ? "" : " · " + x.aVerifier), ton: ok ? "ok" : "alerte", source: e, min: min };
}

// ——————————————————————————————————————————————— Ligne de hauteur sous rampants

async function tracerLigne() {
  var x = tx();
  var m = await planche.modele.lire();
  var toit = await toitureChoisie(m, await planche.selection.lire());
  if (!toit) return alerte(x.aucuneToiture);
  if (toit.placement) return alerte(toit.placement);
  var H = lireNombre(valeurs.hauteur);
  if (!(H > 0)) return alerte(x.hauteurInvalide);
  var R = toit.p.rect;
  var t = toit.p.t;
  var a = H / t;
  var L = R.L;
  var W = R.W;
  var mes = surfacesComble(toit.p.type, L, W, a);
  var sep = (await planche.unites.lire()).separateur;
  var h = nombreLibre(H, sep);
  // Contour au plancher du comble, et la ligne là où la hauteur sous rampants vaut H.
  var seg = function (s0, r0, s1, r1) { return [monde(R, s0, r0, R.z), monde(R, s1, r1, R.z)]; };
  var segments = [seg(0, 0, L, 0), seg(L, 0, L, W), seg(L, W, 0, W), seg(0, W, 0, 0)];
  if (mes.sur > EPS) {
    if (toit.p.type === "2") segments.push(seg(0, a, L, a), seg(0, W - a, L, W - a));
    else if (toit.p.type === "1") segments.push(seg(0, a, L, a));
    else segments.push(seg(a, a, L - a, a), seg(L - a, a, L - a, W - a), seg(L - a, W - a, a, W - a), seg(a, W - a, a, a));
  }
  var hauteurEn = function (q) {
    var p = local(R, q);
    var s = p.s;
    var r = p.r;
    var d = toit.p.type === "1" ? r : toit.p.type === "2" ? Math.min(r, W - r) : Math.min(s, L - s, r, W - r);
    return d * t;
  };
  var ancienne = await planche.donnees.lire(toit.id, "ligne");
  var matiere = valeurs.matiere;
  var matieres = await planche.matieres.lire();
  if (!matieres.some(function (k) { return k.id === matiere; })) matiere = "";
  await planche.operation.ouvrir(x.opLigne);
  var g;
  try {
    if (ancienne && m.objets.some(function (o) { return o.id === ancienne; })) await planche.modele.effacer([ancienne]);
    var r = await tracerAEcart(segments);
    var sousIds = [];
    var surIds = [];
    r.faces.forEach(function (f) {
      var haute = f.points.every(function (q) { return hauteurEn([q[0] - r.X, q[1], q[2]]) >= H - 1e-6; });
      (haute ? surIds : sousIds).push(f.id);
    });
    var groupes = [];
    var bande = await planche.modele.grouper(sousIds, x.nomBandeSous(h, fixe(mes.sous, 2, sep)));
    if (matiere) await planche.matieres.appliquer([bande], matiere);
    groupes.push(bande);
    if (surIds.length) groupes.push(await planche.modele.grouper(surIds, x.nomPartieSur(h, fixe(mes.sur, 2, sep))));
    g = await planche.modele.grouper(groupes, x.nomLigne(h));
    await planche.modele.deplacer([g], [-r.X, 0, 0]);
    await planche.donnees.ecrire(g, "comble", { hauteur: H, sous: mes.sous, sur: mes.sur, toiture: toit.id });
    await planche.donnees.ecrire(toit.id, "ligne", g);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  await planche.selection.definir([toit.id]).catch(function () {});
  if (mes.sur <= EPS) return info(x.rienAuDessus(h));
  return info(x.ligneTracee(h, fixe(mes.sous, 2, sep), fixe(mes.sur, 2, sep)));
}

/** Aires du plancher du comble sous la hauteur et au-dessus, quand la ligne est à la distance a des murs bas. */
function surfacesComble(type, L, W, a) {
  var sur = type === "1" ? L * Math.max(0, W - a) : type === "2" ? L * Math.max(0, W - 2 * a) : Math.max(0, L - 2 * a) * Math.max(0, W - 2 * a);
  return { sur: sur, sous: L * W - sur };
}

// ——————————————————————————————————————————————— États des onglets

var choixDe = function (liste, libelles) { return liste.map(function (v) { return { valeur: v, libelle: libelles ? libelles[v] : v }; }); };

function champsToiture() {
  var x = tx();
  var c = x.champs;
  return [
    { id: "type", libelle: c.type, valeur: valeurs.type, choix: choixDe(TYPES, x.typesLongs) },
    { id: "pente", libelle: c.pente, valeur: valeurs.pente },
    { id: "unite", libelle: c.unite, valeur: valeurs.unite, choix: choixDe(["%", "°"], x.unites) },
    { id: "debord", libelle: c.debord, valeur: valeurs.debord },
  ];
}

function lignesMesures(R, p, sep) {
  var x = tx();
  var m = mesurer(R, p.type, p.t, p.d);
  return [
    { libelle: x.egout, valeur: altitude(m.egout, sep) },
    { libelle: x.faitage, valeur: altitude(m.faitage, sep) },
    { libelle: x.couverture, valeur: fixe(m.couverture, 1, sep) + " m²" },
    { libelle: x.comble, valeur: fixe(m.comble, 0, sep) + " m³" },
  ];
}

async function etatPans(sep, table) {
  var x = tx();
  var c = await contourCourant();
  var formulaire = champsToiture();
  if (c.erreur) return { formulaire: formulaire, resultats: [{ libelle: x.contour, valeur: c.erreur, ton: "alerte" }] };
  var resultats = [{ libelle: x.contour, valeur: fixe(c.R.L, 2, sep) + " × " + fixe(c.R.W, 2, sep) + " m" }];
  var p = lireToitureFormulaire();
  if (!p.erreur) {
    resultats = resultats.concat(lignesMesures(c.R, p, sep));
    var j = jugerPente(p.t, table, sep);
    resultats.push({ libelle: j.libelle, valeur: j.valeur, ton: j.ton });
  }
  return { formulaire: formulaire, resultats: resultats };
}

async function etatVariantes(sep, table) {
  var x = tx();
  var g = await variantesGardees();
  var encart = table.entrees.length ? null : x.tableAbsente;
  if (!g || !g.liste.length) return { vide: x.videVariantes, colonnes: x.colVariantes, encart: encart, resultats: [] };
  var lignes = g.liste.map(function (p, i) {
    var m = mesurer(g.R, p.type, p.t, p.d);
    var id = "v" + i;
    return { genre: "ligne", id: id, choisi: id === choisie, cellules: [LETTRES.charAt(i) + " · " + x.types[p.type], penteTexte(p, sep), fixe(m.couverture, 1, sep) + " m²", altitude(m.egout, sep), altitude(m.faitage, sep), fixe(m.comble, 0, sep) + " m³"] };
  });
  var i = choisie ? Number(choisie.slice(1)) : -1;
  var v = g.liste[i];
  var j = jugerPente(v ? v.t : null, table, sep);
  return {
    colonnes: x.colVariantes,
    lignes: lignes,
    resultats: [{ libelle: j.libelle, valeur: v || !table.entrees.length ? j.valeur : x.varianteIntrouvable, ton: v ? j.ton : "" }],
    encart: encart,
    choisieLibelle: v ? LETTRES.charAt(i) : "",
  };
}

async function etatPente(sep, table) {
  var x = tx();
  var c = choixTable(table);
  var formulaire = c ? [
    { id: "materiau", libelle: x.champs.materiau, valeur: valeurs.materiau, choix: choixDe(c.materiaux) },
    { id: "zone", libelle: x.champs.zone, valeur: valeurs.zone, choix: choixDe(c.zones) },
    { id: "situation", libelle: x.champs.situation, valeur: valeurs.situation, choix: choixDe(c.situations) },
  ] : [];
  var m = await planche.modele.lire();
  var toit = await toitureChoisie(m, await planche.selection.lire());
  var p = toit ? toit.p : lireToitureFormulaire();
  var resultats = [];
  var t = null;
  if (!p.erreur) {
    t = p.t;
    resultats.push({ libelle: x.pente, valeur: penteTexte(p, sep) + " (" + (toit ? x.origineToiture(toit.nom) : x.origineFormulaire) + ")" });
  }
  var j = jugerPente(t, table, sep);
  if (j.min) {
    resultats.push({ libelle: j.libelle, valeur: penteTexte(j.min, sep) });
    if (t !== null) resultats.push({ libelle: x.resultat, valeur: j.valeur, ton: j.ton });
  } else resultats.push({ libelle: j.libelle, valeur: j.valeur, ton: j.ton });
  if (j.source) resultats.push({ libelle: x.source, valeur: j.source.source + (j.source.relu ? "" : " · " + x.aVerifier) });
  return { formulaire: formulaire, resultats: resultats, encart: table.entrees.length ? x.tableChargee(table.entrees.length, table.fichier) : x.tableAbsente };
}

async function etatLigne(sep) {
  var x = tx();
  var matieres = await planche.matieres.lire();
  var formulaire = [
    { id: "hauteur", libelle: x.champs.hauteur, valeur: valeurs.hauteur },
    { id: "matiere", libelle: x.champs.matiere, valeur: valeurs.matiere, choix: [{ valeur: "", libelle: x.aucuneMatiere }].concat(matieres.slice(0, 39).map(function (k) { return { valeur: k.id, libelle: k.nom }; })) },
  ];
  var m = await planche.modele.lire();
  var toit = await toitureChoisie(m, await planche.selection.lire());
  if (!toit) return { formulaire: formulaire, resultats: [{ libelle: x.toitureChoisie, valeur: x.aucuneToiture, ton: "alerte" }] };
  var H = lireNombre(valeurs.hauteur);
  var resultats = [{ libelle: x.toitureChoisie, valeur: toit.nom }];
  if (H > 0) {
    var h = nombreLibre(H, sep);
    var mes = surfacesComble(toit.p.type, toit.p.rect.L, toit.p.rect.W, H / toit.p.t);
    resultats.push({ libelle: x.sousLigne(h), valeur: fixe(mes.sous, 2, sep) + " m²", ton: "limite" }, { libelle: x.surLigne(h), valeur: fixe(mes.sur, 2, sep) + " m²" });
  }
  return { formulaire: formulaire, resultats: resultats };
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var table = await tableGardee();
  var e;
  if (onglet === "variantes") e = await etatVariantes(sep, table);
  else if (onglet === "pente") e = await etatPente(sep, table);
  else if (onglet === "ligne") e = await etatLigne(sep);
  else e = await etatPans(sep, table);
  var lignes = e.lignes || [];
  var pages = Math.max(1, Math.ceil(lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    note: x.note[onglet],
    formulaire: e.formulaire || [],
    resultats: e.resultats || [],
    encart: e.encart || null,
    colonnes: e.colonnes || [],
    lignes: lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    vide: e.vide || null,
    choisie: onglet === "variantes" ? choisie : null,
    choisieLibelle: e.choisieLibelle || "",
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
action("choisir", function (d) { choisie = typeof d.id === "string" ? d.id : null; });
action("generer-toiture", genererToiture);
action("comparer-pente", comparerAutrePente);
action("garder-variante", function (d) { return garderVariante(typeof d.id === "string" ? d.id : choisie); });
action("charger-table", chargerTable);
action("modele-table", enregistrerModeleTable);
action("tracer-ligne", tracerLigne);

var commande = function (nom, ong, fn) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) { page = 0; choisie = null; }
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
commande("ouvrir-panneau", "pans", null);
commande("toiture-pans", "pans", null);
commande("variantes", "variantes", null);
commande("pente-minimale", "pente", null);
commande("ligne-hauteur", "ligne", null);
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
