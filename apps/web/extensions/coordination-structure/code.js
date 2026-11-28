// Extension « Coordination et structure » (catalogue des extensions de la Planche, cas 3 de la feuille de route, lot 5 ;
// protocole 1.7). Trois onglets :
//   Collisions (n° 8, D4-F22-005) · Descente des porteurs (n° 23, D4-F5-069) · Saillies (n° 30, D9-R-004).
//
// Les familles d'objets se désignent par leurs balises (aucune n'est imposée). Tout seuil (décalage admis, saillie
// admise, hauteur libre) est saisi avec sa source : sans elle, le contrôle est « non évalué ». Rien n'est corrigé :
// l'extension montre, l'utilisateur décide.

var VERSION = "1.0.0";
var PANNEAU = "coordination";
var ONGLETS = ["collisions", "descente", "saillies"];
var LIGNES_PAR_PAGE = 80;
var TOL = 1e-6;

var onglet = "collisions";
var page = 0;
var langue = "fr";
var valeurs = { familleA: "", familleB: "", porteurs: "", decalage: "", sourceDecalage: "", controlees: "", saillie: "", hauteur: "", sol: "", sourceSaillie: "" };
// Résultat du dernier contrôle des collisions : refait à la demande, marqué « à refaire » quand le dessin change.
var collisions = null;
var choisie = null;

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    champs: {
      familleA: "Balises de la première famille (séparées par des virgules)",
      familleB: "Balises de la seconde famille (vide = la première contre elle-même)",
      porteurs: "Balises des porteurs (poteaux, voiles)",
      decalage: "Décalage admis d'un étage à l'autre (m)",
      sourceDecalage: "Source ou hypothèse du décalage admis",
      controlees: "Balises contrôlées (vide = tous les objets)",
      saillie: "Saillie admise sur le domaine public (m)",
      hauteur: "Hauteur libre minimale sous saillie (m)",
      sol: "Altitude du sol public dans le dessin (m)",
      sourceSaillie: "Source des valeurs de saillie",
    },
    col: {
      collisions: ["Objet", "Contre", "Traversée", "État"],
      descente: ["Porteur", "Niveau", "Appui dessous", "Décalage"],
      saillies: ["Objet", "Saillie", "Hauteur libre", "État"],
    },
    note: {
      collisions: "Traversées face contre face entre les objets des deux familles : un contact (objets accolés, posés) n'est pas une collision. Chaque ligne se sélectionne dans le dessin.",
      descente: "Chaque porteur d'un étage cherche, à l'étage du dessous, le porteur dont l'emprise le recouvre ; le décalage est l'écart entre les centres des emprises. Étage : niveau de l'objet, sinon le niveau d'étage sous sa base.",
      saillies: "Alignement : arête retenue dans le dessin ; le domaine public est du côté opposé au projet. Saillie : avancée de chaque objet au-delà de l'alignement ; hauteur libre : point le plus bas de la partie en saillie, au-dessus du sol public saisi.",
    },
    vides: {
      collisions: "Nommez au moins une balise, puis « Contrôler ».",
      collisionsAucune: "Aucune collision entre ces familles.",
      collisionsSansObjet: "Aucun objet ne porte ces balises.",
      descente: "Nommez les balises des porteurs.",
      descenteSansNiveau: "Aucun niveau d'étage : la descente ne peut pas être contrôlée (Niveaux).",
      descenteSansObjet: "Aucun porteur ne porte ces balises.",
      saillies: "Aucun alignement retenu : choisissez une arête du dessin, puis « Retenir l'alignement ».",
      sailliesAucune: "Aucun objet n'avance au-delà de l'alignement.",
    },
    res: {
      paires: "Paires en collision", total: "Longueur de traversée totale", aRefaire: "Dessin modifié depuis le contrôle",
      porteurs: "Porteurs contrôlés", sansAppui: "Porteurs sans appui dessous", horsDecalage: "Décalages au-delà de l'admis",
      alignement: "Alignement retenu", objets: "Objets en saillie", source: "Source",
    },
    etats: { ok: "conforme", alerte: "au-delà", nonEvalue: "non évalué", fondation: "plus bas niveau", aucun: "aucun", aRefaire: "à refaire" },
    nonEvalue: "non évalué",
    oui: "oui", non: "non",
    alignementRetenu: "Alignement retenu.",
    alignementRefuse: "Choisissez une seule arête du dessin (au niveau où vous dessinez).",
    controle: function (n) { return n ? "Collisions : " + n + " paires." : "Aucune collision."; },
    etage: function (n) { return n; },
  },
  en: {
    champs: {
      familleA: "Tags of the first family (comma-separated)",
      familleB: "Tags of the second family (empty = the first against itself)",
      porteurs: "Tags of the supports (columns, walls)",
      decalage: "Allowed offset from one storey to the next (m)",
      sourceDecalage: "Source or assumption of the allowed offset",
      controlees: "Tags checked (empty = all objects)",
      saillie: "Allowed projection over the public domain (m)",
      hauteur: "Minimum clear height under a projection (m)",
      sol: "Public ground altitude in the drawing (m)",
      sourceSaillie: "Source of the projection values",
    },
    col: {
      collisions: ["Object", "Against", "Clash length", "Status"],
      descente: ["Support", "Level", "Bearing below", "Offset"],
      saillies: ["Object", "Projection", "Clear height", "Status"],
    },
    note: {
      collisions: "Face-to-face clashes between the objects of both families: a contact (objects side by side, resting) is not a clash. Each row can be selected in the drawing.",
      descente: "Each support of a storey looks, on the storey below, for the support whose footprint covers it; the offset is the distance between the footprint centres. Storey: the object's level, otherwise the storey level under its base.",
      saillies: "Building line: edge kept in the drawing; the public domain is on the side opposite the project. Projection: how far each object goes beyond the line; clear height: lowest point of the projecting part, above the entered public ground.",
    },
    vides: {
      collisions: "Name at least one tag, then “Check”.",
      collisionsAucune: "No clash between these families.",
      collisionsSansObjet: "No object carries these tags.",
      descente: "Name the tags of the supports.",
      descenteSansNiveau: "No storey level: the load path cannot be checked (Levels).",
      descenteSansObjet: "No support carries these tags.",
      saillies: "No building line kept: choose an edge of the drawing, then “Keep the building line”.",
      sailliesAucune: "No object goes beyond the building line.",
    },
    res: {
      paires: "Clashing pairs", total: "Total clash length", aRefaire: "Drawing changed since the check",
      porteurs: "Supports checked", sansAppui: "Supports without bearing below", horsDecalage: "Offsets beyond the allowed value",
      alignement: "Building line kept", objets: "Projecting objects", source: "Source",
    },
    etats: { ok: "compliant", alerte: "beyond", nonEvalue: "not assessed", fondation: "lowest level", aucun: "none", aRefaire: "to redo" },
    nonEvalue: "not assessed",
    oui: "yes", non: "no",
    alignementRetenu: "Building line kept.",
    alignementRefuse: "Choose a single edge of the drawing (at the level you are drawing in).",
    controle: function (n) { return n ? "Clashes: " + n + " pairs." : "No clash."; },
    etage: function (n) { return n; },
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var info = function (m) { return planche.message.afficher(m); };
var alerte = function (m) { return planche.message.afficher(m, "alerte"); };
var texte = function (v) { return v === undefined || v === null ? "" : String(v); };
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(",", ".");
  return t === "" || !/^-?\d*\.?\d+$/.test(t) ? NaN : Number(t);
};
var fixe = function (v, n, sep) { var f = Math.pow(10, n); return (Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)) / f).toFixed(n).replace(".", sep); };
var metres = function (v, sep) { return fixe(v, 2, sep) + " m"; };
var noms = function (s) { return texte(s).split(/[,;]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); };
async function donnees() { return (await planche.donnees.lire("projet")) || {}; }

