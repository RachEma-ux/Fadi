/** Objets O-6 (D-208) : origine locale d'un nouvel objet au coin de sa boîte englobante, sans déplacement à l'écran. */
import { describe, expect, it } from "vitest";
import { type Id, type Modele, ajouterRectangle, appliquer, contexte, grouper, matriceMonde, modeleVide, pousserTirer } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { v3 } from "./vecteur.js";

const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes), ...Object.keys(contexte(m).occurrences)];
const ecran = (m: Modele) =>
  geometrieVisible(m)
    .faces.flatMap((f) => f.exterieur.map((p) => `${p.x.toFixed(9)},${p.y.toFixed(9)},${p.z.toFixed(9)}`))
    .sort();

/** Boîte 2 × 1 × 3 posée en (5, 4, 1). */
function boite() {
  const r = ajouterRectangle(modeleVide(), v3(5, 4, 1), v3(2, 0, 0), v3(0, 1, 0));
  return pousserTirer(r.modele, Object.keys(contexte(r.modele).faces)[0] as Id, 3).modele;
}

describe("Origine locale (O-6)", () => {
  it("« coin » : l'occurrence est posée au coin minimal, le contenu commence à l'origine, rien ne bouge à l'écran", () => {
    const m = boite();
    const avant = ecran(m);
    const g = grouper(m, tout(m), { origine: "coin" });
    expect(ecran(g.modele)).toEqual(avant);
    const M = matriceMonde(g.modele, g.occurrence)!;
    const zMin = Math.min(...Object.values(contexte(m).sommets).map((s) => s.position.z));
    const pos = Object.values(g.modele.definitions[g.definition]!.contenu.sommets).map((s) => s.position);
    expect(Math.min(...pos.map((p) => p.x))).toBeCloseTo(0, 9);
    expect(Math.min(...pos.map((p) => p.y))).toBeCloseTo(0, 9);
    expect(Math.min(...pos.map((p) => p.z))).toBeCloseTo(0, 9);
    const o = appliquer(M, v3(0, 0, 0));
    expect(o.x).toBeCloseTo(5, 9);
    expect(o.y).toBeCloseTo(4, 9);
    expect(o.z).toBeCloseTo(zMin, 9);
  });

  it("« contexte » (défaut) : transformation identité, comportement historique", () => {
    const m = boite();
    const g = grouper(m, tout(m));
    expect(contexte(g.modele).occurrences[g.occurrence]!.transformation).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("un objet imbriqué compte dans la boîte et reste à sa place", () => {
    const m = boite();
    const a = grouper(m, tout(m), { origine: "coin" });
    const m2 = ajouterRectangle(a.modele, v3(10, 10, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const avant = ecran(m2);
    const b = grouper(m2, tout(m2), { origine: "coin" });
    expect(ecran(b.modele)).toEqual(avant);
    const o = appliquer(matriceMonde(b.modele, b.occurrence)!, v3(0, 0, 0));
    expect(o.x).toBeCloseTo(5, 9);
    expect(o.y).toBeCloseTo(4, 9);
  });
});
