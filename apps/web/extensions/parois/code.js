// Extension « Parois, baies et structure » (catalogue des extensions de la Planche, cas 1 de la feuille de route,
// extension n° 5 ; maquette validée le 27 novembre 2026). Six onglets, un par entrée du catalogue :
//   Cloisons (n° 11, D4-F5-005) · Baies (n° 13, D4-F5-034) · Mur porteur percé (n° 35, D4-F23-027) ·
//   Poteaux et poutres (n° 38, D4-F5-020) · Fronts mitoyens (n° 28, D4-F5-133) · Mur en limite (n° 39, N-D4-1).
//
// Un avis, jamais une note de calcul : la structure reste au bureau d'études. Aucune section, charge ni règle n'est
// écrite ici ; les types de paroi viennent d'une bibliothèque d'agence chargée par l'utilisateur, les sections sont
// saisies. Les murs qualifiés (existant, porteur, en limite) sont gardés avec le dessin par leur plan : une face
// coplanaire qui recouvre le même endroit est le même mur.

var VERSION = "1.0.0";
var PANNEAU = "parois";
var ONGLETS = ["cloisons", "baies", "porteur", "structure", "fronts", "limite"];
var FORMAT_TYPES = "fadi-types-parois/1";
var MAX_TYPES = 20;
var MAX_MURS = 60;
var MURS_PAR_MORCEAU = 10;
var MAX_INTERVENTIONS = 30;
var MAX_AXES = 12;
var MAX_ETAGES = 10;
var LIGNES_PAR_PAGE = 80;
var EPS = 1e-6;
var LETTRES = "ABCDEFGHIJKLM";

