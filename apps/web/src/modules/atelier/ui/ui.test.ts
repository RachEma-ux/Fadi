import { describe, expect, it } from "vitest";
import { creerRegistre, creerRegistreInspecteur, VUE_INITIALE } from "../socle";
import { modeleBarre } from "./barre";
import { contexteDemo, ETAT_DEMO, OUTILS_DEMO, outilDemo } from "./demo-fixtures";
import { lireNombre, texteCourt, texteExact, texteNiveau, texteValeur } from "./format";
import { champsGeneriques, commandeModification, enTeteObjet, proprietesObjet, valeurInchangee } from "./inspecteur-generique";
import { champsInspecteur, preparerModification } from "./inspecteur";
import { basculerMasque, calques, libelleObjet, niveaux, objetsDeProjet, objetsParClasse, vueValide } from "./navigateur";
import { activationOutil, deplacerActif, resultatsPalette, trouvePar } from "./palette";
import { groupesProblemes, lignesJournal, reservesHarmonie, resumePanneau } from "./problemes";
import { analyserRaccourci, resoudreTouche, tableRaccourcis, texteRaccourci, type EvenementTouche } from "./raccourcis";
import { basculerFavori, cleVue, ecrireVue, lireVue, type StockageVue } from "./vue-persistante";

const registreDemo = () => {
  const r = creerRegistre();
  for (const o of OUTILS_DEMO) r.enregistrer(o);
  return r;
};
const objet = (id: string) => {
  const o = ETAT_DEMO.objets[id];
  if (!o) throw new Error(id);
  return o;
};

describe("format : valeurs exactes, saisie française, unités contrôlées", () => {
  it("affiche exact dans un champ, arrondi en lecture, « non renseigné » / « non évaluée »", () => {
    expect(texteExact(0.1 + 0.2)).toBe("0,30000000000000004");
    expect(texteCourt(0.1 + 0.2)).toBe("0,3");
    expect(texteCourt(-0.0001)).toBe("0");
    expect(texteValeur(undefined)).toBe("non renseigné");
    expect(texteValeur({ nonEvaluee: true, motif: "source muette" })).toBe("non évaluée (source muette)");
    expect(texteValeur({ value: 3.2, unit: "m" })).toBe("3,2 m");
    expect(texteValeur(true)).toBe("oui");
    expect(texteNiveau({ value: -3.2, unit: "m" }, undefined)).toBe("-3,2 m · h non renseigné");
  });

  it("lit virgule ou point, convertit cm / mm en m explicitement, refuse une unité incompatible", () => {
    expect(lireNombre("0,25", "m", "Épaisseur")).toEqual({ ok: true, valeur: 0.25 });
    expect(lireNombre(" 3.2 m ", "m", "Hauteur")).toEqual({ ok: true, valeur: 3.2 });
    expect(lireNombre("25 cm", "m", "Épaisseur")).toEqual({ ok: true, valeur: 0.25 });
    expect(lireNombre("", "m", "Épaisseur")).toEqual({ ok: true, valeur: null });
    expect(lireNombre("90°", "°", "Angle")).toEqual({ ok: true, valeur: 90 });
    const r = lireNombre("3,2 m²", "m", "Hauteur");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreur.objet).toBe("Hauteur");
      expect(r.erreur.cause).toMatch(/grandeur incompatible/);
      expect(r.erreur.action).toMatch(/en m$/);
    }
    expect(lireNombre("abc", "m", "Hauteur").ok).toBe(false);
    expect(lireNombre("2 pieds", "m", "Hauteur").ok).toBe(false);
  });
});

