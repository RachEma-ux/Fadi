import { describe, expect, it } from "vitest";
import { nonEvaluee } from "@parcours/atelier-model";
import { cmd, etatDeTest, m, P } from "../objets/__tests__/banc";
import { commandesDeplacement3d, contraindre } from "./manipulateur";
import { ECART_ECLATE, hauteurCoupeParDefaut, sceneDuModele } from "./scene";

const mur = (id: string, a: [number, number], b: [number, number], extra: Record<string, unknown> = {}) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false, ...extra });
const porte = cmd("ouverture.poser", { id: "P1", niveauId: "rdc", calqueId: "C1", classe: "porte", murHoteId: "M1", position: { t: 0.5 }, largeur: m(1), hauteur: m(2), allege: m(0), typeId: "non-type" });
const dalle = cmd("dalle.creer", { id: "D1", niveauId: "rdc", calqueId: "C1", contour: [P(0, 0), P(6, 0), P(6, 4), P(0, 4)], trous: [], epaisseur: m(0.2), decalageBase: m(-0.2) });
const r1 = cmd("niveau.creer", { id: "r1", nom: "R+1", elevation: m(3), hauteur: m(3), ordre: 1 });
const murR1 = cmd("mur.tracer", { id: "M9", niveauId: "r1", calqueId: "C1", a: P(0, 0), b: P(4, 0), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false });
const escalier = (id: string, planSeul: boolean) =>
  cmd("escalier.creer", { id, niveauId: "rdc", calqueId: "C1", axe: { a: P(1, 1), b: P(4, 1) }, largeur: m(1), hauteurAFranchir: m(3), marches: 17, contremarches: 18, epaisseurPaillasse: nonEvaluee("non fournie"), decalageBase: m(0), niveauDepartId: "rdc", niveauArriveeId: "r1", referencePlanSeulement: planSeul });

describe("scène 3D (L3b.1) : modèle typé → prismes", () => {
  it("mur découpé autour de la porte (core-geometry), surface de baie, dalle sous le niveau", () => {
    const etat = etatDeTest(mur("M1", [0, 0], [6, 0]), porte, dalle);
    const s = sceneDuModele(etat, { niveaux: ["rdc"], mode: "volume" });
    const murs = s.prismes.filter((p) => p.objetId === "M1");
    // De part et d'autre de la porte (pleine hauteur) et au-dessus d'elle (2 m → 2,5 m).
    expect(murs).toHaveLength(3);
    expect(murs.every((p) => p.classe === "mur" && p.z0 >= 0 && p.z1 <= 2.5)).toBe(true);
    expect(murs.some((p) => p.z0 === 2 && p.z1 === 2.5)).toBe(true);
    expect(s.surfaces).toEqual([expect.objectContaining({ objetId: "P1", classe: "porte" })]);
    const d = s.prismes.find((p) => p.objetId === "D1");
    expect(d).toMatchObject({ classe: "dalle", z0: -0.2, z1: 0 });
    expect(s.bornes).toEqual({ min: [0, -0.1, -0.2], max: [6, 4, 2.5] });
  });

  it("alignement « gauche » : le corps du mur est du côté −n de l'axe tracé", () => {
    const s = sceneDuModele(etatDeTest(mur("M1", [0, 0], [4, 0], { alignement: "gauche" })), { niveaux: ["rdc"], mode: "volume" });
    const ys = s.prismes[0]?.contour.map(([, y]) => y) ?? [];
    expect(Math.min(...ys)).toBeCloseTo(-0.2, 12);
    expect(Math.max(...ys)).toBeCloseTo(0, 12);
  });

  it("niveaux filtrés ; mode éclaté : écart ajouté par rang ; hauteur de coupe par défaut", () => {
    const etat = etatDeTest(r1, mur("M1", [0, 0], [6, 0]), murR1);
    expect(sceneDuModele(etat, { niveaux: ["rdc"], mode: "volume" }).prismes.map((p) => p.objetId)).toEqual(["M1"]);
    const v = sceneDuModele(etat, { niveaux: ["rdc", "r1"], mode: "volume" });
    expect(v.prismes.find((p) => p.objetId === "M9")).toMatchObject({ z0: 3, z1: 5.5 });
    const e = sceneDuModele(etat, { niveaux: ["rdc", "r1"], mode: "eclate" });
    expect(e.prismes.find((p) => p.objetId === "M9")).toMatchObject({ z0: 3 + ECART_ECLATE, z1: 5.5 + ECART_ECLATE });
    expect(e.decalages).toEqual({ rdc: 0, r1: ECART_ECLATE });
    expect(hauteurCoupeParDefaut(etat, "r1")).toBeCloseTo(4.2, 12);
    expect(hauteurCoupeParDefaut(etat, "r1", e.decalages)).toBeCloseTo(4.2 + ECART_ECLATE, 12);
  });

  it("escalier : marches ; occurrence « vue en plan seulement » non extrudée", () => {
    const etat = etatDeTest(r1, escalier("E1", false), escalier("E2", true));
    const s = sceneDuModele(etat, { niveaux: ["rdc"], mode: "volume" });
    expect(s.prismes.filter((p) => p.objetId === "E1")).toHaveLength(17);
    expect(s.prismes.some((p) => p.objetId === "E2")).toBe(false);
    expect(Math.max(...s.prismes.map((p) => p.z1))).toBeCloseTo(3, 12);
  });

  it("modèle vide ou niveau absent : scène vide, sans erreur", () => {
    const s = sceneDuModele(etatDeTest(), { niveaux: [], mode: "coupe" });
    expect(s).toMatchObject({ prismes: [], surfaces: [], bornes: null });
  });
});

