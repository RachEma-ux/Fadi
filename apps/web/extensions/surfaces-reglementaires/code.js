// Extension « Surfaces réglementaires » (catalogue des extensions de la Planche, cas 3 de la feuille de route, lot 3 ;
// protocole 1.4). Quatre onglets de calcul et un onglet de règles :
//   Par niveau (n° 1, D9-F15e-001 ; n° 18, D9-F10-017) · Emprise au sol (n° 3, D9-F15e-005) ·
//   Programme (n° 22, D9-F10-022) · PPRI (n° 21, D9-F15e-070) · Règles.
//
// Les surfaces sont mesurées sur la géométrie : coupe horizontale des solides au-dessus de chaque niveau d'étage,
// projection au sol. Aucune règle n'est écrite ici. La hauteur de coupe, les balises déduites et l'abattement viennent
// d'une table de règles chargée par l'utilisateur, sourcée et datée ; sans règle, la valeur réglementaire est
// « non évaluée » et seule la mesure est donnée. La cote de référence du PPRI est saisie avec sa source.

var VERSION = "1.0.0";
var PANNEAU = "surfaces";
var ONGLETS = ["niveaux", "emprise", "programme", "ppri", "regles"];
var FORMAT_REGLES = "fadi-regles-surfaces/1";
var REGLES = ["sdp", "emprise", "ppri"];
var MAX_JEUX = 10;
var MAX_EXCLUSIONS = 30;
var MAX_PROGRAMME = 200;
var LIGNES_PAR_PAGE = 80;

