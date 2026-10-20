/** Lot L22 (hors V1, D-202) : effilement, torsion et loft — méthodes de Suivez-moi à section variable. */
import { describe, expect, it } from "vitest";
import { codeDe } from "./diagnostics.js";
import { type Id, type Modele, ERREUR_LOFT_SOMMETS, ajouterRectangle, ajouterSegment, contexte, effiler, estSolide, grouper, loft, modeleVide, volume } from "./geometrie-libre.js";
import { type Vec3, v3 } from "./vecteur.js";

const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes)];
const solide = (m: Modele) => {
  const g = grouper(m, tout(m));
  return { solide: estSolide(g.modele, g.occurrence), volume: volume(g.modele, g.occurrence) as number };
};
const sommets = (m: Modele) => Object.values(contexte(m).sommets).map((s) => s.position);
const contient = (pts: Vec3[], q: Vec3) => pts.some((p) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && Math.abs(p.z - q.z) < 1e-9);
const rect = (x0: number, y0: number, z: number, a: number, b: number) => ajouterRectangle(modeleVide(), v3(x0, y0, z), v3(a, 0, 0), v3(0, b, 0)).modele;
const signeN = (m: Modele, f: Id) => (m.racine.faces[f]!.normale.z > 0 ? 1 : -1);

describe("L22 — effilement et torsion", () => {
  it("carré 1 × 1 effilé à l'échelle 0,5 sur 1 m : tronc de pyramide fermé, volume exact (1 + 0,25 + 0,5) / 3", () => {
    const m = rect(0, 0, 0, 1, 1);
    const f = Object.keys(m.racine.faces)[0] as Id;
    const r = effiler(m, f, { longueur: signeN(m, f), echelle: 0.5 }).modele;
    const s = solide(r);
    expect(s.solide).toBe(true);
    expect(s.volume).toBeCloseTo((1 + 0.25 + 0.5) / 3, 9);
  });

  it("rectangle 2 × 1 tordu de 90° sur 1 m (12 tronçons) : fermé, sommet d'arrivée tourné de 90° autour du centre", () => {
    const m = rect(0, 0, 0, 2, 1);
    const f = Object.keys(m.racine.faces)[0] as Id;
    const L = signeN(m, f);
    const r = effiler(m, f, { longueur: L, torsion: 90 }).modele;
    const s = solide(r);
    expect(s.solide).toBe(true);
    // Parois gauches triangulées : le volume approche celui du prisme (2 m³) par défaut, d'autant mieux que les tronçons
    // sont nombreux (convergence vérifiée à 48 tronçons).
    expect(s.volume).toBeLessThan(2);
    const fin = solide(effiler(m, f, { longueur: L, torsion: 90, segments: 48 }).modele);
    expect(fin.solide).toBe(true);
    expect(fin.volume).toBeGreaterThan(s.volume);
    expect(2 - fin.volume).toBeLessThan((2 - s.volume) / 2);
    // Le coin (0 ; 0) tourne de ±90° autour du centre (1 ; 0,5) : il arrive en (1,5 ; −0,5) ou (0,5 ; 1,5).
    const pts = sommets(r);
    expect(contient(pts, v3(1.5, -0.5, 1)) || contient(pts, v3(0.5, 1.5, 1)) || contient(pts, v3(1.5, -0.5, -1)) || contient(pts, v3(0.5, 1.5, -1))).toBe(true);
  });

  it("refus : échelle nulle (EX_DISTANCE_INVALID) ; plafond de complexité (EX_COMPLEXITY_LIMIT)", () => {
    const m = rect(0, 0, 0, 1, 1);
    const f = Object.keys(m.racine.faces)[0] as Id;
    const piege = (g: () => unknown) => {
      try {
        g();
      } catch (e) {
        return codeDe(e);
      }
      return null;
    };
    expect(piege(() => effiler(m, f, { longueur: 1, echelle: 0 }))).toBe("EX_DISTANCE_INVALID");
    expect(piege(() => effiler(m, f, { longueur: 1, torsion: 90, segments: 512, plafondTriangles: 100 }))).toBe("EX_COMPLEXITY_LIMIT");
  });
});

