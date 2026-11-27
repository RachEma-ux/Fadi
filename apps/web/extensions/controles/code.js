// Extension « Contrôles réglementaires et accessibilité » (catalogue des extensions de la Planche, cas 1 de la feuille
// de route, extension n° 6 ; maquette validée le 27 novembre 2026). Sept onglets, un par entrée du catalogue :
//   Passages utiles (n° 19, D9-F15e-020) · Dégagements (n° 20, D9-F15e-025) · Rampe (n° 16, D4-F5-015) ·
//   Vues droites (n° 5, D9-F15e-038) · Distance entre constructions (n° 10, D6-R-008) ·
//   Places fauteuil (n° 40, S-D12-1) · Registre (n° 32, D9-F15e-037).
//
// Aucun seuil n'est écrit ici. Chaque seuil vient d'une table de règles chargée par l'utilisateur, sourcée et datée,
// organisée en jeux (par exemple un jeu par type de bâtiment) ; une règle non relue est « à vérifier ». Sans seuil, le
// contrôle est « non évalué ». Le registre garde règle, version de table, objet, valeur, seuil et verdict.

var VERSION = "1.0.0";
var PANNEAU = "controles";
var ONGLETS = ["passages", "degagements", "rampe", "vues", "distance", "places", "registre"];
var FORMAT_REGLES = "fadi-regles-controles/1";
var REGLES = ["passage", "degagement", "rampe", "vuesDroites", "prospect", "distanceConstructions", "placesFauteuil"];
var MAX_JEUX = 10;
var MAX_REGISTRE = 200;
/** Taille sérialisée d'un morceau du registre, sous la borne d'une valeur de données (4 000 caractères). */
var TAILLE_MORCEAU = 3800;
var MAX_MESURES = 30;
var MAX_TRONCONS = 30;
var LIGNES_PAR_PAGE = 80;
var EPS = 1e-9;

