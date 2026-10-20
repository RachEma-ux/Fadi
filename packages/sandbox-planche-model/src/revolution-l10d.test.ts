/** Lot 10d (EX-RV-01 à 04 ; cas R-01 à R-04 de la V1) : Révolution, méthode de Suivez-moi — axe et angle exacts. */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ERREUR_REVOLUTION_ANGLE,
  ERREUR_REVOLUTION_AXE_NUL,
  ERREUR_REVOLUTION_AXE_PLAN,
  ERREUR_REVOLUTION_AXE_TRAVERSE,
  ERREUR_REVOLUTION_SEGMENTS,
  aire,
  ajouterRectangle,
  contexte,
  ecartFacettage,
  effacerEntites,
  estSolide,
  grouper,
  modeleVide,
  revolution,
  segmentsRevolution,
  volume,
} from "./geometrie-libre.js";
import { v3 } from "./vecteur.js";

const AXE_Z = { origine: v3(0, 0, 0), direction: v3(0, 0, 1) };
/** Rectangle dans le plan XZ (y = 0) : x de `x0` à `x0 + l`, z de 0 à `h`. */
function profil(x0: number, l: number, h: number): { m: Modele; profil: Id } {
  const m = ajouterRectangle(modeleVide(), v3(x0, 0, 0), v3(l, 0, 0), v3(0, 0, h)).modele;
  return { m, profil: Object.keys(m.racine.faces)[0] as Id };
}
const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes)];
const volumeDe = (m: Modele): number => {
  const g = grouper(m, tout(m));
  return volume(g.modele, g.occurrence) as number;
};
const solide = (m: Modele): boolean => {
  const g = grouper(m, tout(m));
  return estSolide(g.modele, g.occurrence);
};
/** Aire d'un N-gone inscrit dans un cercle de rayon r. */
const polygone = (N: number, r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
/** Volume signé par la divergence (Σ aire · n·p / 3) : la cavité, normales tournées vers le vide, se soustrait. */
const volumeSigne = (m: Modele): number => {
  const c = contexte(m);
  let v = 0;
  for (const f of Object.values(c.faces)) {
    const q = c.sommets[f.exterieur[0] as Id]!.position;
    v += (aire(m, f.id) * (f.normale.x * q.x + f.normale.y * q.y + f.normale.z * q.z)) / 3;
  }
  return v;
};
/** Chaque arête bordée par exactement deux faces : surface fermée (une ou plusieurs coques). */
const etanche = (m: Modele): boolean => {
  const c = contexte(m);
  const n = new Map<string, number>();
  for (const f of Object.values(c.faces)) for (const b of [f.exterieur, ...f.trous]) for (let i = 0; i < b.length; i++) {
    const k = [b[i], b[(i + 1) % b.length]].sort().join("|");
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.values()].every((x) => x === 2);
};
const sommets = (m: Modele) => Object.values(contexte(m).sommets).map((s) => s.position);

describe("R-01 — rectangle décalé de l'axe, +360° (EX-RV-01, 02)", () => {
  it("corps annulaire fermé, couture soudée sans sommet en double, volume du facettage exact", () => {
    const { m, profil: p } = profil(1, 1, 1);
    const r = revolution(m, p, AXE_Z);
    const c = contexte(r.modele);
    expect(Object.keys(c.faces)).toHaveLength(4 * 48);
    expect(Object.keys(c.sommets)).toHaveLength(4 * 48);
    expect(solide(r.modele)).toBe(true);
    expect(volumeDe(r.modele)).toBeCloseTo(polygone(48, 2) - polygone(48, 1), 9);
    expect(volumeSigne(r.modele)).toBeCloseTo(polygone(48, 2) - polygone(48, 1), 9);
    // Pas de face d'aire nulle, pas de coiffe : un tour complet n'a pas de bout.
    for (const f of Object.values(c.faces)) expect(aire(r.modele, f.id)).toBeGreaterThan(1e-9);
  });

  it("toutes les parois sont posées, quels que soient le décalage et la résolution (ordonnées au bruit flottant près)", () => {
    for (const N of [24, 64, 96]) {
      for (const [x0, z0] of [[1.5, 0.5], [0.3, 0.7], [2.7, 1.1]] as const) {
        const m = ajouterRectangle(modeleVide(), v3(x0, 0, z0), v3(1, 0, 0), v3(0, 0, 1)).modele;
        const r = revolution(m, Object.keys(m.racine.faces)[0] as Id, AXE_Z, { segments: N });
        expect(Object.keys(contexte(r.modele).faces)).toHaveLength(4 * N);
      }
    }
  });

  it("profil troué : la cavité tournée est gardée (volume = contour − trou)", () => {
    let m = ajouterRectangle(modeleVide(), v3(1, 0, 0), v3(2, 0, 0), v3(0, 0, 2)).modele;
    m = ajouterRectangle(m, v3(1.5, 0, 0.5), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const faces = Object.values(contexte(m).faces);
    const troue = faces.find((f) => f.trous.length === 1)!;
    m = effacerEntites(m, faces.filter((f) => f.id !== troue.id).map((f) => f.id)).modele;
    const r = revolution(m, troue.id, AXE_Z, { segments: 64 });
    const plein = 2 * (polygone(64, 3) - polygone(64, 1));
    const vide = 1 * (polygone(64, 2.5) - polygone(64, 1.5));
    // Deux coques fermées : la matière et la cavité (normales vers le vide) ; volume signé = contour − trou.
    expect(etanche(r.modele)).toBe(true);
    expect(volumeSigne(r.modele)).toBeCloseTo(plein - vide, 9);
  });
});

describe("R-02 — +90° et −90° (EX-RV-02, 03)", () => {
  it("sens opposés, angles terminaux exacts, coiffes par défaut", () => {
    const { m, profil: p } = profil(1, 1, 1);
    const plus = revolution(m, p, AXE_Z, { angle: 90 });
    const moins = revolution(m, p, AXE_Z, { angle: -90 });
    const a = sommets(plus.modele);
    const b = sommets(moins.modele);
    const aussi = (s: readonly { x: number; y: number; z: number }[], x: number, y: number) => s.some((q) => Math.abs(q.x - x) < 1e-12 && Math.abs(q.y - y) < 1e-12);
    expect(aussi(a, 0, 2) && aussi(a, 0, 1)).toBe(true);
    expect(aussi(b, 0, -2) && aussi(b, 0, -1)).toBe(true);
    expect(a.every((q) => q.y > -1e-12)).toBe(true);
    expect(b.every((q) => q.y < 1e-12)).toBe(true);
    expect(Object.keys(contexte(plus.modele).faces)).toHaveLength(4 * 12 + 2);
    expect(solide(plus.modele)).toBe(true);
    expect(volumeDe(plus.modele)).toBeCloseTo(volumeDe(moins.modele), 12);
  });

  it("coiffes désactivées : surface ouverte, aucun solide affirmé", () => {
    const { m, profil: p } = profil(1, 1, 1);
    const r = revolution(m, p, AXE_Z, { angle: 90, bouchons: false });
    expect(Object.keys(contexte(r.modele).faces)).toHaveLength(4 * 12);
    expect(solide(r.modele)).toBe(false);
  });
});

describe("R-03 — profil qui touche l'axe (EX-RV-03)", () => {
  it("pôles partagés, aucune face d'aire nulle, corps fermé", () => {
    const { m, profil: p } = profil(0, 1, 1);
    const r = revolution(m, p, AXE_Z, { segments: 24 });
    const c = contexte(r.modele);
    const poles = sommets(r.modele).filter((q) => Math.hypot(q.x, q.y) < 1e-12);
    expect(poles).toHaveLength(2);
    for (const f of Object.values(c.faces)) expect(aire(r.modele, f.id)).toBeGreaterThan(1e-9);
    expect(solide(r.modele)).toBe(true);
    expect(volumeDe(r.modele)).toBeCloseTo(polygone(24, 1), 9);
  });

  it("matière qui traverse l'axe : refusée, modèle inchangé", () => {
    const { m, profil: p } = profil(-0.5, 1.5, 1);
    expect(() => revolution(m, p, AXE_Z)).toThrow(ERREUR_REVOLUTION_AXE_TRAVERSE);
  });
});

describe("R-04 — segments par tour (EX-RV-03, 04)", () => {
  it("à 48 par tour, 90° prend 12 segments ; 96 par tour régénère depuis le profil d'origine (24)", () => {
    expect(segmentsRevolution(90, 48)).toBe(12);
    expect(segmentsRevolution(1, 48)).toBe(1);
    expect(segmentsRevolution(-100, 48)).toBe(14);
    const { m, profil: p } = profil(1, 1, 1);
    expect(Object.keys(contexte(revolution(m, p, AXE_Z, { angle: 90, segments: 96 }).modele).faces)).toHaveLength(4 * 24 + 2);
  });

  it("écart de facettage annoncé : r (1 − cos π/N)", () => {
    expect(ecartFacettage(2, 48)).toBeCloseTo(2 * (1 - Math.cos(Math.PI / 48)), 15);
  });

  it("domaines refusés : angle nul ou au-delà de 360°, segments hors 12–512 ou non entiers, axe nul ou hors plan", () => {
    const { m, profil: p } = profil(1, 1, 1);
    expect(() => revolution(m, p, AXE_Z, { angle: 0 })).toThrow(ERREUR_REVOLUTION_ANGLE);
    expect(() => revolution(m, p, AXE_Z, { angle: 361 })).toThrow(ERREUR_REVOLUTION_ANGLE);
    expect(() => revolution(m, p, AXE_Z, { segments: 11 })).toThrow(ERREUR_REVOLUTION_SEGMENTS);
    expect(() => revolution(m, p, AXE_Z, { segments: 513 })).toThrow(ERREUR_REVOLUTION_SEGMENTS);
    expect(() => revolution(m, p, AXE_Z, { segments: 12.5 })).toThrow(ERREUR_REVOLUTION_SEGMENTS);
    expect(() => revolution(m, p, { origine: v3(0, 0, 0), direction: v3(0, 0, 0) })).toThrow(ERREUR_REVOLUTION_AXE_NUL);
    expect(() => revolution(m, p, { origine: v3(0, 0, 0), direction: v3(0, 1, 0) })).toThrow(ERREUR_REVOLUTION_AXE_PLAN);
    expect(() => revolution(m, p, { origine: v3(0, 1, 0), direction: v3(0, 0, 1) })).toThrow(ERREUR_REVOLUTION_AXE_PLAN);
    expect(revolution(m, p, AXE_Z, { angle: -360, segments: 12 }).modele).toBeDefined();
  });
});