var onglet = "baies";
var page = 0;
var langue = "fr";
var valeurs = {
  type: "", hauteur: "", position: "axe",
  baie: "", depuis: "bas", decalage: "",
  etat: "existant", porteur: "oui", nom: "",
  entraxesX: "", entraxesY: "", poteau: "", poutre: "", hauteurEtage: "", etages: "",
  hauteurFacades: "",
  qualification: "mitoyen", heberge: "", extension: "",
};
var derniereBaie = null;
var limitesCotes = { face: null, cotes: {} };

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: {
      type: "Type de paroi", hauteur: "Hauteur (m)", position: "Position sur l'arête",
      baie: "Largeur ; hauteur ; allège (m)", depuis: "Allège mesurée depuis", decalage: "Depuis le bord gauche (m, vide = centrée)",
      etat: "État", porteur: "Porteur", nom: "Nom du mur",
      entraxesX: "Entraxes A, B, C… (m)", entraxesY: "Entraxes 1, 2, 3… (m)", poteau: "Section des poteaux (m)", poutre: "Section des poutres, largeur × hauteur (m)", hauteurEtage: "Hauteur d'étage (m)", etages: "Nombre d'étages",
      hauteurFacades: "Hauteur des façades (m)",
      qualification: "Qualification", heberge: "Hauteur d'héberge (m)", extension: "Hauteur de l'extension contre le mur (m)",
    },
    positions: { axe: "dans l'axe", gauche: "à gauche", droite: "à droite" },
    depuis: { bas: "le bas du mur", zero: "l'altitude 0 du dessin" },
    etats: { existant: "existant", projet: "projet" },
    ouiNon: { oui: "oui", non: "non" },
    qualifications: { mitoyen: "mitoyen", projet: "privatif du projet", voisin: "privatif du voisin" },
    aucunType: "aucune bibliothèque chargée",
    note: {
      cloisons: "Tracez l'axe avec l'outil Ligne (deux points), sélectionnez l'arête, puis posez : chaque cloison est un groupe qui garde son type et son métré.",
      baies: "Sélectionnez la face du mur : la baie traverse jusqu'à la face opposée. Un avis, jamais une note de calcul : la structure reste au bureau d'études.",
      porteur: "Sélectionnez une face de mur pour la marquer. Les interventions consignées depuis l'onglet Baies sont listées ici et s'exportent.",
      structure: "La trame est posée à droite du dessin, axes A, B, C… le long de x et 1, 2, 3… le long de y ; un groupe par niveau. Sections saisies, rien n'est dimensionné.",
      fronts: "Sélectionnez le contour de l'îlot (face horizontale). Cliquez un côté pour le déclarer en limite séparative : aucune baie n'y sera percée.",
      limite: "Sélectionnez une face de mur. Hauteurs mesurées depuis le bas du mur. La Planche ne tranche rien : la qualification d'un mur se vérifie sur titre ou par le géomètre.",
    },
    colMetre: ["Cloison", "Longueur", "Hauteur", "Surface"],
    colInterventions: ["Date", "Baie", "Mur", "À faire valider"],
    colFronts: ["Côté", "Longueur", "Limite séparative"],
    colStructure: ["Élément", "Nombre", "Section", "Longueur"],
    epaisseur: "Épaisseur traversée (face opposée)",
    mur: "Mur", murNonQualifie: "non qualifié",
    murTexte: function (r) {
      var x = T.fr;
      var l = [];
      if (r.existant !== null && r.existant !== undefined) l.push(r.existant ? "existant" : "projet");
      if (r.porteur !== null && r.porteur !== undefined) l.push(r.porteur ? "porteur" : "non porteur");
      if (r.limite) l.push("en limite séparative");
      if (r.qualification) l.push(x.qualifications[r.qualification]);
      return l.length ? l.join(", ") : x.murNonQualifie;
    },
    encartPorteur: function (l) { return "Ouverture dans un mur porteur existant : " + l + " m créés. Points à faire valider : linteau ou poutre, appuis, descente de charges, avis du bureau d'études structure. La Planche ne calcule rien."; },
    encartLimite: "Mur en limite séparative, déclaré dans Fronts mitoyens : aucune baie n'y est percée.",
    points: "linteau ou poutre, appuis, descente de charges, avis du bureau d'études structure",
    selectionnerFace: "Sélectionnez une seule face de mur.",
    pasVerticale: "La face doit être verticale (un mur).",
    pasDOpposee: "Aucune face opposée parallèle derrière cette face : la paroi doit être modelée en faces des deux côtés.",
    horsFace: "La baie sort de la face du mur : réduisez-la ou déplacez-la.",
    baieInvalide: "Saisissez largeur ; hauteur ; allège, en mètres (trois nombres positifs, allège positive ou nulle).",
    nonPercee: "La baie n'a pas pu être percée sur ces faces : rien n'a été modifié.",
    percee: function (l, h) { return "Baie de " + l + " × " + h + " m percée."; },
    rienAConsigner: "Percez d'abord une baie : l'intervention consignée est la dernière baie percée.",
    consignee: "Intervention consignée : elle est listée dans l'onglet Mur porteur percé.",
    tropDInterventions: "Trente interventions au plus : exportez le relevé, puis recommencez.",
    marque: function (n) { return "Mur « " + n + " » marqué."; },
    tropDeMurs: "Soixante murs qualifiés au plus.",
    nomMur: function (i) { return "Mur " + i; },
    videInterventions: "Aucune intervention consignée : percez une baie, puis « Consigner l'intervention ».",
    releve: { titre: "Relevé des interventions sur murs", date: "Date", baie: "Baie", mur: "Mur", points: "Points à faire valider", rien: "La Planche ne calcule rien : chaque point est à faire valider par le bureau d'études structure." },
    fichierReleve: function (d) { return "interventions-murs-" + d + ".md"; },
    exporte: "Relevé exporté.",
    // Cloisons
    choisirAretes: "Sélectionnez une ou plusieurs arêtes droites et horizontales : l'axe de chaque cloison.",
    pasDeType: "Chargez d'abord la bibliothèque des types de paroi de l'agence.",
    hauteurInvalide: "La hauteur doit être un nombre positif, en mètres.",
    cloisonsPosees: function (n) { return n + (n > 1 ? " cloisons posées." : " cloison posée."); },
    nomCloison: function (t, l) { return "Cloison " + t + " — " + l + " m"; },
    videMetre: "Aucune cloison posée.",
    typesCharges: function (n) { return "Bibliothèque chargée : " + n + (n > 1 ? " types." : " type."); },
    typesRefuses: "Bibliothèque refusée : ",
    archiveRefusee: "Chargement refusé : le fichier n'a pas pu être archivé en base (",
    modeleEnregistre: "Modèle de bibliothèque enregistré : remplissez-le, puis chargez-le.",
    fichierModele: "modele-types-parois.json",
    erreursTypes: {
      json: "le fichier n'est pas un JSON lisible",
      format: "le format doit être « " + FORMAT_TYPES + " »",
      types: "la bibliothèque doit contenir de 1 à " + MAX_TYPES + " types",
      type: function (i) { return "type " + (i + 1) + " : identifiant, nom et épaisseur (nombre positif, en mètres) sont attendus"; },
    },
    typeLigne: function (t, sep) { return t.nom + " — " + T.fr.nb(t.epaisseur * 100, sep) + " cm" + (t.ossature ? ", " + t.ossature : "") + (t.plaques ? ", " + t.plaques : ""); },
    nb: function (v, sep) { return (Math.round(v * 10) / 10).toString().replace(".", sep); },
    total: function (n) { return "Total · " + n + (n > 1 ? " cloisons" : " cloison"); },
    // Structure
    trameInvalide: "Saisissez les entraxes (nombres positifs séparés par « ; »), les sections « largeur × profondeur », la hauteur d'étage et le nombre d'étages.",
    tropDAxes: "Douze axes au plus dans chaque direction, dix étages au plus.",
    pouterTropHaute: "La hauteur de poutre doit être inférieure à la hauteur d'étage.",
    trame: "Trame", trameTexte: function (a, b, n) { return "A–" + a + " × 1–" + b + ", " + n + (n > 1 ? " niveaux" : " niveau"); },
    poteaux: "Poteaux", poutres: "Poutres",
    nomPoteau: function (a, k) { return "Poteau " + a + " · niveau " + k; },
    nomPoutre: function (a, b, k) { return "Poutre " + a + "–" + b + " · niveau " + k; },
    nomNiveau: function (k) { return "Niveau " + k; },
    nomTrame: function (t) { return "Structure — trame " + t; },
    tramePosee: function (n, m) { return "Trame posée : " + n + " poteaux, " + m + " poutres."; },
    // Fronts
    choisirContour: "Sélectionnez le contour de l'îlot : une seule face horizontale.",
    contourHorizontal: "Le contour de l'îlot doit être une face horizontale.",
    cote: function (i) { return "Côté " + i; },
    contourIlot: "Contour de l'îlot",
    hauteurFacadesInvalide: "La hauteur des façades doit être un nombre positif, en mètres.",
    nomFacade: function (i, l) { return "Façade " + i + (l ? " — limite séparative" : ""); },
    nomFronts: "Fronts de l'îlot",
    frontsGeneres: function (n, l) { return n + " façades générées, dont " + l + " en limite séparative."; },
    nonFormees: "Les façades n'ont pas pu être formées sur ce contour : rien n'a été modifié.",
    // Limite
    hebergeInvalide: "La hauteur d'héberge doit être un nombre positif ou nul, en mètres.",
    qualifie: function (n) { return "Mur « " + n + " » qualifié."; },
    qualification: "Qualification", heberge: "Héberge", extension: "Extension",
    nonEvaluee: "non évaluée",
    sousHeberge: function (v) { return "adossement sous l'héberge (" + v + " m de marge)"; },
    surHeberge: function (v) { return "surélévation de " + v + " m au-dessus de l'héberge"; },
    encartQualif: {
      mitoyen: "Mur mitoyen : adossement ou surélévation à faire vérifier avec le voisin et sur titre. La Planche ne tranche rien.",
      projet: "Mur privatif du projet : la qualification est à vérifier sur titre ou par le géomètre. La Planche ne tranche rien.",
      voisin: "Adossement contre un mur privatif du voisin : situation à faire vérifier (accord du voisin, mitoyenneté). La Planche ne tranche rien.",
    },
    m: " m",
    opCloisons: "Poser des cloisons", opBaie: "Percer une baie", opConsigner: "Consigner une intervention", opMarquer: "Marquer un mur", opTrame: "Poser une trame", opFronts: "Générer des façades mitoyennes", opQualifier: "Qualifier un mur", opTypes: "Bibliothèque des types de paroi",
  },
  en: {
    champs: {
      type: "Wall type", hauteur: "Height (m)", position: "Position on the edge",
      baie: "Width ; height ; sill (m)", depuis: "Sill measured from", decalage: "From the left edge (m, empty = centred)",
      etat: "State", porteur: "Load-bearing", nom: "Wall name",
      entraxesX: "Spacings A, B, C… (m)", entraxesY: "Spacings 1, 2, 3… (m)", poteau: "Column section (m)", poutre: "Beam section, width × depth (m)", hauteurEtage: "Storey height (m)", etages: "Number of storeys",
      hauteurFacades: "Facade height (m)",
      qualification: "Qualification", heberge: "Party-wall height (m)", extension: "Extension height against the wall (m)",
    },
    positions: { axe: "on the axis", gauche: "on the left", droite: "on the right" },
    depuis: { bas: "the foot of the wall", zero: "level 0 of the drawing" },
    etats: { existant: "existing", projet: "new" },
    ouiNon: { oui: "yes", non: "no" },
    qualifications: { mitoyen: "party wall", projet: "project's own", voisin: "neighbour's own" },
    aucunType: "no library loaded",
    note: {
      cloisons: "Draw the axis with the Line tool (two points), select the edge, then lay: each partition is a group that keeps its type and quantities.",
      baies: "Select the wall face: the opening goes through to the opposite face. An opinion, never a calculation: the structure stays with the engineers.",
      porteur: "Select a wall face to mark it. The works recorded from the Openings tab are listed here and can be exported.",
      structure: "The grid is laid to the right of the drawing, axes A, B, C… along x and 1, 2, 3… along y; one group per level. Sections are typed in, nothing is sized.",
      fronts: "Select the block outline (horizontal face). Click a side to declare it on the boundary: no opening will be cut there.",
      limite: "Select a wall face. Heights measured from the foot of the wall. The Planche decides nothing: a wall's status is checked on title or by the surveyor.",
    },
    colMetre: ["Partition", "Length", "Height", "Area"],
    colInterventions: ["Date", "Opening", "Wall", "To be approved"],
    colFronts: ["Side", "Length", "Boundary"],
    colStructure: ["Element", "Count", "Section", "Length"],
    epaisseur: "Thickness crossed (opposite face)",
    mur: "Wall", murNonQualifie: "not qualified",
    murTexte: function (r) {
      var x = T.en;
      var l = [];
      if (r.existant !== null && r.existant !== undefined) l.push(r.existant ? "existing" : "new");
      if (r.porteur !== null && r.porteur !== undefined) l.push(r.porteur ? "load-bearing" : "not load-bearing");
      if (r.limite) l.push("on the boundary");
      if (r.qualification) l.push(x.qualifications[r.qualification]);
      return l.length ? l.join(", ") : x.murNonQualifie;
    },
    encartPorteur: function (l) { return "Opening in an existing load-bearing wall: " + l + " m created. Points to have approved: lintel or beam, bearings, load path, structural engineer's opinion. The Planche calculates nothing."; },
    encartLimite: "Wall on the boundary, declared in Party facades: no opening is cut there.",
    points: "lintel or beam, bearings, load path, structural engineer's opinion",
    selectionnerFace: "Select a single wall face.",
    pasVerticale: "The face must be vertical (a wall).",
    pasDOpposee: "No parallel opposite face behind this face: the wall must be modelled with faces on both sides.",
    horsFace: "The opening goes beyond the wall face: make it smaller or move it.",
    baieInvalide: "Type width ; height ; sill, in metres (three positive numbers, sill positive or zero).",
    nonPercee: "The opening could not be cut in these faces: nothing was changed.",
    percee: function (l, h) { return "Opening " + l + " × " + h + " m cut."; },
    rienAConsigner: "Cut an opening first: the recorded work is the last opening cut.",
    consignee: "Work recorded: it is listed in the Pierced load-bearing wall tab.",
    tropDInterventions: "Thirty works at most: export the record, then start again.",
    marque: function (n) { return "Wall « " + n + " » marked."; },
    tropDeMurs: "Sixty qualified walls at most.",
    nomMur: function (i) { return "Wall " + i; },
    videInterventions: "No recorded work: cut an opening, then « Record the work ».",
    releve: { titre: "Record of works on walls", date: "Date", baie: "Opening", mur: "Wall", points: "Points to have approved", rien: "The Planche calculates nothing: each point must be approved by the structural engineer." },
    fichierReleve: function (d) { return "wall-works-" + d + ".md"; },
    exporte: "Record exported.",
    choisirAretes: "Select one or more straight horizontal edges: the axis of each partition.",
    pasDeType: "Load the office's wall type library first.",
    hauteurInvalide: "The height must be a positive number, in metres.",
    cloisonsPosees: function (n) { return n + (n > 1 ? " partitions laid." : " partition laid."); },
    nomCloison: function (t, l) { return "Partition " + t + " — " + l + " m"; },
    videMetre: "No partition laid.",
    typesCharges: function (n) { return "Library loaded: " + n + (n > 1 ? " types." : " type."); },
    typesRefuses: "Library refused: ",
    archiveRefusee: "Loading refused: the file could not be archived in the database (",
    modeleEnregistre: "Library template saved: fill it in, then load it.",
    fichierModele: "wall-types-template.json",
    erreursTypes: {
      json: "the file is not readable JSON",
      format: "the format must be « " + FORMAT_TYPES + " »",
      types: "the library must hold 1 to " + MAX_TYPES + " types",
      type: function (i) { return "type " + (i + 1) + ": id, name and thickness (positive number, in metres) are expected"; },
    },
    typeLigne: function (t, sep) { return t.nom + " — " + T.en.nb(t.epaisseur * 100, sep) + " cm" + (t.ossature ? ", " + t.ossature : "") + (t.plaques ? ", " + t.plaques : ""); },
    nb: function (v, sep) { return (Math.round(v * 10) / 10).toString().replace(".", sep); },
    total: function (n) { return "Total · " + n + (n > 1 ? " partitions" : " partition"); },
    trameInvalide: "Type the spacings (positive numbers separated by « ; »), the sections « width × depth », the storey height and the number of storeys.",
    tropDAxes: "Twelve axes at most in each direction, ten storeys at most.",
    pouterTropHaute: "The beam depth must be less than the storey height.",
    trame: "Grid", trameTexte: function (a, b, n) { return "A–" + a + " × 1–" + b + ", " + n + (n > 1 ? " levels" : " level"); },
    poteaux: "Columns", poutres: "Beams",
    nomPoteau: function (a, k) { return "Column " + a + " · level " + k; },
    nomPoutre: function (a, b, k) { return "Beam " + a + "–" + b + " · level " + k; },
    nomNiveau: function (k) { return "Level " + k; },
    nomTrame: function (t) { return "Structure — grid " + t; },
    tramePosee: function (n, m) { return "Grid laid: " + n + " columns, " + m + " beams."; },
    choisirContour: "Select the block outline: a single horizontal face.",
    contourHorizontal: "The block outline must be a horizontal face.",
    cote: function (i) { return "Side " + i; },
    contourIlot: "Block outline",
    hauteurFacadesInvalide: "The facade height must be a positive number, in metres.",
    nomFacade: function (i, l) { return "Facade " + i + (l ? " — boundary" : ""); },
    nomFronts: "Block facades",
    frontsGeneres: function (n, l) { return n + " facades generated, " + l + " on the boundary."; },
    nonFormees: "The facades could not be formed on this outline: nothing was changed.",
    hebergeInvalide: "The party-wall height must be a positive number or zero, in metres.",
    qualifie: function (n) { return "Wall « " + n + " » qualified."; },
    qualification: "Qualification", heberge: "Party-wall height", extension: "Extension",
    nonEvaluee: "not assessed",
    sousHeberge: function (v) { return "leaning below the party-wall height (" + v + " m margin)"; },
    surHeberge: function (v) { return "raised " + v + " m above the party-wall height"; },
    encartQualif: {
      mitoyen: "Party wall: leaning on or raising it must be checked with the neighbour and on title. The Planche decides nothing.",
      projet: "Project's own wall: the status must be checked on title or by the surveyor. The Planche decides nothing.",
      voisin: "Leaning against the neighbour's own wall: to be checked (neighbour's consent, party-wall rights). The Planche decides nothing.",
    },
    m: " m",
    opCloisons: "Lay partitions", opBaie: "Cut an opening", opConsigner: "Record a work", opMarquer: "Mark a wall", opTrame: "Lay a grid", opFronts: "Generate party facades", opQualifier: "Qualify a wall", opTypes: "Wall type library",
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
var lireListe = function (s) { return texte(s).split(";").map(function (x) { return lireNombre(x); }); };
var lireSection = function (s) {
  var l = texte(s).split(/[×x*]/i).map(function (x) { return lireNombre(x); });
  return l.length === 2 && l[0] > 0 && l[1] > 0 ? l : null;
};
// Arrondi au plus proche (le demi monte), sans l'écart binaire de toFixed.
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var aujourdhui = function () { return new Date().toISOString().slice(0, 10); };

// ——————————————————————————————————————————————— Géométrie

var sous = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
var plus = function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
var fois = function (a, k) { return [a[0] * k, a[1] * k, a[2] * k]; };
var scal = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
var norme = function (a) { return Math.sqrt(scal(a, a)); };
var unitaire = function (a) { var n = norme(a); return n > 0 ? fois(a, 1 / n) : a; };

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
  return unitaire(n);
}
/** Point dans un polygone plan (coordonnées 2D). */
function dedans(pt, poly) {
  var c = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i];
    var b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function boite(points) {
  var min = [Infinity, Infinity, Infinity];
  var max = [-Infinity, -Infinity, -Infinity];
  points.forEach(function (q) { for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); } });
  return { min: min, max: max };
}

