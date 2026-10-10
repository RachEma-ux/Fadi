/** Lot 10c (EX-FM-04 à 07 ; cas F-04 à F-08 de la V1) : Suivez-moi d'un profil troué, capuchons, chemins fermés, refus. */
import { describe, expect, it } from "vitest";
import {
  type Id,
  type Modele,
  ERREUR_CHEMIN_RECOUPE,
  ERREUR_ONGLET_SINGULIER,
  ajouterRectangle,
  ajouterSegment,
  contexte,
  effacerEntites,
  estSolide,
  grouper,
  modeleVide,
  suivezMoi,
  volume,
} from "./geometrie-libre.js";
import { v3, type Vec3 } from "./vecteur.js";

const MM3 = 1e9;
/** Profil troué dans le plan YZ en x = 0 : carré `cote` (m), percé de carrés intérieurs (coin, côté). */
function profilTroue(m0: Modele, cote: number, trous: readonly [number, number, number][]): { m: Modele; profil: Id } {
  let m = ajouterRectangle(m0, v3(0, 0, 0), v3(0, cote, 0), v3(0, 0, cote)).modele;
  const avant = new Set(Object.keys(m.racine.faces));
  for (const [y, z, c] of trous) m = ajouterRectangle(m, v3(0, y, z), v3(0, c, 0), v3(0, 0, c)).modele;
  // Les carrés intérieurs créent des faces pleines : on les efface, il reste le contour troué.
  const faces = Object.values(contexte(m).faces);
  const profil = faces.find((f) => f.trous.length === trous.length)!;
  m = effacerEntites(m, faces.filter((f) => f.id !== profil.id).map((f) => f.id)).modele;
  void avant;
  return { m, profil: profil.id };
}
const tout = (m: Modele): Id[] => [...Object.keys(contexte(m).faces), ...Object.keys(contexte(m).aretes)];
const volumeMm3 = (m: Modele): number => {
  const g = grouper(m, tout(m));
  return (volume(g.modele, g.occurrence) as number) * MM3;
};
const chemin = (m0: Modele, pts: readonly Vec3[]): { m: Modele; aretes: Id[] } => {
  let m = m0;
  const avant = new Set(Object.keys(m.racine.aretes));
  for (let i = 0; i + 1 < pts.length; i++) m = ajouterSegment(m, pts[i]!, pts[i + 1]!).modele;
  return { m, aretes: Object.keys(m.racine.aretes).filter((a) => !avant.has(a)) };
};

describe("F-04 — tube carré creux, chemin droit, capuchons (EX-FM-04, EX-FM-06)", () => {
  it("40 × 40 mm, paroi 2 mm, 1 000 mm : le vide est gardé, volume de matière 304 000 mm³", () => {
    const p = profilTroue(modeleVide(), 0.04, [[0.002, 0.002, 0.036]]);
    const ch = chemin(p.m, [v3(0, 0.02, 0.02), v3(1, 0.02, 0.02)]);
    const r = suivezMoi(ch.m, p.profil, { aretes: ch.aretes }).modele;
    const sansChemin = effacerEntites(r, ch.aretes.filter((a) => contexte(r).aretes[a])).modele;
    expect(volumeMm3(sansChemin)).toBeCloseTo(304_000, 0);
    expect(Object.values(contexte(r).faces).filter((f) => f.trous.length === 1)).toHaveLength(2);
  });
});

describe("F-05 — même profil creux sur un chemin en L (EX-FM-05)", () => {
  it("onglet valide, cavité continue, coque fermée avec capuchons", () => {
    const p = profilTroue(modeleVide(), 0.04, [[0.002, 0.002, 0.036]]);
    const ch = chemin(p.m, [v3(0, 0.02, 0.02), v3(1, 0.02, 0.02), v3(1, 1, 0.02)]);
    const r = suivezMoi(ch.m, p.profil, { aretes: ch.aretes }).modele;
    const sansChemin = effacerEntites(r, ch.aretes.filter((a) => contexte(r).aretes[a])).modele;
    const g = grouper(sansChemin, tout(sansChemin));
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
    expect((volume(g.modele, g.occurrence) as number) * MM3).toBeGreaterThan(0);
  });
});

