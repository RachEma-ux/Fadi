/**
 * Plan vectoriel (cas 4 du catalogue des extensions, étape 5 : D7-F11-006, D7-S-001, D7-F11-001) : projection avec
 * lignes cachées, coupe et poché, motifs de hachure (saisie, .pat), sortie SVG à l'échelle.
 */
import { describe, expect, it } from "vitest";
import type { PlanDeCoupe } from "./annotations.js";
import { lireModelePlanche } from "./delta.js";
import { type Id, type Modele, ajouterRectangle, modeleVide, modifierAnnotations, peindreFaces, pousserTirer } from "./geometrie-libre.js";
import { ajouterMotifs, associerMotif, estMotif, familleSimple, lirePat, matieresParMotif, modifierMotif, planDeCoupeActif, projeterPlan, repereVue, sectionsDeCoupe, supprimerMotif, svgPlan } from "./plan-vectoriel.js";
import { dot, v3 } from "./vecteur.js";

/** Boîte 4 × 3 × 2 posée sur le sol à l'origine. */
function boite(): Modele {
  const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const f = Object.keys(sol.racine.faces)[0] as Id;
  return pousserTirer(sol, f, sol.racine.faces[f]!.normale.z > 0 ? 2 : -2).modele;
}

const coupeA1m: PlanDeCoupe = { id: "c1", origine: v3(0, 0, 1), normale: v3(0, 0, 1), u: v3(1, 0, 0), w: v3(0, 1, 0), demiU: 3, demiW: 3, actif: true, inverse: false, nom: "Coupe 1" };
const DESSUS = { direction: v3(0, 0, -1), haut: v3(0, 1, 0) };
const OPTIONS = { echelle: 50, traits: { coupe: 0.5, vu: 0.18, cache: 0.13 }, cachees: "pointille" as const };

function avecMatiere(m: Modele): { modele: Modele; matiere: Id } {
  let matiere = "" as Id;
  const modele = modifierAnnotations(m, (a, id) => {
    matiere = id("m");
    a.materiaux[matiere] = { id: matiere, nom: "Béton", couleur: "#808080" };
  }).modele;
  return { modele: peindreFaces(modele, Object.keys(modele.racine.faces) as Id[], matiere).modele, matiere };
}

describe("Projection et lignes cachées", () => {
  it("repère de vue : dessus = x à droite, y en haut", () => {
    const R = repereVue(DESSUS);
    expect(R.x.x).toBeCloseTo(1);
    expect(R.y.y).toBeCloseTo(1);
  });

  it("vue oblique : seules les trois arêtes du coin arrière (origine) sont cachées", () => {
    const m = boite();
    const vue = { direction: v3(-1, -1, -1) };
    const plan = projeterPlan(m, vue, { plan: null });
    const R = repereVue(vue);
    const o = { x: 0, y: 0 };
    const caches = plan.traits.filter((t) => t.classe === "cache");
    expect(caches.length).toBe(3);
    // Chaque trait caché part du coin arrière projeté.
    for (const t of caches) expect(Math.min(Math.hypot(t.a.x - o.x, t.a.y - o.y), Math.hypot(t.b.x - o.x, t.b.y - o.y))).toBeLessThan(1e-6);
    expect(plan.traits.filter((t) => t.classe === "vu").length).toBe(9);
    expect(plan.traits.some((t) => t.classe === "coupe")).toBe(false);
    expect(dot(R.z, v3(-1, -1, -1))).toBeGreaterThan(0);
  });

  it("aucun plan actif : rien n'est coupé ; le dernier plan actif est retenu", () => {
    const m = boite();
    expect(planDeCoupeActif(m)).toBeNull();
    const avec = modifierAnnotations(m, (a) => {
      a.plansDeCoupe["c0"] = { ...coupeA1m, id: "c0", actif: false };
      a.plansDeCoupe["c1"] = coupeA1m;
    }).modele;
    expect(planDeCoupeActif(avec)?.id).toBe("c1");
  });
});

describe("Coupe et poché", () => {
  it("coupe horizontale à 1 m : un contour fermé 4 × 3, tracé en trait coupé ; le dessus a disparu", () => {
    const { modele, matiere } = avecMatiere(boite());
    const s = sectionsDeCoupe(modele, coupeA1m);
    expect(s).toHaveLength(1);
    expect(s[0]!.materiau).toBe(matiere);
    expect(s[0]!.boucles).toHaveLength(1);
    expect(s[0]!.boucles[0]).toHaveLength(4);
    const plan = projeterPlan(modele, DESSUS, { plan: coupeA1m });
    expect(plan.poches).toHaveLength(1);
    expect(plan.traits.filter((t) => t.classe === "coupe")).toHaveLength(4);
    expect(plan.cadre).toEqual({ min: { x: 0, y: 0 }, max: { x: 4, y: 3 } });
    // Les arêtes du dessus (z = 2) sont coupées : aucun trait vu au-dessus du plan.
    expect(plan.traits.every((t) => t.classe !== "cache")).toBe(true);
  });

  it("une seule face peinte : le contour reste fermé et prend sa matière", () => {
    const m = boite();
    const cote = Object.values(m.racine.faces).find((f) => f.normale.x > 0.9)!.id as Id;
    let matiere = "" as Id;
    const avec = modifierAnnotations(m, (a, id) => {
      matiere = id("m");
      a.materiaux[matiere] = { id: matiere, nom: "Brique", couleur: "#aa5533" };
    }).modele;
    const s = sectionsDeCoupe(peindreFaces(avec, [cote], matiere).modele, coupeA1m);
    expect(s.map((x) => [x.materiau, x.boucles.length])).toEqual([[matiere, 1]]);
  });

  it("face couchée dans le plan de coupe : pas de poché fantôme", () => {
    const m = boite();
    expect(sectionsDeCoupe(m, { ...coupeA1m, origine: v3(0, 0, 2) })).toHaveLength(0);
  });
});