async function xMax(m) {
  var v = -Infinity;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  return v === -Infinity ? 0 : v;
}

/** Face sélectionnée seule ; { face, n } ou { erreur }. */
async function faceChoisie(m) {
  var sel = await planche.selection.lire();
  var faces = m.faces.filter(function (f) { return sel.indexOf(f.id) >= 0; });
  if (sel.length !== 1 || faces.length !== 1) return { erreur: tx().selectionnerFace };
  return { face: faces[0], n: normaleDe(faces[0].points) };
}

// ——————————————————————————————————————————————— Murs qualifiés (par leur plan, gardés avec le dessin)

async function mursGardes() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^murs\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(5)) - Number(b.slice(5)); });
  var murs = [];
  cles.forEach(function (k) { if (Array.isArray(toutes[k])) murs = murs.concat(toutes[k]); });
  return { murs: murs, cles: cles };
}
async function ecrireMurs(murs, anciennes) {
  var n = 0;
  for (var i = 0; i < murs.length; i += MURS_PAR_MORCEAU) await planche.donnees.ecrire("projet", "murs." + n++, murs.slice(i, i + MURS_PAR_MORCEAU));
  for (var k = n; k < anciennes.length; k++) await planche.donnees.effacer("projet", "murs." + k);
}
/** Le mur qualifié qui porte cette face (même plan, à l'endroit), ou null. */
function murDe(murs, face, n) {
  var b = boite(face.points);
  var p = face.points[0];
  return murs.filter(function (r) {
    if (Math.abs(Math.abs(scal(r.n, n)) - 1) > 1e-6 || Math.abs(scal(r.n, sous(p, r.p))) > 1e-4) return false;
    // Recouvrement d'une étendue non nulle dans le plan du mur : deux murs qui se touchent seulement par un bord ou un
    // coin restent deux murs (une qualification n'est jamais prêtée à un mur qui ne l'a pas reçue).
    var recouvre = 0;
    for (var k = 0; k < 3; k++) {
      var o = Math.min(b.max[k], r.max[k]) - Math.max(b.min[k], r.min[k]);
      if (o < -1e-4) return false;
      if (o > 1e-4) recouvre++;
    }
    return recouvre >= 2;
  })[0] || null;
}
/** Ajoute ou complète le mur qualifié de cette face ; rend la fiche. Appelé dans une opération ouverte. */
async function qualifierFace(face, n, champs) {
  var g = await mursGardes();
  var r = murDe(g.murs, face, n);
  if (!r) {
    if (g.murs.length >= MAX_MURS) throw new Error(tx().tropDeMurs);
    var b = boite(face.points);
    var num = g.murs.reduce(function (a, x) { return Math.max(a, Number(String(x.id).slice(1)) || 0); }, 0) + 1;
    r = { id: "m" + num, nom: tx().nomMur(num), p: face.points[0].slice(), n: n, min: b.min, max: b.max, existant: null, porteur: null, limite: false, qualification: null, heberge: null, extension: null };
    g.murs.push(r);
  }
  Object.keys(champs).forEach(function (k) { r[k] = champs[k]; });
  await ecrireMurs(g.murs, g.cles);
  return r;
}