var onglet = "passages";
var page = 0;
var langue = "fr";
var valeurs = { jeu: "", denivele: "", pente: "", largeur: "", devers: "", effectif: "" };

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    onglets: { passages: "Passages utiles", degagements: "Dégagements", rampe: "Rampe", vues: "Vues droites", distance: "Distance entre constructions", places: "Places fauteuil", registre: "Registre" },
    champs: { jeu: "Jeu de règles", denivele: "Dénivelé à franchir (m)", pente: "Pente (%)", largeur: "Largeur (m)", devers: "Dévers (%)", effectif: "Effectif de la salle (places)" },
    aucunJeu: "aucune table chargée",
    jeuLibelle: function (j) { return j.libelle + " (v" + j.version + ", " + j.date + ")"; },
    col: {
      passages: ["Porte", "Passage", "Seuil", "Verdict"],
      degagements: ["Cheminement", "Longueur", "Seuil", "Verdict"],
      rampe: ["Élément", "Longueur", "Pente", "Verdict"],
      vues: ["Mesure", "Distance", "Seuil", "Verdict"],
      distance: ["Mesure", "Distance", "Seuil", "Verdict"],
      places: ["Emplacement", "Déclaré le"],
      registre: ["Date", "Règle", "Objet", "Verdict"],
    },
    conforme: "conforme", nonEvalue: "non évalué", attributAbsent: "non évalué (attribut absent)", sansSeuil: "non évalué (pas de seuil)",
    aVerifier: "à vérifier",
    ecartCm: function (v) { return "−" + v + " cm"; },
    excesCm: function (v) { return "+" + v + " cm"; },
    excesM: function (v) { return "+" + v + " m"; },
    excesPct: function (v) { return "+" + v + " %"; },
    encart: "Chaque seuil vient d'une table sourcée et datée, modifiable ; un écart mène à l'objet en un clic. Aucune valeur n'est inventée.",
    sansTable: "Aucune table de règles : chaque contrôle est non évalué. Chargez une table sourcée et datée (onglet Registre), ou enregistrez un modèle à remplir.",
    note: {
      passages: "Déclarez chaque porte (sélection d'un groupe ou d'un composant) avec son passage utile mesuré ; un passage vide reste « non évalué ».",
      degagements: "Tracez le cheminement d'évacuation avec l'outil Ligne, sélectionnez ses arêtes, puis mesurez : la longueur est la somme des arêtes.",
      rampe: "La rampe est découpée en tronçons et paliers selon la table choisie, posée à droite du dessin dans un groupe.",
      vues: "Sélectionnez deux faces : la baie et ce qui lui fait face. Distance mesurée en plan ; prospect jugé sur la plus haute des deux faces.",
      distance: "Sélectionnez deux faces, une de chaque construction : la distance est la plus courte en plan.",
      places: "Déclarez chaque emplacement posé (sélection d'un groupe ou d'un composant) ; le nombre exigé vient de la table selon l'effectif.",
      registre: "Le registre garde règle, version de table, objet, valeur, seuil et verdict pour la notice ; il s'exporte en .md et en .csv.",
    },
    seuil: "Seuil", source: "Source",
    declarerPorte: "Déclarer une porte",
    champPassage: "Passage utile mesuré (m, vide = non mesuré)",
    champNom: "Nom",
    choisirObjets: "Sélectionnez un ou plusieurs groupes ou composants.",
    porteDeclaree: function (n) { return n + (n > 1 ? " portes déclarées." : " porte déclarée."); },
    passageInvalide: "Le passage utile doit être un nombre positif, en mètres, ou vide.",
    videPassages: "Aucune porte déclarée : sélectionnez un groupe ou un composant, puis « Déclarer la sélection ».",
    choisirAretes: "Sélectionnez les arêtes du cheminement.",
    cheminementMesure: function (n, l) { return "Cheminement « " + n + " » : " + l + " m."; },
    cheminement: function (i) { return "Cheminement " + i; },
    videDegagements: "Aucun cheminement mesuré : sélectionnez ses arêtes, puis « Mesurer le cheminement ».",
    tropDeMesures: "Trente mesures au plus par onglet.",
    rampeInvalide: "Saisissez le dénivelé, la pente et la largeur (nombres positifs) ; le dévers est facultatif.",
    tropDeTroncons: "Plus de trente tronçons : réduisez le dénivelé ou augmentez la pente admise.",
    entreeTropLongue: "Une entrée du registre est trop longue : raccourcissez le nom de l'élément ou de la table.",
    troncon: function (i) { return "Tronçon " + i; },
    palier: function (i) { return "Palier " + i; },
    devers: "Dévers",
    longueurTotale: "Longueur développée",
    penteHors: "pente au-delà de la table",
    rampePosee: function (n) { return "Rampe posée : " + n + (n > 1 ? " tronçons." : " tronçon."); },
    nomRampe: function (n) { return "Rampe — " + n + (n > 1 ? " tronçons" : " tronçon"); },
    rampeSansTable: "Sans table de rampe, la longueur des tronçons et des paliers n'est pas connue : rien n'est posé.",
    choisirDeuxFaces: "Sélectionnez exactement deux faces.",
    mesure: function (i) { return "Mesure " + i; },
    videMesures: "Aucune mesure : sélectionnez deux faces, puis « Mesurer la sélection ».",
    prospect: "Prospect (hauteur admise)",
    hauteur: "Hauteur",
    mesureFaite: function (n, d) { return n + " : " + d + " m."; },
    exigees: "Emplacements exigés", posees: "Emplacements déclarés", resultat: "Résultat",
    effectifInvalide: "L'effectif doit être un nombre entier positif.",
    placeDeclaree: function (n) { return n + (n > 1 ? " emplacements déclarés." : " emplacement déclaré."); },
    videPlaces: "Aucun emplacement déclaré.",
    manque: function (n) { return n + " manquant" + (n > 1 ? "s" : ""); },
    ajoutes: function (n) { return n + (n > 1 ? " contrôles ajoutés au registre." : " contrôle ajouté au registre."); },
    rienAAjouter: "Rien à ajouter : cet onglet n'a aucun contrôle.",
    registrePlein: "Le registre est plein (200 lignes) : exportez-le, puis videz-le.",
    videRegistre: "Registre vide : « Ajouter au registre » depuis un onglet de contrôle.",
    exporte: "Registre exporté (.md et .csv).",
    registreVide: "Registre vidé.",
    md: { titre: "Registre des contrôles", date: "Date", regle: "Règle", table: "Table", objet: "Objet", valeur: "Valeur", seuil: "Seuil", verdict: "Verdict", rien: "Les seuils viennent de la table citée ; aucune valeur n'a été inventée. Un verdict « à vérifier » repose sur une règle dont le texte n'a pas été relu." },
    fichierMd: function (d) { return "registre-controles-" + d + ".md"; },
    fichierCsv: function (d) { return "registre-controles-" + d + ".csv"; },
    reglesChargees: function (n) { return "Table chargée : " + n + (n > 1 ? " jeux de règles." : " jeu de règles."); },
    reglesRefusees: "Table refusée : ",
    archiveRefusee: "Chargement refusé : le fichier n'a pas pu être archivé en base (",
    modeleEnregistre: "Modèle de table enregistré : remplissez-le, citez chaque source, puis chargez-le.",
    fichierModele: "modele-regles-controles.json",
    erreurs: {
      json: "le fichier n'est pas un JSON lisible",
      format: "le format doit être « " + FORMAT_REGLES + " »",
      jeux: "la table doit contenir de 1 à " + MAX_JEUX + " jeux de règles",
      jeu: function (i) { return "jeu " + (i + 1) + " : identifiant, libellé, version et date (AAAA-MM-JJ) sont attendus"; },
      regle: function (j, k) { return "jeu « " + j + " », règle « " + k + " » : valeur ou source manquante"; },
      inconnue: function (j, k) { return "jeu « " + j + " » : règle inconnue « " + k + " »"; },
    },
    op: { porte: "Déclarer des portes", cheminement: "Mesurer un cheminement", rampe: "Poser une rampe", mesure: "Mesurer une distance", place: "Déclarer des emplacements", registre: "Ajouter au registre", vider: "Vider le registre", regles: "Table des règles de contrôle" },
  },
  en: {
    onglets: { passages: "Clear widths", degagements: "Escape routes", rampe: "Ramp", vues: "Direct views", distance: "Distance between buildings", places: "Wheelchair spaces", registre: "Register" },
    champs: { jeu: "Rule set", denivele: "Height to climb (m)", pente: "Slope (%)", largeur: "Width (m)", devers: "Cross slope (%)", effectif: "Room capacity (seats)" },
    aucunJeu: "no table loaded",
    jeuLibelle: function (j) { return j.libelle + " (v" + j.version + ", " + j.date + ")"; },
    col: {
      passages: ["Door", "Clear width", "Threshold", "Verdict"],
      degagements: ["Route", "Length", "Threshold", "Verdict"],
      rampe: ["Element", "Length", "Slope", "Verdict"],
      vues: ["Measure", "Distance", "Threshold", "Verdict"],
      distance: ["Measure", "Distance", "Threshold", "Verdict"],
      places: ["Space", "Declared on"],
      registre: ["Date", "Rule", "Object", "Verdict"],
    },
    conforme: "compliant", nonEvalue: "not assessed", attributAbsent: "not assessed (attribute missing)", sansSeuil: "not assessed (no threshold)",
    aVerifier: "to be checked",
    ecartCm: function (v) { return "−" + v + " cm"; },
    excesCm: function (v) { return "+" + v + " cm"; },
    excesM: function (v) { return "+" + v + " m"; },
    excesPct: function (v) { return "+" + v + " %"; },
    encart: "Each threshold comes from a sourced and dated table, which can be changed; a deviation leads to the object in one click. No value is invented.",
    sansTable: "No rules table: every check is not assessed. Load a sourced and dated table (Register tab), or save a template to fill in.",
    note: {
      passages: "Declare each door (a selected group or component) with its measured clear width; an empty width stays « not assessed ».",
      degagements: "Draw the escape route with the Line tool, select its edges, then measure: the length is the sum of the edges.",
      rampe: "The ramp is split into flights and landings according to the chosen table, laid to the right of the drawing in a group.",
      vues: "Select two faces: the opening and what faces it. Distance measured in plan; height ratio checked on the taller of the two faces.",
      distance: "Select two faces, one on each building: the distance is the shortest in plan.",
      places: "Declare each laid space (a selected group or component); the required number comes from the table according to capacity.",
      registre: "The register keeps rule, table version, object, value, threshold and verdict for the report; it exports to .md and .csv.",
    },
    seuil: "Threshold", source: "Source",
    declarerPorte: "Declare a door",
    champPassage: "Measured clear width (m, empty = not measured)",
    champNom: "Name",
    choisirObjets: "Select one or more groups or components.",
    porteDeclaree: function (n) { return n + (n > 1 ? " doors declared." : " door declared."); },
    passageInvalide: "The clear width must be a positive number, in metres, or empty.",
    videPassages: "No door declared: select a group or component, then « Declare the selection ».",
    choisirAretes: "Select the edges of the route.",
    cheminementMesure: function (n, l) { return "Route « " + n + " »: " + l + " m."; },
    cheminement: function (i) { return "Route " + i; },
    videDegagements: "No route measured: select its edges, then « Measure the route ».",
    tropDeMesures: "Thirty measures at most per tab.",
    rampeInvalide: "Type the height, slope and width (positive numbers); the cross slope is optional.",
    tropDeTroncons: "More than thirty flights: reduce the height or raise the allowed slope.",
    entreeTropLongue: "A register entry is too long: shorten the element or table name.",
    troncon: function (i) { return "Flight " + i; },
    palier: function (i) { return "Landing " + i; },
    devers: "Cross slope",
    longueurTotale: "Developed length",
    penteHors: "slope beyond the table",
    rampePosee: function (n) { return "Ramp laid: " + n + (n > 1 ? " flights." : " flight."); },
    nomRampe: function (n) { return "Ramp — " + n + (n > 1 ? " flights" : " flight"); },
    rampeSansTable: "Without a ramp table, the length of flights and landings is unknown: nothing is laid.",
    choisirDeuxFaces: "Select exactly two faces.",
    mesure: function (i) { return "Measure " + i; },
    videMesures: "No measure: select two faces, then « Measure the selection ».",
    prospect: "Height ratio (allowed height)",
    hauteur: "Height",
    mesureFaite: function (n, d) { return n + ": " + d + " m."; },
    exigees: "Spaces required", posees: "Spaces declared", resultat: "Result",
    effectifInvalide: "The capacity must be a positive whole number.",
    placeDeclaree: function (n) { return n + (n > 1 ? " spaces declared." : " space declared."); },
    videPlaces: "No space declared.",
    manque: function (n) { return n + " missing"; },
    ajoutes: function (n) { return n + (n > 1 ? " checks added to the register." : " check added to the register."); },
    rienAAjouter: "Nothing to add: this tab has no check.",
    registrePlein: "The register is full (200 rows): export it, then clear it.",
    videRegistre: "Empty register: « Add to the register » from a check tab.",
    exporte: "Register exported (.md and .csv).",
    registreVide: "Register cleared.",
    md: { titre: "Register of checks", date: "Date", regle: "Rule", table: "Table", objet: "Object", valeur: "Value", seuil: "Threshold", verdict: "Verdict", rien: "The thresholds come from the cited table; no value was invented. A « to be checked » verdict rests on a rule whose text has not been read again." },
    fichierMd: function (d) { return "checks-register-" + d + ".md"; },
    fichierCsv: function (d) { return "checks-register-" + d + ".csv"; },
    reglesChargees: function (n) { return "Table loaded: " + n + (n > 1 ? " rule sets." : " rule set."); },
    reglesRefusees: "Table refused: ",
    archiveRefusee: "Loading refused: the file could not be archived in the database (",
    modeleEnregistre: "Table template saved: fill it in, cite each source, then load it.",
    fichierModele: "checks-rules-template.json",
    erreurs: {
      json: "the file is not readable JSON",
      format: "the format must be « " + FORMAT_REGLES + " »",
      jeux: "the table must hold 1 to " + MAX_JEUX + " rule sets",
      jeu: function (i) { return "set " + (i + 1) + ": id, label, version and date (YYYY-MM-DD) are expected"; },
      regle: function (j, k) { return "set « " + j + " », rule « " + k + " »: value or source missing"; },
      inconnue: function (j, k) { return "set « " + j + " »: unknown rule « " + k + " »"; },
    },
    op: { porte: "Declare doors", cheminement: "Measure a route", rampe: "Lay a ramp", mesure: "Measure a distance", place: "Declare spaces", registre: "Add to the register", vider: "Clear the register", regles: "Checks rules table" },
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
var aujourdhui = function () { return new Date().toISOString().slice(0, 10); };
var positif = function (v) { return typeof v === "number" && isFinite(v) && v > 0; };

// ——————————————————————————————————————————————— Table des règles (sourcée, datée, gardée avec le dessin)

/** Une règle lue : seuls les nombres attendus sont gardés ; une source est exigée. */
function lireRegle(k, v) {
  if (!v || typeof v.source !== "string" || !v.source.trim()) return null;
  var base = { source: v.source.trim().slice(0, 160), relu: v.relu === true };
  if (k === "passage" || k === "vuesDroites" || k === "distanceConstructions") return positif(v.min) ? Object.assign(base, { min: v.min }) : null;
  if (k === "degagement") return positif(v.max) ? Object.assign(base, { max: v.max }) : null;
  if (k === "prospect") return positif(v.rapport) ? Object.assign(base, { rapport: v.rapport }) : null;
  if (k === "rampe") {
    if (!Array.isArray(v.tranches) || !v.tranches.length || v.tranches.length > 10) return null;
    if (!v.tranches.every(function (t) { return t && positif(t.penteMax) && positif(t.longueurMax); }) || !positif(v.palier)) return null;
    if (v.deversMax !== undefined && v.deversMax !== null && !positif(v.deversMax)) return null;
    return Object.assign(base, { tranches: v.tranches.map(function (t) { return { penteMax: t.penteMax, longueurMax: t.longueurMax }; }).sort(function (a, b) { return a.penteMax - b.penteMax; }), palier: v.palier, deversMax: positif(v.deversMax) ? v.deversMax : null });
  }
  if (k === "placesFauteuil") {
    if (!Array.isArray(v.tranches) || !v.tranches.length || v.tranches.length > 20) return null;
    if (!v.tranches.every(function (t) { return t && positif(t.jusqua) && typeof t.places === "number" && t.places >= 0; })) return null;
    var au = v.auDela;
    if (au !== undefined && au !== null && !(au && positif(au.par) && typeof au.places === "number" && au.places >= 0)) return null;
    return Object.assign(base, { tranches: v.tranches.map(function (t) { return { jusqua: t.jusqua, places: t.places }; }).sort(function (a, b) { return a.jusqua - b.jusqua; }), auDela: au ? { par: au.par, places: au.places } : null });
  }
  return null;
}

function lireTable(brut) {
  var e = tx().erreurs;
  var d;
  try {
    d = JSON.parse(texte(brut).replace(/^﻿/, ""));
  } catch (err) {
    return { erreur: e.json };
  }
  if (!d || d.format !== FORMAT_REGLES) return { erreur: e.format };
  if (!Array.isArray(d.jeux) || !d.jeux.length || d.jeux.length > MAX_JEUX) return { erreur: e.jeux };
  var jeux = [];
  for (var i = 0; i < d.jeux.length; i++) {
    var j = d.jeux[i];
    var ok = j && ["id", "libelle", "version"].every(function (k) { return typeof j[k] === "string" && j[k].trim(); }) && typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date);
    if (!ok) return { erreur: e.jeu(i) };
    var regles = {};
    var r = j.regles && typeof j.regles === "object" ? j.regles : {};
    var cles = Object.keys(r);
    for (var c = 0; c < cles.length; c++) {
      if (REGLES.indexOf(cles[c]) < 0) return { erreur: e.inconnue(j.libelle, cles[c]) };
      var lu = lireRegle(cles[c], r[cles[c]]);
      if (!lu) return { erreur: e.regle(j.libelle, cles[c]) };
      regles[cles[c]] = lu;
    }
    jeux.push({ id: j.id.trim().slice(0, 40), libelle: j.libelle.trim().slice(0, 60), version: j.version.trim().slice(0, 20), date: j.date, regles: regles });
  }
  return { jeux: jeux };
}

