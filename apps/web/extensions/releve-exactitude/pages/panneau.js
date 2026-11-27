(function () {
  var en = fadi.langue === "en";
  var el = function (id) { return document.getElementById(id); };
  var t = function (fr, an) { return en ? an : fr; };
  // Onglets : un par entrée du catalogue ; boutons : action du code de l'extension.
  var ONGLETS = [
    { id: "piece", nom: t("Pièce hors d'équerre", "Out-of-square room"), boutons: [
      { action: "poser-piece", nom: t("Poser la pièce", "Lay the room"), principal: true },
      { action: "effacer-piece", nom: t("Effacer", "Clear") } ] },
    { id: "point", nom: t("Point par deux distances", "Point from two distances"), boutons: [
      { action: "construire-point", nom: t("Construire le point", "Build the point"), principal: true },
      { action: "poser-triangle", nom: t("Poser le triangle", "Lay the triangle") } ] },
    { id: "provenance", nom: t("Provenance de l'existant", "Provenance of existing"), boutons: [
      { action: "marquer-provenance", nom: t("Marquer la sélection", "Mark the selection"), principal: true } ] },
    { id: "bulletin", nom: t("Bulletin d'exactitude", "Accuracy report"), boutons: [
      { action: "controler-dessin", nom: t("Contrôler le dessin", "Check the drawing"), principal: true },
      { action: "exporter-bulletin", nom: t("Exporter le bulletin (.md)", "Export the report (.md)") } ] },
  ];
  var onglet = "piece";
  var dernier = null;
  var formulaireDe = null;
  var minuterie = null;
  var erreur = function (e) {
    el("erreur").textContent = e && e.message ? e.message : String(e);
    el("erreur").hidden = false;
  };
  var lireValeurs = function () {
    var v = {};
    Array.prototype.forEach.call(el("formulaire").elements, function (c) { if (c.name) v[c.name] = c.value; });
    return v;
  };
  var appeler = function (nom, donnees) {
    el("erreur").hidden = true;
    var d = donnees || {};
    d.langue = fadi.langue;
    d.onglet = onglet;
    d.valeurs = lireValeurs();
    return fadi.action(nom, d).then(montrer, erreur);
  };
  var dessinerOnglets = function () {
    var barre = el("onglets");
    barre.textContent = "";
    ONGLETS.forEach(function (o) {
      var x = document.createElement("button");
      x.type = "button";
      x.setAttribute("role", "tab");
      x.setAttribute("aria-selected", o.id === onglet ? "true" : "false");
      x.textContent = o.nom;
      x.addEventListener("click", function () {
        if (o.id === onglet) return;
        onglet = o.id;
        formulaireDe = null;
        dessinerOnglets();
        dessinerBoutons();
        appeler("etat");
      });
      barre.appendChild(x);
    });
  };
  var dessinerBoutons = function () {
    var barre = el("barre");
    barre.textContent = "";
    ONGLETS.filter(function (o) { return o.id === onglet; })[0].boutons.forEach(function (b) {
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = b.nom;
      if (b.principal) x.className = "principal";
      x.addEventListener("click", function () {
        appeler(b.action).then(function () {
          // « Effacer » vide les champs affichés.
          if (b.action === "effacer-piece") { formulaireDe = null; appeler("etat"); }
        });
      });
      barre.appendChild(x);
    });
  };
  // Le formulaire n'est redessiné qu'au changement d'onglet : la saisie en cours n'est jamais écrasée.
  var dessinerFormulaire = function (champs) {
    var f = el("formulaire");
    if (formulaireDe === onglet && f.elements.length === champs.length) return;
    formulaireDe = onglet;
    f.textContent = "";
    champs.forEach(function (c) {
      var l = document.createElement("label");
      l.textContent = c.libelle;
      l.htmlFor = "champ-" + c.id;
      var i;
      if (c.choix) {
        i = document.createElement("select");
        c.choix.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o.valeur;
          op.textContent = o.libelle;
          i.appendChild(op);
        });
      } else {
        i = document.createElement("input");
        i.type = "text";
        i.inputMode = "decimal";
      }
      i.id = "champ-" + c.id;
      i.name = c.id;
      i.value = c.valeur;
      i.addEventListener("input", function () {
        clearTimeout(minuterie);
        minuterie = setTimeout(function () { appeler("etat"); }, 300);
      });
      f.appendChild(l);
      f.appendChild(i);
    });
    f.hidden = champs.length === 0;
  };
  var cellule = function (tr, texte, classe, colspan, entete) {
    var td = document.createElement(entete ? "th" : "td");
    td.textContent = texte;
    if (classe) td.className = classe;
    if (colspan > 1) td.colSpan = colspan;
    tr.appendChild(td);
  };
  var montrer = function (e) {
    if (!e) return;
    dernier = e;
    if (e.onglet && e.onglet !== onglet) {
      onglet = e.onglet;
      formulaireDe = null;
      dessinerBoutons();
    }
    dessinerOnglets();
    dessinerFormulaire(e.formulaire);
    var r = el("resultats");
    r.textContent = "";
    e.resultats.forEach(function (x) {
      var dt = document.createElement("dt");
      dt.textContent = x.libelle;
      var dd = document.createElement("dd");
      dd.textContent = x.valeur;
      if (x.ton) dd.className = x.ton;
      r.appendChild(dt);
      r.appendChild(dd);
    });
    r.hidden = e.resultats.length === 0;
    el("encart").textContent = e.encart || "";
    el("encart").hidden = !e.encart;
    el("note").textContent = e.note;
    el("vide").textContent = e.vide || "";
    el("vide").hidden = !e.vide;
    var n = e.colonnes.length;
    el("table").hidden = !!e.vide || n === 0 || e.lignes.length === 0;
    var entete = el("entete");
    entete.textContent = "";
    e.colonnes.forEach(function (c) { cellule(entete, c, "", 1, true); });
    var corps = el("lignes");
    corps.textContent = "";
    e.lignes.forEach(function (l) {
      var tr = document.createElement("tr");
      tr.className = l.genre + (l.choisi ? " choisi" : "");
      if (l.genre === "groupe") {
        cellule(tr, l.cellules[0], "", n - 1);
        cellule(tr, l.cellules[1], "n");
      } else l.cellules.forEach(function (c) { cellule(tr, c); });
      if (l.id) {
        tr.tabIndex = 0;
        tr.setAttribute("data-id", l.id);
        var choisir = function () { appeler("choisir", { id: l.id }); };
        tr.addEventListener("click", choisir);
        tr.addEventListener("keydown", function (k) { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); choisir(); } });
      }
      corps.appendChild(tr);
    });
    var pied = el("pied");
    pied.textContent = "";
    if (e.pied) {
      var tr = document.createElement("tr");
      cellule(tr, e.pied[0], "", n - 1);
      cellule(tr, e.pied[1], "n");
      pied.appendChild(tr);
    }
    el("pagination").hidden = e.pages <= 1;
    el("page").textContent = "Page " + (e.page + 1) + " / " + e.pages;
    el("precedente").disabled = e.page <= 0;
    el("suivante").disabled = e.page >= e.pages - 1;
  };
  el("formulaire").addEventListener("submit", function (ev) { ev.preventDefault(); appeler("etat"); });
  el("precedente").addEventListener("click", function () { if (dernier) appeler("page", { page: dernier.page - 1 }); });
  el("suivante").addEventListener("click", function () { if (dernier) appeler("page", { page: dernier.page + 1 }); });
  dessinerOnglets();
  dessinerBoutons();
  fadi.surDonnees(montrer);
  appeler("etat");
})();