// ——————————————————————————————————————————————— Lecture des objets placés (protocole 1.7)

/**
 * Objets du modèle avec leur balise effective (la leur, sinon celle du plus proche contenant) et leur boîte englobante
 * dans le modèle, tirée des faces visibles.
 */
async function objetsPlaces() {
  var balises = {};
  (await planche.balises.lire()).forEach(function (b) { balises[b.id] = b.nom.toLowerCase(); });
  var lus = (await planche.objets.lire()).objets;
  var parId = {};
  lus.forEach(function (o) { parId[o.id] = o; });
  var monde = await planche.modele.lire({ portee: "monde" });
  var boites = {};
  monde.faces.forEach(function (f) {
    f.chemin.forEach(function (id) {
      var b = boites[id] || (boites[id] = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], points: [] });
      f.points.forEach(function (p) {
        for (var k = 0; k < 3; k++) { if (p[k] < b.min[k]) b.min[k] = p[k]; if (p[k] > b.max[k]) b.max[k] = p[k]; }
        if (b.points.length < 4000) b.points.push(p);
      });
    });
  });
  return lus.map(function (o) {
    var nom = o.balise ? balises[o.balise] : null;
    for (var i = o.chemin.length - 2; !nom && i >= 0; i--) { var p = parId[o.chemin[i]]; if (p && p.balise) nom = balises[p.balise]; }
    return { id: o.id, nom: o.nom, parent: o.parent, chemin: o.chemin, niveau: o.niveau, baliseNom: o.balise ? balises[o.balise] : null, baliseEffective: nom || null, boite: boites[o.id] || null };
  });
}
var porteBalise = function (o, liste) { return !!o.baliseNom && liste.indexOf(o.baliseNom) >= 0; };
var nomObjet = function (o) { return o.nom || o.id; };

