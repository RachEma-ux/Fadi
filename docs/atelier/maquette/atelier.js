/* Maquette statique de l'Atelier (L0.3) — comportements de démonstration, sans dépendance ni serveur.
   L'état d'un écran est porté par l'adresse (paramètres de requête), pour que chaque écran soit ouvrable
   directement et capturable : niveau, etape, mode, sel, panneau, palette, feuille. Aucune commande n'est
   exécutée : la maquette ne contient pas de modèle. */
(function () {
  "use strict";
  var body = document.body;
  var params = new URLSearchParams(window.location.search);

  function tous(sel, racine) { return Array.prototype.slice.call((racine || document).querySelectorAll(sel)); }

  function etat(cle, valeur) {
    body.setAttribute("data-" + cle, valeur);
    tous('[data-regle="' + cle + '"]').forEach(function (b) {
      var actif = b.getAttribute("data-valeur") === valeur;
      if (b.getAttribute("role") === "radio") b.setAttribute("aria-checked", String(actif));
      else if (b.getAttribute("role") === "tab") b.setAttribute("aria-selected", String(actif));
      else b.setAttribute("aria-pressed", String(actif));
    });
    if (cle === "etape") {
      // L'outil du geste reste enfoncé pendant tout le cycle.
      tous("[data-outil-geste]").forEach(function (b) { b.setAttribute("aria-pressed", String(valeur !== "repos")); });
      tous(".cycle a").forEach(function (a) {
        var ordre = ["selection", "parametres", "apercu", "controle", "validation"];
        var i = ordre.indexOf(a.getAttribute("data-valeur"));
        var j = ordre.indexOf(valeur);
        if (i === j) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
        a.classList.toggle("fait", j > -1 && i < j);
      });
    }
  }

  // Valeurs par défaut, puis adresse.
  var defauts = { niveau: "essentiel", etape: "repos", mode: "2d", sel: "mur", famille: "creer" };
  Object.keys(defauts).forEach(function (cle) { etat(cle, params.get(cle) || body.getAttribute("data-" + cle) || defauts[cle]); });

  tous("[data-regle]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      etat(b.getAttribute("data-regle"), b.getAttribute("data-valeur"));
      // Choisir un outil depuis une feuille du téléphone rend la zone de travail.
      if (b.getAttribute("data-regle") === "etape" && b.closest(".feuille")) ouvrirFeuille("");
    });
  });

  // Panneau des modifications et problèmes (ordinateur).
  var panneau = document.querySelector(".panneau");
  function ouvrirPanneau(ouvert) {
    if (!panneau) return;
    panneau.setAttribute("data-ouvert", String(ouvert));
    tous("[data-panneau-bascule]").forEach(function (b) { b.setAttribute("aria-expanded", String(ouvert)); });
  }
  tous("[data-panneau-bascule]").forEach(function (b) {
    b.addEventListener("click", function () { ouvrirPanneau(panneau.getAttribute("data-ouvert") !== "true"); });
  });
  if (panneau) ouvrirPanneau(params.get("panneau") === "ouvert");

  // Feuilles du téléphone (un repère par feuille).
  function ouvrirFeuille(nom) {
    tous(".feuille").forEach(function (f) { f.setAttribute("data-ouvert", String(f.id === "feuille-" + nom)); });
    tous("[data-feuille]").forEach(function (b) { b.setAttribute("aria-expanded", String(b.getAttribute("data-feuille") === nom)); });
  }
  tous("[data-feuille]").forEach(function (b) {
    b.addEventListener("click", function () {
      ouvrirFeuille(b.getAttribute("aria-expanded") === "true" ? "" : b.getAttribute("data-feuille"));
    });
  });
  tous("[data-feuille-fermer]").forEach(function (b) { b.addEventListener("click", function () { ouvrirFeuille(""); }); });
  if (params.get("feuille")) ouvrirFeuille(params.get("feuille"));

  // Palette Ctrl/⌘ K : filtre par nom, synonymes et termes d'autres logiciels.
  var palette = document.querySelector(".palette");
  var voile = document.querySelector(".voile");
  var champ = palette && palette.querySelector("input");
  var resultats = palette ? tous(".res", palette) : [];
  var vide = palette && palette.querySelector(".vide");
  var dernierFocus = null;

  function normaliser(t) {
    return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function filtrer() {
    var q = normaliser(champ.value);
    var premier = null;
    resultats.forEach(function (r) {
      var mots = normaliser(r.textContent + " " + (r.getAttribute("data-mots") || ""));
      var garde = !q || q.split(" ").every(function (m) { return mots.indexOf(m) > -1; });
      r.hidden = !garde;
      r.setAttribute("aria-selected", "false");
      if (garde && !premier) premier = r;
      var via = r.querySelector(".via");
      if (via) {
        var syn = (r.getAttribute("data-mots") || "").split(",").map(function (s) { return s.trim(); })
          .filter(function (s) { return q && normaliser(s).indexOf(q) > -1; })[0];
        via.hidden = !syn;
        if (syn) via.textContent = "Trouvé par le synonyme « " + syn + " »";
      }
    });
    if (premier) { premier.setAttribute("aria-selected", "true"); champ.setAttribute("aria-activedescendant", premier.id); }
    else champ.removeAttribute("aria-activedescendant");
    if (vide) vide.hidden = !!premier;
  }
  function ouvrirPalette(texte) {
    if (!palette) return;
    dernierFocus = document.activeElement;
    palette.setAttribute("data-ouvert", "true");
    voile.setAttribute("data-ouvert", "true");
    champ.value = texte || "";
    filtrer();
    champ.focus();
  }
  function fermerPalette() {
    if (!palette || palette.getAttribute("data-ouvert") !== "true") return;
    palette.setAttribute("data-ouvert", "false");
    voile.setAttribute("data-ouvert", "false");
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }
  function deplacer(sens) {
    var visibles = resultats.filter(function (r) { return !r.hidden; });
    var i = visibles.findIndex(function (r) { return r.getAttribute("aria-selected") === "true"; });
    if (!visibles.length) return;
    var j = (i + sens + visibles.length) % visibles.length;
    visibles.forEach(function (r, k) { r.setAttribute("aria-selected", String(k === j)); });
    champ.setAttribute("aria-activedescendant", visibles[j].id);
    visibles[j].scrollIntoView({ block: "nearest" });
  }
  var toast = document.querySelector(".toast");
  function annoncer(texte) {
    if (!toast) return;
    toast.textContent = texte;
    toast.setAttribute("data-ouvert", "true");
    window.clearTimeout(annoncer.t);
    annoncer.t = window.setTimeout(function () { toast.setAttribute("data-ouvert", "false"); }, 3200);
  }
  if (palette) {
    champ.addEventListener("input", filtrer);
    champ.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); deplacer(1); }
      if (e.key === "ArrowUp") { e.preventDefault(); deplacer(-1); }
      if (e.key === "Enter") {
        e.preventDefault();
        var r = resultats.filter(function (x) { return x.getAttribute("aria-selected") === "true"; })[0];
        if (r) { fermerPalette(); annoncer("Maquette : « " + r.querySelector(".nom").textContent + " » n'est pas exécutée."); }
      }
    });
    resultats.forEach(function (r) {
      r.addEventListener("click", function () { fermerPalette(); annoncer("Maquette : « " + r.querySelector(".nom").textContent + " » n'est pas exécutée."); });
    });
    voile.addEventListener("click", fermerPalette);
    tous("[data-palette-ouvrir]").forEach(function (b) { b.addEventListener("click", function () { ouvrirPalette(""); }); });
    tous("[data-palette-fermer]").forEach(function (b) { b.addEventListener("click", fermerPalette); });
    if (params.has("palette")) ouvrirPalette(params.get("palette"));
  }

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); ouvrirPalette(""); }
    if (e.key === "Escape") { fermerPalette(); ouvrirFeuille(""); }
  });

  // Outils et boutons de démonstration : rien n'est exécuté, on le dit.
  tous("[data-demo]").forEach(function (b) {
    b.addEventListener("click", function () { annoncer(b.getAttribute("data-demo")); });
  });

  // Lien « écran courant » du bandeau de maquette.
  var ici = window.location.pathname.split("/").pop() + window.location.search;
  tous(".bandeau-maquette .etats a").forEach(function (a) {
    if (a.getAttribute("href") === ici) a.setAttribute("aria-current", "true");
  });
})();