describe("F-06 — chemin ouvert sans capuchon (EX-FM-06)", () => {
  it("surface ouverte : pas de capuchon, pas de solide affirmé", () => {
    const p = profilTroue(modeleVide(), 0.04, [[0.002, 0.002, 0.036]]);
    const ch = chemin(p.m, [v3(0, 0.02, 0.02), v3(1, 0.02, 0.02)]);
    const r = suivezMoi(ch.m, p.profil, { aretes: ch.aretes }, { bouchons: false }).modele;
    expect(Object.values(contexte(r).faces).filter((f) => f.trous.length > 0)).toHaveLength(0);
    const sansChemin = effacerEntites(r, ch.aretes.filter((a) => contexte(r).aretes[a])).modele;
    const g = grouper(sansChemin, tout(sansChemin));
    expect(estSolide(g.modele, g.occurrence)).toBe(false);
  });
});

describe("F-07 — chemin fermé plan (EX-FM-05, 06)", () => {
  it("couture soudée, sans capuchon ni face en double", () => {
    const p = profilTroue(modeleVide(), 0.04, []);
    // Boucle rectangulaire de −1 à 1 en x : aucun côté dans le plan du profil (x = 0), qu'il découperait.
    const ch = chemin(p.m, [v3(0, 0.02, 0.02), v3(1, 0.02, 0.02), v3(1, 1, 0.02), v3(-1, 1, 0.02), v3(-1, 0.02, 0.02), v3(0, 0.02, 0.02)]);
    const r = suivezMoi(ch.m, p.profil, { aretes: ch.aretes }).modele;
    const faces = Object.values(contexte(r).faces);
    const cles = faces.map((f) => [...f.exterieur].sort().join(","));
    expect(new Set(cles).size).toBe(cles.length);
    const sansChemin = effacerEntites(r, ch.aretes.filter((a) => contexte(r).aretes[a])).modele;
    const g = grouper(sansChemin, tout(sansChemin));
    expect(estSolide(g.modele, g.occurrence)).toBe(true);
  });
});

describe("F-08 — plusieurs trous ; refus atomiques (EX-FM-04, 07)", () => {
  it("deux trous survivent au balayage", () => {
    const p = profilTroue(modeleVide(), 0.05, [[0.005, 0.005, 0.015], [0.03, 0.03, 0.015]]);
    const ch = chemin(p.m, [v3(0, 0.025, 0.025), v3(1, 0.025, 0.025)]);
    const r = suivezMoi(ch.m, p.profil, { aretes: ch.aretes }).modele;
    expect(Object.values(contexte(r).faces).filter((f) => f.trous.length === 2)).toHaveLength(2);
  });
  it("coin trop aigu et chemin qui se recoupe : refusés, modèle inchangé", () => {
    // (Un demi-tour exact superposerait ses arêtes, que le dessin fusionne : il ne peut pas former un chemin.)
    const p = profilTroue(modeleVide(), 0.04, []);
    const aigu = chemin(p.m, [v3(0, 0.02, 0.02), v3(1, 0.02, 0.02), v3(0, 0.12, 0.02)]);
    expect(() => suivezMoi(aigu.m, p.profil, { aretes: aigu.aretes })).toThrow(ERREUR_ONGLET_SINGULIER);
    // Épingle à cheveux : les deux branches à 3 cm l'une de l'autre, profil de 4 cm — les sections se chevaucheraient.
    const recoupe = chemin(p.m, [v3(0, 0.02, 0.02), v3(1, 0.02, 0.02), v3(1, 0.05, 0.02), v3(0.1, 0.05, 0.02)]);
    expect(() => suivezMoi(recoupe.m, p.profil, { aretes: recoupe.aretes })).toThrow(ERREUR_CHEMIN_RECOUPE);
  });
});