// ——————————————————————————————————————————————— Collisions (n° 8)

async function controlerCollisions() {
  var x = tx();
  var A = noms(valeurs.familleA), B = noms(valeurs.familleB);
  if (!A.length) { collisions = null; return; }
  var objets = await objetsPlaces();
  var oa = objets.filter(function (o) { return porteBalise(o, A) && o.boite; });
  var ob = B.length ? objets.filter(function (o) { return porteBalise(o, B) && o.boite; }) : null;
  var parId = {};
  objets.forEach(function (o) { parId[o.id] = o; });
  if (!oa.length || (ob && !ob.length)) { collisions = { sansObjet: true, lignes: [], valide: true }; return; }
  var r = await planche.geometrie.intersection(oa.map(function (o) { return o.id; }), ob ? ob.map(function (o) { return o.id; }) : undefined);
  collisions = {
    sansObjet: false,
    valide: true,
    tronque: r.tronque,
    lignes: r.collisions.map(function (c) { return { a: c.a, b: c.b, nomA: nomObjet(parId[c.a] || { id: c.a }), nomB: nomObjet(parId[c.b] || { id: c.b }), longueur: c.longueur }; }),
  };
  await info(x.controle(collisions.lignes.length));
}

// ——————————————————————————————————————————————— Descente des porteurs (n° 23)

async function descente() {
  var P = noms(valeurs.porteurs);
  if (!P.length) return { vide: "descente" };
  var niv = (await planche.niveaux.lire()).niveaux.slice().sort(function (a, b) { return a.altitude - b.altitude; });
  if (!niv.length) return { vide: "descenteSansNiveau" };
  var rang = {};
  niv.forEach(function (n, k) { rang[n.id] = k; });
  var porteurs = (await objetsPlaces()).filter(function (o) { return porteBalise(o, P) && o.boite; });
  if (!porteurs.length) return { vide: "descenteSansObjet" };
  porteurs.forEach(function (o) {
    if (o.niveau && rang[o.niveau] !== undefined) o.etage = rang[o.niveau];
    else {
      o.etage = 0;
      niv.forEach(function (n, k) { if (n.altitude <= o.boite.min[2] + 0.05) o.etage = k; });
    }
    o.centre = [(o.boite.min[0] + o.boite.max[0]) / 2, (o.boite.min[1] + o.boite.max[1]) / 2];
  });
  var admis = lireNombre(valeurs.decalage);
  var evalue = admis >= 0 && !!valeurs.sourceDecalage.trim();
  var lignes = porteurs.sort(function (a, b) { return b.etage - a.etage || (nomObjet(a) < nomObjet(b) ? -1 : 1); }).map(function (o) {
    if (o.etage === 0) return { o: o, etat: "fondation" };
    var dessous = porteurs.filter(function (q) {
      return q.etage === o.etage - 1 && q.boite.min[0] < o.boite.max[0] - TOL && o.boite.min[0] < q.boite.max[0] - TOL && q.boite.min[1] < o.boite.max[1] - TOL && o.boite.min[1] < q.boite.max[1] - TOL;
    });
    if (!dessous.length) return { o: o, etat: "aucun" };
    var mieux = null;
    dessous.forEach(function (q) {
      var d = Math.hypot(q.centre[0] - o.centre[0], q.centre[1] - o.centre[1]);
      if (!mieux || d < mieux.d) mieux = { q: q, d: d };
    });
    return { o: o, appui: mieux.q, decalage: mieux.d, etat: !evalue ? "nonEvalue" : mieux.d <= admis + 1e-9 ? "ok" : "alerte" };
  });
  return { niveaux: niv, lignes: lignes, evalue: evalue };
}

