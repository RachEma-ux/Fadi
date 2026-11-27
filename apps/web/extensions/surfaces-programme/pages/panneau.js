(function () {
  var en = fadi.langue === "en";
  var el = function (id) { return document.getElementById(id); };
  var t = function (fr, an) { return en ? an : fr; };
  // Onglets : un par entrée du catalogue. Boutons : action du code de l'extension ; « ligne » = demande une ligne choisie.
  var ONGLETS = [
    { id: "surfaces", nom: t("Tableau des surfaces", "Area schedule"), boutons: [
      { action: "declarer", nom: t("＋ Déclarer un local", "＋ Declare a room"), principal: true },
      { action: "modifier", nom: t("Modifier le local", "Edit the room"), ligne: true },
      { action: "exporter", nom: t("Exporter le CSV", "Export the CSV") } ] },
    { id: "programme", nom: t("Programme", "Brief"), boutons: [
      { action: "programme-ajouter", nom: t("＋ Ajouter une ligne", "＋ Add a line"), principal: true },
      { action: "programme-modifier", nom: t("Modifier la ligne", "Edit the line"), ligne: true },
      { action: "programme-importer", nom: t("Importer un CSV", "Load a CSV") },
      { action: "generer-boites", nom: t("Générer les boîtes", "Generate the boxes") } ] },
    { id: "capacite", nom: t("Capacité", "Capacity"), boutons: [
      { action: "volumes-capacite", nom: t("Générer les volumes", "Generate the volumes"), principal: true },
      { action: "capacite-effacer", nom: t("Effacer les volumes", "Erase the volumes") } ] },
    { id: "typologies", nom: t("Typologies", "Unit types"), boutons: [
      { action: "typologie-ajouter", nom: t("＋ Ajouter une typologie", "＋ Add a unit type"), principal: true },
      { action: "typologie-modifier", nom: t("Modifier la typologie", "Edit the unit type"), ligne: true },
      { action: "remplir-facade", nom: t("Remplir le long d'une façade", "Fill along a façade") },
      { action: "typologies-effacer", nom: t("Effacer le remplissage", "Erase the fill") } ] },
    { id: "lots", nom: t("Lots", "Lots"), boutons: [
      { action: "creer-lot", nom: t("＋ Créer ou compléter un lot", "＋ Create or complete a lot"), principal: true },
      { action: "lot-retirer", nom: t("Retirer le lot", "Remove the lot"), ligne: "lot:" } ] },
    { id: "sdp", nom: t("SDP du permis", "Permit floor area"), boutons: [
      { action: "qualifier-local", nom: t("Qualifier le local", "Qualify the room"), principal: true },
      { action: "sdp-exporter", nom: t("Exporter le CSV", "Export the CSV") } ] },
  ];
  var onglet = "surfaces";
  var choisie = null;
  var dernier = null;
  var erreur = function (e) {
    el("erreur").textContent = e && e.message ? e.message : String(e);
    el("erreur").hidden = false;
  };
  var appeler = function (nom, donnees) {
    el("erreur").hidden = true;
    var d = donnees || {};
    d.langue = fadi.langue;
    d.onglet = onglet;
    return fadi.action(nom, d).then(montrer, erreur);
  };
  var ongletActif = function () { return ONGLETS.filter(function (o) { return o.id === onglet; })[0]; };
  // Un bouton « ligne » n'est actif que si une ligne choisie convient (« lot: » : un en-tête de lot).
  var convient = function (b) { return !!choisie && (b.ligne === true || choisie.indexOf(b.ligne) === 0); };
  var dessinerBoutons = function () {
    var barre = el("barre");
    barre.textContent = "";
    ongletActif().boutons.forEach(function (b) {
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = b.nom;
      if (b.principal) x.className = "principal";
      if (b.ligne) x.disabled = !convient(b);
      x.addEventListener("click", function () {
        if (b.ligne) { if (convient(b)) appeler(b.action, { id: choisie }); }
        else appeler(b.action);
      });
      barre.appendChild(x);
    });
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
        dessinerOnglets();
        dessinerBoutons();
        appeler("etat");
      });
      barre.appendChild(x);
    });
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
      choisie = null;
    }
    dessinerOnglets();
    var n = e.colonnes.length;
    el("regle").textContent = e.regle;
    el("note").textContent = e.note;
    el("vide").textContent = e.vide || "";
    el("vide").hidden = !e.vide;
    el("table").hidden = !!e.vide;
    var entete = el("entete");
    entete.textContent = "";
    e.colonnes.forEach(function (c, i) { cellule(entete, c, i === n - 1 || (i > 0 && onglet !== "surfaces" && onglet !== "lots") ? "n" : "", 1, true); });
    var corps = el("lignes");
    corps.textContent = "";
    var ids = {};
    e.lignes.forEach(function (l) {
      var tr = document.createElement("tr");
      tr.className = l.genre + (l.choisi || (l.id && l.id === choisie) ? " choisi" : "");
      if (l.genre === "groupe") {
        // Ligne d'en-tête : libellé sur toutes les colonnes sauf la dernière, valeur à droite.
        cellule(tr, l.cellules[0], "", n - 1);
        cellule(tr, l.cellules[1], "n");
      } else {
        l.cellules.forEach(function (c, i) { cellule(tr, c, i === n - 1 || (i > 0 && onglet !== "surfaces" && onglet !== "lots") ? "n" : ""); });
      }
      if (l.id) {
        ids[l.id] = true;
        tr.tabIndex = 0;
        tr.setAttribute("data-id", l.id);
        var choisir = function () {
          choisie = l.id;
          dessinerBoutons();
          appeler("choisir", { id: l.id });
        };
        tr.addEventListener("click", choisir);
        tr.addEventListener("keydown", function (k) { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); choisir(); } });
      }
      corps.appendChild(tr);
    });
    if (choisie && !ids[choisie]) choisie = null;
    // Sans ligne choisie dans le panneau, la ligne sélectionnée dans le dessin le devient.
    if (!choisie) e.lignes.forEach(function (l) { if (!choisie && l.choisi && l.id) choisie = l.id; });
    var pied = el("pied");
    pied.textContent = "";
    if (e.pied) {
      var tr = document.createElement("tr");
      if (e.pied.length === 2) {
        cellule(tr, e.pied[0], "", n - 1);
        cellule(tr, e.pied[1], "n");
      } else e.pied.forEach(function (c, i) { cellule(tr, c, i > 0 ? "n" : ""); });
      pied.appendChild(tr);
    }
    el("pagination").hidden = e.pages <= 1;
    el("page").textContent = "Page " + (e.page + 1) + " / " + e.pages;
    el("precedente").disabled = e.page <= 0;
    el("suivante").disabled = e.page >= e.pages - 1;
    dessinerBoutons();
  };
  el("precedente").addEventListener("click", function () { if (dernier) appeler("page", { page: dernier.page - 1 }); });
  el("suivante").addEventListener("click", function () { if (dernier) appeler("page", { page: dernier.page + 1 }); });
  dessinerOnglets();
  dessinerBoutons();
  fadi.surDonnees(montrer);
  appeler("etat");
})();