// ——————————————————————————————————————————————— Cloisons (n° 11)

function lireTypes(brut) {
  var e = tx().erreursTypes;
  var d;
  try {
    d = JSON.parse(texte(brut).replace(/^﻿/, ""));
  } catch (err) {
    return { erreur: e.json };
  }
  if (!d || d.format !== FORMAT_TYPES) return { erreur: e.format };
  if (!Array.isArray(d.types) || !d.types.length || d.types.length > MAX_TYPES) return { erreur: e.types };
  var types = [];
  for (var i = 0; i < d.types.length; i++) {
    var t = d.types[i];
    if (!t || typeof t.id !== "string" || !t.id.trim() || typeof t.nom !== "string" || !t.nom.trim() || typeof t.epaisseur !== "number" || !(t.epaisseur > 0) || t.epaisseur > 2) return { erreur: e.type(i) };
    types.push({ id: t.id.trim().slice(0, 30), nom: t.nom.trim().slice(0, 40), epaisseur: t.epaisseur, ossature: texte(t.ossature).trim().slice(0, 40), plaques: texte(t.plaques).trim().slice(0, 60) });
  }
  return { types: types };
}
async function typesGardes() {
  var t = await planche.donnees.lire("projet", "types-parois");
  return Array.isArray(t) ? t : [];
}
async function chargerTypes() {
  var x = tx();
  // Protocole 1.2 : le fichier chargé est archivé tel quel en base ; sans archive, il n'est pas chargé.
  var f = await planche.fichiers.ouvrir([".json"], { archiver: true });
  if (!f) return;
  if (!f.archive) return alerte(x.archiveRefusee + (f.archiveRefus || "") + ")");
  var r = lireTypes(f.texte);
  if (r.erreur) return alerte(x.typesRefuses + r.erreur);
  await enUnPas(x.opTypes, async function () {
    await planche.donnees.ecrire("projet", "types-parois", r.types);
    await planche.donnees.ecrire("projet", "types-parois-archive", { id: f.archive.id, empreinte: f.archive.empreinte, nom: String(f.nom || "").slice(0, 80) });
  });
  if (!r.types.some(function (t) { return t.id === valeurs.type; })) valeurs.type = r.types[0].id;
  return info(x.typesCharges(r.types.length));
}
async function enregistrerModeleTypes() {
  var x = tx();
  var modele = { format: FORMAT_TYPES, types: [{ id: "", nom: "", epaisseur: null, ossature: "", plaques: "" }] };
  if (await planche.fichiers.enregistrer(x.fichierModele, JSON.stringify(modele, null, 2) + "\n")) await info(x.modeleEnregistre);
}

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

/** Prisme d'un rectangle horizontal (coin, côté a, côté b) poussé de h vers le haut, tracé à l'écart puis groupé et remis en place. */
async function prismeAEcart(coin, a, b, h, nom, ecart) {
  var m0 = await planche.modele.lire();
  var avant = {};
  m0.faces.forEach(function (f) { avant[f.id] = true; });
  var base = await planche.modele.rectangle(plus(coin, [ecart, 0, 0]), a, b);
  var m1 = await planche.modele.lire();
  var f = m1.faces.filter(function (x) { return x.id === base; })[0];
  await planche.modele.pousser(base, normaleDe(f.points)[2] < 0 ? -h : h);
  var m2 = await planche.modele.lire();
  var g = await planche.modele.grouper(m2.faces.filter(function (x) { return !avant[x.id]; }).map(function (x) { return x.id; }), nom);
  await planche.modele.deplacer([g], [-ecart, 0, 0]);
  return g;
}

