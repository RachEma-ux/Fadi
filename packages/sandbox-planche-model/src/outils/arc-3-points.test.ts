import { describe, expect, it } from "vitest";
import { dist, v3 } from "../vecteur.js";
import { MACHINE_ARC_3_POINTS, MSG_ANGLE_3P, MSG_PASSE_PAR } from "./arc-3-points.js";
import { etape } from "./commun-formes.js";
import { aretes, clic, contientPoint, courbes, echap, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";

const O = v3(0, 0, 0);

describe("Arc 3 points (§4.12)", () => {
  it("étapes du catalogue : Côtés 12 → Longueur → Angle", () => {
    const p = partie(MACHINE_ARC_3_POINTS);
    expect(p.vue().consigne).toBe(etape("arc-3-points", 0).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Côtés", valeur: "12" });
    p.jouer(clic(1, 0), survol(0.2, 0.9));
    expect(p.vue().consigne).toBe(etape("arc-3-points", 1).consigne);
    expect(p.vue().mesures?.libelle).toBe("Longueur");
    p.jouer(clic(0, 1), survol(-1, 0.3));
    expect(p.vue().consigne).toBe(etape("arc-3-points", 2).consigne);
    expect(p.vue().mesures?.libelle).toBe("Angle");
    expect(p.vue().apercu.lignes[0]).toHaveLength(13);
  });

  it("CA-A3P-1 : (1;0;0), (0;1;0), (−1;0;0) → courbe sur le cercle unité centré en (0;0;0), sans face", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), survol(-1, 0), clic(-1, 0));
    const s = sommets(p.modele);
    expect(s).toHaveLength(13);
    expect(s.every((q) => Math.abs(dist(q, O) - 1) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(0, 1, 0))).toBe(true);
    expect(contientPoint(s, v3(-1, 0, 0))).toBe(true);
    expect(faces(p.modele)).toHaveLength(0);
    expect(courbes(p.modele)[0]).toMatchObject({ genre: "arc" });
    expect(courbes(p.modele)[0]?.rayon).toBeCloseTo(1, 12);
  });

  it("l'arc passe par le 2e point, même pour un arc de plus de 180°", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), survol(0, -1), clic(0, -1));
    const s = sommets(p.modele);
    expect(s.every((q) => Math.abs(dist(q, O) - 1) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(-1, 0, 0))).toBe(true); // 270° balayés
  });

  it("angle saisi sur le cercle de l'aperçu : « 120 »", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), survol(-1, 0), saisie("120"));
    const s = sommets(p.modele);
    expect(s.every((q) => Math.abs(dist(q, O) - 1) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(Math.cos((2 * Math.PI) / 3), Math.sin((2 * Math.PI) / 3), 0))).toBe(true);
  });

  it("angle saisi sans aperçu : le 2e point est le milieu de l'arc", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), saisie("180"));
    const s = sommets(p.modele);
    expect(s.every((q) => Math.abs(dist(q, O) - 1) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(-1, 0, 0))).toBe(true);
  });

  it("longueur saisie à l'étape 2 dans la direction du curseur", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(0, 0), survol(0.3, 0.3), saisie("2"), survol(2, 0), clic(2, 0));
    const k = courbes(p.modele)[0];
    expect(k).toBeDefined();
    // le 2e point (√2 ; √2 ; 0) est sur le cercle de l'arc
    expect(dist(k?.centre ?? O, v3(Math.SQRT2, Math.SQRT2, 0))).toBeCloseTo(k?.rayon ?? -1, 9);
    expect(contientPoint(sommets(p.modele), v3(2, 0, 0))).toBe(true);
  });

  it("« 6s » après création reconstruit l'arc (un pas) ; Ctrl ±", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), survol(-1, 0), clic(-1, 0), saisie("6s"));
    expect(aretes(p.modele)).toHaveLength(6);
    expect(p.historique).toHaveLength(2);
    p.jouer(touche("CtrlPlus"), clic(5, 0), clic(6, 1), survol(7, 0), clic(7, 0));
    expect(aretes(p.modele)).toHaveLength(13);
  });

  it("erreurs : angle trop petit, 0, 360, segments, points alignés", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), survol(-1, 0), saisie("45"));
    expect(p.vue().erreur).toBe(MSG_PASSE_PAR);
    p.jouer(saisie("0"));
    expect(p.vue().erreur).toBe(MSG_ANGLE_3P);
    p.jouer(saisie("360"));
    expect(p.vue().erreur).toBe(MSG_ANGLE_3P);
    p.jouer(saisie("1s"));
    expect(p.vue().erreur).toMatch(/entre 3 et 999/);
    p.jouer(survol(-1, 2), clic(-1, 2)); // aligné avec (1;0) et (0;1)
    expect(aretes(p.modele)).toHaveLength(0);
    expect(p.vue().consigne).toBe(etape("arc-3-points", 2).consigne);
  });

  it("Échap annule", () => {
    const p = partie(MACHINE_ARC_3_POINTS).jouer(clic(1, 0), clic(0, 1), echap);
    expect(p.vue().consigne).toBe(etape("arc-3-points", 0).consigne);
  });
});
