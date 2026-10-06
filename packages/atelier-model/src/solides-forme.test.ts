import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const deg = (value: number) => ({ value, unit: "deg" as const });

function volume(ma: { positions: ArrayLike<number>; indices: ArrayLike<number> }): number {
  let v = 0;
  const p = (i: number) => [ma.positions[3 * i]!, ma.positions[3 * i + 1]!, ma.positions[3 * i + 2]!] as const;
  for (let k = 0; k < ma.indices.length; k += 3) {
    const [a, b, c] = [p(ma.indices[k]!), p(ma.indices[k + 1]!), p(ma.indices[k + 2]!)];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

const solide = (params: Record<string, unknown>) =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "objet.creer", params: { id: "s", classe: "solide", niveauId: "n", params: { contour: [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)], trous: [], ferme: true, hauteur: m(1), ...params } } },
  ])).etat;

describe("dépouille et extrusion oblique (D-148, DA-04-01)", () => {
  it("dépouille de 45° sur 1 m : tronc de pyramide (carré de 4 m → 2 m), volume exact", () => {
    const e = solide({ depouille: deg(45) });
    const v = volume(maillageObjet(e, e.objets["s"]!)!);
    expect(v).toBeCloseTo((1 / 3) * (16 + 4 + Math.sqrt(16 * 4)), 9);
    const evase = solide({ depouille: deg(-45) });
    expect(volume(maillageObjet(evase, evase.objets["s"]!)!)).toBeCloseTo((1 / 3) * (16 + 36 + Math.sqrt(16 * 36)), 9);
  });

  it("inclinaison : face haute translatée, volume du prisme droit (Cavalieri), direction suivie par la rotation ; IFC en tessellation", () => {
    const e = solide({ inclinaison: { angle: deg(45), direction: deg(90) } });
    const ma = maillageObjet(e, e.objets["s"]!)!;
    expect(volume(ma)).toBeCloseTo(16, 9);
    const hauts = Array.from({ length: ma.positions.length / 3 }, (_, i) => [ma.positions[3 * i + 1]!, ma.positions[3 * i + 2]!]).filter(([, z]) => z === 1).map(([y]) => y);
    expect(Math.min(...(hauts as number[]))).toBeCloseTo(1, 9);
    const t = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: deg(90) }, cibles: ["s"] }], "t")).etat;
    expect((t.objets["s"] as Occurrence<"solide">).params.inclinaison!.direction.value).toBe(180);
    expect(exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu).toMatch(/IFCTRIANGULATEDFACESET/);
  });

  it("saisie contrôlée", () => {
    expect(() => solide({ depouille: deg(70) })).toThrow(/−60° et 60°/);
    expect(() => solide({ depouille: deg(70), hauteur: m(10) })).toThrow();
    expect(() => solide({ depouille: deg(30), hauteur: m(10) })).toThrow(/se retourne/);
    expect(() => solide({ inclinaison: { angle: deg(0), direction: deg(0) } })).toThrow(/inclinaison entre/);
    expect(() => solide({ depouille: deg(10), hauteur: null })).toThrow(/hauteur du solide requise/);
    expect(() => solide({ depouille: deg(10), trous: [[pt(1, 1), pt(2, 1), pt(2, 2), pt(1, 2)]] })).toThrow(/à trous/);
    const e = solide({ depouille: deg(10) });
    const r = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "s", params: { depouille: null } } }], "x")).etat;
    expect((r.objets["s"] as Occurrence<"solide">).params.depouille).toBeUndefined();
  });
});
