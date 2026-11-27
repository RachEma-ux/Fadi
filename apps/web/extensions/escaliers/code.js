// Extension « Escaliers » (catalogue des extensions de la Planche, cas 1 de la feuille de route, extension n° 3 ;
// maquette validée le 27 novembre 2026). Cinq onglets, un par entrée du catalogue :
//   Générer (n° 7, D4-F5-011) · Solutions dans la règle (n° 15, D4-F5-068) · Vérifier (n° 9, D4-F5-012) ·
//   Accessibilité (n° 22, D4-F5-104) · Rouvrir (n° 37, D4-F5-134).
//
// Aucune valeur réglementaire n'est écrite ici. Les règles (hauteur de marche, giron, module de Blondel, échappée,
// largeur, exigences d'accessibilité) viennent d'un fichier de règles chargé par l'utilisateur, où chaque règle cite sa
// source ; une règle non relue est marquée « à vérifier ». Sans règle, le critère est « non évaluable ».

var VERSION = "1.0.0";
var PANNEAU = "escaliers";
var ONGLETS = ["generer", "solutions", "verifier", "accessibilite", "rouvrir"];
var FORMAT_REGLES = "fadi-regles-escaliers/1";
var TYPES = ["droit", "palier", "l", "u", "balance"];
var NUMERIQUES = ["hauteurMarche", "giron", "blondel", "echappee", "largeur", "prolongementMainCourante"];
var EXIGENCES = ["mainsCourantesDeuxCotes", "nezContrastes", "contremarchesExtremes", "bandeEveil"];
var MAX_PORTEES = 20;
var MAX_MARCHES = 40;
var LIGNES_PAR_PAGE = 80;
var EPS = 1e-9;

