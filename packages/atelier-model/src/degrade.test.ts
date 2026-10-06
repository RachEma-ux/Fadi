import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { svgVue } from "./documents/rendu-svg.js";
import { couleurGris, dxfVue } from "./documents/rendu-dxf.js";
import { commandesImportDxf } from "./echanges/import-dxf.js";
import { bandesDegrade } from "./hachures.js";
import { modeleVide, objetsDeClasse, type Occurrence } from "./modele.js";
import { aireSignee } from "./geometrie.js";
import { pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = [pt(0, 0), pt(4, 0), pt(4, 2), pt(0, 2)];

describe("dégradés de hachure (D-120, DA-01-11)", () => {
  it("bandes perpendiculaires à la direction, gris interpolé, aire conservée", () => {
    const b = bandesDegrade(carre, { de: 0, a: 1, angle: { value: 0 } }, 4);
    expect(b).toHaveLength(4);
    expect(b.map((x) => x.gris)).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(b.reduce((s, x) => s + Math.abs(aireSignee(x.points)), 0)).toBeCloseTo(8, 9);
    expect(Math.min(...b[1]!.points.map((q) => q.x))).toBeCloseTo(1, 9);
    const v = bandesDegrade(carre, { de: 1, a: 0, angle: { value: 90 } }, 2);
    expect(v.map((x) => Math.max(...x.points.map((q) => q.y)))).toEqual([1, 2]);
    expect(couleurGris(0.5)).toBe(252);
  });

  it("saisie validée (hachures seulement, gris 0 à 1, retrait par null) ; vue, SVG et DXF dessinent les bandes", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "esquisse.hachure", params: { id: "h", niveauId: "n", points: carre, degrade: { de: 0.2, a: 1, angle: { value: 0, unit: "deg" } } } },
      { type: "esquisse.polyligne", params: { id: "p", niveauId: "n", points: carre, ferme: true } },
      { type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "n" } },
    ])).etat;
    expect((e.objets["h"] as Occurrence<"esquisse">).params.degrade).toEqual({ de: 0.2, a: 1, angle: { value: 0, unit: "deg" } });
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { degrade: { de: 0, a: 1 } } } }], "x"))).toThrow(/réservé aux hachures/);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "h", params: { degrade: { de: 2, a: 1 } } } }], "y"))).toThrow();
    expect((appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "h", params: { degrade: null } } }], "z")).etat.objets["h"] as Occurrence<"esquisse">).params.degrade).toBeUndefined();
    const g = genererVue(e, e.definitions["v"]!.params as unknown as ParamsVue, "v");
    const bandes = g.primitives.filter((p) => p.type === "poly" && p.remplissage === "degrade");
    expect(bandes).toHaveLength(16);
    expect(g.primitives.filter((p) => p.type === "ligne" && (p as { objetId?: string }).objetId === "h")).toHaveLength(0); // pas de motif
    const svg = svgVue(g, 1);
    expect(svg).toMatch(/fill="#3[0-9a-f]3[0-9a-f]3[0-9a-f]"/); // premier gris ≈ 0,225
    const dxf = dxfVue(g, 1, null);
    expect(dxf).toMatch(/SOLID\r?\n *8\r?\nFIN\r?\n *62\r?\n *25[0-5]/);
  });

  it("import DXF : HATCH en dégradé (450 = 1) lu avec ses deux couleurs ramenées au gris ; sans couleurs, plein", () => {
    const base = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "rdc", nom: "R", elevation: 0, hauteur: 3 } }])).etat;
    const contour = "91\n1\n92\n2\n72\n0\n73\n1\n93\n4\n10\n0\n20\n0\n10\n4\n20\n0\n10\n4\n20\n2\n10\n0\n20\n2";
    const texte = (degrade: string) => ["0\nSECTION\n2\nENTITIES", `0\nHATCH\n8\nSols\n2\nSOLID\n70\n1\n${contour}\n${degrade}`, "0\nENDSEC\n0\nEOF"].join("\n");
    const lire = (t: string) => {
      const r = commandesImportDxf(base, t, { source: "d.dxf", niveauId: "rdc", repere: "local", uniteSiAbsente: "m" });
      let e = base;
      for (const l of r.lots) e = appliquerLot(e, lot(l.commands, l.label)).etat;
      return { e, r };
    };
    const { e, r } = lire(texte("450\n1\n451\n0\n452\n0\n453\n2\n460\n1.5707963267948966\n461\n0\n463\n0\n63\n5\n421\n0\n463\n1\n63\n7\n421\n16777215\n470\nLINEAR"));
    const h = objetsDeClasse(e, "esquisse").find((o) => o.params.forme === "hachure")!;
    expect(h.params.degrade).toEqual({ de: 0, a: 1, angle: { value: 90, unit: "deg" } });
    expect(r.rapport.entites.find((x) => x.type === "HATCH")?.remarque).toMatch(/dégradé/);
    const sans = lire(texte("450\n1\n470\nLINEAR"));
    expect(objetsDeClasse(sans.e, "esquisse").find((o) => o.params.forme === "hachure")!.params.degrade).toBeUndefined();
  });
});

describe("dégradé et transformations (D-120)", () => {
  it("la direction du dégradé suit la rotation et le miroir", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "esquisse.hachure", params: { id: "h", niveauId: "n", points: carre, degrade: { de: 0, a: 1, angle: { value: 10, unit: "deg" } } } },
    ])).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 90, unit: "deg" } }, cibles: ["h"] }], "t")).etat;
    expect((r.objets["h"] as Occurrence<"esquisse">).params.degrade!.angle.value).toBe(100);
    const m = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(1, 0) }, cibles: ["h"] }], "m")).etat;
    expect((m.objets["h"] as Occurrence<"esquisse">).params.degrade!.angle.value).toBe(-10);
  });
});
