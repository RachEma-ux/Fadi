import { describe, expect, it } from "vitest";
import { aire, ajouterRectangle, contexte, estSolide, modeleVide, verrouillerOccurrences } from "./geometrie-libre.js";
import { lireModelePlanche } from "./delta.js";
import { EXEMPLES_SCRIPTS, FONCTIONS_SCRIPT, MAX_CODE_SCRIPT, MAX_CODE_TOTAL, MAX_LIGNES_JOURNAL, MAX_OPERATIONS_SCRIPT, MAX_SCRIPTS, MESSAGES_ERREUR_SCRIPT, executerScript, idScript, normaliserCodeScript, validerScripts } from "./scripts.js";
import { v3 } from "./vecteur.js";

const exemple = (id: string) => EXEMPLES_SCRIPTS.find((e) => e.id === id)!.code;

describe("Scripts — exécution", () => {
  it("dessine par l'objet planche : une boîte groupée est un solide fermé", () => {
    const r = executerScript('const b = planche.boite([1, 2, 0], 2, 1, 3);\nconst g = planche.grouper(b, "Bloc");\nplanche.afficher(planche.nom(g), planche.objets().length);', modeleVide());
    expect(r.erreur).toBeNull();
    expect(r.journal).toEqual(["Bloc 1"]);
    const occ = Object.values(r.modele.racine.occurrences);
    expect(occ).toHaveLength(1);
    expect(estSolide(r.modele, occ[0]!.id)).toBe(true);
    const c = contexte(r.modele, occ[0]!.id);
    expect(Object.keys(c.faces)).toHaveLength(6);
    const zs = Object.values(c.sommets).map((s) => s.position.z);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([0, 3]);
    expect(r.crees).toEqual([occ[0]!.id]);
    expect(lireModelePlanche(JSON.parse(JSON.stringify(r.modele)))).not.toBeNull();
  });

  it("ne modifie jamais le modèle reçu ; une erreur rend le modèle d'origine avec la ligne fautive", () => {
    const depart = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const copie = JSON.stringify(depart);
    const r = executerScript("planche.boite([5, 5, 0], 1, 1, 1);\n\nplanche.boite([0, 0, 0], -1, 1, 1);\nplanche.afficher('jamais');", depart);
    expect(r.modele).toBe(depart);
    expect(JSON.stringify(depart)).toBe(copie);
    expect(r.crees).toEqual([]);
    expect(r.erreur).toMatchObject({ cle: "positif", ligne: 3, args: { fonction: "boite", quoi: "largeur" } });
    expect(r.erreur!.message).toContain("strictement positif");
  });

  it("donne la ligne d'une erreur JavaScript et d'un refus du modèle", () => {
    expect(executerScript("const a = 1;\nconst b = a.x.y;", modeleVide()).erreur).toMatchObject({ cle: "execution", ligne: 2 });
    expect(executerScript("// rien\n\n\nabsent();", modeleVide()).erreur).toMatchObject({ cle: "execution", ligne: 4 });
    expect(executerScript("function f() {\n  throw new Error('voulu');\n}\nf();", modeleVide()).erreur).toMatchObject({ cle: "execution", message: "voulu", ligne: 2 });
    expect(executerScript("planche.pousser('f999', 1);", modeleVide()).erreur).toMatchObject({ cle: "introuvable", ligne: 1 });
  });

  it("refuse un script illisible, trop long, ou qui importe du code", () => {
    expect(executerScript("const = ;", modeleVide()).erreur).toMatchObject({ cle: "syntaxe", ligne: null });
    expect(executerScript(`// ${"x".repeat(MAX_CODE_SCRIPT)}`, modeleVide()).erreur).toMatchObject({ cle: "texte" });
    expect(executerScript("const m = await import('https://exemple.invalid/x.js');", modeleVide()).erreur).toMatchObject({ cle: "import" });
    // Le mot dans un commentaire n'est pas un import.
    expect(executerScript("// import interdit\nplanche.afficher('ok');", modeleVide()).erreur).toBeNull();
  });

  it("vérifie les arguments : point, nombre, identifiants, genre d'élément", () => {
    const cle = (code: string) => executerScript(code, modeleVide()).erreur?.cle;
    expect(cle("planche.ligne([0, 0], [1, 0, 0]);")).toBe("point");
    expect(cle("planche.ligne([0, 0, 0], [1, 0, NaN]);")).toBe("point");
    expect(cle("planche.copier([], [1, 0, 0]);")).toBe("vide");
    expect(cle("planche.copier(12, [1, 0, 0]);")).toBe("identifiants");
    expect(cle("const a = planche.ligne([0, 0, 0], [1, 0, 0]);\nplanche.copier(a, [0, 1, 0], 0.5);")).toBe("entier");
    expect(cle("const a = planche.ligne([0, 0, 0], [1, 0, 0]);\nplanche.aire(a[0]);")).toBe("face");
    expect(cle("const f = planche.rectangle([0, 0, 0], [1, 0, 0], [0, 1, 0]);\nplanche.longueur(f);")).toBe("arete");
    expect(cle("const f = planche.rectangle([0, 0, 0], [1, 0, 0], [0, 1, 0]);\nplanche.pousser(f, 'haut');")).toBe("nombre");
  });

  it("lit le dessin : sélection, genres, aire, longueur, points", () => {
    const depart = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 3, 0));
    const face = Object.keys(depart.modele.racine.faces)[0]!;
    const r = executerScript(
      "const s = planche.selection();\nplanche.afficher(s.length, planche.genre(s[0]), planche.aire(s[0]), planche.aretes().length, planche.faces().length);\nplanche.afficher(planche.longueur(planche.aretes()[0]) > 0, planche.points(s[0]).length, planche.genre('absent'));",
      depart.modele,
      { selection: [face, "disparu"] },
    );
    expect(r.erreur).toBeNull();
    expect(r.journal).toEqual(["1 face 6 4 1", "true 4 null"]);
    expect(r.modele).toBe(depart.modele);
  });

  it("déplace, copie, tourne et efface", () => {
    const r = executerScript(
      "const g = planche.grouper(planche.boite([0, 0, 0], 1, 1, 1), 'A');\nconst copies = planche.copier(g, [2, 0, 0], 3);\nplanche.deplacer(g, [0, 5, 0]);\nplanche.tourner(copies[0], [0, 0, 0], [0, 0, 1], 90);\nplanche.effacer(copies[2]);\nplanche.afficher(copies.length, planche.objets().length);",
      modeleVide(),
    );
    expect(r.erreur).toBeNull();
    expect(r.journal).toEqual(["3 3"]);
    expect(r.crees).toHaveLength(3);
  });

  it("travaille dans l'objet ouvert, et respecte un objet verrouillé", () => {
    const a = executerScript("planche.grouper(planche.boite([0, 0, 0], 1, 1, 1), 'A');", modeleVide());
    const occ = Object.keys(a.modele.racine.occurrences)[0]!;
    const dedans = executerScript("planche.boite([3, 0, 0], 1, 1, 1);\nplanche.afficher(planche.faces().length);", a.modele, { dans: occ });
    expect(dedans.erreur).toBeNull();
    expect(dedans.journal).toEqual(["12"]);
    expect(Object.keys(dedans.modele.racine.faces)).toHaveLength(0);
    const verrou = verrouillerOccurrences(a.modele, [occ], true).modele;
    const refus = executerScript(`planche.afficher('avant');\nplanche.effacer('${occ}');`, verrou);
    expect(refus.erreur).toMatchObject({ cle: "execution", ligne: 2 });
    expect(refus.modele).toBe(verrou);
    expect(refus.journal).toEqual(["avant"]);
  });

  it("borne les opérations de dessin et le journal", () => {
    const r = executerScript("const a = planche.ligne([0, 0, 0], [1, 0, 0]);\nfor (let i = 0; i < 100000; i++) planche.deplacer(a, [0, 1, 0]);", modeleVide());
    expect(r.erreur).toMatchObject({ cle: "limite", ligne: 2, args: { max: String(MAX_OPERATIONS_SCRIPT) } });
    expect(Object.keys(r.modele.racine.aretes)).toHaveLength(0);
    const j = executerScript("for (let i = 0; i < 1000; i++) planche.afficher(i);", modeleVide());
    expect(j.journal).toHaveLength(MAX_LIGNES_JOURNAL);
  });

  it("l'objet planche est figé et porte exactement les fonctions annoncées", () => {
    const r = executerScript("planche.afficher(Object.keys(planche).join(','), Object.isFrozen(planche));\nplanche.ligne = null;", modeleVide());
    expect(r.journal).toEqual([`${FONCTIONS_SCRIPT.join(",")} true`]);
    expect(r.erreur).toMatchObject({ cle: "execution", ligne: 2 });
  });
});