async function jeuxGardes() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^regles\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(7)) - Number(b.slice(7)); });
  return { jeux: cles.map(function (k) { return toutes[k]; }).filter(function (j) { return j && j.id; }), cles: cles };
}
async function jeuChoisi() {
  var g = await jeuxGardes();
  var j = g.jeux.filter(function (x) { return x.id === valeurs.jeu; })[0] || g.jeux[0] || null;
  if (j) valeurs.jeu = j.id;
  return { jeu: j, jeux: g.jeux };
}

async function chargerRegles() {
  var x = tx();
  // Protocole 1.2 : le fichier chargé est archivé tel quel en base ; sans archive, il n'est pas chargé.
  var f = await planche.fichiers.ouvrir([".json"], { archiver: true });
  if (!f) return;
  if (!f.archive) return alerte(x.archiveRefusee + (f.archiveRefus || "") + ")");
  var r = lireTable(f.texte);
  if (r.erreur) return alerte(x.reglesRefusees + r.erreur);
  var anciens = await jeuxGardes();
  await enUnPas(x.op.regles, async function () {
    for (var i = 0; i < r.jeux.length; i++) await planche.donnees.ecrire("projet", "regles." + i, r.jeux[i]);
    for (var k = r.jeux.length; k < anciens.cles.length; k++) await planche.donnees.effacer("projet", "regles." + k);
    await planche.donnees.ecrire("projet", "regles-archive", { id: f.archive.id, empreinte: f.archive.empreinte, nom: String(f.nom || "").slice(0, 80) });
  });
  if (!r.jeux.some(function (j) { return j.id === valeurs.jeu; })) valeurs.jeu = r.jeux[0].id;
  return info(x.reglesChargees(r.jeux.length));
}

