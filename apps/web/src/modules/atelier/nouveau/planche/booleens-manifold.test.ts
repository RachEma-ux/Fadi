/** Lot 6 — CA-COQ-1, CA-BOO-1 à -5 avec le vrai moteur manifold-3d (Node, WASM), boîtes alignées sur les axes. */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, estSolide, grouper, modeleVide, opererSolides, pousserTirer, volume, type ContexteOutil, type Modele } from "@parcours/planche-model";
import { chargerBooleens } from "./booleens-manifold";

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
/** Boîte 2 × 2 × 1,5 dont le coin est en (dx ; 0 ; 0), groupée seule. */
function boite(m: Modele, dx: number) {
  const r = ajouterRectangle(m, v3(dx, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
  const face = Object.values(r.racine.faces).find((f) => f.exterieur.every((s) => r.racine.sommets[s]!.position.x >= dx - 1e-9 && r.racine.sommets[s]!.position.x <= dx + 2 + 1e-9))!;
  const b = pousserTirer(r, face.id, 1.5).modele;
  const dedans = (s: string) => b.racine.sommets[s]!.position.x >= dx - 1e-9 && b.racine.sommets[s]!.position.x <= dx + 2 + 1e-9;
  const faces = Object.values(b.racine.faces).filter((f) => f.exterieur.every(dedans)).map((f) => f.id);
  const aretes = Object.values(b.racine.aretes).filter((a) => dedans(a.a) && dedans(a.b)).map((a) => a.id);
  return grouper(b, [...faces, ...aretes], { nom: `Boîte ${dx}` });
}

describe("manifold-3d — booléens de maillage", () => {
  it("CA-COQ-1 : coque de deux boîtes 2 × 2 × 1,5 chevauchées de 1 m → un groupe solide de 9 m³ (6 + 6 − 3) ; CA-BOO-1 : union idem", async () => {
    const booleens = await chargerBooleens();
    const a = boite(modeleVide(), 0);
    const b = boite(a.modele, 1);
    expect(volume(b.modele, a.occurrence)).toBeCloseTo(6, 9);
    const ctx: ContexteOutil = { modele: b.modele, selection: [], separateurDecimal: ",", booleens };
    const t0 = performance.now();
    const coque = opererSolides(ctx, "enveloppe-exterieure", a.occurrence, b.occurrence);
    console.log(`⏱ coque extérieure (manifold-3d, Node) : ${Math.round(performance.now() - t0)} ms`);
    expect(coque.crees).toHaveLength(1);
    expect(Object.keys(coque.modele.racine.occurrences)).toEqual(coque.crees);
    expect(estSolide(coque.modele, coque.crees[0]!)).toBe(true);
    expect(volume(coque.modele, coque.crees[0]!)).toBeCloseTo(9, 9);
    const union = opererSolides(ctx, "union", a.occurrence, b.occurrence);
    expect(volume(union.modele, union.crees[0]!)).toBeCloseTo(9, 9);
  });
  it("CA-BOO-2 : soustraction A puis B → B − A (3 m³), A supprimé ; CA-BOO-3 : découpe → A conservé", async () => {
    const booleens = await chargerBooleens();
    const a = boite(modeleVide(), 0);
    const b = boite(a.modele, 1);
    const ctx: ContexteOutil = { modele: b.modele, selection: [], separateurDecimal: ",", booleens };
    const s = opererSolides(ctx, "soustraction", a.occurrence, b.occurrence);
    expect(Object.keys(s.modele.racine.occurrences)).toEqual(s.crees);
    expect(volume(s.modele, s.crees[0]!)).toBeCloseTo(3, 9);
    const t = opererSolides(ctx, "ajuster", a.occurrence, b.occurrence);
    expect(Object.keys(t.modele.racine.occurrences).sort()).toEqual([a.occurrence, ...t.crees].sort());
    expect(volume(t.modele, t.crees[0]!)).toBeCloseTo(3, 9);
    expect(volume(t.modele, a.occurrence)).toBeCloseTo(6, 9);
  });
  it("CA-BOO-4 : intersection → volume commun 3 m³ ; CA-BOO-5 : scission → 3 groupes dont la somme vaut l'union (9 m³)", async () => {
    const booleens = await chargerBooleens();
    const a = boite(modeleVide(), 0);
    const b = boite(a.modele, 1);
    const ctx: ContexteOutil = { modele: b.modele, selection: [], separateurDecimal: ",", booleens };
    const i = opererSolides(ctx, "intersection", a.occurrence, b.occurrence);
    expect(volume(i.modele, i.crees[0]!)).toBeCloseTo(3, 9);
    const sc = opererSolides(ctx, "scinder", a.occurrence, b.occurrence);
    expect(sc.crees).toHaveLength(3);
    const volumes = sc.crees.map((id) => volume(sc.modele, id) ?? 0).sort((x, y) => x - y);
    expect(volumes.reduce((s, v) => s + v, 0)).toBeCloseTo(9, 9);
    expect(volumes).toEqual([3, 3, 3].map((v) => expect.closeTo(v, 9)));
  });
  it("déterminisme : deux exécutions de la même coque donnent le même modèle (mêmes sommets, mêmes faces)", async () => {
    const booleens = await chargerBooleens();
    const a = boite(modeleVide(), 0);
    const b = boite(a.modele, 1);
    const ctx: ContexteOutil = { modele: b.modele, selection: [], separateurDecimal: ",", booleens };
    const r1 = opererSolides(ctx, "enveloppe-exterieure", a.occurrence, b.occurrence);
    const r2 = opererSolides(ctx, "enveloppe-exterieure", a.occurrence, b.occurrence);
    expect(JSON.stringify(r1.modele)).toBe(JSON.stringify(r2.modele));
  });
});