var onglet = "niveaux";
var page = 0;
var langue = "fr";
var valeurs = { jeu: "", hauteur: "", terrain: "", cote: "", source: "", plancher: "" };

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: { jeu: "Jeu de règles", hauteur: "Coupe au-dessus du niveau (m)", terrain: "Surface du terrain (m²)", cote: "Cote de référence PPRI (m NGF)", source: "Source de la cote", plancher: "Premier plancher" },
    aucunJeu: "aucune table chargée",
    aucunNiveau: "aucun niveau",
    jeuLibelle: function (j) { return j.libelle + " (v" + j.version + ", " + j.date + ")"; },
    col: {
      niveaux: ["Niveau", "Surface coupée", "Déductions", "Surface de plancher"],
      emprise: ["Balise", "Projection", "Compté"],
      programme: ["Niveau", "Programme", "Projet", "Écart"],
      ppri: [],
      regles: ["Jeu de règles", "Version", "Date", "Relu"],
    },
    total: "Total",
    nonEvaluee: "non évaluée", nonEvalue: "non évalué", nonRenseignee: "non renseignée",
    conforme: "conforme", insuffisant: function (v) { return "insuffisant (−" + v + ")"; },
    oui: "oui", non: "non", sansBalise: "sans balise",
    aVerifier: "à vérifier",
    encart: "Surfaces mesurées par coupe des volumes, sans double compte. Hauteur de coupe, déductions et abattement viennent de la table citée ; aucune valeur n'est inventée.",
    sansTable: "Aucune table de règles : seules les mesures sont données, la surface de plancher et l'emprise réglementaire sont non évaluées. Chargez une table sourcée et datée (onglet Règles).",
    note: {
      niveaux: "Chaque niveau d'étage est coupé à la hauteur indiquée au-dessus de son altitude ; seuls les volumes fermés (solides) comptent. Les balises déduites viennent de la table.",
      emprise: "Projection au sol de tous les volumes fermés ; les balises écartées viennent de la table (par exemple les débords sans appui).",
      programme: "Programme chargé d'un fichier CSV « niveau ; surface » ; le projet est comparé niveau par niveau, par le nom du niveau.",
      ppri: "L'altitude NGF du premier plancher vient du ±0,00 de la planche (Info planche) et de l'altitude du niveau. La zone refuge est mesurée sur la sélection (projection au sol).",
      regles: "Table « " + FORMAT_REGLES + " » : un ou plusieurs jeux, chaque règle avec sa source ; une règle non relue est « à vérifier ».",
    },
    vides: {
      niveaux: "Aucun niveau d'étage : créez les niveaux (panneau Niveaux), puis revenez ici.",
      emprise: "Aucun volume fermé dans le dessin : rien à projeter.",
      programme: "Aucun programme chargé : « Charger le programme (.csv) ».",
      regles: "Aucune table de règles chargée.",
    },
    res: {
      coupee: "Surface coupée (mesure)", deductions: "Déductions (balises de la table)", abattement: "Abattement", sdp: "Surface de plancher",
      projetee: "Emprise projetée (mesure)", empriseReg: "Emprise au sol", ces: "Emprise / terrain",
      ecartes: "Objets non comptés (pas des volumes fermés)", libres: "Faces hors de tout groupe (non comptées)",
      ngf0: "Altitude NGF du ±0,00", ngfPlancher: "Altitude NGF du premier plancher", cote: "Cote de référence PPRI", verdict: "Premier plancher",
      refuge: "Zone refuge (sélection mesurée)", refugeMin: "Zone refuge exigée", refugeVerdict: "Zone refuge",
      totalProgramme: "Total programme", totalProjet: "Total projet",
    },
    projetSelon: function (sdp) { return sdp ? "Projet = surface de plancher" : "Projet = surface coupée (pas de règle de surface de plancher)"; },
    programmeCharge: function (n) { return "Programme chargé : " + n + (n > 1 ? " lignes." : " ligne."); },
    programmeRefuse: "Programme refusé : ",
    reglesChargees: function (n) { return "Table chargée : " + n + (n > 1 ? " jeux de règles." : " jeu de règles."); },
    reglesRefusees: "Table refusée : ",
    archiveRefusee: "Chargement refusé : le fichier n'a pas pu être archivé en base (",
    motifsArchive: { indisponible: "archivage indisponible dans cette Planche", impossible: "archivage impossible", reseau: "réseau indisponible", connexion: "connexion requise", extension_inconnue: "extension non installée pour ce compte", trop_lourd: "fichier trop lourd", serveur: "refus du serveur", illisible: "réponse du serveur illisible" },
    modeleEnregistre: "Modèle de table enregistré : remplissez-le, citez chaque source, puis chargez-le.",
    fichierModele: "modele-regles-surfaces.json",
    selectionVide: "Sélectionnez les volumes de la zone refuge, puis mesurez.",
    refugeMesuree: "Zone refuge mesurée.",
    coteEnregistree: "Cote de référence enregistrée avec sa source.",
    coteIncomplete: "Saisissez la cote (m NGF) et sa source.",
    erreurs: {
      json: "le fichier n'est pas un JSON lisible",
      format: "le format doit être « " + FORMAT_REGLES + " »",
      jeux: "la table doit contenir de 1 à " + MAX_JEUX + " jeux de règles",
      jeu: function (i) { return "jeu " + (i + 1) + " : identifiant, libellé, version et date (AAAA-MM-JJ) sont attendus"; },
      regle: function (j, k) { return "jeu « " + j + " », règle « " + k + " » : valeur ou source manquante"; },
      inconnue: function (j, k) { return "jeu « " + j + " » : règle inconnue « " + k + " »"; },
      csv: "chaque ligne doit être « niveau ; surface » (surface positive, en m²)",
      csvVide: "aucune ligne lisible",
      csvTrop: "plus de " + MAX_PROGRAMME + " lignes",
    },
    op: { regles: "Table des règles de surface", programme: "Programme de surfaces", ppri: "Cote de référence PPRI", refuge: "Mesurer la zone refuge" },
  },
  en: {
    champs: { jeu: "Rule set", hauteur: "Cut above the storey (m)", terrain: "Plot area (m²)", cote: "Flood plan reference level (m NGF)", source: "Source of the level", plancher: "First floor" },
    aucunJeu: "no table loaded",
    aucunNiveau: "no storey",
    jeuLibelle: function (j) { return j.libelle + " (v" + j.version + ", " + j.date + ")"; },
    col: {
      niveaux: ["Storey", "Cut area", "Deductions", "Floor area"],
      emprise: ["Tag", "Projection", "Counted"],
      programme: ["Storey", "Brief", "Project", "Difference"],
      ppri: [],
      regles: ["Rule set", "Version", "Date", "Reviewed"],
    },
    total: "Total",
    nonEvaluee: "not assessed", nonEvalue: "not assessed", nonRenseignee: "not entered",
    conforme: "compliant", insuffisant: function (v) { return "insufficient (−" + v + ")"; },
    oui: "yes", non: "no", sansBalise: "no tag",
    aVerifier: "to be checked",
    encart: "Areas measured by cutting the volumes, never counted twice. Cut height, deductions and allowance come from the cited table; no value is made up.",
    sansTable: "No rules table: only measurements are given, the regulatory floor area and footprint are not assessed. Load a sourced and dated table (Rules tab).",
    note: {
      niveaux: "Each storey is cut at the given height above its level; only closed volumes (solids) count. Deducted tags come from the table.",
      emprise: "Projection onto the ground of all closed volumes; excluded tags come from the table (for example unsupported overhangs).",
      programme: "Brief loaded from a CSV file “storey ; area”; the project is compared storey by storey, by the storey name.",
      ppri: "The NGF level of the first floor comes from the plan's ±0.00 (Plan info) and the storey level. The refuge area is measured on the selection (ground projection).",
      regles: "Table “" + FORMAT_REGLES + "”: one or more rule sets, each rule with its source; a rule not reviewed is “to be checked”.",
    },
    vides: {
      niveaux: "No storeys: create the storeys (Storeys panel), then come back here.",
      emprise: "No closed volume in the drawing: nothing to project.",
      programme: "No brief loaded: “Load the brief (.csv)”.",
      regles: "No rules table loaded.",
    },
    res: {
      coupee: "Cut area (measured)", deductions: "Deductions (table tags)", abattement: "Allowance", sdp: "Floor area",
      projetee: "Projected footprint (measured)", empriseReg: "Building footprint", ces: "Footprint / plot",
      ecartes: "Objects not counted (not closed volumes)", libres: "Faces outside any group (not counted)",
      ngf0: "NGF level of ±0.00", ngfPlancher: "NGF level of the first floor", cote: "Flood plan reference level", verdict: "First floor",
      refuge: "Refuge area (measured selection)", refugeMin: "Required refuge area", refugeVerdict: "Refuge area",
      totalProgramme: "Brief total", totalProjet: "Project total",
    },
    projetSelon: function (sdp) { return sdp ? "Project = floor area" : "Project = cut area (no floor area rule)"; },
    programmeCharge: function (n) { return "Brief loaded: " + n + (n > 1 ? " lines." : " line."); },
    programmeRefuse: "Brief refused: ",
    reglesChargees: function (n) { return "Table loaded: " + n + (n > 1 ? " rule sets." : " rule set."); },
    reglesRefusees: "Table refused: ",
    archiveRefusee: "Loading refused: the file could not be archived in the database (",
    motifsArchive: { indisponible: "archiving unavailable in this Planche", impossible: "archiving failed", reseau: "network unavailable", connexion: "sign-in required", extension_inconnue: "extension not installed for this account", trop_lourd: "file too large", serveur: "refused by the server", illisible: "unreadable server response" },
    modeleEnregistre: "Table template saved: fill it in, cite each source, then load it.",
    fichierModele: "modele-regles-surfaces.json",
    selectionVide: "Select the volumes of the refuge area, then measure.",
    refugeMesuree: "Refuge area measured.",
    coteEnregistree: "Reference level saved with its source.",
    coteIncomplete: "Enter the level (m NGF) and its source.",
    erreurs: {
      json: "the file is not readable JSON",
      format: "the format must be “" + FORMAT_REGLES + "”",
      jeux: "the table must contain 1 to " + MAX_JEUX + " rule sets",
      jeu: function (i) { return "set " + (i + 1) + ": identifier, label, version and date (YYYY-MM-DD) are expected"; },
      regle: function (j, k) { return "set “" + j + "”, rule “" + k + "”: value or source missing"; },
      inconnue: function (j, k) { return "set “" + j + "”: unknown rule “" + k + "”"; },
      csv: "each line must be “storey ; area” (positive area, in m²)",
      csvVide: "no readable line",
      csvTrop: "more than " + MAX_PROGRAMME + " lines",
    },
    op: { regles: "Floor area rules table", programme: "Area brief", ppri: "Flood plan reference level", refuge: "Measure the refuge area" },
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
var m2 = function (v, sep) { return fixe(v, 2, sep) + " m²"; };
var aujourdhui = function () { return new Date().toISOString().slice(0, 10); };
var positif = function (v) { return typeof v === "number" && isFinite(v) && v > 0; };
var altitudeTexte = function (v, sep) { return (Math.abs(v) < 0.005 ? "±" : v > 0 ? "+" : "−") + fixe(Math.abs(v), 2, sep); };

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

// ——————————————————————————————————————————————— Table des règles (sourcée, datée, gardée avec le dessin)

/** Balises citées par une règle : nom (tel qu'il est dans le dessin) et motif de l'exclusion. */
function lireExclusions(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_EXCLUSIONS) return null;
  var l = [];
  for (var i = 0; i < v.length; i++) {
    var e = v[i];
    if (!e || typeof e.balise !== "string" || !e.balise.trim()) return null;
    l.push({ balise: e.balise.trim().slice(0, 80), motif: texte(e.motif).trim().slice(0, 120) });
  }
  return l;
}
function lireRegle(k, v) {
  if (!v || typeof v.source !== "string" || !v.source.trim()) return null;
  var base = { source: v.source.trim().slice(0, 160), relu: v.relu === true };
  if (k === "sdp") {
    var ex = lireExclusions(v.exclusions);
    if (!positif(v.hauteurCoupe) || !ex) return null;
    var ab = v.abattement;
    if (ab !== undefined && ab !== null && !(typeof ab === "number" && ab >= 0 && ab < 1)) return null;
    return Object.assign(base, { hauteurCoupe: v.hauteurCoupe, exclusions: ex, abattement: typeof ab === "number" ? ab : null });
  }
  if (k === "emprise") {
    var ex2 = lireExclusions(v.exclusions);
    return ex2 ? Object.assign(base, { exclusions: ex2 }) : null;
  }
  if (k === "ppri") return positif(v.zoneRefugeMin) ? Object.assign(base, { zoneRefugeMin: v.zoneRefugeMin }) : null;
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

async function donneesProjet() { return (await planche.donnees.lire("projet")) || {}; }
async function jeuxGardes() {
  var toutes = await donneesProjet();
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

/** Ouvre un fichier archivé en base (protocole 1.2) ; sans archive, il n'est pas chargé. */
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

async function chargerRegles() {
  var x = tx();
  var f = await ouvrirArchive([".json"]);
  if (!f) return;
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
  var modele = {
    format: FORMAT_REGLES,
    jeux: [{
      id: "jeu-1", libelle: "", version: "1", date: aujourdhui(),
      regles: {
        sdp: { hauteurCoupe: null, exclusions: [{ balise: "", motif: "" }], abattement: null, source: "", relu: false },
        emprise: { exclusions: [{ balise: "", motif: "" }], source: "", relu: false },
        ppri: { zoneRefugeMin: null, source: "", relu: false },
      },
    }],
  };
  if (await planche.fichiers.enregistrer(x.fichierModele, JSON.stringify(modele, null, 2) + "\n")) await info(x.modeleEnregistre);
}

// ——————————————————————————————————————————————— Programme (CSV « niveau ; surface »)

function lireProgramme(brut) {
  var e = tx().erreurs;
  var lignes = texte(brut).replace(/^﻿/, "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });
  var sortie = [];
  for (var i = 0; i < lignes.length; i++) {
    var c = lignes[i].split(";").map(function (s) { return s.trim(); });
    var v = lireNombre(c[1]);
    // Une première ligne d'en-tête (surface non numérique) est passée.
    if (i === 0 && c.length >= 2 && isNaN(v)) continue;
    if (c.length < 2 || !c[0] || !(v > 0)) return { erreur: e.csv + " (" + (i + 1) + ")" };
    sortie.push({ niveau: c[0].slice(0, 60), surface: v });
  }
  if (!sortie.length) return { erreur: e.csvVide };
  if (sortie.length > MAX_PROGRAMME) return { erreur: e.csvTrop };
  return { lignes: sortie };
}
async function chargerProgramme() {
  var x = tx();
  var f = await ouvrirArchive([".csv"]);
  if (!f) return;
  var r = lireProgramme(f.texte);
  if (r.erreur) return alerte(x.programmeRefuse + r.erreur);
  await enUnPas(x.op.programme, function () {
    return planche.donnees.ecrire("projet", "programme", { lignes: r.lignes, archive: { id: f.archive.id, empreinte: f.archive.empreinte, nom: String(f.nom || "").slice(0, 80) } });
  });
  return info(x.programmeCharge(r.lignes.length));
}

// ——————————————————————————————————————————————— Mesures

async function nomsBalises() {
  var n = {};
  (await planche.balises.lire()).forEach(function (b) { n[b.id] = b.nom; });
  return n;
}
/** Balises du dessin citées par une règle (par nom, sans tenir compte de la casse) : leurs identifiants. */
function balisesCitees(exclusions, noms) {
  var cites = {};
  (exclusions || []).forEach(function (e) { cites[e.balise.toLowerCase()] = true; });
  return Object.keys(noms).filter(function (id) { return cites[noms[id].toLowerCase()] === true; });
}
/** Détail par balise (aire propre de chaque solide) d'une coupe ou d'une projection. */
function parBalise(lu, exclues, noms) {
  var l = {};
  lu.solides.forEach(function (s) {
    var nom = s.balise ? noms[s.balise] || "" : "";
    l[nom] = l[nom] || { nom: nom, aire: 0, exclu: !!s.balise && exclues.indexOf(s.balise) >= 0 };
    l[nom].aire += s.aire;
  });
  return l;
}

/**
 * Surfaces par niveau : coupe de chaque niveau à sa hauteur. Avec la règle, les volumes des balises citées sont écartés
 * par une seconde coupe (union des seuls volumes comptés, sans double compte), puis l'abattement est appliqué.
 */
async function surfacesParNiveau(jeu) {
  var regle = jeu && jeu.regles.sdp;
  var h = lireNombre(valeurs.hauteur);
  if (!(h > 0) && regle) h = regle.hauteurCoupe;
  var lus = await planche.niveaux.lire();
  var exclues = regle ? balisesCitees(regle.exclusions, await nomsBalises()) : [];
  var lignes = [];
  var ecartes = {};
  var libres = 0;
  for (var i = 0; i < lus.niveaux.length; i++) {
    var n = lus.niveaux[i];
    if (!(h > 0)) { lignes.push({ niveau: n, coupee: null, deduit: null, sdp: null }); continue; }
    var c = await planche.geometrie.coupe(n.altitude + h);
    c.ecartes.forEach(function (e) { ecartes[e.id] = true; });
    libres = c.facesLibres;
    var apres = regle ? (exclues.length ? (await planche.geometrie.coupe(n.altitude + h, null, exclues)).aire : c.aire) : null;
    var sdp = apres === null ? null : apres * (1 - (regle.abattement || 0));
    lignes.push({ niveau: n, coupee: c.aire, deduit: apres === null ? null : c.aire - apres, sdp: sdp });
  }
  return { hauteur: h > 0 ? h : null, lignes: lignes, regle: regle || null, ecartes: Object.keys(ecartes).length, libres: libres };
}

async function emprise(jeu) {
  var regle = jeu && jeu.regles.emprise;
  var noms = await nomsBalises();
  var exclues = regle ? balisesCitees(regle.exclusions, noms) : [];
  var p = await planche.geometrie.projection();
  // L'emprise réglementaire est la projection des seuls volumes comptés (union, sans double compte).
  var empriseReg = regle ? (exclues.length ? (await planche.geometrie.projection(null, exclues)).aire : p.aire) : null;
  return { projetee: p.aire, parBalise: parBalise(p, exclues, noms), empriseReg: empriseReg, regle: regle || null, ecartes: p.ecartes.length, libres: p.facesLibres, solides: p.solides.length };
}

// ——————————————————————————————————————————————— PPRI

async function retenirCote() {
  var x = tx();
  var v = lireNombre(valeurs.cote);
  if (isNaN(v) || !valeurs.source.trim()) return alerte(x.coteIncomplete);
  // La zone refuge déjà mesurée est gardée : seuls les champs de la cote changent.
  var g = (await donneesProjet()).ppri || {};
  await enUnPas(x.op.ppri, function () { return planche.donnees.ecrire("projet", "ppri", Object.assign({}, g, { cote: v, source: valeurs.source.trim().slice(0, 160), plancher: valeurs.plancher })); });
  return info(x.coteEnregistree);
}
async function mesurerRefuge() {
  var x = tx();
  var sel = await planche.selection.lire();
  if (!sel.length) return alerte(x.selectionVide);
  var p = await planche.geometrie.projection(sel);
  if (!p.solides.length) return alerte(x.selectionVide);
  var g = (await donneesProjet()).ppri || {};
  await enUnPas(x.op.refuge, function () { return planche.donnees.ecrire("projet", "ppri", Object.assign({}, g, { refuge: p.aire, refugeObjets: sel.slice(0, 50) })); });
  return info(x.refugeMesuree);
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var c = await jeuChoisi();
  var formulaire = [{ id: "jeu", libelle: x.champs.jeu, valeur: valeurs.jeu, choix: c.jeux.length ? c.jeux.map(function (j) { return { valeur: j.id, libelle: x.jeuLibelle(j) }; }) : [{ valeur: "", libelle: x.aucunJeu }] }];
  var e = { lignes: [], vide: null, resultats: [], pied: null };
  var regleSdp = c.jeu && c.jeu.regles.sdp;
  if (onglet === "niveaux") {
    formulaire.push({ id: "hauteur", libelle: x.champs.hauteur, valeur: valeurs.hauteur || (regleSdp ? fixe(regleSdp.hauteurCoupe, 2, sep) : "") });
    var s = await surfacesParNiveau(c.jeu);
    var tot = { coupee: 0, deduit: 0, sdp: 0 };
    e.lignes = s.lignes.map(function (l) {
      var nom = l.niveau.nom + " (" + altitudeTexte(l.niveau.altitude, sep) + ")";
      if (l.coupee === null) return { genre: "ligne", ton: "gris", cellules: [nom, x.nonEvaluee, x.nonEvaluee, x.nonEvaluee] };
      tot.coupee += l.coupee;
      if (l.deduit !== null) tot.deduit += l.deduit;
      if (l.sdp !== null) tot.sdp += l.sdp;
      return { genre: "ligne", ton: l.sdp === null ? "gris" : "", cellules: [nom, m2(l.coupee, sep), l.deduit === null ? x.nonEvaluee : m2(l.deduit, sep), l.sdp === null ? x.nonEvaluee : m2(l.sdp, sep)] };
    });
    if (s.lignes.length && s.hauteur !== null) e.pied = [x.total, m2(tot.coupee, sep), regleSdp ? m2(tot.deduit, sep) : "–", regleSdp ? m2(tot.sdp, sep) : x.nonEvaluee];
    if (regleSdp && regleSdp.abattement) e.resultats.push({ libelle: x.res.abattement, valeur: fixe(regleSdp.abattement * 100, 1, sep) + " %" });
    if (s.ecartes) e.resultats.push({ libelle: x.res.ecartes, valeur: String(s.ecartes), ton: "limite" });
    if (s.libres) e.resultats.push({ libelle: x.res.libres, valeur: String(s.libres), ton: "limite" });
    e.vide = s.lignes.length ? null : x.vides.niveaux;
  } else if (onglet === "emprise") {
    formulaire.push({ id: "terrain", libelle: x.champs.terrain, valeur: valeurs.terrain });
    var em = await emprise(c.jeu);
    e.lignes = Object.keys(em.parBalise).sort().map(function (k) {
      var b = em.parBalise[k];
      return { genre: "ligne", ton: b.exclu ? "gris" : "", cellules: [b.nom || x.sansBalise, m2(b.aire, sep), em.regle ? (b.exclu ? x.non : x.oui) : "–"] };
    });
    e.resultats.push({ libelle: x.res.projetee, valeur: m2(em.projetee, sep) });
    e.resultats.push({ libelle: x.res.empriseReg, valeur: em.empriseReg === null ? x.nonEvaluee : m2(em.empriseReg, sep), ton: em.empriseReg === null ? "" : "ok" });
    var terrain = lireNombre(valeurs.terrain);
    if (em.empriseReg !== null && terrain > 0) e.resultats.push({ libelle: x.res.ces, valeur: fixe((em.empriseReg / terrain) * 100, 1, sep) + " %" });
    if (em.ecartes) e.resultats.push({ libelle: x.res.ecartes, valeur: String(em.ecartes), ton: "limite" });
    if (em.libres) e.resultats.push({ libelle: x.res.libres, valeur: String(em.libres), ton: "limite" });
    e.vide = em.solides ? null : x.vides.emprise;
  } else if (onglet === "programme") {
    var prog = (await donneesProjet()).programme;
    if (prog && prog.lignes) {
      var sn = await surfacesParNiveau(c.jeu);
      var parNom = {};
      sn.lignes.forEach(function (l) { parNom[l.niveau.nom.toLowerCase()] = l; });
      var tp = 0, tj = 0;
      e.lignes = prog.lignes.map(function (p) {
        var l = parNom[p.niveau.toLowerCase()];
        var v = l ? (l.sdp !== null ? l.sdp : l.coupee) : null;
        tp += p.surface;
        if (v !== null) tj += v;
        if (v === null) return { genre: "ligne", ton: "gris", cellules: [p.niveau, m2(p.surface, sep), x.nonEvalue, "–"] };
        var ecart = v - p.surface;
        return { genre: "ligne", ton: ecart < -0.005 ? "alerte" : "ok", cellules: [p.niveau, m2(p.surface, sep), m2(v, sep), (ecart >= 0 ? "+" : "−") + m2(Math.abs(ecart), sep)] };
      });
      e.pied = [x.total, m2(tp, sep), m2(tj, sep), (tj - tp >= 0 ? "+" : "−") + m2(Math.abs(tj - tp), sep)];
      e.resultats.push({ libelle: x.projetSelon(!!regleSdp), valeur: "" });
    } else e.vide = x.vides.programme;
  } else if (onglet === "ppri") {
    var lusN = await planche.niveaux.lire();
    var g = (await donneesProjet()).ppri || {};
    if (!valeurs.cote && typeof g.cote === "number") valeurs.cote = fixe(g.cote, 2, sep);
    if (!valeurs.source && g.source) valeurs.source = g.source;
    if (!valeurs.plancher) valeurs.plancher = g.plancher || (lusN.niveaux.length ? lusN.niveaux[lusN.niveaux.length - 1].id : "");
    formulaire.push({ id: "cote", libelle: x.champs.cote, valeur: valeurs.cote });
    formulaire.push({ id: "source", libelle: x.champs.source, valeur: valeurs.source });
    formulaire.push({ id: "plancher", libelle: x.champs.plancher, valeur: valeurs.plancher, choix: lusN.niveaux.length ? lusN.niveaux.map(function (n) { return { valeur: n.id, libelle: n.nom + " (" + altitudeTexte(n.altitude, sep) + ")" }; }) : [{ valeur: "", libelle: x.aucunNiveau }] });
    var niv = lusN.niveaux.filter(function (n) { return n.id === valeurs.plancher; })[0] || null;
    var ref = lusN.referenceNGF;
    var ngf = ref !== null && niv ? ref + niv.altitude : null;
    var cote = lireNombre(valeurs.cote);
    e.resultats.push({ libelle: x.res.ngf0, valeur: ref === null ? x.nonRenseignee : fixe(ref, 2, sep) + " m NGF" });
    e.resultats.push({ libelle: x.res.ngfPlancher, valeur: ngf === null ? x.nonEvaluee : fixe(ngf, 2, sep) + " m NGF" });
    e.resultats.push({ libelle: x.res.cote, valeur: isNaN(cote) ? x.nonRenseignee : fixe(cote, 2, sep) + " m NGF" });
    var ok = ngf !== null && !isNaN(cote) ? ngf >= cote - 1e-9 : null;
    e.resultats.push({ libelle: x.res.verdict, valeur: ok === null ? x.nonEvalue : ok ? x.conforme : x.insuffisant(fixe((cote - ngf) * 100, 0, sep) + " cm"), ton: ok === null ? "" : ok ? "ok" : "alerte" });
    var rr = c.jeu && c.jeu.regles.ppri;
    e.resultats.push({ libelle: x.res.refuge, valeur: typeof g.refuge === "number" ? m2(g.refuge, sep) : x.nonEvaluee });
    e.resultats.push({ libelle: x.res.refugeMin, valeur: rr ? m2(rr.zoneRefugeMin, sep) + (rr.relu ? "" : " (" + x.aVerifier + ")") : x.nonEvaluee });
    var okR = rr && typeof g.refuge === "number" ? g.refuge >= rr.zoneRefugeMin - 1e-9 : null;
    e.resultats.push({ libelle: x.res.refugeVerdict, valeur: okR === null ? x.nonEvalue : okR ? x.conforme : x.insuffisant(m2(rr.zoneRefugeMin - g.refuge, sep)), ton: okR === null ? "" : okR ? "ok" : "alerte" });
  } else {
    e.lignes = c.jeux.map(function (j) { return { genre: "ligne", cellules: [j.libelle, j.version, j.date, REGLES.every(function (k) { return !j.regles[k] || j.regles[k].relu; }) ? x.oui : x.aVerifier] }; });
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
action("charger-programme", chargerProgramme);
action("retenir-cote", retenirCote);
action("mesurer-refuge", mesurerRefuge);
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
commande("ouvrir-panneau", "niveaux");
commande("par-niveau", "niveaux");
commande("emprise", "emprise");
commande("programme", "programme");
commande("ppri", "ppri");
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