async function enregistrerModele() {
  var x = tx();
  var v = function (k) { var o = { source: "", relu: false }; o[k] = null; return o; };
  var modele = {
    format: FORMAT_REGLES,
    jeux: [{
      id: "jeu-1", libelle: "", version: "1", date: aujourdhui(),
      regles: {
        passage: v("min"), degagement: v("max"), vuesDroites: v("min"), prospect: v("rapport"), distanceConstructions: v("min"),
        rampe: { tranches: [{ penteMax: null, longueurMax: null }], palier: null, deversMax: null, source: "", relu: false },
        placesFauteuil: { tranches: [{ jusqua: null, places: null }], auDela: { par: null, places: null }, source: "", relu: false },
      },
    }],
  };
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

// ——————————————————————————————————————————————— Verdicts

/** Verdict d'une valeur contre un minimum ou un maximum : { texte, ton }. */
function juger(v, regle, cle, sep, enCm) {
  var x = tx();
  if (typeof v !== "number") return { texte: x.attributAbsent, ton: "gris" };
  if (!regle) return { texte: x.sansSeuil, ton: "gris" };
  var s = regle[cle];
  var ok = cle === "min" ? v >= s - EPS : v <= s + EPS;
  var suffixe = regle.relu ? "" : " · " + x.aVerifier;
  if (ok) return { texte: x.conforme + suffixe, ton: "ok" };
  var ecart = Math.abs(v - s);
  var t = enCm ? (cle === "min" ? x.ecartCm(fixe(ecart * 100, 0, sep)) : x.excesCm(fixe(ecart * 100, 0, sep))) : (cle === "min" ? "−" + fixe(ecart, 2, sep) + " m" : x.excesM(fixe(ecart, 2, sep)));
  return { texte: t + suffixe, ton: "alerte" };
}
var seuilTexte = function (regle, cle, sep) { return regle ? fixe(regle[cle], 2, sep) + " m" : "–"; };
var mesureTexte = function (v, sep) { return typeof v === "number" ? fixe(v, 2, sep) + " m" : "–"; };

// ——————————————————————————————————————————————— Objets déclarés (portes, emplacements)

async function objetsDeclares(cle) {
  var m = await planche.modele.lire();
  var l = [];
  for (var i = 0; i < m.objets.length; i++) {
    var d = await planche.donnees.lire(m.objets[i].id, cle);
    if (d) l.push({ id: m.objets[i].id, nom: m.objets[i].nom, d: d });
  }
  l.sort(function (a, b) { return a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0; });
  return l;
}
async function objetsChoisis() {
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  return m.objets.filter(function (o) { return sel.indexOf(o.id) >= 0; });
}

async function declarerPortes() {
  var x = tx();
  var objets = await objetsChoisis();
  if (!objets.length) return alerte(x.choisirObjets);
  var actuel = objets.length === 1 ? await planche.donnees.lire(objets[0].id, "porte") : null;
  var r = await planche.saisie.demander(x.declarerPorte, [
    { id: "passage", libelle: x.champPassage, genre: "texte", valeur: actuel && typeof actuel.passage === "number" ? String(actuel.passage) : "" },
  ]);
  if (!r) return;
  var p = texte(r.passage).trim() === "" ? null : lireNombre(r.passage);
  if (p !== null && !(p > 0)) return alerte(x.passageInvalide);
  await enUnPas(x.op.porte, async function () {
    for (var i = 0; i < objets.length; i++) await planche.donnees.ecrire(objets[i].id, "porte", { passage: p });
  });
  return info(x.porteDeclaree(objets.length));
}

async function declarerPlaces() {
  var x = tx();
  var objets = await objetsChoisis();
  if (!objets.length) return alerte(x.choisirObjets);
  await enUnPas(x.op.place, async function () {
    for (var i = 0; i < objets.length; i++) await planche.donnees.ecrire(objets[i].id, "place", { declaree: aujourdhui() });
  });
  return info(x.placeDeclaree(objets.length));
}

// ——————————————————————————————————————————————— Mesures (cheminements, vues, distances)

async function mesuresGardees(cle) {
  var l = await planche.donnees.lire("projet", cle);
  return Array.isArray(l) ? l : [];
}

async function mesurerCheminement() {
  var x = tx();
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  var aretes = m.aretes.filter(function (e) { return sel.indexOf(e.id) >= 0; });
  if (!aretes.length) return alerte(x.choisirAretes);
  var l = await mesuresGardees("cheminements");
  if (l.length >= MAX_MESURES) return alerte(x.tropDeMesures);
  var total = aretes.reduce(function (a, e) { return a + e.longueur; }, 0);
  var r = await planche.saisie.demander(x.onglets.degagements, [{ id: "nom", libelle: x.champNom, genre: "texte", valeur: x.cheminement(l.length + 1) }]);
  if (!r) return;
  var nom = texte(r.nom).trim().slice(0, 60) || x.cheminement(l.length + 1);
  await enUnPas(x.op.cheminement, function () { return planche.donnees.ecrire("projet", "cheminements", l.concat([{ nom: nom, longueur: total, aretes: aretes.map(function (e) { return e.id; }).slice(0, 40) }])); });
  return info(x.cheminementMesure(nom, fixe(total, 2, (await planche.unites.lire()).separateur)));
}

/** Distance la plus courte, en plan, entre deux segments. */
function distanceSegments(a, b, c, d) {
  var pt = function (p, q, r) {
    var vx = r[0] - q[0];
    var vy = r[1] - q[1];
    var l2 = vx * vx + vy * vy;
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * vx + (p[1] - q[1]) * vy) / l2)) : 0;
    return Math.hypot(p[0] - q[0] - t * vx, p[1] - q[1] - t * vy);
  };
  var cr = function (p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); };
  var d1 = cr(a, b, c);
  var d2 = cr(a, b, d);
  var d3 = cr(c, d, a);
  var d4 = cr(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}