// ——————————————————————————————————————————————— Saillies (n° 30)

async function retenirAlignement() {
  var x = tx();
  var sel = await planche.selection.lire();
  var lus = await planche.modele.lire();
  var aretes = lus.aretes.filter(function (a) { return sel.indexOf(a.id) >= 0; });
  if (sel.length !== 1 || aretes.length !== 1) { await alerte(x.alignementRefuse); return; }
  var a = aretes[0].points[0], b = aretes[0].points[aretes[0].points.length - 1];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) { await alerte(x.alignementRefuse); return; }
  await planche.donnees.ecrire("projet", "saillies.alignement", { a: [a[0], a[1]], b: [b[0], b[1]] });
  await info(x.alignementRetenu);
}

async function saillies() {
  var al = (await donnees())["saillies.alignement"];
  if (!al) return { vide: "saillies" };
  var C = noms(valeurs.controlees);
  var objets = (await objetsPlaces()).filter(function (o) { return o.boite && (C.length ? porteBalise(o, C) : o.parent === null); });
  var ux = al.b[0] - al.a[0], uy = al.b[1] - al.a[1], l = Math.hypot(ux, uy);
  // Distance signée à l'alignement (côté gauche positif).
  var cote = function (p) { return ((p[0] - al.a[0]) * -uy + (p[1] - al.a[1]) * ux) / l; };
  // Le projet est du côté où se trouve la plus grande part de ses objets ; le domaine public, de l'autre.
  var somme = 0;
  objets.forEach(function (o) { somme += cote([(o.boite.min[0] + o.boite.max[0]) / 2, (o.boite.min[1] + o.boite.max[1]) / 2]); });
  var sens = somme >= 0 ? -1 : 1;
  var admise = lireNombre(valeurs.saillie), hmin = lireNombre(valeurs.hauteur), sol = lireNombre(valeurs.sol);
  var source = valeurs.sourceSaillie.trim();
  var lignes = [];
  objets.forEach(function (o) {
    var avance = 0, bas = Infinity;
    o.boite.points.forEach(function (p) {
      var d = sens * cote(p);
      if (d > avance) avance = d;
      if (d > TOL && p[2] < bas) bas = p[2];
    });
    if (avance <= TOL) return;
    var libre = sol === sol && bas < Infinity ? bas - sol : null;
    var etat = "nonEvalue";
    if (source && admise >= 0) etat = avance <= admise + 1e-9 && (hmin !== hmin || libre === null || libre >= hmin - 1e-9) ? "ok" : "alerte";
    if (source && hmin >= 0 && libre !== null && libre < hmin - 1e-9) etat = "alerte";
    lignes.push({ o: o, avance: avance, libre: libre, etat: etat });
  });
  lignes.sort(function (a, b) { return b.avance - a.avance; });
  return { alignement: al, lignes: lignes };
}

// ——————————————————————————————————————————————— Panneau

