import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { etendueDalle } from "./dalles.js";
import { interferences } from "./interferences.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

function volume(ma: { positions: ArrayLike<number>; indices: ArrayLike<number> }): number {
  let v = 0;
  const p = (i: number) => [ma.positions[3 * i]!, ma.positions[3 * i + 1]!, ma.positions[3 * i + 2]!] as const;
  for (let k = 0; k < ma.indices.length; k += 3) {
    const [a, b, c] = [p(ma.indices[k]!), p(ma.indices[k + 1]!), p(ma.indices[k + 2]!)];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

const base = (params: Record<string, unknown>) =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 3, hauteur: 3 } },
    { type: "dalle.creer", params: { id: "d", niveauId: "n", contour: [pt(0, 0), pt(6, 0), pt(6, 4), pt(0, 4)], trous: [], epaisseur: m(0.2), ...params } },
  ])).etat;

const zs = (ma: { positions: ArrayLike<number> }) => [...new Set(Array.from({ length: ma.positions.length / 3 }, (_, i) => Math.round(ma.positions[3 * i + 2]! * 1e9) / 1e9))].sort((a, b) => a - b);

describe("dalles : sens de l'épaisseur et retombées de rive (D-144, DA-07-06)", () => {
  it("épaisseur vers le bas : dessus à la base ; par défaut inchangé", () => {
    expect(etendueDalle({ decalageBase: m(0), epaisseur: m(0.2) })).toEqual({ bas: 0, haut: 0.2 });
    expect(etendueDalle({ decalageBase: m(0), epaisseur: m(0.2), sens: "bas" })).toEqual({ bas: -0.2, haut: 0 });
    const e = base({ sens: "bas" });
    expect(zs(maillageObjet(e, e.objets["d"]!)!)).toEqual([2.8, 3]);
    expect(zs(maillageObjet(base({}), base({}).objets["d"]!)!)).toEqual([3, 3.2]);
  });

  it("retombée : anneau sous la dalle, volume exact, IFC à deux extrusions, trait caché au plan, interférences", () => {
    const e = base({ retombee: { largeur: m(0.25), hauteur: m(0.3) } });
    const ma = maillageObjet(e, e.objets["d"]!)!;
    expect(zs(ma)).toEqual([2.7, 3, 3.2]);
    const anneau = 6 * 4 - 5.5 * 3.5;
    expect(volume(ma)).toBeCloseTo(6 * 4 * 0.2 + anneau * 0.3, 9);
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu;
    expect(ifc).toMatch(/IFCARBITRARYPROFILEDEFWITHVOIDS/);
    const v = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", titre: "R", type: "plan", niveauId: "n", echelle: 50 } }], "v")).etat;
    const plan = genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v");
    expect(plan.primitives.some((p) => (p as { trait?: string; objetId?: string }).trait === "cache" && (p as { objetId?: string }).objetId === "d")).toBe(true);
    // Un solide de 2,90 m sous la rive (dessous de dalle à 3 m) recoupe la retombée, qui descend à 2,70 m.
    const f = appliquerLot(e, lot([
      { type: "niveau.creer", params: { id: "n0", nom: "R-1", elevation: 0, hauteur: 3 } },
      { type: "objet.creer", params: { id: "s", classe: "solide", niveauId: "n0", params: { contour: [pt(0, 1.9), pt(0.2, 1.9), pt(0.2, 2.1), pt(0, 2.1)], trous: [], ferme: true, hauteur: m(2.9) } } },
    ], "p")).etat;
    expect(interferences(f).map((i) => i.objets.join("+"))).toEqual(["d+s"]);
  });

  it("saisie contrôlée : largeur trop grande, trémie touchée, dalle inclinée, retrait par null", () => {
    expect(() => base({ retombee: { largeur: m(2.5), hauteur: m(0.3) } })).toThrow(/plus large/);
    expect(() => base({ trous: [[pt(0.1, 1), pt(1, 1), pt(1, 2), pt(0.1, 2)]], retombee: { largeur: m(0.25), hauteur: m(0.3) } })).toThrow(/trémie 1/);
    expect(() => base({ pente: { angle: { value: 5, unit: "deg" }, direction: { value: 0, unit: "deg" } }, retombee: { largeur: m(0.25), hauteur: m(0.3) } })).toThrow(/inclinée/);
    expect(() => base({ sens: "côté" })).toThrow(/haut.*bas/);
    const e = base({ sens: "bas", retombee: { largeur: m(0.25), hauteur: m(0.3) } });
    const r = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "d", params: { sens: null, retombee: null } } }], "x")).etat;
    const p = (r.objets["d"] as Occurrence<"dalle">).params;
    expect(p.sens).toBeUndefined();
    expect(p.retombee).toBeUndefined();
  });
});