function distancePlan(f, g) {
  var best = Infinity;
  for (var i = 0; i < f.points.length; i++) {
    for (var j = 0; j < g.points.length; j++) {
      best = Math.min(best, distanceSegments(f.points[i], f.points[(i + 1) % f.points.length], g.points[j], g.points[(j + 1) % g.points.length]));
    }
  }
  return best;
}
var hauteurFace = function (f) { var z = f.points.map(function (q) { return q[2]; }); return Math.max.apply(null, z) - Math.min.apply(null, z); };

async function mesurerDistance(cle) {
  var x = tx();
  var m = await planche.modele.lire();
  var sel = await planche.selection.lire();
  var faces = m.faces.filter(function (f) { return sel.indexOf(f.id) >= 0; });
  if (faces.length !== 2 || sel.length !== 2) return alerte(x.choisirDeuxFaces);
  var l = await mesuresGardees(cle);
  if (l.length >= MAX_MESURES) return alerte(x.tropDeMesures);
  var d = distancePlan(faces[0], faces[1]);
  var h = Math.max(hauteurFace(faces[0]), hauteurFace(faces[1]));
  var nom = x.mesure(l.length + 1);
  await enUnPas(x.op.mesure, function () { return planche.donnees.ecrire("projet", cle, l.concat([{ nom: nom, distance: d, hauteur: h, faces: [faces[0].id, faces[1].id] }])); });
  return info(x.mesureFaite(nom, fixe(d, 2, (await planche.unites.lire()).separateur)));
}