describe("L22 — loft", () => {
  it("carré 1 × 1 au sol vers carré 0,5 × 0,5 à 1 m : coque fermée, volume du tronc de pyramide", () => {
    let m = rect(0, 0, 0, 1, 1);
    const a = Object.keys(m.racine.faces)[0] as Id;
    m = ajouterRectangle(m, v3(0.25, 0.25, 1), v3(0.5, 0, 0), v3(0, 0.5, 0)).modele;
    const b = Object.keys(m.racine.faces).find((f) => f !== a) as Id;
    const r = loft(m, a, b).modele;
    const s = solide(r);
    expect(s.solide).toBe(true);
    expect(s.volume).toBeCloseTo((1 + 0.25 + 0.5) / 3, 9);
  });

  it("refus : nombres de sommets différents (EX_PROFILE_INVALID)", () => {
    let m = rect(0, 0, 0, 1, 1);
    const a = Object.keys(m.racine.faces)[0] as Id;
    for (const [p, q] of [[v3(0, 0, 1), v3(1, 0, 1)], [v3(1, 0, 1), v3(0.5, 1, 1)], [v3(0.5, 1, 1), v3(0, 0, 1)]] as const) m = ajouterSegment(m, p, q).modele;
    const b = Object.keys(m.racine.faces).find((f) => f !== a) as Id;
    expect(() => loft(m, a, b)).toThrow(ERREUR_LOFT_SOMMETS);
  });
});

describe("L22 — revue de #135 : estimation comptée une fois, capuchons du loft", () => {
  const piege = (g: () => unknown) => {
    try {
      g();
    } catch (e) {
      return codeDe(e);
    }
    return null;
  };
  const deuxProfils = () => {
    let m = rect(0, 0, 0, 1, 1);
    const a = Object.keys(m.racine.faces)[0] as Id;
    m = ajouterRectangle(m, v3(0.25, 0.25, 1), v3(0.5, 0, 0), v3(0, 0.5, 0)).modele;
    const b = Object.keys(m.racine.faces).find((f) => f !== a) as Id;
    return { m, a, b };
  };

  it("effilement tordu : 4 sommets × 125 tronçons = 1 008 triangles avec capuchons — accepté au plafond 1 008, refusé à 1 007", () => {
    const m = rect(0, 0, 0, 1, 1);
    const f = Object.keys(m.racine.faces)[0] as Id;
    expect(piege(() => effiler(m, f, { longueur: signeN(m, f), torsion: 90, segments: 125, plafondTriangles: 1008 }))).toBeNull();
    expect(piege(() => effiler(m, f, { longueur: signeN(m, f), torsion: 90, segments: 125, plafondTriangles: 1007 }))).toBe("EX_COMPLEXITY_LIMIT");
  });

  it("loft : même estimation (1 008 à 125 tronçons) ; sans capuchons, 1 000 — et la coque reste ouverte, les deux profils consommés", () => {
    const { m, a, b } = deuxProfils();
    expect(piege(() => loft(m, a, b, { segments: 125, plafondTriangles: 1008 }))).toBeNull();
    expect(piege(() => loft(m, a, b, { segments: 125, plafondTriangles: 1007 }))).toBe("EX_COMPLEXITY_LIMIT");
    expect(piege(() => loft(m, a, b, { segments: 125, plafondTriangles: 1000, bouchons: false }))).toBeNull();
    const ouvert = loft(m, a, b, { bouchons: false }).modele;
    expect(Object.keys(contexte(ouvert).faces)).toHaveLength(4);
    expect(contexte(ouvert).faces[a]).toBeUndefined();
    expect(contexte(ouvert).faces[b]).toBeUndefined();
    expect(solide(ouvert).solide).toBe(false);
    expect(Object.keys(contexte(loft(m, a, b).modele).faces)).toHaveLength(6);
  });
});
