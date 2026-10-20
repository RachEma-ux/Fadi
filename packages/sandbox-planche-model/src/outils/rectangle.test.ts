import { describe, expect, it } from "vitest";
import { ajouterSegment, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { aireTotale, clic, contientPoint, echap, faces, partie, saisie, sommets, survol, touche } from "./essais-formes.js";
import { MACHINE_RECTANGLE } from "./rectangle.js";

describe("Rectangle (§4.6)", () => {
  it("consignes et libellé Mesures viennent du catalogue", () => {
    const p = partie(MACHINE_RECTANGLE);
    expect(p.vue().consigne).toBe(etape("rectangle", 0).consigne);
    expect(p.vue().mesures?.libelle).toBe("Dimensions");
    p.jouer(clic(0, 0));
    expect(p.vue().consigne).toBe(etape("rectangle", 1).consigne);
    expect(p.vue().mesures?.saisie.attendu).toBe("dimensions2");
  });

  it("CA-REC-1 : « 4,3 » curseur dans (+x;+y) → 4 sommets, une face de 12 m²", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(1, 1), saisie("4,3"));
    const s = sommets(p.modele);
    expect(s).toHaveLength(4);
    for (const q of [v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0)]) expect(contientPoint(s, q)).toBe(true);
    expect(faces(p.modele)).toHaveLength(1);
    expect(aireTotale(p.modele)).toBeCloseTo(12, 9);
    expect(p.operations).toEqual(["Rectangle"]);
    expect(p.vue().mesures?.valeur).toBe("4,3"); // le champ garde le texte tapé
    expect(p.vue().consigne).toBe(etape("rectangle", 0).consigne); // outil gardé, étape 1
  });

  it("locale française : « 4;3 » et affichage « 1,93 m ; 0,59 m »", () => {
    const p = partie(MACHINE_RECTANGLE, modeleVide(), ",").jouer(clic(0, 0), survol(1.93, 0.59));
    expect(p.vue().mesures?.valeur).toBe("~ 1,93 m ; 0,59 m");
    p.jouer(saisie("4;3"));
    expect(aireTotale(p.modele)).toBeCloseTo(12, 9);
  });

  it("CA-REC-2 : curseur en (−x;+y) → x ∈ [−4;0]", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(-1, 1), saisie("4,3"));
    const s = sommets(p.modele);
    expect(contientPoint(s, v3(-4, 3, 0))).toBe(true);
    expect(Math.min(...s.map((q) => q.x))).toBeCloseTo(-4, 9);
    expect(Math.max(...s.map((q) => q.x))).toBeCloseTo(0, 9);
  });

  it("valeur négative explicite = sens inverse", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(1, 1), saisie("-4,3"));
    expect(contientPoint(sommets(p.modele), v3(-4, 3, 0))).toBe(true);
  });

  it("deux clics → rectangle et face", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(1, 1), survol(3, 2), clic(3, 2));
    expect(faces(p.modele)).toHaveLength(1);
    expect(aireTotale(p.modele)).toBeCloseTo(2, 9);
  });

  it("correction après coup : « 8,2 » remplace le dernier rectangle (un seul pas)", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(1, 1), saisie("4,3"), saisie("8,2"));
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Rectangle (corrigé)"]);
    expect(faces(p.modele)).toHaveLength(1);
    expect(aireTotale(p.modele)).toBeCloseTo(16, 9);
    expect(contientPoint(sommets(p.modele), v3(8, 2, 0))).toBe(true);
  });

  it("pas de correction après une autre action (modèle changé) : erreur, rien n'est modifié", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(1, 1), saisie("4,3"));
    p.modele = ajouterSegment(p.modele, v3(10, 10, 0), v3(11, 10, 0)).modele;
    const avant = p.modele;
    p.jouer(saisie("8,2"));
    expect(p.modele).toBe(avant);
    expect(p.vue().erreur).not.toBeNull();
  });

  it("CA-REC-3 : Ctrl puis clic (0;0;0) et « 2,2 » → carré centré ; le mode persiste", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(touche("Ctrl"), touche("Ctrl", "relachee"));
    expect(p.vue().consigne).toBe(etape("rectangle", 2).consigne);
    p.jouer(clic(0, 0), survol(1, 1));
    expect(p.vue().consigne).toBe(etape("rectangle", 3).consigne);
    expect(p.vue().mesures?.valeur).toBe("~ 2.00 m, 2.00 m"); // dimensions totales
    p.jouer(saisie("2,2"));
    const s = sommets(p.modele);
    for (const q of [v3(-1, -1, 0), v3(1, -1, 0), v3(1, 1, 0), v3(-1, 1, 0)]) expect(contientPoint(s, q)).toBe(true);
    expect(aireTotale(p.modele)).toBeCloseTo(4, 9);
    // rectangle suivant : toujours depuis le centre
    p.jouer(clic(10, 10), survol(11, 12), clic(11, 12));
    expect(contientPoint(sommets(p.modele), v3(9, 8, 0))).toBe(true);
    expect(contientPoint(sommets(p.modele), v3(11, 12, 0))).toBe(true);
  });

  it("CA-REC-4 : → avant le 1er clic → rectangle dans le plan x = constante", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(touche("FlecheDroite"), survol(0, 0));
    expect(p.vue().inference?.libelle.fr).toBe("Contraint sur le plan");
    p.jouer(clic(0, 0));
    p.jouer({ genre: "survol", rayon: { origine: v3(-10, 1, 1), direction: v3(1, 0, 0) }, tolerance: 0.01 });
    p.jouer(saisie("4,3"));
    const s = sommets(p.modele);
    expect(s.every((q) => Math.abs(q.x) < 1e-9)).toBe(true);
    expect(contientPoint(s, v3(0, 4, 3))).toBe(true); // V puis B
    expect(aireTotale(p.modele)).toBeCloseTo(12, 9);
  });

  it("seconde pression sur la même flèche : déverrouille", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(touche("FlecheDroite"), touche("FlecheDroite"), survol(0.3, 0.3));
    expect(p.vue().inference?.verrouillee).toBe(false);
  });

  it("plan inféré : rectangle dessiné sur une face verticale survolée", () => {
    // mur x = 0 (face dans le plan y-z)
    const p0 = partie(MACHINE_RECTANGLE).jouer(touche("FlecheDroite"), clic(0, 0));
    p0.jouer({ genre: "survol", rayon: { origine: v3(-10, 1, 1), direction: v3(1, 0, 0) }, tolerance: 0.01 }, saisie("4,3"));
    const p = partie(MACHINE_RECTANGLE, p0.modele);
    p.jouer({ genre: "clic", rayon: { origine: v3(-10, 1, 1), direction: v3(1, 0, 0) }, tolerance: 0.01 });
    p.jouer({ genre: "survol", rayon: { origine: v3(-10, 2, 2), direction: v3(1, 0, 0) }, tolerance: 0.01 }, saisie("1,1"));
    const nouveaux = sommets(p.modele);
    expect(nouveaux.every((q) => Math.abs(q.x) < 1e-9)).toBe(true);
    expect(contientPoint(nouveaux, v3(0, 2, 2))).toBe(true);
  });

  it("inférence « Carré » quand les deux dimensions sont presque égales", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(2, 2.005));
    expect(p.vue().inference?.libelle.fr).toBe("Carré");
    p.jouer(clic(2, 2.005));
    expect(contientPoint(sommets(p.modele), v3(2.0025, 2.0025, 0))).toBe(true);
  });

  it("erreurs de saisie : texte invalide, dimension nulle, aucune saisie possible avant le 1er clic", () => {
    const p = partie(MACHINE_RECTANGLE);
    p.jouer(saisie("4,3"));
    expect(p.vue().erreur).toMatch(/premier coin/);
    p.jouer(clic(0, 0), survol(1, 1), saisie("abc"));
    expect(p.vue().erreur).toMatch(/non reconnue|valide/);
    expect(p.vue().mesures?.valeur).toBe("abc");
    p.jouer(saisie("0,3"));
    expect(p.vue().erreur).toMatch(/non nulles/);
    expect(faces(p.modele)).toHaveLength(0);
    p.jouer(saisie("4,3"));
    expect(p.vue().erreur).toBeNull();
    expect(faces(p.modele)).toHaveLength(1);
  });

  it("composante vide : « 3, » garde la largeur du curseur", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(1, 2), saisie("3,"));
    expect(aireTotale(p.modele)).toBeCloseTo(6, 9);
  });

  it("Échap annule l'opération en cours", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(1, 1), echap);
    expect(p.vue().consigne).toBe(etape("rectangle", 0).consigne);
    expect(p.vue().apercu.lignes).toHaveLength(0);
    expect(faces(p.modele)).toHaveLength(0);
  });

  it("aperçu : contour fermé et face provisoire", () => {
    const p = partie(MACHINE_RECTANGLE).jouer(clic(0, 0), survol(2, 1));
    expect(p.vue().apercu.lignes[0]).toHaveLength(5);
    expect(p.vue().apercu.faces).toHaveLength(1);
  });
});