var onglet = "generer";
var page = 0;
var langue = "fr";
var choisie = null;
var valeurs = {
  type: "droit", hauteur: "", nombre: "", giron: "", largeur: "", portee: "",
  tremie: "", epaisseur: "",
  vh: "", vg: "", vl: "", ve: "",
};

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    onglets: { generer: "Générer", solutions: "Solutions dans la règle", verifier: "Vérifier", accessibilite: "Accessibilité", rouvrir: "Rouvrir" },
    champs: {
      type: "Type", hauteur: "Hauteur à franchir (m)", nombre: "Nombre de hauteurs de marche", giron: "Giron (m)", largeur: "Largeur (m)",
      portee: "Portée", tremie: "Trémie longueur × largeur (m)", epaisseur: "Épaisseur du plancher haut (m)",
      vh: "Hauteur de marche (m)", vg: "Giron (m)", vl: "Largeur (m)", ve: "Échappée (m)",
    },
    types: { droit: "Droit", palier: "Droit à palier", l: "En L (palier)", u: "En U (palier)", balance: "Balancé (quart tournant)" },
    aucunePortee: "Aucune règle chargée",
    note: {
      generer: "L'escalier est posé à droite du dessin, dans un groupe nommé qui garde ses paramètres (onglet Rouvrir).",
      solutions: "Choisir une ligne, puis « Générer la solution choisie ». Classement : du plus proche au plus loin du milieu du module de Blondel ; hors règle en dernier.",
      verifier: "Sélectionnez un escalier généré pour reprendre ses valeurs, ou saisissez celles d'un escalier dessiné ou relevé.",
      accessibilite: "Sélectionnez un escalier généré, puis déclarez ce qui est prévu ; chaque exigence vient du fichier de règles.",
      rouvrir: "Sélectionnez un escalier généré : ses paramètres reviennent ici ; « Régénérer » le remplace en un seul pas d'annulation.",
    },
    regles: function (n, f) { return "Règles chargées : " + n + (n > 1 ? " portées" : " portée") + (f ? " (" + f + ")" : "") + ". Chaque règle cite sa source, « à vérifier » tant que le texte n'a pas été relu."; },
    sansRegles: "Aucun fichier de règles : les critères sont non évaluables. Chargez un fichier de règles sourcé, ou enregistrez un modèle à remplir.",
    dans: "dans la règle", limite: "à la limite", hors: "hors règle", nonEvaluable: "non évaluable", aVerifier: "à vérifier",
    conforme: "conforme", nonConforme: "non conforme",
    criteres: {
      hauteurMarche: "Hauteur de marche", giron: "Giron", blondel: "Module de Blondel (2h + g)", echappee: "Échappée", largeur: "Largeur",
      prolongementMainCourante: "Prolongement des mains courantes", mainsCourantesDeuxCotes: "Mains courantes des deux côtés",
      nezContrastes: "Nez de marche contrastés", contremarchesExtremes: "Première et dernière contremarches visibles", bandeEveil: "Bande d'éveil en haut",
    },
    colSolutions: ["n", "h (cm)", "g (cm)", "2h + g", "Échappée", "Règle"],
    colVerifier: ["Critère", "Valeur", "Règle", "Source"],
    colAccessibilite: ["Exigence", "Déclaré", "Résultat", "Source"],
    marches: function (n, h, g, b) { return n + " hauteurs · h " + h + " cm · g " + g + " cm · 2h + g = " + b + " cm"; },
    resume: "Escalier",
    longueur: "Longueur au sol",
    resultat: "Résultat",
    oui: "oui", non: "non",
    // Messages
    nombresInvalides: "Hauteur, nombre de marches, giron et largeur doivent être des nombres positifs.",
    tropDeMarches: "Entre 2 et 40 hauteurs de marche.",
    tropPeuPourType: "Ce type demande au moins 6 hauteurs de marche (deux volées et le tournant).",
    opGenerer: "Générer un escalier",
    opRegenerer: "Régénérer l'escalier",
    genere: "Escalier généré : ",
    regenere: "Escalier régénéré : ",
    tremieInvalide: "La trémie s'écrit « longueur × largeur » en mètres, par exemple 3,20 × 1,00.",
    chargerDabord: "Chargez d'abord un fichier de règles sourcé : sans lui, les solutions ne sont pas évaluables.",
    choisirLigne: "Choisissez d'abord une ligne du tableau.",
    choisirEscalier: "Sélectionnez un escalier généré par cette extension (un seul groupe).",
    pasUnEscalier: "Ce groupe n'a pas été généré par l'extension Escaliers : ses paramètres sont inconnus.",
    reglesChargees: "Règles chargées : ",
    reglesRefusees: "Fichier de règles refusé : ",
    modeleEnregistre: "Modèle de fichier de règles enregistré : à remplir avec les valeurs et leurs sources.",
    titreAccessibilite: "Accessibilité de l'escalier",
    accessibiliteEnregistree: "Accessibilité déclarée pour l'escalier.",
    prolongementDeclare: "Prolongement des mains courantes (m)",
    nomEscalier: "Escalier",
    pasDeValeur: "Saisissez au moins une valeur, ou sélectionnez un escalier généré.",
    erreurs: {
      format: "le format doit être « " + FORMAT_REGLES + " »",
      portees: "une liste « portees » de 1 à 20 portées est attendue",
      portee: function (i) { return "portée " + (i + 1) + " : identifiant et libellé attendus"; },
      regle: function (p, r) { return "« " + p + " », règle « " + r + " » : nombres positifs ou null, et une source non vide"; },
      inconnue: function (p, r) { return "« " + p + " » : règle inconnue « " + r + " »"; },
      json: "fichier JSON illisible",
      taille: "fichier trop gros pour être gardé avec le dessin",
    },
    fichierModele: "regles-escaliers-modele.json",
  },
  en: {
    onglets: { generer: "Generate", solutions: "Solutions within the rules", verifier: "Check", accessibilite: "Accessibility", rouvrir: "Reopen" },
    champs: {
      type: "Type", hauteur: "Height to climb (m)", nombre: "Number of risers", giron: "Going (m)", largeur: "Width (m)",
      portee: "Scope", tremie: "Stairwell length × width (m)", epaisseur: "Upper floor thickness (m)",
      vh: "Riser height (m)", vg: "Going (m)", vl: "Width (m)", ve: "Headroom (m)",
    },
    types: { droit: "Straight", palier: "Straight with landing", l: "L-shaped (landing)", u: "U-shaped (landing)", balance: "Winders (quarter turn)" },
    aucunePortee: "No rules loaded",
    note: {
      generer: "The stair is laid to the right of the drawing, in a named group that keeps its parameters (Reopen tab).",
      solutions: "Choose a line, then « Generate the chosen solution ». Ranking: closest to farthest from the middle of the Blondel module; out of rules last.",
      verifier: "Select a generated stair to take its values, or enter those of a drawn or surveyed stair.",
      accessibilite: "Select a generated stair, then declare what is planned; each requirement comes from the rules file.",
      rouvrir: "Select a generated stair: its parameters come back here; « Regenerate » replaces it in a single undo step.",
    },
    regles: function (n, f) { return "Rules loaded: " + n + (n > 1 ? " scopes" : " scope") + (f ? " (" + f + ")" : "") + ". Each rule cites its source, « to check » until the text has been reread."; },
    sansRegles: "No rules file: the criteria cannot be assessed. Load a sourced rules file, or save a template to fill in.",
    dans: "within the rules", limite: "at the limit", hors: "out of rules", nonEvaluable: "cannot be assessed", aVerifier: "to check",
    conforme: "compliant", nonConforme: "not compliant",
    criteres: {
      hauteurMarche: "Riser height", giron: "Going", blondel: "Blondel module (2h + g)", echappee: "Headroom", largeur: "Width",
      prolongementMainCourante: "Handrail extension", mainsCourantesDeuxCotes: "Handrails on both sides",
      nezContrastes: "Contrasting nosings", contremarchesExtremes: "First and last risers visible", bandeEveil: "Warning strip at the top",
    },
    colSolutions: ["n", "h (cm)", "g (cm)", "2h + g", "Headroom", "Rule"],
    colVerifier: ["Criterion", "Value", "Rule", "Source"],
    colAccessibilite: ["Requirement", "Declared", "Result", "Source"],
    marches: function (n, h, g, b) { return n + " risers · h " + h + " cm · g " + g + " cm · 2h + g = " + b + " cm"; },
    resume: "Stair",
    longueur: "Length on plan",
    resultat: "Result",
    oui: "yes", non: "no",
    nombresInvalides: "Height, number of risers, going and width must be positive numbers.",
    tropDeMarches: "Between 2 and 40 risers.",
    tropPeuPourType: "This type needs at least 6 risers (two flights and the turn).",
    opGenerer: "Generate a stair",
    opRegenerer: "Regenerate the stair",
    genere: "Stair generated: ",
    regenere: "Stair regenerated: ",
    tremieInvalide: "The stairwell is written « length × width » in metres, for example 3.20 × 1.00.",
    chargerDabord: "Load a sourced rules file first: without it, the solutions cannot be assessed.",
    choisirLigne: "Choose a line of the table first.",
    choisirEscalier: "Select a stair generated by this extension (a single group).",
    pasUnEscalier: "This group was not generated by the Stairs extension: its parameters are unknown.",
    reglesChargees: "Rules loaded: ",
    reglesRefusees: "Rules file refused: ",
    modeleEnregistre: "Rules file template saved: fill it in with the values and their sources.",
    titreAccessibilite: "Stair accessibility",
    accessibiliteEnregistree: "Accessibility declared for the stair.",
    prolongementDeclare: "Handrail extension (m)",
    nomEscalier: "Stair",
    pasDeValeur: "Enter at least one value, or select a generated stair.",
    erreurs: {
      format: "the format must be « " + FORMAT_REGLES + " »",
      portees: "a « portees » list of 1 to 20 scopes is expected",
      portee: function (i) { return "scope " + (i + 1) + ": id and label expected"; },
      regle: function (p, r) { return "« " + p + " », rule « " + r + " »: positive numbers or null, and a non-empty source"; },
      inconnue: function (p, r) { return "« " + p + " »: unknown rule « " + r + " »"; },
      json: "unreadable JSON file",
      taille: "file too large to be kept with the drawing",
    },
    fichierModele: "stair-rules-template.json",
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var alerte = function (m) { return planche.message.afficher(m, "alerte"); };
var info = function (m) { return planche.message.afficher(m); };
var texte = function (v) { return v === undefined || v === null ? "" : String(v); };
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(",", ".");
  return t === "" || !/^-?\d*\.?\d+$/.test(t) ? NaN : Number(t);
};
// Arrondi au plus proche (le demi monte), sans l'écart binaire de toFixed (61,75 → 61,8).
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var cm = function (v, sep) { return fixe(v * 100, 1, sep); };