async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var formulaire = [];
  var e = { lignes: [], vide: null, resultats: [], pied: null };
  var ton = function (k) { return k === "ok" ? "ok" : k === "alerte" || k === "aucun" ? "alerte" : "gris"; };
  if (onglet === "collisions") {
    formulaire = [{ id: "familleA", libelle: x.champs.familleA, valeur: valeurs.familleA }, { id: "familleB", libelle: x.champs.familleB, valeur: valeurs.familleB }];
    if (!collisions) e.vide = x.vides.collisions;
    else if (collisions.sansObjet) e.vide = x.vides.collisionsSansObjet;
    else {
      var total = 0;
      e.lignes = collisions.lignes.map(function (c) {
        total += c.longueur;
        return { genre: "ligne", id: c.a + "|" + c.b, choisi: choisie === c.a + "|" + c.b, ton: collisions.valide ? "alerte" : "gris", cellules: [c.nomA, c.nomB, metres(c.longueur, sep), collisions.valide ? x.etats.alerte : x.etats.aRefaire] };
      });
      if (!e.lignes.length) e.vide = x.vides.collisionsAucune;
      e.resultats.push({ libelle: x.res.paires, valeur: String(collisions.lignes.length), ton: collisions.lignes.length ? "alerte" : "ok" });
      e.resultats.push({ libelle: x.res.total, valeur: metres(total, sep) });
      if (!collisions.valide) e.resultats.push({ libelle: x.res.aRefaire, valeur: x.oui, ton: "limite" });
    }
  } else if (onglet === "descente") {
    formulaire = [{ id: "porteurs", libelle: x.champs.porteurs, valeur: valeurs.porteurs }, { id: "decalage", libelle: x.champs.decalage, valeur: valeurs.decalage }, { id: "sourceDecalage", libelle: x.champs.sourceDecalage, valeur: valeurs.sourceDecalage }];
    var d = await descente();
    if (d.vide) e.vide = x.vides[d.vide];
    else {
      var sansAppui = 0, hors = 0;
      e.lignes = d.lignes.map(function (l) {
        if (l.etat === "aucun") sansAppui++;
        if (l.etat === "alerte") hors++;
        var appui = l.etat === "fondation" ? x.etats.fondation : l.etat === "aucun" ? x.etats.aucun : nomObjet(l.appui);
        var dec = l.decalage === undefined ? "–" : metres(l.decalage, sep);
        return { genre: "ligne", id: l.o.id, choisi: choisie === l.o.id, ton: ton(l.etat), cellules: [nomObjet(l.o), d.niveaux[l.o.etage].nom, appui, dec] };
      });
      e.resultats.push({ libelle: x.res.porteurs, valeur: String(d.lignes.length) });
      e.resultats.push({ libelle: x.res.sansAppui, valeur: String(sansAppui), ton: sansAppui ? "alerte" : "ok" });
      e.resultats.push({ libelle: x.res.horsDecalage, valeur: d.evalue ? String(hors) : x.nonEvalue, ton: d.evalue ? (hors ? "alerte" : "ok") : "limite" });
    }
  } else {
    formulaire = [
      { id: "controlees", libelle: x.champs.controlees, valeur: valeurs.controlees },
      { id: "saillie", libelle: x.champs.saillie, valeur: valeurs.saillie },
      { id: "hauteur", libelle: x.champs.hauteur, valeur: valeurs.hauteur },
      { id: "sol", libelle: x.champs.sol, valeur: valeurs.sol },
      { id: "sourceSaillie", libelle: x.champs.sourceSaillie, valeur: valeurs.sourceSaillie },
    ];
    var s = await saillies();
    if (s.vide) e.vide = x.vides[s.vide];
    else {
      e.lignes = s.lignes.map(function (l) {
        return { genre: "ligne", id: l.o.id, choisi: choisie === l.o.id, ton: ton(l.etat), cellules: [nomObjet(l.o), metres(l.avance, sep), l.libre === null ? x.nonEvalue : metres(l.libre, sep), x.etats[l.etat]] };
      });
      if (!e.lignes.length) e.vide = x.vides.sailliesAucune;
      e.resultats.push({ libelle: x.res.alignement, valeur: "(" + fixe(s.alignement.a[0], 2, sep) + " ; " + fixe(s.alignement.a[1], 2, sep) + ") → (" + fixe(s.alignement.b[0], 2, sep) + " ; " + fixe(s.alignement.b[1], 2, sep) + ")" });
      e.resultats.push({ libelle: x.res.objets, valeur: String(s.lignes.length), ton: s.lignes.some(function (l) { return l.etat === "alerte"; }) ? "alerte" : "" });
      e.resultats.push({ libelle: x.res.source, valeur: valeurs.sourceSaillie.trim() ? valeurs.sourceSaillie.trim().slice(0, 60) : x.nonEvalue, ton: valeurs.sourceSaillie.trim() ? "" : "limite" });
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
action("controler-collisions", controlerCollisions);
action("retenir-alignement", retenirAlignement);
action("choisir", async function (d) {
  var id = texte(d.id).slice(0, 200);
  if (!id) return;
  choisie = id;
  await planche.selection.definir(id.split("|"));
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
commande("ouvrir-panneau", "collisions");
commande("collisions", "collisions");
commande("descente", "descente");
commande("saillies", "saillies");
planche.sur("modele.change", async function () {
  if (collisions) collisions.valide = false;
  await rafraichir();
});
planche.sur("selection.change", rafraichir);
