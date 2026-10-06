import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { exporterIfc } from "./echanges/ifc.js";
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

// Pignon : triangle de 6 m de base et 3 m de haut, posé à 3 m, extrudé de 0,3 m.
const pignon = { a: pt(0, 0), b: pt(10, 0), profil: [{ s: 0, z: 3 }, { s: 6, z: 3 }, { s: 3, z: 6 }], profondeur: m(0.3), cote: "gauche" };
const base = (pv: unknown = pignon) =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 10, hauteur: 3 } },
    { type: "objet.creer", params: { id: "s", classe: "solide", niveauId: "n", params: { contour: [pt(0, 0), pt(1, 0), pt(1, 1)], trous: [], profilVertical: pv } } },
  ])).etat;

describe("profils verticaux extrudés horizontalement (D-154, DA-01-09)", () => {
  it("emprise, base et hauteur dérivées ; volume = aire du profil × profondeur ; IFC en tessellation", () => {
    const e = base();
    const s = e.objets["s"] as Occurrence<"solide">;
    expect(s.params.contour.map((q) => [q.x, q.y])).toEqual([[0, 0], [6, 0], [6, 0.3], [0, 0.3]]);
    expect([s.params.decalageBase.value, s.params.hauteur!.value]).toEqual([3, 3]);
    const ma = maillageObjet(e, s)!;
    expect(volume(ma)).toBeCloseTo(9 * 0.3, 9);
    expect(Math.max(...Array.from({ length: ma.positions.length / 3 }, (_, i) => ma.positions[3 * i + 2]!))).toBeCloseTo(16, 9); // niveau à 10 m
    expect(exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu).toMatch(/IFCTRIANGULATEDFACESET/);
  });

  it("transformations : la ligne suit, le miroir change le côté ; déplacement : l'emprise suit", () => {
    const e = base();
    const d = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 0, dy: 5 }, cibles: ["s"] }], "d")).etat;
    expect((d.objets["s"] as Occurrence<"solide">).params.contour[0]).toMatchObject({ x: 0, y: 5 });
    const mi = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(1, 0) }, cibles: ["s"] }], "m")).etat;
    const s = mi.objets["s"] as Occurrence<"solide">;
    expect(s.params.profilVertical!.cote).toBe("droite");
    expect(Math.min(...s.params.contour.map((q) => q.y))).toBeCloseTo(-0.3, 9);
    expect(() => appliquerLot(e, lot([{ type: "transformer.echelle", params: { centre: pt(0, 0), facteur: 2, facteurY: 1 }, cibles: ["s"] }], "x"))).toThrow(/profil vertical/);
  });

  it("saisie contrôlée", () => {
    expect(() => base({ ...pignon, profil: [{ s: 0, z: 0 }, { s: 1, z: 0 }] })).toThrow(/de 3 à 500/);
    expect(() => base({ ...pignon, profil: [{ s: 0, z: 0 }, { s: 3, z: 3 }, { s: 3, z: 0 }, { s: 0, z: 1 }] })).toThrow(/se recoupe/);
    expect(() => base({ ...pignon, profondeur: m(0) })).toThrow(/profondeur/);
    expect(() => base({ ...pignon, b: pt(0, 0) })).toThrow(/longueur nulle/);
    // Profil en sens horaire : remis en sens direct, même volume.
    const e = base({ ...pignon, profil: [...pignon.profil].reverse() });
    expect(volume(maillageObjet(e, e.objets["s"]!)!)).toBeCloseTo(2.7, 9);
  });
});