async function poserCloisons() {
  var x = tx();
  var types = await typesGardes();
  var type = types.filter(function (t) { return t.id === valeurs.type; })[0] || types[0];
  if (!type) return alerte(x.pasDeType);
  var h = lireNombre(valeurs.hauteur);
  if (!(h > 0)) return alerte(x.hauteurInvalide);
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  var aretes = m.aretes.filter(function (e) { return sel.indexOf(e.id) >= 0; });
  var droites = aretes.filter(function (e) { return e.points.length === 2 && Math.abs(e.points[0][2] - e.points[1][2]) < EPS && e.longueur > EPS; });
  if (!aretes.length || droites.length !== aretes.length) return alerte(x.choisirAretes);
  var sep = (await planche.unites.lire()).separateur;
  var ecart = (await xMax(m)) + 2 + Math.max.apply(null, droites.map(function (e) { return e.longueur; })) + 10;
  var ep = type.epaisseur;
  var decal = valeurs.position === "gauche" ? 0 : valeurs.position === "droite" ? -ep : -ep / 2;
  var groupes = await enUnPas(x.opCloisons, async function () {
    var l = [];
    for (var i = 0; i < droites.length; i++) {
      var a = droites[i].points[0];
      var b = droites[i].points[1];
      var u = unitaire(sous(b, a));
      var v = [-u[1], u[0], 0];
      var L = droites[i].longueur;
      var g = await prismeAEcart(plus(a, fois(v, decal)), fois(u, L), fois(v, ep), h, x.nomCloison(type.nom, fixe(L, 2, sep)), ecart - Math.min(a[0], b[0]));
      await planche.donnees.ecrire(g, "paroi", { type: type.id, nom: type.nom, epaisseur: ep, hauteur: h, longueur: L });
      l.push(g);
    }
    return l;
  });
  await planche.selection.definir(groupes).catch(function () {});
  return info(x.cloisonsPosees(groupes.length));
}

async function etatCloisons(sep) {
  var x = tx();
  var types = await typesGardes();
  if (types.length && !types.some(function (t) { return t.id === valeurs.type; })) valeurs.type = types[0].id;
  var c = x.champs;
  var formulaire = [
    { id: "type", libelle: c.type, valeur: valeurs.type, choix: types.length ? types.map(function (t) { return { valeur: t.id, libelle: x.typeLigne(t, sep) }; }) : [{ valeur: "", libelle: x.aucunType }] },
    { id: "hauteur", libelle: c.hauteur, valeur: valeurs.hauteur },
    { id: "position", libelle: c.position, valeur: valeurs.position, choix: ["axe", "gauche", "droite"].map(function (p) { return { valeur: p, libelle: x.positions[p] }; }) },
  ];
  var m = await planche.modele.lire();
  var lignes = [];
  var parType = {};
  var total = 0;
  for (var i = 0; i < m.objets.length; i++) {
    var d = await planche.donnees.lire(m.objets[i].id, "paroi");
    if (!d || !(d.longueur > 0)) continue;
    var cle = d.nom;
    (parType[cle] = parType[cle] || []).push({ id: m.objets[i].id, d: d });
  }
  var n = 0;
  Object.keys(parType).sort().forEach(function (k) {
    var l = parType[k];
    var s = l.reduce(function (a, y) { return a + y.d.longueur * y.d.hauteur; }, 0);
    var lg = l.reduce(function (a, y) { return a + y.d.longueur; }, 0);
    lignes.push({ genre: "groupe", cellules: [k + " · " + l.length, fixe(lg, 2, sep) + x.m, "", fixe(s, 2, sep) + " m²"] });
    l.forEach(function (y) { n++; lignes.push({ genre: "ligne", id: y.id, cellules: [fixe(y.d.longueur, 2, sep) + x.m, fixe(y.d.longueur, 2, sep) + x.m, fixe(y.d.hauteur, 2, sep) + x.m, fixe(y.d.longueur * y.d.hauteur, 2, sep) + " m²"] }); });
    total += s;
  });
  lignes.forEach(function (l) { if (l.genre === "ligne") l.cellules[0] = m.objets.filter(function (o) { return o.id === l.id; })[0].nom; });
  return { formulaire: formulaire, colonnes: x.colMetre, lignes: lignes, vide: lignes.length ? null : x.videMetre, pied: lignes.length ? [x.total(n), "", "", fixe(total, 2, sep) + " m²"] : null };
}

// ——————————————————————————————————————————————— Baies (n° 13) et mur porteur percé (n° 35)

function lireBaie() {
  var l = lireListe(valeurs.baie);
  if (l.length !== 3 || !(l[0] > 0) || !(l[1] > 0) || !(l[2] >= 0)) return null;
  return { l: l[0], h: l[1], allege: l[2] };
}

/** Prépare la baie sur la face choisie : axes, rectangle, face opposée, mur ; { … } ou { erreur }. */
async function preparerBaie(m) {
  var x = tx();
  var c = await faceChoisie(m);
  if (c.erreur) return c;
  var n = c.n;
  if (Math.abs(n[2]) > 1e-6) return { erreur: x.pasVerticale };
  var hAxe = unitaire([-n[1], n[0], 0]);
  var p0 = c.face.points[0];
  var deux = function (q) { var d = sous(q, p0); return [scal(d, hAxe), q[2]]; };
  var poly = c.face.points.map(deux);
  var smin = Math.min.apply(null, poly.map(function (q) { return q[0]; }));
  var smax = Math.max.apply(null, poly.map(function (q) { return q[0]; }));
  var zmin = Math.min.apply(null, poly.map(function (q) { return q[1]; }));
  // Face opposée : normale contraire, plan derrière (à moins de 2 m), la plus proche.
  var opposee = null;
  m.faces.forEach(function (f) {
    if (f.id === c.face.id) return;
    var nf = normaleDe(f.points);
    if (scal(nf, n) > -1 + 1e-6) return;
    var e = scal(sous(p0, f.points[0]), n);
    if (!(e > EPS) || e > 2) return;
    // Seule une face qui se trouve derrière celle choisie (recouvrement en plan du mur) peut être son dos.
    var q = f.points.map(deux);
    var fs = q.map(function (y) { return y[0]; });
    var fz = q.map(function (y) { return y[1]; });
    var zmax = Math.max.apply(null, poly.map(function (y) { return y[1]; }));
    if (Math.min(smax, Math.max.apply(null, fs)) - Math.max(smin, Math.min.apply(null, fs)) <= EPS) return;
    if (Math.min(zmax, Math.max.apply(null, fz)) - Math.max(zmin, Math.min.apply(null, fz)) <= EPS) return;
    if (!opposee || e < opposee.e) opposee = { face: f, e: e };
  });
  var g = await mursGardes();
  var mur = murDe(g.murs, c.face, n) || (opposee ? murDe(g.murs, opposee.face, normaleDe(opposee.face.points)) : null);
  return { face: c.face, n: n, hAxe: hAxe, p0: p0, poly: poly, smin: smin, smax: smax, zmin: zmin, opposee: opposee, mur: mur };
}