describe("manipulateur 3D (DA-02-17) : glisser → transformer.deplacer", () => {
  it("vecteur, contrainte Maj, seuil, baie suivie par son mur, baie seule refusée", () => {
    const etat = etatDeTest(mur("M1", [0, 0], [6, 0]), porte);
    expect(contraindre(2, 0.5, true)).toEqual([2, 0]);
    expect(contraindre(0.2, -1, true)).toEqual([0, -1]);
    expect(commandesDeplacement3d(etat, ["M1"], 0.001, 0)).toEqual({ rien: true });
    expect(commandesDeplacement3d(etat, ["M1", "P1"], 1, 2)).toEqual({ commandes: [cmd("transformer.deplacer", { vecteur: { dx: 1, dy: 2, unit: "m" } }, ["M1"])], libelle: "Déplacer M1 (3D)" });
    const r = commandesDeplacement3d(etat, ["P1"], 1, 0);
    expect("erreur" in r && r.erreur.cause).toBe("une baie seule se déplace le long de son mur");
  });
});

describe("mesures de trame (L3b.3)", () => {
  it("p95 par rang le plus proche, fenêtre glissante, valeurs invalides ignorées", async () => {
    const { FENETRE_TRAMES, MesuresTrames } = await import("./mesures");
    const t = new MesuresTrames();
    expect(t.quantile(0.95)).toBeNull();
    for (let i = 1; i <= 100; i++) t.ajouter(i);
    t.ajouter(Number.NaN);
    t.ajouter(-1);
    expect(t.nombre).toBe(100);
    expect(t.quantile(0.95)).toBe(95);
    expect(t.quantile(0.5)).toBe(50);
    for (let i = 0; i < FENETRE_TRAMES; i++) t.ajouter(1);
    expect(t.nombre).toBe(FENETRE_TRAMES);
    expect(t.quantile(0.95)).toBe(1);
  });
});

describe("vues techniques (L3b.4) : plan, coupes, façades depuis core-geometry", () => {
  const etat = () => etatDeTest(mur("M1", [0, 0], [6, 0]), porte, mur("M2", [6, 0], [6, 4]), dalle);
  const niveaux = [{ id: "rdc", nom: "Rez", elevation: 0 }];
  it("coupe nord–sud à x = 3 : linteau de M1 coupé, partie ouest de M1 vue au-delà, M2 (côté spectateur) absent ; lignes de niveau", async () => {
    const { vueTechnique } = await import("./vues");
    const s = sceneDuModele(etat(), { niveaux: ["rdc"], mode: "volume" });
    const v = vueTechnique(s, niveaux, { type: "coupe-ns", position: 3 });
    const coupes = v.formes.filter((f) => f.style === "coupe");
    // À x = 3 (milieu de la porte de 1 m) : seul le linteau de M1 (2 → 2,5 m) et la dalle sont coupés.
    expect(coupes.filter((f) => f.objetId === "M1").map((f) => [f.points[0]?.[1], f.points[2]?.[1]])).toEqual([[2, 2.5]]);
    expect(coupes.some((f) => f.objetId === "D1")).toBe(true);
    // Regard vers l'ouest : la partie de M1 à l'ouest de la porte (x 0 → 2,5) est vue ; M2 (x = 6) est entre le spectateur et le plan.
    expect(v.formes.find((f) => f.objetId === "M1" && f.style === "vue" && f.points[0]?.[1] === 0)).toBeDefined();
    expect(v.formes.some((f) => f.objetId === "M2")).toBe(false);
    expect(v.niveaux).toEqual([{ v: 0, nom: "Rez" }]);
    expect(v.titre).toBe("Coupe nord–sud à x = 3,00 m, vue depuis l'est");
  });
  it("coupe est–ouest, coupe quelconque à 0° identique à l'est–ouest au centre ; plan à 1 m : murs coupés, dalle vue", async () => {
    const { vueTechnique } = await import("./vues");
    const s = sceneDuModele(etat(), { niveaux: ["rdc"], mode: "volume" });
    const eo = vueTechnique(s, niveaux, { type: "coupe-eo", position: 2 });
    const q = vueTechnique(s, niveaux, { type: "coupe-quelconque", position: 0, angle: 0 });
    const cle = (v: typeof eo) => v.formes.filter((f) => f.style === "coupe").map((f) => f.objetId).sort();
    expect(cle(eo)).toEqual(["D1", "M2"]);
    expect(cle(q)).toEqual(cle(vueTechnique(s, niveaux, { type: "coupe-eo", position: 1.95 })));
    const plan = vueTechnique(s, niveaux, { type: "plan", position: 1 });
    expect(plan.formes.filter((f) => f.style === "coupe").map((f) => f.objetId).sort()).toEqual(["M1", "M1", "M2"]);
    expect(plan.formes.find((f) => f.objetId === "D1")?.style).toBe("vue");
  });
  it("façade sud : murs projetés, porte dessinée devant son mur ; façade est : M2 devant M1", async () => {
    const { vueTechnique } = await import("./vues");
    const s = sceneDuModele(etat(), { niveaux: ["rdc"], mode: "volume" });
    const sud = vueTechnique(s, niveaux, { type: "facade-sud", position: 0 });
    const ordre = sud.formes.map((f) => f.objetId);
    expect(ordre.lastIndexOf("P1")).toBeGreaterThan(ordre.lastIndexOf("M1"));
    const est = vueTechnique(s, niveaux, { type: "facade-est", position: 0 });
    const o2 = est.formes.map((f) => f.objetId);
    expect(o2.lastIndexOf("M2")).toBeGreaterThan(o2.lastIndexOf("M1"));
  });
});