// ——————————————————————————————————————————————— Règles (fichier sourcé, gardé avec le dessin)

var estNombreOuNul = function (v) { return v === null || v === undefined || (typeof v === "number" && isFinite(v) && v >= 0); };

/** Relit un fichier de règles ; rend { portees } ou { erreur }. Rien n'est complété : une valeur absente reste absente. */
function lireRegles(brut) {
  var e = tx().erreurs;
  var d;
  try {
    d = JSON.parse(texte(brut).replace(/^﻿/, ""));
  } catch (err) {
    return { erreur: e.json };
  }
  if (!d || d.format !== FORMAT_REGLES) return { erreur: e.format };
  if (!Array.isArray(d.portees) || !d.portees.length || d.portees.length > MAX_PORTEES) return { erreur: e.portees };
  var portees = [];
  for (var i = 0; i < d.portees.length; i++) {
    var p = d.portees[i];
    if (!p || typeof p.id !== "string" || !p.id.trim() || typeof p.libelle !== "string" || !p.libelle.trim()) return { erreur: e.portee(i) };
    var regles = {};
    var r = p.regles && typeof p.regles === "object" ? p.regles : {};
    var cles = Object.keys(r);
    for (var j = 0; j < cles.length; j++) {
      var k = cles[j];
      var v = r[k];
      if (NUMERIQUES.indexOf(k) < 0 && EXIGENCES.indexOf(k) < 0) return { erreur: e.inconnue(p.libelle, k) };
      if (!v || typeof v.source !== "string" || !v.source.trim()) return { erreur: e.regle(p.libelle, k) };
      if (NUMERIQUES.indexOf(k) >= 0) {
        if (!estNombreOuNul(v.min) || !estNombreOuNul(v.max) || !estNombreOuNul(v.milieu)) return { erreur: e.regle(p.libelle, k) };
        // Une règle numérique sans aucune valeur ne dit rien : elle est ignorée, pas inventée.
        if (typeof v.min !== "number" && typeof v.max !== "number") continue;
        regles[k] = { min: typeof v.min === "number" ? v.min : null, max: typeof v.max === "number" ? v.max : null, milieu: typeof v.milieu === "number" ? v.milieu : null, source: v.source.trim().slice(0, 200), relu: v.relu === true };
      } else {
        if (v.exige !== true && v.exige !== false && v.exige !== null && v.exige !== undefined) return { erreur: e.regle(p.libelle, k) };
        if (typeof v.exige !== "boolean") continue;
        regles[k] = { exige: v.exige, source: v.source.trim().slice(0, 200), relu: v.relu === true };
      }
    }
    var marge = typeof p.marge === "number" && p.marge >= 0 && p.marge < 1 ? p.marge : 0;
    portees.push({ id: p.id.trim().slice(0, 60), libelle: p.libelle.trim().slice(0, 60), regles: regles, marge: marge });
  }
  return { portees: portees };
}

async function reglesGardees() {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return /^regles\.\d+$/.test(k); });
  cles.sort(function (a, b) { return Number(a.slice(7)) - Number(b.slice(7)); });
  return { portees: cles.map(function (k) { return toutes[k]; }).filter(function (p) { return p && p.id; }), cles: cles, fichier: texte(toutes["regles-fichier"]) };
}