// ——————————————————————————————————————————————— Rampe (n° 16)

function lireRampe() {
  var H = lireNombre(valeurs.denivele);
  var p = lireNombre(valeurs.pente);
  var w = lireNombre(valeurs.largeur);
  var dv = texte(valeurs.devers).trim() === "" ? null : lireNombre(valeurs.devers);
  if (!(H > 0) || !(p > 0) || !(w > 0) || (dv !== null && !(dv >= 0))) return null;
  return { H: H, p: p, w: w, devers: dv };
}
/** Découpe d'une rampe selon la règle : tronçons de longueur au plus la longueur admise pour la pente, paliers entre eux. */
function decouper(r, regle) {
  var total = r.H / (r.p / 100);
  var tranche = regle ? regle.tranches.filter(function (t) { return r.p <= t.penteMax + EPS; })[0] || null : null;
  if (!tranche) return { total: total, tranche: null, troncons: [total], palier: regle ? regle.palier : null };
  var n = Math.max(1, Math.ceil(total / tranche.longueurMax - 1e-9));
  // Le nombre de tronçons est borné avant d'en allouer un seul (aperçu compris) : une saisie extrême ne bloque pas.
  if (!isFinite(n) || n > MAX_TRONCONS) return { total: total, tranche: tranche, troncons: [], palier: regle.palier, trop: true };
  var l = [];
  for (var i = 0; i < n; i++) l.push(total / n);
  return { total: total, tranche: tranche, troncons: l, palier: regle.palier };
}

async function poserRampe() {
  var x = tx();
  var r = lireRampe();
  if (!r) return alerte(x.rampeInvalide);
  var j = (await jeuChoisi()).jeu;
  var regle = j && j.regles.rampe;
  if (!regle) return alerte(x.rampeSansTable);
  var d = decouper(r, regle);
  if (d.trop || d.troncons.length > MAX_TRONCONS) return alerte(x.tropDeTroncons);
  var m = await planche.modele.lire();
  var avant = {};
  m.faces.forEach(function (f) { avant[f.id] = true; });
  var x0 = 2;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { x0 = Math.max(x0, q[0] + 2); }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { x0 = Math.max(x0, q[0] + 2); }); });
  var g = await enUnPas(x.op.rampe, async function () {
    var xc = x0;
    var z = 0;
    for (var i = 0; i < d.troncons.length; i++) {
      var l = d.troncons[i];
      var monte = l * (r.p / 100);
      await planche.modele.rectangle([xc, 0, z], [l, 0, monte], [0, r.w, 0]);
      xc += l;
      z += monte;
      if (i + 1 < d.troncons.length) {
        await planche.modele.rectangle([xc, 0, z], [d.palier, 0, 0], [0, r.w, 0]);
        xc += d.palier;
      }
    }
    var m2 = await planche.modele.lire();
    var g2 = await planche.modele.grouper(m2.faces.filter(function (f) { return !avant[f.id]; }).map(function (f) { return f.id; }), x.nomRampe(d.troncons.length));
    await planche.donnees.ecrire(g2, "rampe", { H: r.H, p: r.p, w: r.w, devers: r.devers, troncons: d.troncons.length, jeu: j.id });
    return g2;
  });
  await planche.selection.definir([g]).catch(function () {});
  return info(x.rampePosee(d.troncons.length));
}

// ——————————————————————————————————————————————— Places fauteuil (n° 40)

function placesExigees(effectif, regle) {
  var t = regle.tranches.filter(function (y) { return effectif <= y.jusqua; })[0];
  if (t) return t.places;
  if (!regle.auDela) return null;
  var dernier = regle.tranches[regle.tranches.length - 1];
  return dernier.places + Math.ceil((effectif - dernier.jusqua) / regle.auDela.par) * regle.auDela.places;
}

// ——————————————————————————————————————————————— Lignes de contrôle par onglet

