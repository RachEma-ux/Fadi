(function () {
  var en = fadi.langue === "en";
  var el = function (id) { return document.getElementById(id); };
  var t = function (fr, an) { return en ? an : fr; };
  var premier = function (b) { b.principal = true; return b; };
  // Onglets : un par entrée du catalogue ; boutons : action du code.
  var ONGLETS = [
    { id: "garde-corps", nom: t("Garde-corps", "Guardrails"), boutons: [premier({ action: "etat", nom: t("Contrôler", "Check") }), { action: "choisir", ligne: true, nom: t("Sélectionner", "Select") }] },
    { id: "rives", nom: t("Rives et trémies", "Slab edges and openings"), boutons: [premier({ action: "etat", nom: t("Contrôler", "Check") }), { action: "choisir", ligne: true, nom: t("Sélectionner la dalle", "Select the slab") }] },
    { id: "circulations", nom: t("Circulations", "Circulation"), boutons: [premier({ action: "etat", nom: t("Contrôler", "Check") }), { action: "choisir", ligne: true, nom: t("Sélectionner", "Select") }] },
    { id: "sanitaire", nom: t("Sanitaire accessible", "Accessible toilet"), boutons: [premier({ action: "etat", nom: t("Contrôler", "Check") }), { action: "choisir", ligne: true, nom: t("Sélectionner", "Select") }] },
    { id: "stationnement", nom: t("Stationnement", "Parking"), boutons: [premier({ action: "etat", nom: t("Contrôler", "Check") }), { action: "choisir", ligne: true, nom: t("Sélectionner la place", "Select the space") }] },
  ];
  var onglet = "garde-corps";
  var choisie = null;
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
        choisie = null;
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
      // « Garder la variante B » : la lettre de la ligne choisie complète le libellé.
      x.textContent = b.ligne && dernier && dernier.choisieLibelle ? b.nom + " " + dernier.choisieLibelle : b.nom;
      if (b.principal) x.className = "principal";
      if (b.ligne) x.disabled = !choisie;
      x.addEventListener("click", function () {
        if (b.ligne) { if (choisie) appeler(b.action, { id: choisie }); }
        else appeler(b.action).then(function () { formulaireDe = null; appeler("etat"); });
      });
      barre.appendChild(x);
    });
  };
  // Le formulaire n'est redessiné qu'au changement d'onglet ou de champs : la saisie en cours n'est jamais écrasée.
  var dessinerFormulaire = function (champs) {
    var f = el("formulaire");
    var cle = onglet + ":" + champs.map(function (c) { return c.id + (c.choix ? c.choix.length : ""); }).join(",");
    if (formulaireDe === cle) return;
    formulaireDe = cle;
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
        i.addEventListener("change", function () { appeler("etat"); });
      } else {
        i = document.createElement("input");
        i.type = "text";
        i.inputMode = "decimal";
        i.addEventListener("input", function () {
          clearTimeout(minuterie);
          minuterie = setTimeout(function () { appeler("etat"); }, 300);
        });
      }
      i.id = "champ-" + c.id;
      i.name = c.id;
      i.value = c.valeur;
      f.appendChild(l);
      f.appendChild(i);
    });
    f.hidden = champs.length === 0;
  };
  var cellule = function (tr, texte, classe, entete) {
    var td = document.createElement(entete ? "th" : "td");
    td.textContent = texte;
    if (classe) td.className = classe;
    tr.appendChild(td);
  };
  var montrer = function (e) {
    if (!e) return;
    dernier = e;
    if (e.onglet && e.onglet !== onglet) {
      onglet = e.onglet;
      formulaireDe = null;
    }
    choisie = e.choisie || null;
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
    e.colonnes.forEach(function (c) { cellule(entete, c, "", true); });
    var corps = el("lignes");
    corps.textContent = "";
    e.lignes.forEach(function (l) {
      var tr = document.createElement("tr");
      tr.className = l.genre + (l.choisi ? " choisi" : "") + (l.ton ? " t-" + l.ton : "");
      // La dernière colonne porte le résultat : colorée selon son état.
      l.cellules.forEach(function (c, i) {
        var classe = i === n - 1 ? l.ton || "" : "";
        // Les nombres s'alignent à droite.
        if (i > 0 && /^[+−-]?[\d\s,.]+ ?(%|°|m²|m³|m)?$/.test(c)) classe += " n";
        cellule(tr, c, classe.trim());
      });
      if (l.id) {
        tr.tabIndex = 0;
        tr.setAttribute("data-id", l.id);
        var choisir = function () { choisie = l.id; dessinerBoutons(); appeler("choisir", { id: l.id }); };
        tr.addEventListener("click", choisir);
        tr.addEventListener("keydown", function (k) { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); choisir(); } });
      }
      corps.appendChild(tr);
    });
    var pied = el("pied");
    pied.textContent = "";
    if (e.pied) {
      var tp = document.createElement("tr");
      e.pied.forEach(function (c, i) { cellule(tp, c, i > 0 ? "n" : ""); });
      pied.appendChild(tp);
    }
    el("pagination").hidden = e.pages <= 1;
    el("page").textContent = "Page " + (e.page + 1) + " / " + e.pages;
    el("precedente").disabled = e.page <= 0;
    el("suivante").disabled = e.page >= e.pages - 1;
    dessinerBoutons();
  };
  el("formulaire").addEventListener("submit", function (ev) { ev.preventDefault(); appeler("etat"); });
  el("precedente").addEventListener("click", function () { if (dernier) appeler("page", { page: dernier.page - 1 }); });
  el("suivante").addEventListener("click", function () { if (dernier) appeler("page", { page: dernier.page + 1 }); });
  dessinerOnglets();
  dessinerBoutons();
  fadi.surDonnees(montrer);
  appeler("etat");
})();