async function chargerRegles() {
  var x = tx();
  var f = await planche.fichiers.ouvrir([".json"]);
  if (!f) return;
  var r = lireRegles(f.texte);
  if (r.erreur) return alerte(x.reglesRefusees + r.erreur);
  var anciennes = await reglesGardees();
  for (var i = 0; i < r.portees.length; i++) {
    if (JSON.stringify(r.portees[i]).length > 3900) return alerte(x.reglesRefusees + x.erreurs.taille);
  }
  await planche.operation.ouvrir(x.reglesChargees.replace(/ : $|: $/, ""));
  try {
    for (var j = 0; j < r.portees.length; j++) await planche.donnees.ecrire("projet", "regles." + j, r.portees[j]);
    for (var k = r.portees.length; k < anciennes.cles.length; k++) await planche.donnees.effacer("projet", "regles." + k);
    await planche.donnees.ecrire("projet", "regles-fichier", texte(f.nom).slice(0, 80));
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  if (!r.portees.some(function (p) { return p.id === valeurs.portee; })) valeurs.portee = r.portees[0].id;
  return info(x.reglesChargees + r.portees.map(function (p) { return p.libelle; }).join(", "));
}

async function enregistrerModele() {
  var x = tx();
  var vide = function () { return { min: null, max: null, source: "", relu: false }; };
  var modele = {
    format: FORMAT_REGLES,
    portees: [{
      id: "portee-1",
      libelle: x.champs.portee + " 1",
      marge: 0,
      regles: {
        hauteurMarche: vide(), giron: vide(), blondel: { min: null, max: null, milieu: null, source: "", relu: false }, echappee: vide(), largeur: vide(), prolongementMainCourante: vide(),
        mainsCourantesDeuxCotes: { exige: null, source: "", relu: false }, nezContrastes: { exige: null, source: "", relu: false },
        contremarchesExtremes: { exige: null, source: "", relu: false }, bandeEveil: { exige: null, source: "", relu: false },
      },
    }],
  };
  if (await planche.fichiers.enregistrer(x.fichierModele, JSON.stringify(modele, null, 2) + "\n")) await info(x.modeleEnregistre);
}

/** État d'une valeur au regard d'une règle numérique : « dans », « limite », « hors » ; null sans règle. */
function juger(v, regle, marge) {
  if (!regle || typeof v !== "number" || !isFinite(v)) return null;
  if ((regle.min !== null && v < regle.min - EPS) || (regle.max !== null && v > regle.max + EPS)) return "hors";
  if (marge > 0 && ((regle.min !== null && v < regle.min + marge - EPS) || (regle.max !== null && v > regle.max - marge + EPS))) return "limite";
  return "dans";
}
/** Pire état d'une liste (null ignorés) ; null si aucun critère n'est évaluable. */
function pire(etats) {
  var l = etats.filter(function (e) { return e; });
  if (!l.length) return null;
  return l.indexOf("hors") >= 0 ? "hors" : l.indexOf("limite") >= 0 ? "limite" : "dans";
}
var libelleEtat = function (e, relu) {
  var x = tx();
  if (!e) return x.nonEvaluable;
  return x[e] + (relu === false ? " · " + x.aVerifier : "");
};
var tonEtat = function (e) { return e === "dans" ? "ok" : e === "limite" ? "limite" : e === "hors" ? "alerte" : ""; };

function porteeChoisie(regles) {
  return regles.portees.filter(function (p) { return p.id === valeurs.portee; })[0] || regles.portees[0] || null;
}

/** Évalue un escalier { h, g, largeur, echappee } sur une portée : par critère, et l'état d'ensemble. */
function evaluer(esc, portee) {
  var criteres = [];
  if (!portee) return { etat: null, relu: true, criteres: criteres };
  var r = portee.regles;
  var ajouter = function (cle, v) {
    var e = juger(v, r[cle], portee.marge);
    criteres.push({ cle: cle, valeur: v, etat: e, regle: r[cle] || null });
  };
  ajouter("hauteurMarche", esc.h);
  ajouter("giron", esc.g);
  ajouter("blondel", typeof esc.h === "number" && typeof esc.g === "number" ? 2 * esc.h + esc.g : null);
  ajouter("echappee", esc.echappee);
  ajouter("largeur", esc.largeur);
  var evalues = criteres.filter(function (c) { return c.etat; });
  return { etat: pire(evalues.map(function (c) { return c.etat; })), relu: evalues.every(function (c) { return c.regle.relu; }), criteres: criteres };
}

// ——————————————————————————————————————————————— Géométrie de l'escalier

/**
 * Marches d'un escalier : liste de { contour (points du plan), dessus (cote du dessus) }. La dernière hauteur arrive
 * sur le plancher haut : n hauteurs, n − 1 marches (le palier compte pour une marche).
 */
function marches(p) {
  var n = p.n;
  var h = p.H / n;
  var g = p.g;
  var w = p.w;
  var l = [];
  var rect = function (x0, y0, dx, dy, k) { l.push({ contour: [[x0, y0], [x0 + dx, y0], [x0 + dx, y0 + dy], [x0, y0 + dy]], dessus: (k + 1) * h }); };
  var nb = n - 1;
  if (p.type === "droit") {
    for (var k = 0; k < nb; k++) rect(k * g, 0, g, w, k);
    return l;
  }
  // Première volée : la moitié des marches avant le tournant (ou le palier).
  var m1 = Math.floor((nb - (p.type === "balance" ? 3 : 1)) / 2);
  var x = 0;
  for (var i = 0; i < m1; i++) { rect(x, 0, g, w, i); x += g; }
  var reste = nb - m1 - (p.type === "balance" ? 3 : 1);
  if (p.type === "palier") {
    rect(x, 0, w, w, m1);
    x += w;
    for (var j = 0; j < reste; j++) rect(x + j * g, 0, g, w, m1 + 1 + j);
  } else if (p.type === "l") {
    rect(x, 0, w, w, m1);
    for (var a = 0; a < reste; a++) rect(x, w + a * g, w, g, m1 + 1 + a);
  } else if (p.type === "u") {
    // Palier sur toute la largeur des deux volées, retour vers −x.
    rect(x, 0, w, 2 * w, m1);
    for (var b = 0; b < reste; b++) rect(x - (b + 1) * g, w, g, w, m1 + 1 + b);
  } else {
    // Balancé : trois marches en éventail autour de l'angle intérieur (x, w), sur le carré du tournant.
    var c = [x, w];
    l.push({ contour: [c, [x, 0], [x + (2 * w) / 3, 0]], dessus: (m1 + 1) * h });
    l.push({ contour: [c, [x + (2 * w) / 3, 0], [x + w, 0], [x + w, w / 3]], dessus: (m1 + 2) * h });
    l.push({ contour: [c, [x + w, w / 3], [x + w, w]], dessus: (m1 + 3) * h });
    for (var q = 0; q < reste; q++) rect(x, w + q * g, w, g, m1 + 3 + q);
  }
  return l;
}

/** Longueur au sol (encombrement en x et en y). */
function encombrement(l) {
  var xs = [];
  var ys = [];
  l.forEach(function (m) { m.contour.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
  return { x: Math.max.apply(null, xs) - Math.min.apply(null, xs), y: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
}

/** Prisme : contour au sol (z = z0) poussé de `hauteur`, groupé ; reconnaît le nouveau par ses identifiants. */
async function prisme(contour, origine, hauteur, nom) {
  var m0 = await planche.modele.lire();
  var avant = {};
  m0.faces.forEach(function (f) { avant[f.id] = true; });
  m0.aretes.forEach(function (e) { avant[e.id] = true; });
  var nouveau = function (x) { return !avant[x.id]; };
  for (var i = 0; i < contour.length; i++) {
    var a = contour[i];
    var b = contour[(i + 1) % contour.length];
    await planche.modele.ligne([origine[0] + a[0], origine[1] + a[1], origine[2]], [origine[0] + b[0], origine[1] + b[1], origine[2]]);
  }
  var m = await planche.modele.lire();
  var face = m.faces.filter(nouveau)[0];
  if (!face) throw new Error(tx().nombresInvalides);
  var nz = 0;
  for (var j = 0; j < face.points.length; j++) {
    var p = face.points[j];
    var q = face.points[(j + 1) % face.points.length];
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  await planche.modele.pousser(face.id, nz < 0 ? -hauteur : hauteur);
  var m2 = await planche.modele.lire();
  var ids = m2.faces.filter(nouveau).map(function (f) { return f.id; }).concat(m2.aretes.filter(nouveau).map(function (e) { return e.id; }));
  return planche.modele.grouper(ids, nom);
}

/** Dessine l'escalier `p` à `origine` ; rend le groupe. Appelé dans une opération ouverte. */
async function dessiner(p, origine) {
  var x = tx();
  var l = marches(p);
  var groupes = [];
  for (var i = 0; i < l.length; i++) groupes.push(await prisme(l[i].contour, origine, l[i].dessus, x.nomEscalier + " " + (i + 1)));
  var g = await planche.modele.grouper(groupes, x.nomEscalier + " " + x.types[p.type].toLowerCase() + " " + p.n + " × " + (Math.round((p.H / p.n) * 1000) / 10) + " cm");
  await planche.donnees.ecrire(g, "escalier", { type: p.type, H: p.H, n: p.n, g: p.g, w: p.w, portee: p.portee, origine: origine });
  return g;
}

function lireParametres() {
  var x = tx();
  var p = { type: TYPES.indexOf(valeurs.type) >= 0 ? valeurs.type : "droit", H: lireNombre(valeurs.hauteur), n: lireNombre(valeurs.nombre), g: lireNombre(valeurs.giron), w: lireNombre(valeurs.largeur), portee: valeurs.portee };
  if (!(p.H > 0) || !(p.n > 0) || !(p.g > 0) || !(p.w > 0)) return { erreur: x.nombresInvalides };
  if (p.n !== Math.floor(p.n) || p.n < 2 || p.n > MAX_MARCHES) return { erreur: x.tropDeMarches };
  if (p.type !== "droit" && p.n < 6) return { erreur: x.tropPeuPourType };
  return p;
}

async function xMax() {
  var m = await planche.modele.lire();
  var v = -Infinity;
  m.faces.forEach(function (f) { f.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (q) { if (q[0] > v) v = q[0]; }); });
  return v === -Infinity ? 0 : v;
}

async function generer() {
  var x = tx();
  var p = lireParametres();
  if (p.erreur) return alerte(p.erreur);
  var origine = [(await xMax()) + 2, 0, 0];
  await planche.operation.ouvrir(x.opGenerer);
  var g;
  try {
    g = await dessiner(p, origine);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  var sep = (await planche.unites.lire()).separateur;
  await planche.selection.definir([g]).catch(function () {});
  return info(x.genere + x.marches(p.n, cm(p.H / p.n, sep), cm(p.g, sep), cm((2 * p.H) / p.n + p.g, sep)));
}

// ——————————————————————————————————————————————— Escalier sélectionné

async function escalierChoisi() {
  var sel = await planche.selection.lire();
  var m = await planche.modele.lire();
  var objets = m.objets.filter(function (o) { return sel.indexOf(o.id) >= 0; });
  if (sel.length !== 1 || objets.length !== 1) return { erreur: tx().choisirEscalier };
  var d = await planche.donnees.lire(objets[0].id, "escalier");
  if (!d || TYPES.indexOf(d.type) < 0) return { erreur: tx().pasUnEscalier };
  return { id: objets[0].id, nom: objets[0].nom, p: d };
}

async function regenerer() {
  var x = tx();
  var e = await escalierChoisi();
  if (e.erreur) return alerte(e.erreur);
  var p = lireParametres();
  if (p.erreur) return alerte(p.erreur);
  var origine = Array.isArray(e.p.origine) && e.p.origine.length === 3 ? e.p.origine : [(await xMax()) + 2, 0, 0];
  var acces = await planche.donnees.lire(e.id, "accessibilite");
  await planche.operation.ouvrir(x.opRegenerer);
  var g;
  try {
    await planche.modele.effacer([e.id]);
    g = await dessiner(p, origine);
    if (acces) await planche.donnees.ecrire(g, "accessibilite", acces);
    await planche.operation.valider();
  } catch (err) {
    await planche.operation.abandonner();
    throw err;
  }
  await planche.selection.definir([g]).catch(function () {});
  var sep = (await planche.unites.lire()).separateur;
  return info(x.regenere + x.marches(p.n, cm(p.H / p.n, sep), cm(p.g, sep), cm((2 * p.H) / p.n + p.g, sep)));
}

/** Reprend dans le formulaire les paramètres de l'escalier sélectionné. */
function reprendre(p) {
  valeurs.type = p.type;
  valeurs.hauteur = String(p.H);
  valeurs.nombre = String(p.n);
  valeurs.giron = String(p.g);
  valeurs.largeur = String(p.w);
  if (p.portee) valeurs.portee = p.portee;
}

// ——————————————————————————————————————————————— Solutions dans la règle

function lireTremie() {
  var m = texte(valeurs.tremie).split(/[×x*]/i);
  if (m.length !== 2) return null;
  var l = lireNombre(m[0]);
  var w = lireNombre(m[1]);
  return l > 0 && w > 0 ? { l: l, w: w } : null;
}

/**
 * Solutions droites pour la hauteur et la trémie : pour chaque nombre de hauteurs n dont la hauteur de marche entre dans
 * la règle de la portée, giron = milieu du module de Blondel − 2h, échappée mesurée à l'aplomb du bord de la trémie sur
 * la ligne des nez : L × h / g − épaisseur du plancher haut. Classées par écart au milieu du module, hors règle à la fin.
 */
function solutions(H, tremie, e, portee) {
  var r = portee.regles;
  var hm = r.hauteurMarche;
  var milieu = r.blondel && r.blondel.milieu !== null ? r.blondel.milieu : null;
  if (!hm || milieu === null) return null;
  var hmin = hm.min !== null ? hm.min : null;
  var hmax = hm.max !== null ? hm.max : null;
  // Une marge d'un cran de part et d'autre montre aussi les solutions voisines, hors règle.
  var nmin = Math.max(2, hmax !== null ? Math.ceil(H / hmax - EPS) - 1 : 2);
  var nmax = Math.min(MAX_MARCHES, hmin !== null ? Math.floor(H / hmin + EPS) + 1 : nmin + 6);
  var l = [];
  for (var n = nmin; n <= nmax; n++) {
    var h = H / n;
    var g = Math.round((milieu - 2 * h) * 1000) / 1000;
    if (!(g > 0)) continue;
    var echappee = (tremie.l * h) / g - e;
    var ev = evaluer({ h: h, g: g, largeur: tremie.w, echappee: echappee }, portee);
    l.push({ n: n, h: h, g: g, blondel: 2 * h + g, echappee: echappee, etat: ev.etat, relu: ev.relu });
  }
  var rang = function (e) { return e === "dans" ? 0 : e === "limite" ? 1 : e === "hors" ? 2 : 3; };
  l.sort(function (a, b) { return rang(a.etat) - rang(b.etat) || Math.abs(a.blondel - milieu) - Math.abs(b.blondel - milieu) || a.n - b.n; });
  return l;
}

async function genererSolution(id) {
  var x = tx();
  var regles = await reglesGardees();
  var portee = porteeChoisie(regles);
  if (!portee) return alerte(x.chargerDabord);
  var tremie = lireTremie();
  if (!tremie) return alerte(x.tremieInvalide);
  var H = lireNombre(valeurs.hauteur);
  var e = lireNombre(valeurs.epaisseur);
  var l = solutions(H, tremie, e >= 0 ? e : 0, portee) || [];
  var s = l.filter(function (y) { return "n" + y.n === id; })[0];
  if (!s) return alerte(x.choisirLigne);
  valeurs.type = "droit";
  valeurs.nombre = String(s.n);
  valeurs.giron = String(s.g);
  valeurs.largeur = String(tremie.w);
  return generer();
}

// ——————————————————————————————————————————————— Accessibilité

async function declarerAccessibilite() {
  var x = tx();
  var e = await escalierChoisi();
  if (e.erreur) return alerte(e.erreur);
  var a = (await planche.donnees.lire(e.id, "accessibilite")) || {};
  var c = x.criteres;
  var r = await planche.saisie.demander(x.titreAccessibilite, [
    { id: "mainsCourantesDeuxCotes", libelle: c.mainsCourantesDeuxCotes, genre: "case", valeur: a.mainsCourantesDeuxCotes === true },
    { id: "prolongementMainCourante", libelle: x.prolongementDeclare, genre: "nombre", valeur: typeof a.prolongementMainCourante === "number" ? a.prolongementMainCourante : 0, min: 0, max: 5, unite: "m" },
    { id: "nezContrastes", libelle: c.nezContrastes, genre: "case", valeur: a.nezContrastes === true },
    { id: "contremarchesExtremes", libelle: c.contremarchesExtremes, genre: "case", valeur: a.contremarchesExtremes === true },
    { id: "bandeEveil", libelle: c.bandeEveil, genre: "case", valeur: a.bandeEveil === true },
  ]);
  if (!r) return;
  await planche.donnees.ecrire(e.id, "accessibilite", { mainsCourantesDeuxCotes: r.mainsCourantesDeuxCotes === true, prolongementMainCourante: r.prolongementMainCourante, nezContrastes: r.nezContrastes === true, contremarchesExtremes: r.contremarchesExtremes === true, bandeEveil: r.bandeEveil === true });
  return info(x.accessibiliteEnregistree);
}

// ——————————————————————————————————————————————— États des onglets

function champsGenerer(regles) {
  var x = tx();
  var c = x.champs;
  return [
    { id: "type", libelle: c.type, valeur: valeurs.type, choix: TYPES.map(function (t) { return { valeur: t, libelle: x.types[t] }; }) },
    { id: "hauteur", libelle: c.hauteur, valeur: valeurs.hauteur },
    { id: "nombre", libelle: c.nombre, valeur: valeurs.nombre },
    { id: "giron", libelle: c.giron, valeur: valeurs.giron },
    { id: "largeur", libelle: c.largeur, valeur: valeurs.largeur },
    champPortee(regles),
  ];
}
function champPortee(regles) {
  var x = tx();
  var choix = regles.portees.map(function (p) { return { valeur: p.id, libelle: p.libelle }; });
  if (!choix.length) choix = [{ valeur: "", libelle: x.aucunePortee }];
  var p = porteeChoisie(regles);
  return { id: "portee", libelle: x.champs.portee, valeur: p ? p.id : "", choix: choix };
}
var ligneRegles = function (regles) { var x = tx(); return regles.portees.length ? x.regles(regles.portees.length, regles.fichier) : x.sansRegles; };

async function etatGenerer(sep, regles) {
  var x = tx();
  var p = lireParametres();
  var resultats = [];
  var encart = ligneRegles(regles);
  if (p.erreur) encart = p.erreur;
  else {
    var h = p.H / p.n;
    var enc = encombrement(marches(p));
    resultats.push({ libelle: x.resume, valeur: x.marches(p.n, cm(h, sep), cm(p.g, sep), cm(2 * h + p.g, sep)) });
    resultats.push({ libelle: x.longueur, valeur: fixe(enc.x, 2, sep) + " × " + fixe(enc.y, 2, sep) + " m" });
    var ev = evaluer({ h: h, g: p.g, largeur: p.w, echappee: null }, porteeChoisie(regles));
    resultats.push({ libelle: x.resultat, valeur: libelleEtat(ev.etat, ev.relu), ton: tonEtat(ev.etat) });
  }
  return { formulaire: champsGenerer(regles), resultats: resultats, encart: encart };
}

async function etatSolutions(sep, regles) {
  var x = tx();
  var c = x.champs;
  var formulaire = [
    { id: "hauteur", libelle: c.hauteur, valeur: valeurs.hauteur },
    { id: "tremie", libelle: c.tremie, valeur: valeurs.tremie },
    { id: "epaisseur", libelle: c.epaisseur, valeur: valeurs.epaisseur },
    champPortee(regles),
  ];
  var portee = porteeChoisie(regles);
  var tremie = lireTremie();
  var H = lireNombre(valeurs.hauteur);
  var e = lireNombre(valeurs.epaisseur);
  if (!portee) return { formulaire: formulaire, vide: x.chargerDabord, colonnes: x.colSolutions, encart: x.sansRegles };
  if (!tremie || !(H > 0) || !(e >= 0)) return { formulaire: formulaire, vide: !tremie ? x.tremieInvalide : x.nombresInvalides, colonnes: x.colSolutions };
  var l = solutions(H, tremie, e, portee);
  if (!l) return { formulaire: formulaire, vide: x.criteres.hauteurMarche + " / " + x.criteres.blondel + " : " + x.nonEvaluable, colonnes: x.colSolutions, encart: ligneRegles(regles) };
  var lignes = l.map(function (s) {
    return { genre: s.etat === "hors" ? "hors" : "ligne", id: "n" + s.n, choisi: choisie === "n" + s.n, ton: tonEtat(s.etat), cellules: [String(s.n), cm(s.h, sep), cm(s.g, sep), cm(s.blondel, sep), fixe(s.echappee, 2, sep) + " m", libelleEtat(s.etat, s.relu)] };
  });
  return { formulaire: formulaire, colonnes: x.colSolutions, lignes: lignes, encart: blondelTexte(portee, sep) };
}
function blondelTexte(portee, sep) {
  var x = tx();
  var b = portee.regles.blondel;
  var t = b ? "Blondel " + (b.min !== null ? fixe(b.min, 2, sep) : "–") + (langue === "en" ? " to " : " à ") + (b.max !== null ? fixe(b.max, 2, sep) : "–") + " m" + (b.milieu !== null ? (langue === "en" ? ", middle " : ", milieu ") + fixe(b.milieu, 2, sep) + " m" : "") + ". " : "";
  return t + (langue === "en" ? "Each rule cites its source, « to check » until the text has been reread." : "Chaque règle cite sa source, « à vérifier » tant que le texte n'a pas été relu.");
}

/** Lignes de critères (Vérifier) : valeur, état, source. */
function lignesCriteres(ev, sep) {
  var x = tx();
  return ev.criteres.map(function (c) {
    var v = typeof c.valeur === "number" && isFinite(c.valeur) ? (c.cle === "blondel" || c.cle === "hauteurMarche" || c.cle === "giron" ? cm(c.valeur, sep) + " cm" : fixe(c.valeur, 2, sep) + " m") : "–";
    var etat = c.etat ? (c.etat === "hors" ? x.nonConforme : c.etat === "limite" ? x.limite : x.conforme) + (c.regle.relu ? "" : " · " + x.aVerifier) : x.nonEvaluable;
    return { genre: c.etat === "hors" ? "hors" : "ligne", ton: tonEtat(c.etat), cellules: [x.criteres[c.cle], v, etat, c.regle ? c.regle.source : "–"] };
  });
}

async function etatVerifier(sep, regles) {
  var x = tx();
  var c = x.champs;
  var e = await escalierChoisi();
  var resultats = [];
  // Un escalier généré sélectionné prête ses valeurs aux champs vides.
  if (!e.erreur) {
    var h0 = e.p.H / e.p.n;
    if (!texte(valeurs.vh).trim()) valeurs.vh = fixe(h0, 3, sep);
    if (!texte(valeurs.vg).trim()) valeurs.vg = fixe(e.p.g, 3, sep);
    if (!texte(valeurs.vl).trim()) valeurs.vl = fixe(e.p.w, 3, sep);
    resultats.push({ libelle: x.resume, valeur: e.nom });
  }
  var formulaire = [
    { id: "vh", libelle: c.vh, valeur: valeurs.vh },
    { id: "vg", libelle: c.vg, valeur: valeurs.vg },
    { id: "vl", libelle: c.vl, valeur: valeurs.vl },
    { id: "ve", libelle: c.ve, valeur: valeurs.ve },
    champPortee(regles),
  ];
  var nb = function (s) { var v = lireNombre(s); return v > 0 ? v : null; };
  var esc = { h: nb(valeurs.vh), g: nb(valeurs.vg), largeur: nb(valeurs.vl), echappee: nb(valeurs.ve) };
  if (esc.h === null && esc.g === null && esc.largeur === null && esc.echappee === null) return { formulaire: formulaire, resultats: resultats, vide: x.pasDeValeur, colonnes: x.colVerifier, encart: ligneRegles(regles) };
  var portee = porteeChoisie(regles);
  var ev = evaluer(esc, portee);
  resultats.push({ libelle: x.resultat, valeur: ev.etat ? (ev.etat === "hors" ? x.nonConforme : ev.etat === "limite" ? x.limite : x.conforme) + (ev.relu ? "" : " · " + x.aVerifier) : x.nonEvaluable, ton: tonEtat(ev.etat) });
  return { formulaire: formulaire, resultats: resultats, colonnes: x.colVerifier, lignes: portee ? lignesCriteres(ev, sep) : [], encart: ligneRegles(regles) };
}

async function etatAccessibilite(sep, regles) {
  var x = tx();
  var e = await escalierChoisi();
  var formulaire = [champPortee(regles)];
  if (e.erreur) return { formulaire: formulaire, vide: e.erreur, colonnes: x.colAccessibilite, encart: ligneRegles(regles) };
  var a = await planche.donnees.lire(e.id, "accessibilite");
  var portee = porteeChoisie(regles);
  var r = portee ? portee.regles : {};
  var lignes = [];
  var etats = [];
  var relu = true;
  EXIGENCES.concat(["prolongementMainCourante"]).forEach(function (k) {
    var regle = r[k] || null;
    var declare = a ? a[k] : undefined;
    var etat = null;
    var affiche = "–";
    if (k === "prolongementMainCourante") {
      if (typeof declare === "number") affiche = fixe(declare, 2, sep) + " m";
      etat = a ? juger(typeof declare === "number" ? declare : 0, regle, portee ? portee.marge : 0) : null;
    } else {
      if (typeof declare === "boolean") affiche = declare ? x.oui : x.non;
      if (regle && a) etat = !regle.exige || declare === true ? "dans" : "hors";
    }
    if (etat) { etats.push(etat); if (!regle.relu) relu = false; }
    lignes.push({ genre: etat === "hors" ? "hors" : "ligne", ton: tonEtat(etat), cellules: [x.criteres[k], affiche, etat ? (etat === "hors" ? x.nonConforme : etat === "limite" ? x.limite : x.conforme) + (regle.relu ? "" : " · " + x.aVerifier) : x.nonEvaluable, regle ? regle.source : "–"] });
  });
  var ens = pire(etats);
  return {
    formulaire: formulaire,
    resultats: [{ libelle: x.resume, valeur: e.nom }, { libelle: x.resultat, valeur: ens ? (ens === "hors" ? x.nonConforme : x.conforme) + (relu ? "" : " · " + x.aVerifier) : x.nonEvaluable, ton: tonEtat(ens) }],
    colonnes: x.colAccessibilite,
    lignes: lignes,
    encart: ligneRegles(regles),
  };
}

async function etatRouvrir(sep, regles) {
  var x = tx();
  var e = await escalierChoisi();
  if (e.erreur) return { formulaire: [], vide: e.erreur, colonnes: [] };
  if (choisie !== e.id) {
    // Nouvel escalier sélectionné : ses paramètres reviennent dans le formulaire.
    reprendre(e.p);
    choisie = e.id;
  }
  var r = await etatGenerer(sep, regles);
  r.resultats.unshift({ libelle: x.resume, valeur: e.nom });
  return r;
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var regles = await reglesGardees();
  var e;
  if (onglet === "solutions") e = await etatSolutions(sep, regles);
  else if (onglet === "verifier") e = await etatVerifier(sep, regles);
  else if (onglet === "accessibilite") e = await etatAccessibilite(sep, regles);
  else if (onglet === "rouvrir") e = await etatRouvrir(sep, regles);
  else e = await etatGenerer(sep, regles);
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
    choisie: onglet === "solutions" ? choisie : null,
    page: page,
    pages: pages,
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
      if (onglet === "verifier") { valeurs.vh = ""; valeurs.vg = ""; valeurs.vl = ""; }
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
action("generer-escalier", generer);
action("generer-solution", function (d) { return genererSolution(typeof d.id === "string" ? d.id : choisie); });
action("charger-regles", chargerRegles);
action("modele-regles", enregistrerModele);
action("verifier-selection", function () { valeurs.vh = ""; valeurs.vg = ""; valeurs.vl = ""; valeurs.ve = ""; });
action("declarer-accessibilite", declarerAccessibilite);
action("regenerer-escalier", regenerer);

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
commande("ouvrir-panneau", "generer", null);
commande("generer-escalier", "generer", generer);
commande("solutions", "solutions", null);
commande("verifier-escalier", "verifier", function () { valeurs.vh = ""; valeurs.vg = ""; valeurs.vl = ""; valeurs.ve = ""; });
commande("accessibilite", "accessibilite", declarerAccessibilite);
commande("rouvrir-escalier", "rouvrir", function () { choisie = null; });
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