describe("Scripts — exemples fournis", () => {
  it("rangée de poteaux : six poteaux identiques au pas donné", () => {
    const r = executerScript(exemple("rangee-poteaux"), modeleVide());
    expect(r.erreur).toBeNull();
    const occ = Object.values(r.modele.racine.occurrences);
    expect(occ).toHaveLength(6);
    expect(new Set(occ.map((o) => o.definition)).size).toBe(1);
    expect(occ.map((o) => Math.round((o.transformation[3] as number) * 100) / 100).sort((a, b) => a - b)).toEqual([0, 1.2, 2.4, 3.6, 4.8, 6]);
    expect(occ.every((o) => estSolide(r.modele, o.id))).toBe(true);
    expect(r.journal[0]).toContain("6 poteaux");
  });

  it("escalier droit : douze marches pleines, chacune un solide fermé", () => {
    const r = executerScript(exemple("escalier-droit"), modeleVide());
    expect(r.erreur).toBeNull();
    const occ = Object.values(r.modele.racine.occurrences);
    expect(occ).toHaveLength(12);
    expect(occ.every((o) => estSolide(r.modele, o.id))).toBe(true);
    expect(Object.keys(r.modele.racine.faces)).toHaveLength(0);
    expect(r.journal).toEqual(["Hauteur franchie : 2.04 m", "Longueur au sol : 3.36 m"]);
  });

  it("aire des faces sélectionnées : lit sans rien modifier", () => {
    const depart = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 3, 0)).modele;
    const face = Object.keys(depart.racine.faces)[0]!;
    expect(aire(depart, face)).toBeCloseTo(6);
    const r = executerScript(exemple("aire-selection"), depart, { selection: [face, ...Object.keys(depart.racine.aretes)] });
    expect(r.erreur).toBeNull();
    expect(r.modele).toBe(depart);
    expect(r.journal).toEqual(["1 face(s) : 6.000 m²"]);
  });

  it("chaque exemple est un script valide, d'identifiant et de nom distincts", () => {
    expect(validerScripts(EXEMPLES_SCRIPTS.map((e) => ({ id: e.id, nom: e.nom, code: e.code }))).ok).toBe(true);
  });
});