/** Contrôles de l'onglet : lignes du tableau et entrées prêtes pour le registre. */
async function controles(j, sep) {
  var x = tx();
  var R = j ? j.regles : {};
  var lignes = [];
  var entrees = [];
  var regleTexte = x.onglets[onglet];
  var ajouter = function (id, objet, valeur, seuil, v, cellules) {
    lignes.push({ genre: "ligne", id: id, ton: v.ton, cellules: cellules });
    entrees.push({ regle: regleTexte, objet: objet, valeur: valeur, seuil: seuil, verdict: v.texte });
  };
  if (onglet === "passages") {
    (await objetsDeclares("porte")).forEach(function (o) {
      var p = typeof o.d.passage === "number" ? o.d.passage : null;
      var v = juger(p, R.passage, "min", sep, true);
      ajouter(o.id, o.nom, mesureTexte(p, sep), seuilTexte(R.passage, "min", sep), v, [o.nom, mesureTexte(p, sep), seuilTexte(R.passage, "min", sep), v.texte]);
    });
  } else if (onglet === "degagements") {
    (await mesuresGardees("cheminements")).forEach(function (c, i) {
      var v = juger(c.longueur, R.degagement, "max", sep, false);
      ajouter("ch" + i, c.nom, mesureTexte(c.longueur, sep), seuilTexte(R.degagement, "max", sep), v, [c.nom, mesureTexte(c.longueur, sep), seuilTexte(R.degagement, "max", sep), v.texte]);
    });
  } else if (onglet === "vues") {
    (await mesuresGardees("vues")).forEach(function (c, i) {
      var v = juger(c.distance, R.vuesDroites, "min", sep, false);
      ajouter("mv" + i, c.nom, mesureTexte(c.distance, sep), seuilTexte(R.vuesDroites, "min", sep), v, [c.nom, mesureTexte(c.distance, sep), seuilTexte(R.vuesDroites, "min", sep), v.texte]);
      if (R.prospect) {
        var admise = c.distance * R.prospect.rapport;
        var vp = juger(c.hauteur, { max: admise, relu: R.prospect.relu }, "max", sep, false);
        ajouter("mv" + i, c.nom + " — " + x.prospect, mesureTexte(c.hauteur, sep), mesureTexte(admise, sep), vp, [x.prospect, x.hauteur + " " + mesureTexte(c.hauteur, sep), mesureTexte(admise, sep), vp.texte]);
      }
    });
  } else if (onglet === "distance") {
    (await mesuresGardees("distances")).forEach(function (c, i) {
      var v = juger(c.distance, R.distanceConstructions, "min", sep, false);
      ajouter("md" + i, c.nom, mesureTexte(c.distance, sep), seuilTexte(R.distanceConstructions, "min", sep), v, [c.nom, mesureTexte(c.distance, sep), seuilTexte(R.distanceConstructions, "min", sep), v.texte]);
    });
  } else if (onglet === "rampe") {
    var r = lireRampe();
    if (r) {
      var d = decouper(r, R.rampe);
      var regle = R.rampe;
      var suffixe = regle && !regle.relu ? " · " + x.aVerifier : "";
      var vPente = !regle ? { texte: x.sansSeuil, ton: "gris" } : d.tranche ? { texte: x.conforme + suffixe, ton: "ok" } : { texte: x.penteHors + suffixe, ton: "alerte" };
      if (d.trop) lignes.push({ genre: "ligne", ton: "alerte", cellules: [x.tropDeTroncons, "", "", ""] });
      d.troncons.forEach(function (l, i) {
        ajouter(null, x.troncon(i + 1), fixe(l, 2, sep) + " m", d.tranche ? fixe(d.tranche.longueurMax, 2, sep) + " m" : "–", vPente, [x.troncon(i + 1), fixe(l, 2, sep) + " m", fixe(r.p, 1, sep) + " %", vPente.texte]);
        if (i + 1 < d.troncons.length) lignes.push({ genre: "ligne", cellules: [x.palier(i + 1), fixe(d.palier, 2, sep) + " m", "0 %", ""] });
      });
      if (r.devers !== null) {
        var vd = !regle || regle.deversMax === null ? { texte: x.sansSeuil, ton: "gris" } : r.devers <= regle.deversMax + EPS ? { texte: x.conforme + suffixe, ton: "ok" } : { texte: x.excesPct(fixe(r.devers - regle.deversMax, 1, sep)) + suffixe, ton: "alerte" };
        ajouter(null, x.devers, fixe(r.devers, 1, sep) + " %", regle && regle.deversMax !== null ? fixe(regle.deversMax, 1, sep) + " %" : "–", vd, [x.devers, "", fixe(r.devers, 1, sep) + " %", vd.texte]);
      }
    }
  } else if (onglet === "places") {
    var pl = await objetsDeclares("place");
    pl.forEach(function (o) { lignes.push({ genre: "ligne", id: o.id, cellules: [o.nom, o.d.declaree || ""] }); });
    var eff = lireNombre(valeurs.effectif);
    if (eff > 0 && eff === Math.floor(eff)) {
      var exig = R.placesFauteuil ? placesExigees(eff, R.placesFauteuil) : null;
      var v = exig === null ? { texte: x.sansSeuil, ton: "gris" } : pl.length >= exig ? { texte: x.conforme + (R.placesFauteuil.relu ? "" : " · " + x.aVerifier), ton: "ok" } : { texte: x.manque(exig - pl.length) + (R.placesFauteuil.relu ? "" : " · " + x.aVerifier), ton: "alerte" };
      entrees.push({ regle: regleTexte, objet: x.champs.effectif + " " + eff, valeur: String(pl.length), seuil: exig === null ? "–" : String(exig), verdict: v.texte });
    }
  }
  return { lignes: lignes, entrees: entrees };
}

// ——————————————————————————————————————————————— Registre (n° 32)

async function registreGarde() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^registre\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(9)) - Number(b.slice(9)); });
  var l = [];
  cles.forEach(function (k) { if (Array.isArray(toutes[k])) l = l.concat(toutes[k]); });
  return { lignes: l, cles: cles };
}
async function ecrireRegistre(l, cles) {
  var n = 0;
  var morceau = [];
  var taille = 2;
  for (var i = 0; i < l.length; i++) {
    // Découpe par taille sérialisée : chaque morceau reste sous la borne d'une valeur, quel que soit le nombre d'entrées.
    var t = JSON.stringify(l[i]).length;
    if (t + 2 > TAILLE_MORCEAU) throw new Error(tx().entreeTropLongue);
    if (morceau.length && taille + 1 + t > TAILLE_MORCEAU) {
      await planche.donnees.ecrire("projet", "registre." + n++, morceau);
      morceau = [];
      taille = 2;
    }
    taille += (morceau.length ? 1 : 0) + t;
    morceau.push(l[i]);
  }
  if (morceau.length) await planche.donnees.ecrire("projet", "registre." + n++, morceau);
  for (var k = n; k < cles.length; k++) await planche.donnees.effacer("projet", "registre." + k);
}