describe("navigateur : niveaux, calques, objets par classe", () => {
  it("niveaux triés par ordre ; calques avec présence au niveau ; objets du niveau actif par classe avec totaux", () => {
    expect(niveaux(ETAT_DEMO).map((n) => [n.id, n.detail])).toEqual([
      ["n-ss", "-3,2 m · h 3,2 m"],
      ["n-rdc", "0 m · h 3,2 m"],
    ]);
    const c = calques(ETAT_DEMO, "n-rdc");
    expect(c.map((x) => [x.id, x.verrouille, x.presentAuNiveau])).toEqual([
      ["k-murs", false, true],
      ["k-fige", true, true],
      ["k-ss", false, false],
    ]);
    const g = objetsParClasse(ETAT_DEMO, "n-rdc");
    expect(g.map((x) => [x.classe, x.libelle, x.nombre, x.total])).toEqual([
      ["mur", "Mur", 2, 3],
      ["porte", "Porte", 1, 1],
      ["esquisse.ligne", "Ligne", 1, 1],
    ]);
    expect(g[0]?.objets.map((o) => o.libelle)).toEqual(["Façade nord", "m2"]);
    expect(objetsParClasse(ETAT_DEMO, "n-rdc", "facade").map((x) => x.objets.map((o) => o.id))).toEqual([["m1"]]);
    expect(objetsParClasse(ETAT_DEMO, "n-rdc", "PORTE")[0]?.objets[0]?.libelle).toBe("P01");
    expect(objetsDeProjet(ETAT_DEMO).map((x) => [x.classe, x.nombre])).toEqual([["hypothese", 1]]);
    expect(libelleObjet(objet("h1"))).toBe("H01 · Hypothèse de test");
  });

  it("vue valide : niveau et calque par défaut, calque verrouillé évité, masques orphelins retirés", () => {
    expect(vueValide(ETAT_DEMO, VUE_INITIALE)).toEqual({ niveauActifId: "n-ss", calqueActifId: "k-murs" });
    expect(vueValide(ETAT_DEMO, { ...VUE_INITIALE, niveauActifId: "n-rdc", calqueActifId: "k-fige", calquesMasques: ["k-ss", "disparu"] })).toEqual({ calquesMasques: ["k-ss"] });
    expect(vueValide(ETAT_DEMO, { ...VUE_INITIALE, niveauActifId: "inconnu", calqueActifId: "k-murs" })).toEqual({ niveauActifId: "n-ss" });
    expect(basculerMasque(["a"], "b")).toEqual(["a", "b"]);
    expect(basculerMasque(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("inspecteur générique depuis l'ontologie", () => {
  it("mur : paramètres déclarés, unités, provenance, lecture seule de la géométrie", () => {
    const champs = champsGeneriques(objet("m1"), "Façade nord");
    const par = Object.fromEntries(champs.map((c) => [c.cle, c]));
    expect(par.epaisseur).toMatchObject({ type: "longueur", unite: "m", valeur: 0.3, lectureSeule: false, provenance: "provenance import · statut déclarée" });
    expect(par.axe).toMatchObject({ lectureSeule: true, valeur: "(0 ; 0) → (5 ; 0) m" });
    expect(par.alignement).toMatchObject({ type: "choix", lectureSeule: false, provenance: "provenance import · statut à vérifier · lineRef absent" });
    expect(par.alignement?.choix?.map((c) => c.valeur)).toEqual(["gauche", "axe", "droite"]);
    expect(par.typeId?.lectureSeule).toBe(true);
    expect(par.niveauHaut?.valeur).toBeUndefined();
    expect(texteValeur(champsGeneriques(objet("m2")).find((c) => c.cle === "alignement")?.valeur)).toBe("non évaluée (source sans alignement)");
  });

  it("contrôle avant envoi « objet, cause, action » puis commande validée par le vrai réducteur", () => {
    const { ctx } = contexteDemo();
    const ep = champsGeneriques(objet("m1"), "Façade nord").find((c) => c.cle === "epaisseur");
    if (!ep) throw new Error("épaisseur");
    expect(ep.controler(-1)).toMatchObject({ objet: "Façade nord, paramètre « Épaisseur »", cause: "la valeur doit être strictement positive" });
    expect(ep.controler(null)?.cause).toBe("valeur obligatoire");
    expect(ep.controler(0.25)).toBeNull();
    const cmd = ep.commandes(0.25);
    expect(cmd).toEqual([{ type: "mur.modifier", params: { modifications: { epaisseur: { value: 0.25, unit: "m" } } }, cibles: ["m1"] }]);
    const essai = ctx.essayer(cmd);
    expect(essai.ok).toBe(true);
    if (essai.ok) expect((essai.etat.objets.m1?.params as { epaisseur: { value: number } }).epaisseur.value).toBe(0.25);
    expect(valeurInchangee(ep, 0.3)).toBe(true);
    expect(valeurInchangee(ep, 0.25)).toBe(false);
  });

  it("baie → ouverture.modifier sans hôte ni position ; esquisse → esquisse.modifier avec classe ; projet en lecture seule", () => {
    const porte = Object.fromEntries(champsGeneriques(objet("p1")).map((c) => [c.cle, c]));
    expect(porte.murHoteId?.lectureSeule).toBe(true);
    expect(porte.position?.valeur).toBe("t = 0,5");
    expect(porte.largeur?.commandes(1)).toEqual([{ type: "ouverture.modifier", params: { modifications: { largeur: { value: 1, unit: "m" } } }, cibles: ["p1"] }]);
    expect(porte.repere?.commandes(null)).toEqual([{ type: "ouverture.modifier", params: { modifications: { repere: null } }, cibles: ["p1"] }]);
    expect(porte.allege?.controler(-0.1)?.cause).toMatch(/négative/);
    const { ctx } = contexteDemo();
    expect(ctx.essayer(porte.largeur?.commandes(1) ?? []).ok).toBe(true);
    const ligne = champsGeneriques(objet("l1")).find((c) => c.cle === "nom");
    expect(ligne?.commandes("Nouvel axe")).toEqual([{ type: "esquisse.modifier", params: { classe: "esquisse.ligne", modifications: { nom: "Nouvel axe" } }, cibles: ["l1"] }]);
    const hyp = champsGeneriques(objet("h1"));
    expect(hyp.every((c) => c.lectureSeule)).toBe(true);
    expect(hyp[0]?.controler("x")?.cause).toMatch(/lecture seule/);
    expect(commandeModification(objet("h1"), "texte", "x")).toBeNull();
    const calque = Object.fromEntries(champsGeneriques(objet("k-murs")).map((c) => [c.cle, c]));
    expect(calque.ordre?.lectureSeule).toBe(true);
    expect(calque.couleur?.controler("vert")?.cause).toMatch(/mal formée/);
    expect(calque.verrouille?.commandes(true)[0]?.type).toBe("calque.modifier");
  });

  it("descripteur enregistré prioritaire, sinon repli ; en-tête et propriétés en lecture", () => {
    const { ctx } = contexteDemo();
    const r = creerRegistreInspecteur();
    r.enregistrer({ classes: ["mur"], champs: () => [{ cle: "special", libelle: "Spécial", type: "texte", valeur: "x", lectureSeule: true, controler: () => null, commandes: () => [] }] });
    expect(champsInspecteur(r, objet("m1"), ctx).map((c) => c.cle)).toEqual(["special"]);
    expect(champsInspecteur(r, objet("p1"), ctx).some((c) => c.cle === "largeur")).toBe(true);
    const enTete = Object.fromEntries(enTeteObjet(objet("m1")).map((l) => [l.libelle, l.valeur]));
    expect(enTete).toMatchObject({ Identifiant: "m1", Classe: "Mur (building.architecture)", "Classe IFC": "IfcWall" });
    expect(proprietesObjet(objet("m1"))).toEqual([{ nom: "import.lineRef", valeur: "axe", provenance: "provenance import · statut déclarée" }]);
  });

  it("descripteur en échec : repli générique annoncé, jamais d'inspecteur vide en silence", () => {
    const { ctx } = contexteDemo();
    const r = creerRegistreInspecteur();
    r.enregistrer({
      classes: ["mur"],
      champs: () => {
        throw new Error("panne");
      },
    });
    const champs = champsInspecteur(r, objet("m1"), ctx);
    expect(champs[0]?.cle).toBe("__erreur");
    expect(String(champs[0]?.valeur)).toMatch(/panne/);
    expect(champs.some((c) => c.cle === "epaisseur")).toBe(true);
  });
});

describe("inspecteur : préparation d'une modification", () => {
  it("inchangée, refus de saisie, refus du contrôle, contrôle à blanc, prête ; lecture seule du projet", () => {
    const { ctx } = contexteDemo();
    const m1 = objet("m1");
    const champs = Object.fromEntries(champsGeneriques(m1, "Façade nord").map((c) => [c.cle, c]));
    const ep = champs.epaisseur;
    const al = champs.alignement;
    if (!ep || !al) throw new Error("champs");
    expect(preparerModification(ep, { texte: "0,3" }, m1, ctx)).toEqual({ etat: "inchange" });
    expect(preparerModification(ep, { texte: "30 cm" }, m1, ctx)).toEqual({ etat: "inchange" });
    const unite = preparerModification(ep, { texte: "3 m²" }, m1, ctx);
    expect(unite.etat === "refus" && unite.erreurs[0]?.cause).toMatch(/grandeur incompatible/);
    const neg = preparerModification(ep, { texte: "-1" }, m1, ctx);
    expect(neg.etat === "refus" && neg.erreurs[0]?.cause).toMatch(/strictement positive/);
    const ok = preparerModification(ep, { texte: "25 cm" }, m1, ctx);
    expect(ok).toMatchObject({ etat: "pret", label: "Épaisseur · Façade nord" });
    expect(preparerModification(al, { texte: "gauche" }, m1, ctx).etat).toBe("pret");
    expect(preparerModification(champs.axe!, { texte: "x" }, m1, ctx).etat).toBe("refus");
    const lecture = contexteDemo({ ecriture: { permise: false, motif: "rôle lecteur" } }).ctx;
    const r = preparerModification(ep, { texte: "0,2" }, m1, lecture);
    expect(r.etat === "refus" && r.erreurs[0]?.cause).toBe("rôle lecteur");
    const refusReducteur = preparerModification({ ...ep, commandes: () => [{ type: "mur.modifier", params: { modifications: { epaisseur: { value: 1, unit: "m" } } }, cibles: ["absent"] }] as never }, { texte: "1" }, m1, ctx);
    expect(refusReducteur.etat).toBe("refus");
  });
});

describe("palette Ctrl/⌘ K", () => {
  it("cherche dans toutes les commandes, dit comment, motif d'indisponibilité, objets et aides", () => {
    const { ctx } = contexteDemo();
    const outils = registreDemo();
    const push = resultatsPalette({ texte: "push", filtre: "tout", outils, ctx, etat: ETAT_DEMO, favoris: [] });
    const r = push.resultats[0];
    expect(r).toMatchObject({ nom: "Pousser / tirer", etiquette: "Modifier · outil", via: "Trouvé par le synonyme « push/pull »", motif: "vue 3D au lot 3b" });
    const dep = resultatsPalette({ texte: "move", filtre: "outils", outils, ctx, etat: ETAT_DEMO, favoris: ["modifier.deplacer"] }).resultats;
    expect(dep).toHaveLength(1);
    expect(dep[0]).toMatchObject({ motif: "sélectionner au moins un objet", favori: true, raccourci: "D" });
    ctx.selection.choisir(["m1"]);
    expect(resultatsPalette({ texte: "move", filtre: "outils", outils, ctx, etat: ETAT_DEMO, favoris: [] }).resultats[0]?.motif).toBeNull();
    const objets = resultatsPalette({ texte: "façade", filtre: "objets", outils, ctx, etat: ETAT_DEMO, favoris: [] }).resultats;
    expect(objets.map((x) => [x.nom, x.etiquette, x.action])).toEqual([["Façade nord", "Mur · objet", { type: "objet", id: "m1", niveauId: "n-rdc" }]]);
    const tous = resultatsPalette({ texte: "", filtre: "tout", outils, ctx, etat: ETAT_DEMO, favoris: [] }).resultats;
    expect(tous.filter((x) => x.categorie === "outils")).toHaveLength(OUTILS_DEMO.length);
    expect(tous.some((x) => x.categorie === "objets")).toBe(false);
  });

  it("DA-05-03 : « level » → Calques ; « niveau » → Niveaux (étages) avant Calques ; limite d'objets annoncée", () => {
    const { ctx } = contexteDemo();
    const outils = registreDemo();
    const level = resultatsPalette({ texte: "level", filtre: "aides", outils, ctx, etat: ETAT_DEMO, favoris: [] }).resultats;
    expect(level[0]).toMatchObject({ nom: "Calques", via: "Trouvé par le synonyme « level »" });
    expect(level[0]?.aide.exemple).toMatch(/un niveau est un étage/);
    const niveau = resultatsPalette({ texte: "niveau", filtre: "aides", outils, ctx, etat: ETAT_DEMO, favoris: [] }).resultats.map((x) => x.nom);
    expect(niveau.indexOf("Niveaux (étages)")).toBeLessThan(niveau.indexOf("Calques"));
    expect(resultatsPalette({ texte: "undo", filtre: "tout", outils, ctx, etat: ETAT_DEMO, favoris: [] }).resultats[0]?.action).toEqual({ type: "annuler" });
    const limite = resultatsPalette({ texte: "m", filtre: "objets", outils, ctx, etat: ETAT_DEMO, favoris: [], maxObjets: 2 });
    expect(limite.resultats).toHaveLength(2);
    expect(limite.objetsNonListes).toBeGreaterThan(0);
  });

  it("lecture seule : outil d'écriture inactivable avec le motif ; outil de mesure permis ; activation en panne lisible", () => {
    const { ctx } = contexteDemo({ ecriture: { permise: false, motif: "exemple protégé" } });
    const mur = OUTILS_DEMO.find((o) => o.id === "creer.mur");
    const metre = OUTILS_DEMO.find((o) => o.id === "analyser.metre");
    if (!mur || !metre) throw new Error("outils");
    expect(activationOutil(mur, ctx)).toEqual({ ok: false, motif: "exemple protégé" });
    expect(activationOutil(metre, ctx)).toEqual({ ok: true });
    const panne = outilDemo("x.panne", "Panne", {
      ecrit: false,
      activation: () => {
        throw new Error("boum");
      },
    });
    expect(activationOutil(panne, ctx)).toEqual({ ok: false, motif: "contrôle d'activation en échec : boum" });
    expect(trouvePar(mur, "cloison")).toBe("Trouvé par le synonyme « cloison »");
    expect(trouvePar(mur, "mu")).toBe("");
    expect(deplacerActif(-1, 3, 1)).toBe(0);
    expect(deplacerActif(0, 3, -1)).toBe(2);
    expect(deplacerActif(2, 3, 1)).toBe(0);
    expect(deplacerActif(0, 0, 1)).toBe(-1);
  });
});

describe("raccourcis clavier", () => {
  const touche = (key: string, extra: Partial<EvenementTouche> = {}): EvenementTouche => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, dansChamp: false, ...extra });

  it("table : réservés, outils, conflits (mal formé, réservé, doublon)", () => {
    expect(analyserRaccourci("Maj+X")).toEqual({ touche: "x", maj: true, mod: false });
    expect(analyserRaccourci("Ctrl+X")).toBeNull();
    expect(texteRaccourci("maj+m")).toBe("Maj M");
    const t = tableRaccourcis([...OUTILS_DEMO, { id: "x.ctrl", raccourci: "Ctrl+K" }, { id: "x.double", raccourci: "m" }, { id: "x.long", raccourci: "MM" }]);
    expect(t.conflits.map((c) => [c.outilId, c.motif])).toEqual([
      ["x.ctrl", "raccourci mal formé (une lettre ou un chiffre, éventuellement Maj+)"],
      ["x.double", "déjà pris par « creer.mur »"],
      ["x.long", "raccourci mal formé (une lettre ou un chiffre, éventuellement Maj+)"],
    ]);
    expect(resoudreTouche(touche("m"), t)).toEqual({ type: "outil", id: "creer.mur" });
    expect(resoudreTouche(touche("M", { shiftKey: true }), t)).toEqual({ type: "outil", id: "analyser.metre" });
    expect(resoudreTouche(touche("k", { ctrlKey: true }), t)).toEqual({ type: "palette" });
    expect(resoudreTouche(touche("k", { metaKey: true, dansChamp: true }), t)).toEqual({ type: "palette" });
    expect(resoudreTouche(touche("z", { metaKey: true }), t)).toEqual({ type: "annuler" });
    expect(resoudreTouche(touche("Z", { ctrlKey: true, shiftKey: true }), t)).toEqual({ type: "retablir" });
    expect(resoudreTouche(touche("y", { ctrlKey: true }), t)).toEqual({ type: "retablir" });
    expect(resoudreTouche(touche("Escape", { dansChamp: true }), t)).toEqual({ type: "echap" });
  });

  it("dans un champ : ni outil ni Ctrl/⌘ Z ; Alt et Ctrl+lettre d'outil ignorés", () => {
    const t = tableRaccourcis(OUTILS_DEMO);
    expect(resoudreTouche(touche("m", { dansChamp: true }), t)).toBeNull();
    expect(resoudreTouche(touche("z", { ctrlKey: true, dansChamp: true }), t)).toBeNull();
    expect(resoudreTouche(touche("m", { altKey: true }), t)).toBeNull();
    expect(resoudreTouche(touche("m", { ctrlKey: true }), t)).toBeNull();
    expect(resoudreTouche(touche("q"), t)).toBeNull();
  });
});

describe("barre de commandes", () => {
  it("Essentiel à plat, Contextuel selon la sélection, Complet par familles ; favoris en tête", () => {
    const { ctx } = contexteDemo();
    const activation = (o: (typeof OUTILS_DEMO)[number]) => activationOutil(o, ctx);
    const ess = modeleBarre({ outils: OUTILS_DEMO, niveau: "essentiel", favoris: ["modifier.decaler", "inconnu"], famille: "creer", activation });
    expect(ess.favoris.map((o) => o.id)).toEqual(["modifier.decaler"]);
    expect(ess.groupes[0]?.outils.map((o) => o.id)).toEqual(["creer.mur", "creer.porte", "analyser.metre"]);
    expect(ess.familles).toEqual([]);
    expect(modeleBarre({ outils: OUTILS_DEMO, niveau: "contextuel", favoris: [], famille: "creer", activation }).groupes[1]?.outils).toEqual([]);
    ctx.selection.choisir(["m1"]);
    expect(modeleBarre({ outils: OUTILS_DEMO, niveau: "contextuel", favoris: [], famille: "creer", activation }).groupes[1]?.outils.map((o) => o.id)).toEqual(["modifier.deplacer"]);
    const complet = modeleBarre({ outils: OUTILS_DEMO, niveau: "complet", favoris: [], famille: "modifier", activation });
    expect(complet.familles.map((f) => [f.libelle, f.nombre])).toEqual([
      ["Créer", 2],
      ["Modifier", 3],
      ["Connecter", 0],
      ["Analyser", 1],
      ["Documenter", 0],
      ["Partager", 0],
    ]);
    expect(complet.groupes[0]?.outils.map((o) => o.id)).toEqual(["modifier.deplacer", "modifier.decaler", "modifier.pousser"]);
  });
});

describe("persistance de la vue par projet", () => {
  const memoire = (): StockageVue & { donnees: Map<string, string> } => {
    const donnees = new Map<string, string>();
    return { donnees, getItem: (k) => donnees.get(k) ?? null, setItem: (k, v) => void donnees.set(k, v) };
  };

  it("aller-retour sans outil actif ni vue 3D ; champs invalides ignorés ; stockage en panne toléré", () => {
    const s = memoire();
    const vue = { ...VUE_INITIALE, niveauActifId: "n-rdc", niveauAffichage: "complet" as const, favoris: ["creer.mur"], calquesMasques: ["k"], outilActif: "creer.mur", vue: "3d" as const };
    expect(ecrireVue(s, "p1", vue)).toBe(true);
    expect(lireVue(s, "p1")).toEqual({ niveauActifId: "n-rdc", calqueActifId: null, niveauAffichage: "complet", favoris: ["creer.mur"], calquesMasques: ["k"], immersif: false });
    expect(lireVue(s, "p2")).toEqual({});
    s.donnees.set(cleVue("p3"), "{pas du json");
    expect(lireVue(s, "p3")).toEqual({});
    s.donnees.set(cleVue("p4"), JSON.stringify({ version: 1, niveauAffichage: "géant", favoris: [1, 2], niveauActifId: 3, immersif: true }));
    expect(lireVue(s, "p4")).toEqual({ immersif: true });
    s.donnees.set(cleVue("p5"), JSON.stringify({ version: 99, niveauActifId: "x" }));
    expect(lireVue(s, "p5")).toEqual({});
    const panne: StockageVue = {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(lireVue(panne, "p1")).toEqual({});
    expect(ecrireVue(panne, "p1", vue)).toBe(false);
    expect(lireVue(null, "p1")).toEqual({});
    expect(basculerFavori(["a"], "b")).toEqual(["a", "b"]);
    expect(basculerFavori(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("panneau des modifications et problèmes", () => {
  it("lots locaux au-dessus du journal validé (plus récent d'abord), états lisibles", () => {
    const enveloppe = (label: string, base: number) => ({ requestId: label, baseRevision: base, contract: "atelier-commands/1" as const, label, commands: [{ type: "mur.supprimer", params: {}, cibles: ["m1"] }] });
    const locales = [
      { requestId: "b", projectId: "p", ordre: 2, enveloppe: enveloppe("Mur B", 7), etat: "en-conflit" as const, tentatives: 1, derniereErreur: "409", creeLe: "", conflit: null },
      { requestId: "a", projectId: "p", ordre: 1, enveloppe: enveloppe("Mur A", 7), etat: "en-attente" as const, tentatives: 0, derniereErreur: null, creeLe: "", conflit: null },
    ] as unknown as Parameters<typeof lignesJournal>[0];
    const validees = [
      { journalId: "1", requestId: "r1", revision: 6, baseRevision: 5, label: "Import de l'exemple P.118", types: [], objetIds: [], inverseDe: null, creeLe: "2026-10-04T08:00:00Z" },
      { journalId: "2", requestId: "r2", revision: 7, baseRevision: 6, label: "", types: ["mur.modifier" as const], objetIds: ["m1"], inverseDe: "1", auteur: "fadi", creeLe: "bad" },
    ];
    const l = lignesJournal(locales, validees);
    expect(l.map((x) => [x.revision, x.libelle, x.etat])).toEqual([
      ["—", "Mur A", "local"],
      ["—", "Mur B", "conflit"],
      ["r7", "mur.modifier", "synchronise"],
      ["r6", "Import de l'exemple P.118", "synchronise"],
    ]);
    expect(l[1]?.detail).toBe("fondé sur la révision 7 · 1 envoi(s) · 409");
    expect(l[2]?.detail).toBe("annulation ou rétablissement · par fadi · 1 objet(s)");
  });

  it("problèmes groupés par catégorie et gravité ; réserves Harmonie du bilan ; résumé", () => {
    const pb = (categorie: string, gravite: string, message: string) => ({ code: "reference-a-reparer", gravite, message, objetIds: [], categorie }) as unknown as Parameters<typeof groupesProblemes>[0][number];
    const liste = [pb("document", "information", "d1"), pb("reference", "avertissement", "r1"), pb("reference", "erreur", "r2"), pb("inconnue", "erreur", "x")];
    expect(groupesProblemes(liste).map((g) => [g.libelle, g.problemes.map((p) => p.message)])).toEqual([
      ["Références à réparer", ["r2", "r1"]],
      ["Documents à recalculer", ["d1"]],
      ["Autres problèmes", ["x"]],
    ]);
    const h = reservesHarmonie({ analysis: { issues: [{ id: "HEIGHT", priority: "prioritaire", title: "Hauteurs", body: "Règle HEIGHT", refs: ["n1"], step: 10 }], stale: true, generatedAt: "2026-10-04T08:00:00Z" } } as never);
    expect(h.reserves).toEqual([{ id: "HEIGHT", titre: "Hauteurs", priorite: "prioritaire", detail: "Règle HEIGHT", etape: 10, refs: ["n1"] }]);
    expect(h.perime).toBe(true);
    expect(reservesHarmonie(null)).toEqual({ reserves: [], perime: false, calculeLe: "" });
    expect(resumePanneau(liste, 1, 2, 3)).toEqual({ harmonie: 1, references: 2, documents: 1, autres: 1, conflits: 2, enAttente: 3 });
  });
});
