import { describe, expect, it } from "vitest";
import { ajouterSegment } from "../geometrie-libre.js";
import { type Vec3, dist, v3 } from "../vecteur.js";
import { MACHINE_CERCLE } from "./cercle.js";
import { MSG_SEGMENTS, etape } from "./commun-formes.js";
import { aireTotale, clic, contientPoint, courbes, echap, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";

const surCercle = (pts: Vec3[], c: Vec3, r: number) => pts.every((p) => Math.abs(dist(p, c) - r) < 1e-9);

describe("Cercle (§4.8)", () => {
  it("étape 1 : « Côtés · 24 » (défaut relevé), consignes du catalogue", () => {
    const p = partie(MACHINE_CERCLE);
    expect(p.vue().consigne).toBe(etape("cercle", 0).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Côtés", valeur: "24" });
    p.jouer(clic(0, 0), survol(1.2, 0.5));
    expect(p.vue().consigne).toBe(etape("cercle", 1).consigne);
    expect(p.vue().mesures).toMatchObject({ libelle: "Rayon", valeur: "~ 1.30 m" });
    p.jouer(survol(1.29, 0)); // accroché sur l'axe rouge : valeur exacte, sans « ~ »
    expect(p.vue().mesures?.valeur).toBe("1.29 m");
  });

  it("CA-CER-1 : centre (0;0;0), curseur vers +x, « 1 » → 24 sommets à 1 m, le 1er en (1;0;0), une face", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(0.5, 0), saisie("1"));
    const s = sommets(p.modele);
    expect(s).toHaveLength(24);
    expect(surCercle(s, v3(0, 0, 0), 1)).toBe(true);
    expect(contientPoint(s, v3(1, 0, 0))).toBe(true);
    expect(faces(p.modele)).toHaveLength(1);
    expect(courbes(p.modele)).toHaveLength(1);
    expect(courbes(p.modele)[0]?.genre).toBe("cercle");
    expect(aireTotale(p.modele)).toBeCloseTo(0.5 * 24 * Math.sin((2 * Math.PI) / 24), 9);
    expect(p.operations).toEqual(["Cercle"]);
  });

  it("le 1er sommet est dans la direction du curseur", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(0, 2), clic(0, 2));
    expect(contientPoint(sommets(p.modele), v3(0, 2, 0))).toBe(true);
    expect(surCercle(sommets(p.modele), v3(0, 0, 0), 2)).toBe(true);
  });

  it("CA-CER-2 : « 8s » après création → 8 sommets, rayon inchangé, un seul pas", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0), saisie("1"), saisie("8s"));
    const s = sommets(p.modele);
    expect(s).toHaveLength(8);
    expect(surCercle(s, v3(0, 0, 0), 1)).toBe(true);
    expect(contientPoint(s, v3(1, 0, 0))).toBe(true);
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Cercle (corrigé)"]);
    expect(p.vue().mesures?.valeur).toBe("8s");
  });

  it("rayon après création : « 2 » redimensionne le dernier cercle (un pas)", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0), saisie("1"), saisie("2"));
    expect(surCercle(sommets(p.modele), v3(0, 0, 0), 2)).toBe(true);
    expect(sommets(p.modele)).toHaveLength(24);
    expect(p.historique).toHaveLength(2);
  });

  it("CA-CER-3 : « 1000 » → erreur relevée, état inchangé", () => {
    const p = partie(MACHINE_CERCLE).jouer(saisie("1000"));
    expect(p.vue().erreur).toBe(MSG_SEGMENTS);
    expect(p.vue().erreur).toBe("Le nombre de segments d'une courbe doit être compris entre 3 et 999.");
    expect(p.vue().mesures?.valeur).toBe("1000"); // le champ garde le texte tapé
    p.jouer(clic(0, 0), survol(1, 0), saisie("1"), saisie("1000s"));
    expect(p.vue().erreur).toBe(MSG_SEGMENTS);
    expect(sommets(p.modele)).toHaveLength(24);
    p.jouer(saisie("2s"));
    expect(p.vue().erreur).toBe(MSG_SEGMENTS);
  });

  it("« 12 » avant le 1er clic → côtés", () => {
    const p = partie(MACHINE_CERCLE).jouer(saisie("12"), clic(0, 0), survol(1, 0), clic(1, 0));
    expect(sommets(p.modele)).toHaveLength(12);
  });

  it("CA-CER-4 : six Ctrl − depuis 10 → 4 ; Ctrl + ajoute ; borne basse 3", () => {
    const p = partie(MACHINE_CERCLE).jouer(saisie("10"));
    for (let i = 0; i < 6; i++) p.jouer(touche("CtrlMoins"));
    expect(p.vue().mesures?.valeur).toBe("4");
    p.jouer(touche("CtrlPlus"));
    expect(p.vue().mesures?.valeur).toBe("5");
    p.jouer(touche("CtrlMoins"), touche("CtrlMoins"), touche("CtrlMoins"));
    expect(p.vue().mesures?.valeur).toBe("3");
    expect(p.vue().erreur).toBe(MSG_SEGMENTS);
  });

  it("Ctrl ± pendant le tracé modifie l'aperçu", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0));
    expect(p.vue().apercu.faces[0]).toHaveLength(24);
    p.jouer(touche("CtrlPlus"));
    expect(p.vue().apercu.faces[0]).toHaveLength(25);
    p.jouer(clic(1, 0));
    expect(sommets(p.modele)).toHaveLength(25);
  });

  it("« Ns » pendant le tracé (étape 2)", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0), saisie("6s"), saisie("1"));
    expect(sommets(p.modele)).toHaveLength(6);
  });

  it("CA-CER-5 : le cercle suivant part de la dernière valeur de côtés", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0), saisie("1"), saisie("8s"));
    p.jouer(clic(5, 5), survol(6, 5), clic(6, 5));
    expect(sommets(p.modele)).toHaveLength(16);
  });

  it("← avant le 1er clic : normale sur l'axe vert (cercle vertical)", () => {
    const p = partie(MACHINE_CERCLE).jouer(touche("FlecheGauche"), clic(0, 0));
    p.jouer({ genre: "survol", rayon: { origine: v3(1, -10, 0), direction: v3(0, 1, 0) }, tolerance: 0.01 }, saisie("1"));
    const s = sommets(p.modele);
    expect(s.every((q) => Math.abs(q.y) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(1, 0, 0))).toBe(true);
    expect(surCercle(s, v3(0, 0, 0), 1)).toBe(true);
  });

  it("pas de correction après une autre action", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0), saisie("1"));
    p.modele = ajouterSegment(p.modele, v3(5, 5, 0), v3(6, 5, 0)).modele;
    p.jouer(saisie("8s"));
    expect(sommets(p.modele)).toHaveLength(26);
    expect(p.vue().mesures?.valeur).toBe("8s"); // « 8s » pris comme côtés du cercle suivant
    p.jouer(clic(10, 0), survol(11, 0), clic(11, 0));
    expect(sommets(p.modele)).toHaveLength(34);
  });

  it("erreurs : rayon nul / négatif / texte", () => {
    const p = partie(MACHINE_CERCLE).jouer(clic(0, 0), survol(1, 0), saisie("0"));
    expect(p.vue().erreur).toMatch(/strictement positif/);
    p.jouer(saisie("-1"));
    expect(p.vue().erreur).toMatch(/strictement positif/);
    p.jouer(saisie("abc"));
    expect(p.vue().erreur).toMatch(/non reconnue/);
    expect(faces(p.modele)).toHaveLength(0);
  });

  it("Échap annule ; le nombre de côtés est gardé", () => {
    const p = partie(MACHINE_CERCLE).jouer(saisie("12"), clic(0, 0), survol(1, 0), echap);
    expect(p.vue().consigne).toBe(etape("cercle", 0).consigne);
    expect(p.vue().mesures?.valeur).toBe("12");
    expect(faces(p.modele)).toHaveLength(0);
  });
});
