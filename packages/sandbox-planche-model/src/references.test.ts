import { describe, expect, it } from "vitest";
import { ENTREE_DEUX_TEMPS, normaliserRaccourci, secondTemps } from "./catalogue-outils.js";
import { lireModelePlanche } from "./delta.js";
import { type Id, modeleVide } from "./geometrie-libre.js";
import { afficherReference, ajouterReference, controlerRecolement, deplacerReference, distancePointTriangle, estReference, rechargerReference, referencesDe, reglerTolerance, supprimerReference, verrouillerReference, versProjet } from "./references.js";

const F = { id: "sbxref_123e4567-e89b-12d3-a456-426614174000", empreinte: "a".repeat(64), taille: 1234 };
const ajout = () => {
  const r = ajouterReference(modeleVide(), { nom: "releve.ifc", format: "ifc", fichier: F, echelle: 1, triangles: 12, date: "2026-11-27" });
  if (!r.ok) throw new Error(r.erreur);
  return r;
};

describe("Références verrouillées", () => {
  it("ajoutée verrouillée, visible, à l'origine, v1 ; relue par le document ; forme fautive refusée", () => {
    const { modele, id } = ajout();
    const r = modele.annotations!.references![id]!;
    expect(r).toMatchObject({ verrouille: true, visible: true, version: 1, tolerance: null, placement: { x: 0, y: 0, z: 0, rotation: 0 } });
    expect(lireModelePlanche(JSON.parse(JSON.stringify(modele)))!.annotations!.references![id]).toEqual(r);
    expect(estReference(id, { ...r, fichier: { ...F, id: "x" } })).toBe(false);
    expect(estReference(id, { ...r, tolerance: 0 })).toBe(false);
    expect(ajouterReference(modeleVide(), { nom: "x", format: "obj", fichier: F, echelle: 0, triangles: 1, date: "2026-11-27" })).toEqual({ ok: false, erreur: "echelle" });
  });

  it("verrouillée : déplacement refusé ; déverrouillée : déplacée ; rechargée : version +1, placement gardé, même fichier refusé", () => {
    let { modele: m, id } = ajout();
    const p = { x: 2, y: 3, z: 0.5, rotation: 0.1 };
    expect(deplacerReference(m, id, p)).toEqual({ ok: false, erreur: "verrouille" });
    const v = verrouillerReference(m, id, false);
    if (!v.ok) throw new Error();
    const d = deplacerReference(v.modele, id, p);
    if (!d.ok) throw new Error();
    m = d.modele;
    expect(rechargerReference(m, id, { nom: "releve.ifc", fichier: F, echelle: 1, triangles: 12, date: "2026-11-28" })).toEqual({ ok: false, erreur: "fichier" });
    const r = rechargerReference(m, id, { nom: "releve-v2.ifc", fichier: { ...F, empreinte: "b".repeat(64) }, echelle: 1, triangles: 20, date: "2026-11-28" });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.modele.annotations!.references![id]).toMatchObject({ version: 2, placement: p, triangles: 20, chargeLe: "2026-11-28", nom: "releve-v2.ifc" });
  });

  it("masquée, tolérance bornée, supprimée", () => {
    const { modele, id } = ajout();
    const a = afficherReference(modele, id, false);
    expect(a.ok && a.modele.annotations!.references![id]!.visible).toBe(false);
    expect(reglerTolerance(modele, id, -1)).toEqual({ ok: false, erreur: "tolerance" });
    const t = reglerTolerance(modele, id, 0.02);
    expect(t.ok && t.modele.annotations!.references![id]!.tolerance).toBe(0.02);
    const s = supprimerReference(modele, id);
    expect(s.ok && referencesDe(s.modele)).toEqual([]);
    expect(supprimerReference(modele, "u999" as Id)).toEqual({ ok: false, erreur: "absent" });
  });

  it("placement : échelle, rotation autour de la verticale, translation", () => {
    const [x, y, z] = versProjet({ echelle: 0.01, placement: { x: 10, y: 0, z: 1, rotation: Math.PI / 2 } }, 100, 0, 100);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(1, 9);
    expect(z).toBeCloseTo(2, 9);
  });
});

describe("Contrôle de récolement", () => {
  it("distance point-triangle : au-dessus, sur une arête, à un sommet", () => {
    const a = [0, 0, 0] as const, b = [1, 0, 0] as const, c = [0, 1, 0] as const;
    expect(distancePointTriangle([0.2, 0.2, 0.5], a, b, c)).toBeCloseTo(0.5, 12);
    expect(distancePointTriangle([0.5, -1, 0], a, b, c)).toBeCloseTo(1, 12);
    expect(distancePointTriangle([-3, -4, 0], a, b, c)).toBeCloseTo(5, 12);
  });

  it("grille exacte : mêmes écarts qu'une recherche brute ; hors tolérance triés ; sans tolérance rien n'est jugé", () => {
    // Sol de 10 × 10 m en 200 triangles, points au-dessus et à côté.
    const t: number[] = [];
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) t.push(i, j, 0, i + 1, j, 0, i, j + 1, 0, i + 1, j, 0, i + 1, j + 1, 0, i, j + 1, 0);
    const points = [[5, 5, 0.01], [2.5, 7.5, 0.05], [12, 5, 0], [-1, -1, 3], [9.9, 0.1, 0.002]] as const;
    const brute = points.map((p) => {
      let d = Infinity;
      for (let k = 0; k < t.length; k += 9) d = Math.min(d, distancePointTriangle(p, [t[k]!, t[k + 1]!, t[k + 2]!], [t[k + 3]!, t[k + 4]!, t[k + 5]!], [t[k + 6]!, t[k + 7]!, t[k + 8]!]));
      return d;
    });
    const r = controlerRecolement(points, t, 0.02);
    expect(r.max).toBeCloseTo(Math.max(...brute), 12);
    expect(r.moyen).toBeCloseTo(brute.reduce((s, x) => s + x, 0) / brute.length, 12);
    expect(r.horsTolerance!.map((x) => x.point)).toEqual([3, 2, 1]);
    expect(controlerRecolement(points, t, null).horsTolerance).toBeNull();
    expect(controlerRecolement([], t, 0.02)).toEqual({ points: 0, max: null, moyen: null, horsTolerance: [] });
  });
});

describe("Raccourcis en deux temps", () => {
  it("forme canonique et seconde touche", () => {
    expect(normaliserRaccourci("shift+ctrl+space,r")).toBe("Ctrl+Maj+Espace, R");
    expect(secondTemps("Ctrl+Maj+Espace, Maj+r")).toBe("Maj+R");
    expect(secondTemps("Ctrl+Maj+R")).toBeNull();
    expect(secondTemps("Ctrl+Espace, R")).toBeNull();
    expect(ENTREE_DEUX_TEMPS).toBe("Ctrl+Maj+Espace");
  });
});
