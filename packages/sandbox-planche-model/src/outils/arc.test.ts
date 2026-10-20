import { describe, expect, it } from "vitest";
import { effacerArete } from "../geometrie-libre.js";
import { dist, v3 } from "../vecteur.js";
import { MACHINE_ARC, MSG_ANGLE } from "./arc.js";
import { MSG_SEGMENTS, etape } from "./commun-formes.js";
import { aretes, clic, contientPoint, courbes, echap, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";

const O = v3(0, 0, 0);

describe("Arc par le centre (§4.10)", () => {
  it("étapes et Mesures du catalogue : Côtés 12 → Longueur → Angle", () => {
    const p = partie(MACHINE_ARC);
    expect(p.vue().consigne).toBe(etape("arc", 0).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Côtés", valeur: "12" });
    p.jouer(clic(0, 0), survol(0.78, 0.0));
    expect(p.vue().consigne).toBe(etape("arc", 1).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Longueur", valeur: "0.78 m" });
    p.jouer(clic(0.78, 0));
    expect(p.vue().consigne).toBe(etape("arc", 2).consigne);
    expect(p.vue().mesures?.libelle).toBe("Angle");
  });

  it("CA-ARC-1 : centre (0;0;0), départ +x, « 1 », « 90 » → 12 arêtes de (1;0;0) à (0;1;0), aucune face", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), survol(0.5, 0), saisie("1"), saisie("90"));
    expect(aretes(p.modele)).toHaveLength(12);
    expect(faces(p.modele)).toHaveLength(0);
    const s = sommets(p.modele);
    expect(s).toHaveLength(13);
    expect(contientPoint(s, v3(1, 0, 0))).toBe(true);
    expect(contientPoint(s, v3(0, 1, 0))).toBe(true);
    expect(s.every((q) => Math.abs(dist(q, O) - 1) < 1e-9)).toBe(true);
    expect(courbes(p.modele)).toHaveLength(1);
    expect(courbes(p.modele)[0]).toMatchObject({ genre: "arc", rayon: 1 });
    expect(p.operations).toEqual(["Arc"]);
  });

  it("trois clics ; le balayage suit le curseur au-delà de 180°", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), clic(1, 0), survol(0, 1), survol(-1, 0.01), survol(-1, -0.01), survol(0, -1));
    expect(p.vue().mesures?.valeur).toBe("270.0"); // accroché sur l'axe vert
    p.jouer(clic(0, -1));
    expect(contientPoint(sommets(p.modele), v3(0, -1, 0))).toBe(true);
    expect(contientPoint(sommets(p.modele), v3(-1, 0, 0))).toBe(true);
  });

  it("angle saisi : sens du balayage courant (horaire si le curseur est passé dessous)", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), clic(1, 0), survol(0.5, -0.5), saisie("90"));
    expect(contientPoint(sommets(p.modele), v3(0, -1, 0))).toBe(true);
  });

  it("« 10s » après création reconstruit l'arc (un pas)", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), survol(0.5, 0), saisie("1"), saisie("90"), saisie("10s"));
    expect(aretes(p.modele)).toHaveLength(10);
    expect(p.historique).toHaveLength(2);
    expect(contientPoint(sommets(p.modele), v3(0, 1, 0))).toBe(true);
  });

  it("la gomme efface l'arc entier (une courbe)", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), survol(0.5, 0), saisie("1"), saisie("90"));
    const m = effacerArete(p.modele, aretes(p.modele)[3]?.id ?? "").modele;
    expect(Object.keys(m.racine.aretes)).toHaveLength(0);
  });

  it("Ctrl ± et « Ns » en cours de tracé", () => {
    const p = partie(MACHINE_ARC).jouer(touche("CtrlMoins"), touche("CtrlMoins"), clic(0, 0), saisie("4s"), saisie("1"), saisie("6s"), saisie("90"));
    expect(aretes(p.modele)).toHaveLength(6);
  });

  it("erreurs : angle 0 / 360, rayon nul, segments hors bornes", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), saisie("0"));
    expect(p.vue().erreur).toMatch(/strictement positif/);
    p.jouer(saisie("1"), saisie("0"));
    expect(p.vue().erreur).toBe(MSG_ANGLE);
    p.jouer(saisie("360"));
    expect(p.vue().erreur).toBe(MSG_ANGLE);
    p.jouer(saisie("1000s"));
    expect(p.vue().erreur).toBe(MSG_SEGMENTS);
    p.jouer(saisie("abc"));
    expect(p.vue().erreur).toMatch(/non reconnue/);
    expect(aretes(p.modele)).toHaveLength(0);
  });

  it("↑ avant le 1er clic puis ← : normale sur l'axe vert, arc vertical", () => {
    const p = partie(MACHINE_ARC).jouer(touche("FlecheGauche"), clic(0, 0));
    p.jouer({ genre: "survol", rayon: { origine: v3(0.5, -10, 0), direction: v3(0, 1, 0) }, tolerance: 0.01 }, saisie("1"), saisie("90"));
    expect(sommets(p.modele).every((q) => Math.abs(q.y) < 1e-9)).toBe(true);
  });

  it("Échap annule", () => {
    const p = partie(MACHINE_ARC).jouer(clic(0, 0), clic(1, 0), survol(0, 1), echap);
    expect(p.vue().consigne).toBe(etape("arc", 0).consigne);
    expect(p.vue().apercu.lignes).toHaveLength(0);
  });
});
