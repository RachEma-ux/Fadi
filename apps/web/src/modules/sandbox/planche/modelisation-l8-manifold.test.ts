/** Cas 2 du catalogue, lot 8 — booléens précis, soustraire en gardant, écrêter et aire projetée avec le vrai moteur manifold-3d. */
import { describe, expect, it } from "vitest";
import { aireProjetee, contexte, creerGroupeDepuisFaces, ecreterParEnveloppe, empreintesEnPlan, estSolide, modeleVide, opererSolides, soustraireEnGardant, volume, type ContexteOutil, type Modele } from "@parcours/sandbox-planche-model";
import { chargerBooleens } from "./booleens-manifold";

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
function boite(m: Modele, o: { x: number; y: number; z: number }, a: number, b: number, c: number, nom = "Boîte") {
  const p = (x: number, y: number, z: number) => v3(o.x + x, o.y + y, o.z + z);
  return creerGroupeDepuisFaces(m, [
    [[p(0, 0, 0), p(0, b, 0), p(a, b, 0), p(a, 0, 0)]],
    [[p(0, 0, c), p(a, 0, c), p(a, b, c), p(0, b, c)]],
    [[p(0, 0, 0), p(a, 0, 0), p(a, 0, c), p(0, 0, c)]],
    [[p(a, b, 0), p(0, b, 0), p(0, b, c), p(a, b, c)]],
    [[p(0, b, 0), p(0, 0, 0), p(0, 0, c), p(0, b, c)]],
    [[p(a, 0, 0), p(a, b, 0), p(a, b, c), p(a, 0, c)]],
  ], { nom });
}

describe("lot 8 — booléens précis (n° 68, 72), soustraire en gardant (n° 99), écrêter (n° 16), aire projetée (n° 15)", () => {
  it("n° 99 : la partie retirée est gardée, nommée et balisée ; le reste garde son nom", async () => {
    const moteur = await chargerBooleens();
    const existant = boite(modeleVide(), v3(0, 0, 0), 4, 3, 3, "Existant");
    const outil = boite(existant.modele, v3(3, 0, 0), 2, 3, 3, "Outil");
    const r = soustraireEnGardant(moteur, outil.modele, outil.occurrence, existant.occurrence, { garder: true, nom: "Démolition 1", balise: "b-demolition" });
    expect(r.volumeRetire).toBeCloseTo(9, 6);
    expect(Object.keys(r.modele.racine.occurrences).sort()).toEqual([r.reste, r.garde].sort());
    expect(volume(r.modele, r.reste)).toBeCloseTo(27, 6);
    expect(volume(r.modele, r.garde!)).toBeCloseTo(9, 6);
    const g = r.modele.racine.occurrences[r.garde!]!;
    expect(r.modele.definitions[g.definition]!.nom).toBe("Démolition 1");
    expect(g.balise).toBe("b-demolition");
    expect(r.modele.definitions[r.modele.racine.occurrences[r.reste]!.definition]!.nom).toBe("Existant");
    expect(() => soustraireEnGardant(moteur, outil.modele, outil.occurrence, existant.occurrence, { garder: true, nom: " " })).toThrow();
  });

  it("n° 68, 72 : loin de l'origine (coordonnées suisses), la soustraction garde les cotes exactes", async () => {
    const booleens = await chargerBooleens();
    const O = v3(2600123.25, 1200456.75, 432.1);
    const a = boite(modeleVide(), O, 4, 3, 3, "Bâtiment");
    const b = boite(a.modele, v3(O.x + 1, O.y + 1, O.z + 1), 1.25, 1, 1, "Niche");
    const ctx: ContexteOutil = { modele: b.modele, selection: [], separateurDecimal: ",", booleens };
    const s = opererSolides(ctx, "soustraction", b.occurrence, a.occurrence);
    const id = s.crees[0]!;
    expect(estSolide(s.modele, id)).toBe(true);
    expect(volume(s.modele, id)).toBeCloseTo(36 - 1.25, 6);
    const c = contexte(s.modele, id);
    // Chaque sommet est exactement sur un plan d'origine : x ∈ {O.x, O.x + 1, O.x + 2,25, O.x + 4}.
    const xs = [...new Set(Object.values(c.sommets).map((p) => p.position.x))].sort((u, v) => u - v);
    expect(xs).toEqual([O.x, O.x + 1, O.x + 2.25, O.x + 4]);
  });

  it("n° 16 : écrêter par l'enveloppe chiffre la part retirée ; n° 15 : aire projetée en union et en somme", async () => {
    const moteur = await chargerBooleens();
    const v1 = boite(modeleVide(), v3(0, 0, 0), 10, 10, 20, "Volume A");
    const env = boite(v1.modele, v3(0, 0, 0), 10, 10, 15, "Enveloppe");
    const e = ecreterParEnveloppe(moteur, env.modele, [v1.occurrence], env.occurrence);
    expect(e.retireTotal).toBeCloseTo(500, 6);
    expect(e.parts).toEqual([{ nom: "Volume A", avant: expect.closeTo(2000, 6), retire: expect.closeTo(500, 6) }]);
    expect(volume(e.modele, e.crees[0]!)).toBeCloseTo(1500, 6);
    const a = boite(modeleVide(), v3(0, 0, 0), 10, 10, 3);
    const b = boite(a.modele, v3(5, 0, 3), 10, 10, 3);
    const aire = aireProjetee(moteur.aireUnion!, empreintesEnPlan(b.modele, [a.occurrence, b.occurrence]));
    expect(aire.union).toBeCloseTo(150, 6);
    expect(aire.somme).toBeCloseTo(200, 6);
  });
});