async function ajouterAuRegistre() {
  var x = tx();
  var j = (await jeuChoisi()).jeu;
  var sep = (await planche.unites.lire()).separateur;
  var c = await controles(j, sep);
  if (!c.entrees.length) return alerte(x.rienAAjouter);
  var g = await registreGarde();
  if (g.lignes.length + c.entrees.length > MAX_REGISTRE) return alerte(x.registrePlein);
  var table = j ? x.jeuLibelle(j) : x.aucunJeu;
  var date = aujourdhui();
  var l = g.lignes.concat(c.entrees.map(function (e) { return { date: date, regle: e.regle, table: table, objet: e.objet, valeur: e.valeur, seuil: e.seuil, verdict: e.verdict }; }));
  await enUnPas(x.op.registre, function () { return ecrireRegistre(l, g.cles); });
  return info(x.ajoutes(c.entrees.length));
}

var csv = function (v) { var s = texte(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function exporterRegistre() {
  var x = tx();
  var g = await registreGarde();
  if (!g.lignes.length) return alerte(x.videRegistre);
  var md = x.md;
  var cols = [md.date, md.regle, md.table, md.objet, md.valeur, md.seuil, md.verdict];
  var cles = ["date", "regle", "table", "objet", "valeur", "seuil", "verdict"];
  var l = ["# " + md.titre, "", "| " + cols.join(" | ") + " |", "|" + cols.map(function () { return "---"; }).join("|") + "|"];
  g.lignes.forEach(function (e) { l.push("| " + cles.map(function (k) { return texte(e[k]).replace(/\|/g, "/"); }).join(" | ") + " |"); });
  l.push("", md.rien, "");
  var c = [cols.map(csv).join(";")].concat(g.lignes.map(function (e) { return cles.map(function (k) { return csv(e[k]); }).join(";"); }));
  var d = aujourdhui();
  var a = await planche.fichiers.enregistrer(x.fichierMd(d), l.join("\n"));
  var b = a && (await planche.fichiers.enregistrer(x.fichierCsv(d), "﻿" + c.join("\n") + "\n"));
  if (b) await info(x.exporte);
}
async function viderRegistre() {
  var x = tx();
  var g = await registreGarde();
  if (!g.lignes.length) return;
  await enUnPas(x.op.vider, function () { return ecrireRegistre([], g.cles); });
  return info(x.registreVide);
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var c = await jeuChoisi();
  var formulaire = [{ id: "jeu", libelle: x.champs.jeu, valeur: valeurs.jeu, choix: c.jeux.length ? c.jeux.map(function (j) { return { valeur: j.id, libelle: x.jeuLibelle(j) }; }) : [{ valeur: "", libelle: x.aucunJeu }] }];
  var e = { lignes: [], vide: null, resultats: [] };
  if (onglet === "registre") {
    var g = await registreGarde();
    e.lignes = g.lignes.map(function (r) { return { genre: "ligne", ton: /^(conforme|compliant)/.test(r.verdict) ? "ok" : /^(non évalué|not assessed)/.test(r.verdict) ? "gris" : "alerte", cellules: [r.date, r.regle, r.objet, r.verdict] }; });
    e.vide = g.lignes.length ? null : x.videRegistre;
  } else {
    if (onglet === "rampe") ["denivele", "pente", "largeur", "devers"].forEach(function (k) { formulaire.push({ id: k, libelle: x.champs[k], valeur: valeurs[k] }); });
    if (onglet === "places") formulaire.push({ id: "effectif", libelle: x.champs.effectif, valeur: valeurs.effectif });
    var k = await controles(c.jeu, sep);
    e.lignes = k.lignes;
    if (onglet === "rampe") {
      var r = lireRampe();
      if (r) e.resultats.push({ libelle: x.longueurTotale, valeur: fixe(decouper(r, c.jeu && c.jeu.regles.rampe).total, 2, sep) + " m" });
    }
    if (onglet === "places" && k.entrees.length) {
      var p = k.entrees[0];
      e.resultats.push({ libelle: x.exigees, valeur: p.seuil }, { libelle: x.posees, valeur: p.valeur }, { libelle: x.resultat, valeur: p.verdict, ton: /^(conforme|compliant)/.test(p.verdict) ? "ok" : p.seuil === "–" ? "" : "alerte" });
    }
    var vides = { passages: x.videPassages, degagements: x.videDegagements, vues: x.videMesures, distance: x.videMesures, places: x.videPlaces, rampe: null };
    e.vide = e.lignes.length ? null : vides[onglet];
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
// Un écart mène à l'objet en un clic : la ligne choisie sélectionne son objet dans le dessin.
action("choisir", async function (d) {
  if (typeof d.id !== "string") return;
  var m = await planche.modele.lire();
  if (m.objets.some(function (o) { return o.id === d.id; })) return planche.selection.definir([d.id]);
  var cle = /^ch\d+$/.test(d.id) ? "cheminements" : /^mv\d+$/.test(d.id) ? "vues" : /^md\d+$/.test(d.id) ? "distances" : null;
  if (!cle) return;
  var l = await mesuresGardees(cle);
  var e = l[Number(d.id.slice(2))];
  var ids = e ? (e.aretes || e.faces || []).filter(function (id) { return m.faces.some(function (f) { return f.id === id; }) || m.aretes.some(function (a) { return a.id === id; }); }) : [];
  if (ids.length) await planche.selection.definir(ids);
});
action("declarer-portes", declarerPortes);
action("mesurer-cheminement", mesurerCheminement);
action("poser-rampe", poserRampe);
action("mesurer-vues", function () { return mesurerDistance("vues"); });
action("mesurer-distance", function () { return mesurerDistance("distances"); });
action("declarer-places", declarerPlaces);
action("ajouter-registre", ajouterAuRegistre);
action("exporter-registre", exporterRegistre);
action("vider-registre", viderRegistre);
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
commande("ouvrir-panneau", "passages");
commande("passages", "passages");
commande("degagements", "degagements");
commande("rampe", "rampe");
commande("vues-droites", "vues");
commande("distance-constructions", "distance");
commande("places-fauteuil", "places");
commande("registre", "registre");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
