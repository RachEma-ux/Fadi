import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  aire,
  ajouterRectangle,
  ajouterSegment,
  contexte,
  decalerAretes,
  diviser,
  positionsFace,
  modeleVide,
  suivezMoi,
} from "./geometrie-libre.js";
import { dot, egal, sub, v3, normalize } from "./vecteur.js";

const aretesDe = (m: Modele) => Object.values(contexte(m).aretes);
const pt = (m: Modele, s: Id) => (contexte(m).sommets[s] as { position: ReturnType<typeof v3> }).position;

describe("CA-DIV-1 : diviser", () => {
  it("découpe une arête de 3 m en 3 arêtes de 1 m colinéaires et garde les faces bordantes", () => {
    const base = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(3, 0, 0), v3(0, 2, 0)).modele;
    const a = aretesDe(base).find((e) => egal(pt(base, e.a), v3(0, 0, 0)) && egal(pt(base, e.b), v3(3, 0, 0)) || egal(pt(base, e.b), v3(0, 0, 0)) && egal(pt(base, e.a), v3(3, 0, 0)));
    expect(a).toBeDefined();
    const r = diviser(base, (a as { id: Id }).id, 3);
    const c = contexte(r.modele);
    const bas = Object.values(c.aretes).filter((e) => Math.abs(pt(r.modele, e.a).y) < 1e-9 && Math.abs(pt(r.modele, e.b).y) < 1e-9);
    expect(bas).toHaveLength(3);
    for (const e of bas) expect(Math.hypot(...(["x", "y", "z"] as const).map((k) => pt(r.modele, e.a)[k] - pt(r.modele, e.b)[k]) as [number, number, number])).toBeCloseTo(1, 9);
    const faces = Object.values(c.faces);
    expect(faces).toHaveLength(1);
    expect((faces[0]?.exterieur ?? [])).toHaveLength(6);
    expect(aire(r.modele, (faces[0] as { id: Id }).id)).toBeCloseTo(6, 9);
  });
  it("refuse un nombre de segments invalide", () => {
    const base = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(3, 0, 0)).modele;
    const a = aretesDe(base)[0] as { id: Id };
    expect(() => diviser(base, a.id, 0)).toThrow(RangeError);
    expect(() => diviser(base, a.id, 2.5)).toThrow(RangeError);
    expect(aretesDe(diviser(base, a.id, 1).modele)).toHaveLength(1);
  });
});

describe("CA-DEC-3 : décalage d'arêtes", () => {
  it("deux arêtes en L, 0,5 : 2 arêtes nouvelles, aucune face", () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const ids = aretesDe(m).map((e) => e.id);
    const r = decalerAretes(m, ids, 0.5, v3(2, 1, 0));
    expect(r.rapport.crees.filter((id) => id.startsWith("a"))).toHaveLength(2);
    expect(r.rapport.crees.filter((id) => id.startsWith("f"))).toHaveLength(0);
    const nouvelles = r.rapport.crees.filter((id) => id.startsWith("a")).map((id) => contexte(r.modele).aretes[id]!);
    const coins = nouvelles.flatMap((e) => [pt(r.modele, e.a), pt(r.modele, e.b)]);
    expect(coins.some((p) => egal(p, v3(0, 0.5, 0)))).toBe(true);
    expect(coins.some((p) => egal(p, v3(3.5, 0.5, 0)))).toBe(true);
    expect(coins.some((p) => egal(p, v3(3.5, 3, 0)))).toBe(true);
  });
  it("refuse une distance nulle", () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    expect(() => decalerAretes(m, aretesDe(m).map((e) => e.id), 0, v3(0, 1, 0))).toThrow(RangeError);
  });
});

describe("CA-SUI-1 : Suivez-moi", () => {
  function scenario(): { m: Modele; sol: Id; profil: Id } {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const sol = Object.keys(contexte(m).faces)[0] as Id;
    // Profil 0,4 × 0,6 vertical au coin (0;0;0), dans le plan x = 0, côté intérieur de la face.
    const r = ajouterRectangle(m, v3(0, 0, 0), v3(0, 0.4, 0), v3(0, 0, 0.6));
    m = r.modele;
    const profil = Object.values(contexte(m).faces).find((f) => Math.abs(f.normale.x) > 0.99) as { id: Id };
    return { m, sol, profil: profil.id };
  }
  it("muret fermé de 4 tronçons à onglet : faces planes, surface étanche, aires exactes", () => {
    const { m, sol, profil } = scenario();
    const r = suivezMoi(m, profil, { face: sol });
    const c = contexte(r.modele);
    expect(c.faces[profil]).toBeUndefined();
    const toutes = Object.values(c.faces);
    // Le sol intérieur (3,2 × 2,2) subsiste ; le reste est le balayage : 4 tronçons × 4 arêtes du profil.
    const interieur = toutes.filter((f) => Math.abs(aire(r.modele, f.id) - 3.2 * 2.2) < 1e-9);
    expect(interieur).toHaveLength(1);
    const muret = toutes.filter((f) => f.id !== (interieur[0] as { id: Id }).id);
    expect(muret).toHaveLength(16);
    // Planarité à 1e-9 près.
    for (const f of toutes) {
      const P = positionsFace(c, f).exterieur;
      const n = normalize(f.normale);
      for (const p of P) expect(Math.abs(dot(n, sub(p, P[0] as ReturnType<typeof v3>)))).toBeLessThan(1e-9);
    }
    // Étanchéité : chaque arête du muret borde exactement deux faces du muret.
    const nb = new Map<string, number>();
    for (const f of muret) {
      for (let i = 0; i < f.exterieur.length; i++) {
        const k = [f.exterieur[i], f.exterieur[(i + 1) % f.exterieur.length]].sort().join("|");
        nb.set(k, (nb.get(k) ?? 0) + 1);
      }
    }
    for (const n of nb.values()) expect(n).toBe(2);
    // Anneau 12 − 7,04 = 4,96 m², dessus et dessous ; volume = 4,96 × 0,6.
    const z = (f: (typeof muret)[number], h: number) => positionsFace(c, f).exterieur.every((p) => Math.abs(p.z - h) < 1e-9);
    const somme = (h: number) => muret.filter((f) => z(f, h)).reduce((a, f) => a + aire(r.modele, f.id), 0);
    expect(somme(0.6)).toBeCloseTo(4.96, 9);
    expect(somme(0)).toBeCloseTo(4.96, 9);
  });
  it("chemin parallèle au profil : refusé", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const sol = Object.keys(contexte(m).faces)[0] as Id;
    m = ajouterRectangle(m, v3(0, 0, 5), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const autre = Object.values(contexte(m).faces).find((f) => f.id !== sol) as { id: Id };
    expect(() => suivezMoi(m, autre.id, { face: sol })).toThrow(RangeError);
  });
});

