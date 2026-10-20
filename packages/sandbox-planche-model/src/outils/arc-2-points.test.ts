import { describe, expect, it } from "vitest";
import type { Modele } from "../geometrie-libre.js";
import { type Vec3, cross, dist, normalize, sub, v3 } from "../vecteur.js";
import { MACHINE_ARC_2_POINTS, tangenteDepuisExtremite } from "./arc-2-points.js";
import { etape } from "./commun-formes.js";
import { aretes, clic, contientPoint, courbes, echap, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";

/** Arc 1 : (0;0;0) → (2;0;0), flèche 0,5 vers +y. */
function premierArc() {
  return partie(MACHINE_ARC_2_POINTS).jouer(clic(0, 0), survol(1, 0), saisie("2"), saisie("0.5"));
}

function tangenteDepartDerniereCourbe(m: Modele, ancienne: Set<string>, A: Vec3): Vec3 {
  const k = courbes(m).find((c) => !ancienne.has(c.id));
  if (!k) throw new Error("pas de nouvelle courbe");
  return normalize(cross(k.normale, sub(A, k.centre)));
}

describe("Arc 2 points (§4.11)", () => {
  it("étapes du catalogue : Côtés 12 → Longueur → Flèche", () => {
    const p = partie(MACHINE_ARC_2_POINTS);
    expect(p.vue().consigne).toBe(etape("arc-2-points", 0).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Côtés", valeur: "12" });
    p.jouer(clic(0, 0), survol(2, 0));
    expect(p.vue().consigne).toBe(etape("arc-2-points", 1).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Longueur", valeur: "2.00 m" });
    p.jouer(clic(2, 0), survol(1, 0.86));
    expect(p.vue().consigne).toBe(etape("arc-2-points", 2).consigne);
    expect(p.vue().mesures?.libelle).toBe("Flèche");
    expect(p.vue().mesures?.valeur).toMatch(/^~ 0\.86 m$/);
  });

  it("CA-A2P-1 : (0;0;0) → (2;0;0), flèche 0,5 → milieu de la courbe à 0,5 m de la corde, sans face", () => {
    const p = premierArc();
    const s = sommets(p.modele);
    expect(s).toHaveLength(13);
    expect(aretes(p.modele)).toHaveLength(12);
    expect(contientPoint(s, v3(1, 0.5, 0))).toBe(true);
    expect(contientPoint(s, v3(0, 0, 0))).toBe(true);
    expect(contientPoint(s, v3(2, 0, 0))).toBe(true);
    expect(faces(p.modele)).toHaveLength(0);
    expect(courbes(p.modele)[0]?.genre).toBe("arc");
    // après création : la dernière flèche est affichée
    expect(p.vue().mesures).toMatchObject({ libelle: "Flèche", valeur: "0.5" });
  });

  it("locale française : « 2 » puis « 0,5 »", () => {
    const p = partie(MACHINE_ARC_2_POINTS, undefined, ",").jouer(clic(0, 0), survol(1, 0), saisie("2"), saisie("0,5"));
    expect(contientPoint(sommets(p.modele), v3(1, 0.5, 0))).toBe(true);
  });

  it("trois clics ; flèche du côté du curseur", () => {
    const p = partie(MACHINE_ARC_2_POINTS).jouer(clic(0, 0), clic(2, 0), survol(1, -0.5), clic(1, -0.5));
    expect(contientPoint(sommets(p.modele), v3(1, -0.5, 0))).toBe(true);
  });

  it("rayon « 1r » à l'étape de la flèche : demi-cercle sur une corde de 2", () => {
    const p = partie(MACHINE_ARC_2_POINTS).jouer(clic(0, 0), survol(1, 0), saisie("2"), saisie("1r"));
    expect(contientPoint(sommets(p.modele), v3(1, 1, 0))).toBe(true);
    expect(sommets(p.modele).every((q) => Math.abs(dist(q, v3(1, 0, 0)) - 1) < 1e-9)).toBe(true);
  });

  it("« 6s » après création → 6 segments, un seul pas", () => {
    const p = premierArc().jouer(saisie("6s"));
    expect(aretes(p.modele)).toHaveLength(6);
    expect(contientPoint(sommets(p.modele), v3(1, 0.5, 0))).toBe(true);
    expect(p.historique).toHaveLength(2);
  });

  it("CA-A2P-2 : double-clic au point final depuis l'extrémité d'un arc → arc tangent, retour à l'étape 1", () => {
    const p = premierArc();
    const avant = p.modele;
    const t0 = tangenteDepuisExtremite(avant, v3(2, 0, 0));
    expect(t0).not.toBeNull();
    const anciennes = new Set(courbes(avant).map((c) => c.id));
    p.jouer(survol(2, 0), clic(2, 0), survol(4, 1));
    expect(p.vue().inference?.type).toBe("tangente");
    expect(p.vue().consigne).toContain("Alt = Verrouiller la tangence.");
    p.jouer(clic(4, 1), clic(4, 1, true));
    expect(courbes(p.modele)).toHaveLength(2);
    const t1 = tangenteDepartDerniereCourbe(p.modele, anciennes, v3(2, 0, 0));
    expect(dist(t1, t0?.tangente ?? v3(0, 0, 0))).toBeLessThan(1e-9);
    expect(contientPoint(sommets(p.modele), v3(4, 1, 0))).toBe(true);
    expect(p.vue().consigne).toBe(etape("arc-2-points", 0).consigne);
  });

  it("double-clic direct (un seul événement) à l'étape 2 : même résultat", () => {
    const p = premierArc();
    const t0 = tangenteDepuisExtremite(p.modele, v3(2, 0, 0));
    const anciennes = new Set(courbes(p.modele).map((c) => c.id));
    p.jouer(clic(2, 0), survol(3, -2), clic(3, -2, true));
    const t1 = tangenteDepartDerniereCourbe(p.modele, anciennes, v3(2, 0, 0));
    expect(dist(t1, t0?.tangente ?? v3(0, 0, 0))).toBeLessThan(1e-9);
    expect(p.vue().consigne).toBe(etape("arc-2-points", 0).consigne);
  });

  it("clic simple depuis l'extrémité : retour au mode à 3 clics (étape de flèche)", () => {
    const p = premierArc().jouer(clic(2, 0), clic(4, 0));
    expect(p.vue().consigne).toBe(etape("arc-2-points", 2).consigne);
  });

  it("CA-A2P-3 : Alt puis deux points → arc tangent, l'outil reste à l'étape 2 depuis la nouvelle extrémité", () => {
    const p = premierArc();
    const t0 = tangenteDepuisExtremite(p.modele, v3(2, 0, 0));
    const anciennes = new Set(courbes(p.modele).map((c) => c.id));
    p.jouer(touche("Alt"), touche("Alt", "relachee"), clic(2, 0), survol(4, 1), clic(4, 1));
    expect(courbes(p.modele)).toHaveLength(2);
    const t1 = tangenteDepartDerniereCourbe(p.modele, anciennes, v3(2, 0, 0));
    expect(dist(t1, t0?.tangente ?? v3(0, 0, 0))).toBeLessThan(1e-9);
    expect(p.vue().consigne.startsWith(etape("arc-2-points", 1).consigne ?? "")).toBe(true);
    // enchaînement : un clic de plus crée un troisième arc tangent au deuxième
    const t2 = tangenteDepuisExtremite(p.modele, v3(4, 1, 0));
    const anciennes2 = new Set(courbes(p.modele).map((c) => c.id));
    p.jouer(survol(5, 3), clic(5, 3));
    expect(courbes(p.modele)).toHaveLength(3);
    const t3 = tangenteDepartDerniereCourbe(p.modele, anciennes2, v3(4, 1, 0));
    expect(dist(t3, t2?.tangente ?? v3(0, 0, 0))).toBeLessThan(1e-9);
    // Échap termine la chaîne
    p.jouer(echap);
    expect(p.vue().consigne).toBe(etape("arc-2-points", 0).consigne);
  });

  it("erreurs : longueur nulle, rayon trop petit, flèche nulle, « 2s »", () => {
    const p = partie(MACHINE_ARC_2_POINTS).jouer(clic(0, 0), saisie("0"));
    expect(p.vue().erreur).toMatch(/strictement positive/);
    p.jouer(saisie("2r"));
    expect(p.vue().erreur).toMatch(/longueur de la corde/);
    p.jouer(survol(1, 0), saisie("2"), saisie("0.5r"));
    expect(p.vue().erreur).toMatch(/demi-corde/);
    p.jouer(saisie("0"));
    expect(p.vue().erreur).toMatch(/non nulle/);
    p.jouer(saisie("2s"));
    expect(p.vue().erreur).toMatch(/entre 3 et 999/);
    expect(aretes(p.modele)).toHaveLength(0);
  });

  it("juste après la création, une longueur tapée n'est pas une correction", () => {
    const p = premierArc().jouer(saisie("3"));
    expect(p.vue().erreur).toMatch(/segments/);
    expect(aretes(p.modele)).toHaveLength(12);
  });
});