describe("Motifs de hachure", () => {
  it(".pat : lu par familles ; une ligne illisible refuse le fichier avec son numéro", () => {
    const r = lirePat("; motifs du bureau\n*BETON, béton armé\n45, 0,0, 0,3\n135, 0,0, 0,3, 1,-0.5\n*TERRE\n0,0,0,0,2\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.motifs.map((x) => x.nom)).toEqual(["BETON", "TERRE"]);
      expect(r.motifs[0]!.familles[1]).toEqual({ angle: 135, x0: 0, y0: 0, dx: 0, dy: 3, tirets: [1, -0.5] });
    }
    expect(lirePat("*A\n45, 0, x, 0, 3\n")).toEqual({ ok: false, ligne: 2 });
    expect(lirePat("45,0,0,0,3\n")).toEqual({ ok: false, ligne: 1 });
    expect(lirePat("*VIDE\n").ok).toBe(false);
    expect(lirePat("*A\n45,0,0,0,0\n")).toEqual({ ok: false, ligne: 2 });
  });

  it("ajouter, modifier, associer, supprimer (la matière revient à l'aplat) ; persistance validée", () => {
    const { modele, matiere } = avecMatiere(boite());
    expect(ajouterMotifs(modele, [{ nom: " ", familles: [familleSimple(45, 3)], source: { genre: "saisie" } }])).toEqual({ ok: false, erreur: "nom" });
    expect(ajouterMotifs(modele, [{ nom: "A", familles: [familleSimple(45, 0)], source: { genre: "saisie" } }])).toEqual({ ok: false, erreur: "pas" });
    const a = ajouterMotifs(modele, [{ nom: "Béton armé", familles: [familleSimple(45, 3)], source: { genre: "saisie" } }]);
    if (!a.ok) throw new Error("ajout refusé");
    const id = a.ids[0]!;
    expect(id).toMatch(/^h/);
    expect(modifierMotif(a.modele, id, { nom: "Béton", angle: 30, pas: -1 })).toEqual({ ok: false, erreur: "pas" });
    const mo = modifierMotif(a.modele, id, { nom: "Béton", angle: 30, pas: 2 });
    if (!mo.ok) throw new Error("modification refusée");
    expect(mo.modele.annotations?.motifs?.[id]?.familles[0]).toMatchObject({ angle: 30, dy: 2 });
    const as = associerMotif(mo.modele, matiere, id);
    if (!as.ok) throw new Error("association refusée");
    expect(matieresParMotif(as.modele)[id]?.map((x) => x.id)).toEqual([matiere]);
    expect(lireModelePlanche(JSON.parse(JSON.stringify(as.modele)))?.annotations?.motifs?.[id]?.nom).toBe("Béton");
    const faux = JSON.parse(JSON.stringify(as.modele));
    faux.annotations.motifs[id].familles[0].dy = 0;
    expect(lireModelePlanche(faux)).toBeNull();
    const sup = supprimerMotif(as.modele, id);
    if (!sup.ok) throw new Error("suppression refusée");
    expect(sup.modele.annotations?.motifs?.[id]).toBeUndefined();
    expect(sup.modele.annotations?.materiaux[matiere]?.motif).toBeUndefined();
    expect(supprimerMotif(sup.modele, id)).toEqual({ ok: false, erreur: "absent" });
    expect(estMotif("h1", { id: "h1", nom: "X", familles: [familleSimple(0, 1)], source: { genre: "pat", fichier: "a.pat" } })).toBe(true);
    expect(estMotif("h1", { id: "h1", nom: "X", familles: [], source: { genre: "saisie" } })).toBe(false);
  });
});

describe("Sortie SVG", () => {
  it("à l'échelle 1:50 en mm papier ; aplat gris sans motif ; motif de la matière sinon ; cachées masquables", () => {
    const { modele, matiere } = avecMatiere(boite());
    const plan = projeterPlan(modele, DESSUS, { plan: coupeA1m });
    const svg = svgPlan(plan, modele, { ...OPTIONS, marge: 0 });
    // 4 m à 1:50 = 80 mm ; 3 m = 60 mm.
    expect(svg).toContain('width="80mm" height="60mm" viewBox="0 0 80 60"');
    expect(svg).toContain("rgb(217,217,217)");
    expect(svg).toContain('<g id="coupe"');
    expect(svg).toContain('stroke-width="0.5"');
    const a = ajouterMotifs(modele, [{ nom: "Béton", familles: [familleSimple(45, 3)], source: { genre: "saisie" } }]);
    if (!a.ok) throw new Error("ajout refusé");
    const as = associerMotif(a.modele, matiere, a.ids[0]!);
    if (!as.ok) throw new Error("association refusée");
    const svg2 = svgPlan(projeterPlan(as.modele, DESSUS, { plan: coupeA1m }), as.modele, OPTIONS);
    expect(svg2).toContain(`<pattern id="${a.ids[0]}-0"`);
    expect(svg2).not.toContain("rgb(217,217,217)");
    const oblique = projeterPlan(boite(), { direction: v3(-1, -1, -1) }, { plan: null });
    expect(svgPlan(oblique, boite(), OPTIONS)).toContain('<g id="cache"');
    expect(svgPlan(oblique, boite(), { ...OPTIONS, cachees: "masquees" })).not.toContain('<g id="cache"');
  });
});
