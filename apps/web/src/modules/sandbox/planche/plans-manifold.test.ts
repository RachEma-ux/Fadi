/** Protocole 1.4 — opérations planes du moteur manifold-3d (Node, WASM) : coupe, projection au sol, union. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, grouper, maillageDuSolide, modeleVide, pousserTirer, type Modele, type PolygonePlan } from "@parcours/sandbox-planche-model";
import { chargerBooleens } from "./booleens-manifold";

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
/** Boîte l × p × h dont le coin est en (dx ; 0 ; z0), groupée seule. */
function boite(m: Modele, dx: number, l: number, p: number, h: number, z0 = 0) {
  const r = ajouterRectangle(m, v3(dx, 0, z0), v3(l, 0, 0), v3(0, p, 0)).modele;
  const dans = (x: number) => x >= dx - 1e-9 && x <= dx + l + 1e-9;
  const face = Object.values(r.racine.faces).find((f) => f.exterieur.every((s) => dans(r.racine.sommets[s]!.position.x)) && r.racine.sommets[f.exterieur[0]!]!.position.z === z0)!;
  const b = pousserTirer(r, face.id, h).modele;
  const dedans = (s: string) => dans(b.racine.sommets[s]!.position.x);
  const faces = Object.values(b.racine.faces).filter((f) => f.exterieur.every(dedans)).map((f) => f.id);
  const aretes = Object.values(b.racine.aretes).filter((a) => dedans(a.a) && dedans(a.b)).map((a) => a.id);
  return grouper(b, [...faces, ...aretes], { nom: `Boîte ${dx}` });
}
const aire = (ps: readonly PolygonePlan[]) => {
  const a = (c: readonly (readonly [number, number])[]) => Math.abs(c.reduce((s, p, i) => s + p[0] * c[(i + 1) % c.length]![1] - c[(i + 1) % c.length]![0] * p[1], 0)) / 2;
  return ps.reduce((s, p) => s + a(p.exterieur) - p.trous.reduce((t, h) => t + a(h), 0), 0);
};

describe("manifold-3d — opérations planes (protocole 1.4)", () => {
  it("coupe à 1 m de deux boîtes 10 × 8 et 4 × 8 chevauchées de 2 m : une seule surface de 96 m² (pas de double compte)", async () => {
    const { plans } = await chargerBooleens();
    const a = boite(modeleVide(), 0, 10, 8, 3);
    const b = boite(a.modele, 8, 4, 8, 3);
    const solides = [maillageDuSolide(b.modele, a.occurrence), maillageDuSolide(b.modele, b.occurrence)];
    const c = plans!.coupe(solides, 1);
    expect(c).toHaveLength(1);
    expect(aire(c)).toBeCloseTo(96, 6);
    expect(plans!.coupe(solides, 5)).toEqual([]);
  });
  it("projection au sol d'une boîte posée à 3 m : son emprise 10 × 8 ; union de deux carrés disjoints : deux polygones", async () => {
    const { plans } = await chargerBooleens();
    const a = boite(modeleVide(), 0, 10, 8, 3, 3);
    expect(aire(plans!.projection([maillageDuSolide(a.modele, a.occurrence)]))).toBeCloseTo(80, 6);
    const carre = (x: number): PolygonePlan => ({ exterieur: [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]], trous: [] });
    const u = plans!.union([carre(0), carre(3), carre(0.5)]);
    expect(u).toHaveLength(2);
    expect(aire(u)).toBeCloseTo(2.5, 9);
  });
  it("union d'un carré percé : le trou est rendu dans le sens horaire", async () => {
    const { plans } = await chargerBooleens();
    const u = plans!.union([{ exterieur: [[0, 0], [10, 0], [10, 10], [0, 10]], trous: [[[4, 4], [4, 6], [6, 6], [6, 4]]] }]);
    expect(u).toHaveLength(1);
    expect(u[0]!.trous).toHaveLength(1);
    expect(aire(u)).toBeCloseTo(96, 9);
  });
});
