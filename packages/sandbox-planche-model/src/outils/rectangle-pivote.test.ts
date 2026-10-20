import { describe, expect, it } from "vitest";
import { modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { aireTotale, clic, contientPoint, echap, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";
import { MACHINE_RECTANGLE_PIVOTE } from "./rectangle-pivote.js";

describe("Rectangle pivoté (§4.7)", () => {
  it("consignes et libellés du catalogue : — → « Longueur, angle » → « Largeur, angle » → « Dimensions »", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE, modeleVide(), ",");
    expect(p.vue().consigne).toBe(etape("rectangle-pivote", 0).consigne);
    expect(p.vue().mesures).toBeNull();
    p.jouer(clic(0, 0), survol(1.27, 0));
    expect(p.vue().consigne).toBe(etape("rectangle-pivote", 1).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Longueur, angle", valeur: "1,27 m ; 0,0" });
    p.jouer(saisie("3"));
    expect(p.vue().consigne).toBe(etape("rectangle-pivote", 2).consigne);
    expect(p.vue().mesures?.libelle).toBe("Largeur, angle");
    p.jouer(saisie("2;90"));
    expect(p.vue().mesures).toMatchObject({ libelle: "Dimensions", valeur: "2;90" });
    p.jouer(survol(5, 5));
    expect(p.vue().mesures?.valeur).toBe("2;90");
  });

  it("CA-RTO-1 : clic (0;0;0), direction +x, « 3 », puis « 2;90 » → (0;0;0)–(3;0;0)–(3;2;0)–(0;2;0), une face", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE, modeleVide(), ",").jouer(clic(0, 0), survol(1, 0), saisie("3"), saisie("2;90"));
    const s = sommets(p.modele);
    expect(s).toHaveLength(4);
    for (const q of [v3(0, 0, 0), v3(3, 0, 0), v3(3, 2, 0), v3(0, 2, 0)]) expect(contientPoint(s, q)).toBe(true);
    expect(faces(p.modele)).toHaveLength(1);
    expect(aireTotale(p.modele)).toBeCloseTo(6, 9);
    expect(p.operations).toEqual(["Rectangle pivoté"]);
  });

  it("« Dimensions » après création, affichées 3,00 m ; 2,00 m quand rien n'a été tapé", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE, modeleVide(), ",").jouer(clic(0, 0), clic(3, 0), survol(3, 2), clic(3, 2));
    expect(p.vue().mesures).toMatchObject({ libelle: "Dimensions", valeur: "3,00 m ; 2,00 m" });
  });

  it("trois clics, rectangle tourné de 45°", () => {
    const c = Math.SQRT1_2;
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(clic(0, 0), clic(2 * c, 2 * c), survol(2 * c - c, 2 * c + c), clic(c, 3 * c));
    const s = sommets(p.modele);
    expect(contientPoint(s, v3(-c, c, 0), 1e-6)).toBe(true);
    expect(aireTotale(p.modele)).toBeCloseTo(2, 6);
  });

  it("longueur ; angle à l'étape 2 : « 2,90 » → 1er côté sur l'axe vert", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(clic(0, 0), saisie("2,90"), saisie("1,90"));
    const s = sommets(p.modele);
    expect(contientPoint(s, v3(0, 2, 0))).toBe(true);
    expect(contientPoint(s, v3(-1, 2, 0))).toBe(true);
  });

  it("angle 0 à l'étape 3 : 2e côté vertical (le long de la normale)", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(clic(0, 0), saisie("3,0"), saisie("2,0"));
    const s = sommets(p.modele);
    expect(contientPoint(s, v3(3, 0, 2))).toBe(true);
    expect(contientPoint(s, v3(0, 0, 2))).toBe(true);
  });

  it("largeur seule : angle du curseur (côté droit → −90°)", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(clic(0, 0), saisie("3"), survol(2, -1), saisie("2"));
    expect(contientPoint(sommets(p.modele), v3(3, -2, 0))).toBe(true);
  });

  it("erreurs : saisie avant le 1er clic, longueur nulle, largeur nulle, texte", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(saisie("3"));
    expect(p.vue().erreur).toMatch(/premier coin/);
    p.jouer(clic(0, 0), saisie("0"));
    expect(p.vue().erreur).toMatch(/non nulle/);
    p.jouer(saisie("abc"));
    expect(p.vue().erreur).toMatch(/valide|non reconnue/);
    p.jouer(saisie("3"), saisie("0,90"));
    expect(p.vue().erreur).toMatch(/non nulle/);
    expect(faces(p.modele)).toHaveLength(0);
  });

  it("→ avant le 1er clic : plan du rapporteur ⟂ rouge", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(touche("FlecheDroite"), clic(0, 0), saisie("3,0"), saisie("2,90"));
    expect(sommets(p.modele).every((q) => Math.abs(q.x) < 1e-9)).toBe(true);
    expect(aireTotale(p.modele)).toBeCloseTo(6, 9);
  });

  it("Échap annule", () => {
    const p = partie(MACHINE_RECTANGLE_PIVOTE).jouer(clic(0, 0), clic(3, 0), echap);
    expect(p.vue().consigne).toBe(etape("rectangle-pivote", 0).consigne);
    expect(faces(p.modele)).toHaveLength(0);
  });
});