describe("Scripts — « Mes scripts »", () => {
  const s = (id: string, nom: string, code = "planche.afficher(1);") => ({ id, nom, code });
  it("accepte une liste bornée et rogne les noms", () => {
    const r = validerScripts([s("a", "  Mon script  "), s("b-2", "Autre")]);
    expect(r).toEqual({ ok: true, scripts: [s("a", "Mon script"), s("b-2", "Autre")] });
    expect(validerScripts([])).toEqual({ ok: true, scripts: [] });
  });
  it("refuse une forme invalide, sans filtrer", () => {
    const refuse = (v: unknown) => expect(validerScripts(v).ok, JSON.stringify(v).slice(0, 80)).toBe(false);
    refuse(null);
    refuse({});
    refuse([null]);
    refuse([{ ...s("a", "A"), autre: 1 }]);
    refuse([s("A", "A")]);
    refuse([s("a", "")]);
    refuse([s("a", "x".repeat(61))]);
    refuse([s("a", "A", "x".repeat(MAX_CODE_SCRIPT + 1))]);
    refuse([s("a", "A", "a\u0000b")]);
    refuse([s("a", "A"), s("a", "B")]);
    refuse([s("a", "Nom"), s("b", "nom")]);
    refuse(Array.from({ length: MAX_SCRIPTS + 1 }, (_, i) => s(`s${i}`, `S ${i}`)));
    refuse(Array.from({ length: 6 }, (_, i) => s(`s${i}`, `S ${i}`, "x".repeat(MAX_CODE_SCRIPT))));
    expect(6 * MAX_CODE_SCRIPT).toBeGreaterThan(MAX_CODE_TOTAL);
  });
  it("dérive un identifiant du nom et unifie les fins de ligne", () => {
    expect(idScript("Rangée de poteaux", [])).toBe("rangee-de-poteaux");
    expect(idScript("Rangée de poteaux", ["rangee-de-poteaux"])).toBe("rangee-de-poteaux-2");
    expect(idScript("***", [])).toBe("script");
    expect(validerScripts([s(idScript("x".repeat(60), []), "X")]).ok).toBe(true);
    expect(normaliserCodeScript("a\r\nb\rc")).toBe("a\nb\nc");
  });
  it("chaque clé d'erreur a un texte français", () => {
    for (const [cle, texte] of Object.entries(MESSAGES_ERREUR_SCRIPT)) expect(texte.length, cle).toBeGreaterThan(0);
  });
});