async function percerBaie() {
  var x = tx();
  var b = lireBaie();
  if (!b) return alerte(x.baieInvalide);
  var m = await planche.modele.lire();
  var P = await preparerBaie(m);
  if (P.erreur) return alerte(P.erreur);
  if (P.mur && P.mur.limite) return alerte(x.encartLimite);
  if (!P.opposee) return alerte(x.pasDOpposee);
  var dec = lireNombre(valeurs.decalage);
  var s0 = texte(valeurs.decalage).trim() === "" ? (P.smin + P.smax - b.l) / 2 : P.smin + dec;
  if (!(s0 >= P.smin - EPS)) return alerte(x.horsFace);
  var z0 = (valeurs.depuis === "zero" ? 0 : P.zmin) + b.allege;
  var coins2 = [[s0, z0], [s0 + b.l, z0], [s0 + b.l, z0 + b.h], [s0, z0 + b.h]];
  // Les coins (un rien en retrait) doivent être dans la face et dans la face opposée.
  var oppPoly = P.opposee.face.points.map(function (q) { var d = sous(q, P.p0); return [scal(d, P.hAxe), q[2]]; });
  var centre = [s0 + b.l / 2, z0 + b.h / 2];
  var retrait = function (q) { return [q[0] + (centre[0] - q[0]) * 1e-6, q[1] + (centre[1] - q[1]) * 1e-6]; };
  if (!coins2.every(function (q) { return dedans(retrait(q), P.poly) && dedans(retrait(q), oppPoly); })) return alerte(x.horsFace);
  var monde = function (q, e) { return plus(plus(P.p0, fois(P.hAxe, q[0])), [-P.n[0] * e, -P.n[1] * e, q[1] - P.p0[2]]); };
  var A = coins2.map(function (q) { return monde(q, 0); });
  var B = coins2.map(function (q) { return monde(q, P.opposee.e); });
  var avant = {};
  m.faces.forEach(function (f) { avant[f.id] = true; });
  await planche.operation.ouvrir(x.opBaie);
  try {
    for (var i = 0; i < 4; i++) await planche.modele.ligne(A[i], A[(i + 1) % 4]);
    for (var j = 0; j < 4; j++) await planche.modele.ligne(B[j], B[(j + 1) % 4]);
    for (var k = 0; k < 4; k++) await planche.modele.ligne(A[k], B[k]);
    var m2 = await planche.modele.lire();
    var nouvelles = m2.faces.filter(function (f) { return !avant[f.id]; });
    var bouchons = nouvelles.filter(function (f) { return Math.abs(Math.abs(scal(normaleDe(f.points), P.n)) - 1) < 1e-6; });
    if (bouchons.length !== 2 || nouvelles.length !== 6) throw new Error(x.nonPercee);
    await planche.modele.effacer(bouchons.map(function (f) { return f.id; }));
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  var sep = (await planche.unites.lire()).separateur;
  derniereBaie = { l: b.l, h: b.h, allege: b.allege, mur: P.mur ? P.mur.nom : null, porteurExistant: !!(P.mur && P.mur.existant && P.mur.porteur) };
  return info(x.percee(fixe(b.l, 2, sep), fixe(b.h, 2, sep)));
}

async function interventionsGardees() {
  var l = await planche.donnees.lire("projet", "interventions");
  return Array.isArray(l) ? l : [];
}
async function consignerIntervention() {
  var x = tx();
  if (!derniereBaie) return alerte(x.rienAConsigner);
  var l = await interventionsGardees();
  if (l.length >= MAX_INTERVENTIONS) return alerte(x.tropDInterventions);
  var e = { date: aujourdhui(), l: derniereBaie.l, h: derniereBaie.h, allege: derniereBaie.allege, mur: derniereBaie.mur, porteurExistant: derniereBaie.porteurExistant };
  await enUnPas(x.opConsigner, function () { return planche.donnees.ecrire("projet", "interventions", l.concat([e])); });
  derniereBaie = null;
  return info(x.consignee);
}

async function etatBaies(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "baie", libelle: c.baie, valeur: valeurs.baie },
    { id: "depuis", libelle: c.depuis, valeur: valeurs.depuis, choix: ["bas", "zero"].map(function (k) { return { valeur: k, libelle: x.depuis[k] }; }) },
    { id: "decalage", libelle: c.decalage, valeur: valeurs.decalage },
  ];
  var P = await preparerBaie(await planche.modele.lire());
  if (P.erreur) return { formulaire: formulaire, resultats: [{ libelle: x.mur, valeur: P.erreur, ton: "alerte" }] };
  var resultats = [
    { libelle: x.epaisseur, valeur: P.opposee ? fixe(P.opposee.e, 2, sep) + x.m : x.pasDOpposee, ton: P.opposee ? "" : "alerte" },
    { libelle: x.mur, valeur: P.mur ? x.murTexte(P.mur) : x.murNonQualifie, ton: P.mur && (P.mur.porteur || P.mur.limite) ? "limite" : "" },
  ];
  var b = lireBaie();
  var encart = null;
  if (P.mur && P.mur.limite) encart = x.encartLimite;
  else if (P.mur && P.mur.existant && P.mur.porteur) encart = x.encartPorteur(b ? fixe(b.l, 2, sep) : "…");
  return { formulaire: formulaire, resultats: resultats, encart: encart };
}

async function marquerMur() {
  var x = tx();
  var m = await planche.modele.lire();
  var c = await faceChoisie(m);
  if (c.erreur) return alerte(c.erreur);
  if (Math.abs(c.n[2]) > 1e-6) return alerte(x.pasVerticale);
  var champs = { existant: valeurs.etat === "existant", porteur: valeurs.porteur === "oui" };
  if (texte(valeurs.nom).trim()) champs.nom = texte(valeurs.nom).trim().slice(0, 40);
  var r = await enUnPas(x.opMarquer, function () { return qualifierFace(c.face, c.n, champs); });
  return info(x.marque(r.nom));
}

async function exporterReleve() {
  var x = tx();
  var l = await interventionsGardees();
  if (!l.length) return alerte(x.videInterventions);
  var sep = (await planche.unites.lire()).separateur;
  var r = x.releve;
  var md = ["# " + r.titre, "", "| " + r.date + " | " + r.baie + " | " + r.mur + " | " + r.points + " |", "|---|---|---|---|"];
  l.forEach(function (e) { md.push("| " + e.date + " | " + baieTexte(e, sep) + " | " + (e.mur || x.murNonQualifie) + " | " + x.points + " |"); });
  md.push("", r.rien, "");
  if (await planche.fichiers.enregistrer(x.fichierReleve(aujourdhui()), md.join("\n"))) await info(x.exporte);
}
var baieTexte = function (e, sep) { return fixe(e.l, 2, sep) + " × " + fixe(e.h, 2, sep) + " m, allège " + fixe(e.allege, 2, sep) + " m"; };

async function etatPorteur(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "etat", libelle: c.etat, valeur: valeurs.etat, choix: ["existant", "projet"].map(function (k) { return { valeur: k, libelle: x.etats[k] }; }) },
    { id: "porteur", libelle: c.porteur, valeur: valeurs.porteur, choix: ["oui", "non"].map(function (k) { return { valeur: k, libelle: x.ouiNon[k] }; }) },
    { id: "nom", libelle: c.nom, valeur: valeurs.nom },
  ];
  var m = await planche.modele.lire();
  var f = await faceChoisie(m);
  var resultats = [];
  if (!f.erreur) {
    var g = await mursGardes();
    var r = murDe(g.murs, f.face, f.n);
    resultats.push({ libelle: x.mur, valeur: r ? r.nom + " — " + x.murTexte(r) : x.murNonQualifie });
  }
  var l = await interventionsGardees();
  var lignes = l.map(function (e) { return { genre: "ligne", cellules: [e.date, baieTexte(e, sep), (e.mur || x.murNonQualifie) + (e.porteurExistant ? " (" + x.murTexte({ existant: true, porteur: true }) + ")" : ""), x.points] }; });
  return { formulaire: formulaire, resultats: resultats, colonnes: x.colInterventions, lignes: lignes, vide: lignes.length ? null : x.videInterventions };
}

// ——————————————————————————————————————————————— Poteaux et poutres (n° 38)

function lireTrame() {
  var x = tx();
  var ex = lireListe(valeurs.entraxesX);
  var ey = lireListe(valeurs.entraxesY);
  var po = lireSection(valeurs.poteau);
  var pu = lireSection(valeurs.poutre);
  var he = lireNombre(valeurs.hauteurEtage);
  var n = lireNombre(valeurs.etages);
  var ok = function (l) { return l.length && l.every(function (v) { return v > 0; }); };
  if (!ok(ex) || !ok(ey) || !po || !pu || !(he > 0) || !(n >= 1) || n !== Math.floor(n)) return { erreur: x.trameInvalide };
  if (ex.length + 1 > MAX_AXES || ey.length + 1 > MAX_AXES || n > MAX_ETAGES) return { erreur: x.tropDAxes };
  if (pu[1] >= he) return { erreur: x.pouterTropHaute };
  var xs = [0];
  ex.forEach(function (v) { xs.push(xs[xs.length - 1] + v); });
  var ys = [0];
  ey.forEach(function (v) { ys.push(ys[ys.length - 1] + v); });
  return { xs: xs, ys: ys, poteau: po, poutre: pu, he: he, n: n };
}
function metreTrame(t) {
  var nx = t.xs.length;
  var ny = t.ys.length;
  var poutresX = (nx - 1) * ny;
  var poutresY = nx * (ny - 1);
  return {
    poteaux: nx * ny * t.n, longueurPoteaux: nx * ny * t.n * (t.he - t.poutre[1]),
    poutres: (poutresX + poutresY) * t.n, longueurPoutres: t.n * (ny * t.xs[nx - 1] + nx * t.ys[ny - 1]),
  };
}

async function poserTrame() {
  var x = tx();
  var t = lireTrame();
  if (t.erreur) return alerte(t.erreur);
  var m = await planche.modele.lire();
  var o = [(await xMax(m)) + 2 + t.poteau[0] / 2, t.poteau[1] / 2, 0];
  var ecart = t.xs[t.xs.length - 1] + 20;
  var nx = t.xs.length;
  var ny = t.ys.length;
  var mt = metreTrame(t);
  var nom = x.trameTexte(LETTRES.charAt(nx - 1), ny, t.n);
  // Chaque élément est une boîte tracée à l'écart, groupée, puis remise en place : rien ne se soude.
  var element = async function (coin, lx, ly, lz, nomEl) {
    var ids = await planche.modele.boite([coin[0] + ecart, coin[1], coin[2]], lx, ly, lz);
    var g = await planche.modele.grouper(ids, nomEl);
    await planche.modele.deplacer([g], [-ecart, 0, 0]);
    return g;
  };
  var g = await enUnPas(x.opTrame, async function () {
    var niveaux = [];
    for (var k = 0; k < t.n; k++) {
      var z0 = k * t.he;
      var zp = z0 + t.he - t.poutre[1];
      var els = [];
      for (var i = 0; i < nx; i++) {
        for (var j = 0; j < ny; j++) {
          els.push(await element([o[0] + t.xs[i] - t.poteau[0] / 2, o[1] + t.ys[j] - t.poteau[1] / 2, z0], t.poteau[0], t.poteau[1], zp - z0, x.nomPoteau(LETTRES.charAt(i) + (j + 1), k + 1)));
        }
      }
      for (var j2 = 0; j2 < ny; j2++) {
        for (var i2 = 0; i2 + 1 < nx; i2++) els.push(await element([o[0] + t.xs[i2], o[1] + t.ys[j2] - t.poutre[0] / 2, zp], t.xs[i2 + 1] - t.xs[i2], t.poutre[0], t.poutre[1], x.nomPoutre(LETTRES.charAt(i2) + (j2 + 1), LETTRES.charAt(i2 + 1) + (j2 + 1), k + 1)));
      }
      for (var i3 = 0; i3 < nx; i3++) {
        for (var j3 = 0; j3 + 1 < ny; j3++) els.push(await element([o[0] + t.xs[i3] - t.poutre[0] / 2, o[1] + t.ys[j3], zp], t.poutre[0], t.ys[j3 + 1] - t.ys[j3], t.poutre[1], x.nomPoutre(LETTRES.charAt(i3) + (j3 + 1), LETTRES.charAt(i3) + (j3 + 2), k + 1)));
      }
      niveaux.push(await planche.modele.grouper(els, x.nomNiveau(k + 1)));
    }
    var tout = await planche.modele.grouper(niveaux, x.nomTrame(nom));
    await planche.donnees.ecrire(tout, "trame", { xs: t.xs, ys: t.ys, poteau: t.poteau, poutre: t.poutre, he: t.he, n: t.n, origine: o });
    return tout;
  });
  await planche.selection.definir([g]).catch(function () {});
  return info(x.tramePosee(mt.poteaux, mt.poutres));
}

function etatStructure(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = ["entraxesX", "entraxesY", "poteau", "poutre", "hauteurEtage", "etages"].map(function (k) { return { id: k, libelle: c[k], valeur: valeurs[k] }; });
  var t = lireTrame();
  if (t.erreur) return { formulaire: formulaire, colonnes: x.colStructure, lignes: [] };
  var mt = metreTrame(t);
  var sec = function (s) { return fixe(s[0], 2, sep) + " × " + fixe(s[1], 2, sep); };
  return {
    formulaire: formulaire,
    resultats: [{ libelle: x.trame, valeur: x.trameTexte(LETTRES.charAt(t.xs.length - 1), t.ys.length, t.n) }],
    colonnes: x.colStructure,
    lignes: [
      { genre: "ligne", cellules: [x.poteaux, String(mt.poteaux), sec(t.poteau), fixe(mt.longueurPoteaux, 2, sep) + x.m] },
      { genre: "ligne", cellules: [x.poutres, String(mt.poutres), sec(t.poutre), fixe(mt.longueurPoutres, 2, sep) + x.m] },
    ],
  };
}

// ——————————————————————————————————————————————— Fronts mitoyens (n° 28)

async function contourIlot(m) {
  var x = tx();
  var sel = await planche.selection.lire();
  var faces = m.faces.filter(function (f) { return sel.indexOf(f.id) >= 0; });
  if (sel.length !== 1 || faces.length !== 1) return { erreur: x.choisirContour };
  var f = faces[0];
  if (f.points.some(function (q) { return Math.abs(q[2] - f.points[0][2]) > EPS; })) return { erreur: x.contourHorizontal };
  if (limitesCotes.face !== f.id) limitesCotes = { face: f.id, cotes: {} };
  return { face: f };
}

async function genererFronts() {
  var x = tx();
  var H = lireNombre(valeurs.hauteurFacades);
  if (!(H > 0)) return alerte(x.hauteurFacadesInvalide);
  var m = await planche.modele.lire();
  var c = await contourIlot(m);
  if (c.erreur) return alerte(c.erreur);
  var P = c.face.points;
  var avant = {};
  m.faces.forEach(function (f) { avant[f.id] = true; });
  var haut = function (q) { return [q[0], q[1], q[2] + H]; };
  var nLim = 0;
  var g = await enUnPas(x.opFronts, async function () {
    for (var i = 0; i < P.length; i++) await planche.modele.ligne(P[i], haut(P[i]));
    for (var j = 0; j < P.length; j++) await planche.modele.ligne(haut(P[j]), haut(P[(j + 1) % P.length]));
    var m2 = await planche.modele.lire();
    // Le haut des façades ferme une face horizontale : elle n'est pas une façade.
    var dessus = m2.faces.filter(function (f) { return !avant[f.id] && Math.abs(normaleDe(f.points)[2]) >= 1e-6; });
    if (dessus.length) await planche.modele.effacer(dessus.map(function (f) { return f.id; }));
    var nouvelles = m2.faces.filter(function (f) { return !avant[f.id] && Math.abs(normaleDe(f.points)[2]) < 1e-6; });
    if (nouvelles.length !== P.length) throw new Error(x.nonFormees);
    var groupes = [];
    for (var k = 0; k < P.length; k++) {
      var a = P[k];
      var b = P[(k + 1) % P.length];
      var milieu = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // La façade d'un côté : la face verticale nouvelle qui passe par son milieu.
      var f = nouvelles.filter(function (y) {
        var n = normaleDe(y.points);
        return Math.abs(n[0] * (milieu[0] - y.points[0][0]) + n[1] * (milieu[1] - y.points[0][1])) < 1e-6 && Math.abs(n[0] * (b[0] - a[0]) + n[1] * (b[1] - a[1])) < 1e-6;
      })[0];
      if (!f) throw new Error(x.nonFormees);
      var lim = !!limitesCotes.cotes[k];
      if (lim) {
        nLim++;
        await qualifierFace(f, normaleDe(f.points), { limite: true, nom: x.nomFacade(k + 1, false) });
      }
      var gf = await planche.modele.grouper([f.id], x.nomFacade(k + 1, lim));
      await planche.donnees.ecrire(gf, "facade", { cote: k + 1, limite: lim, hauteur: H });
      groupes.push(gf);
    }
    return planche.modele.grouper(groupes, x.nomFronts);
  });
  await planche.selection.definir([g]).catch(function () {});
  return info(x.frontsGeneres(P.length, nLim));
}

async function etatFronts(sep) {
  var x = tx();
  var formulaire = [{ id: "hauteurFacades", libelle: x.champs.hauteurFacades, valeur: valeurs.hauteurFacades }];
  var c = await contourIlot(await planche.modele.lire());
  if (c.erreur) return { formulaire: formulaire, resultats: [{ libelle: x.contourIlot, valeur: c.erreur, ton: "alerte" }], colonnes: x.colFronts, lignes: [] };
  var P = c.face.points;
  var lignes = P.map(function (a, i) {
    var b = P[(i + 1) % P.length];
    var lim = !!limitesCotes.cotes[i];
    return { genre: "ligne", id: "c" + i, choisi: lim, ton: lim ? "alerte" : "", cellules: [x.cote(i + 1), fixe(norme(sous(b, a)), 2, sep) + x.m, lim ? x.ouiNon.oui : x.ouiNon.non] };
  });
  return { formulaire: formulaire, colonnes: x.colFronts, lignes: lignes };
}

// ——————————————————————————————————————————————— Mur en limite (n° 39)

async function qualifierLimite() {
  var x = tx();
  var m = await planche.modele.lire();
  var c = await faceChoisie(m);
  if (c.erreur) return alerte(c.erreur);
  if (Math.abs(c.n[2]) > 1e-6) return alerte(x.pasVerticale);
  var hb = lireNombre(valeurs.heberge);
  if (!(hb >= 0)) return alerte(x.hebergeInvalide);
  var ext = lireNombre(valeurs.extension);
  var q = ["mitoyen", "projet", "voisin"].indexOf(valeurs.qualification) >= 0 ? valeurs.qualification : "mitoyen";
  var r = await enUnPas(x.opQualifier, function () { return qualifierFace(c.face, c.n, { qualification: q, heberge: hb, extension: ext >= 0 ? ext : null }); });
  return info(x.qualifie(r.nom));
}

async function etatLimite(sep) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "qualification", libelle: c.qualification, valeur: valeurs.qualification, choix: ["mitoyen", "projet", "voisin"].map(function (k) { return { valeur: k, libelle: x.qualifications[k] }; }) },
    { id: "heberge", libelle: c.heberge, valeur: valeurs.heberge },
    { id: "extension", libelle: c.extension, valeur: valeurs.extension },
  ];
  var m = await planche.modele.lire();
  var f = await faceChoisie(m);
  if (f.erreur) return { formulaire: formulaire, resultats: [{ libelle: x.mur, valeur: f.erreur, ton: "alerte" }] };
  var g = await mursGardes();
  var r = murDe(g.murs, f.face, f.n);
  var resultats = [{ libelle: x.mur, valeur: r ? r.nom + " — " + x.murTexte(r) : x.murNonQualifie }];
  if (!r || !r.qualification) return { formulaire: formulaire, resultats: resultats };
  resultats.push({ libelle: x.heberge, valeur: typeof r.heberge === "number" ? fixe(r.heberge, 2, sep) + x.m : x.nonEvaluee });
  var ext = { libelle: x.extension, valeur: x.nonEvaluee };
  if (typeof r.extension === "number" && typeof r.heberge === "number") {
    var d = r.extension - r.heberge;
    ext = d > EPS ? { libelle: x.extension, valeur: x.surHeberge(fixe(d, 2, sep)), ton: "alerte" } : { libelle: x.extension, valeur: x.sousHeberge(fixe(-d, 2, sep)), ton: "ok" };
  }
  resultats.push(ext);
  return { formulaire: formulaire, resultats: resultats, encart: x.encartQualif[r.qualification] };
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var e;
  if (onglet === "cloisons") e = await etatCloisons(sep);
  else if (onglet === "porteur") e = await etatPorteur(sep);
  else if (onglet === "structure") e = etatStructure(sep);
  else if (onglet === "fronts") e = await etatFronts(sep);
  else if (onglet === "limite") e = await etatLimite(sep);
  else e = await etatBaies(sep);
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
    pied: e.pied || null,
    vide: e.vide || null,
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
// Choisir une ligne : dans Fronts mitoyens, bascule le côté en limite séparative.
action("choisir", function (d) {
  if (onglet === "fronts" && typeof d.id === "string" && /^c\d+$/.test(d.id)) {
    var i = Number(d.id.slice(1));
    limitesCotes.cotes[i] = !limitesCotes.cotes[i];
  }
});
action("poser-cloisons", poserCloisons);
action("charger-types", chargerTypes);
action("modele-types", enregistrerModeleTypes);
action("percer-baie", percerBaie);
action("consigner-intervention", consignerIntervention);
action("marquer-mur", marquerMur);
action("exporter-releve", exporterReleve);
action("poser-trame", poserTrame);
action("generer-fronts", genererFronts);
action("qualifier-mur", qualifierLimite);

var commande = function (nom, ong) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) page = 0;
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    await rafraichir();
  });
};
commande("ouvrir-panneau", "baies");
commande("cloisons", "cloisons");
commande("baies", "baies");
commande("mur-porteur", "porteur");
commande("poteaux-poutres", "structure");
commande("fronts-mitoyens", "fronts");
commande("mur-limite", "limite");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
