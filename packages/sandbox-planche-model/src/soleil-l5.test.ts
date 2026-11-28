import { describe, expect, it } from "vitest";
import { courseSolaire, dateDuRang, heureSolaireVraie, jourJulien, positionSoleil, rangDuJour, silhouetteMasques, texteHeure } from "./soleil-l5.js";

describe("Cas 2, lot 5 — soleil par l'algorithme de référence (NOAA, d'après Meeus)", () => {
  it("jour julien et rang du jour", () => {
    expect(jourJulien(2000, 1, 1)).toBe(2451544.5);
    expect(rangDuJour(2026, 6, 21)).toBe(172);
    expect(rangDuJour(2024, 12, 31)).toBe(366);
    expect(dateDuRang(2026, 172)).toEqual({ mois: 6, jour: 21 });
  });

  it("cas d'essai publié de l'algorithme SPA (NREL, 17 octobre 2003, Golden) : écart inférieur à 0,05°", () => {
    // Reda et Andreas (2004), tableau A4.1 : 12:30:30 heure locale, fuseau −7 h, zénith 50,11162° (réfraction
    // comprise, environ 0,013° à cette hauteur), azimut 194,34024°.
    const s = positionSoleil({ annee: 2003, mois: 10, jour: 17, heure: 12 + 30 / 60 + 30 / 3600, decalageMinutes: -7 * 60, latitude: 39.742476, longitude: -105.1786 });
    expect(s.legale).toBe(true);
    expect(Math.abs(90 - s.hauteur - 50.11162 - 0.013)).toBeLessThan(0.05);
    expect(Math.abs(s.azimut - 194.34024)).toBeLessThan(0.05);
  });

  it("heure légale : fuseau, longitude et équation du temps donnent l'heure solaire vraie", () => {
    const s = positionSoleil({ annee: 2026, mois: 6, jour: 21, heure: 14.5, decalageMinutes: 120, latitude: 46.2, longitude: 6.15 });
    expect(s.equationTemps).toBeGreaterThan(-2.5);
    expect(s.equationTemps).toBeLessThan(-0.5);
    expect(s.heureSolaire).toBeCloseTo(heureSolaireVraie(14.5, 120, 6.15, s.equationTemps), 9);
    expect(Math.abs(s.heureSolaire - (12 + 53 / 60))).toBeLessThan(2 / 60);
    expect(s.azimut).toBeGreaterThan(180);
    expect(s.hauteur).toBeGreaterThan(60);
  });

  it("sans fuseau, l'heure est l'heure solaire : midi solaire au sud, sur le méridien", () => {
    const s = positionSoleil({ annee: 2026, mois: 3, jour: 20, heure: 12, latitude: 46, longitude: null });
    expect(s.legale).toBe(false);
    expect(s.azimut).toBeCloseTo(180, 6);
    expect(s.hauteur).toBeGreaterThan(43);
    expect(s.hauteur).toBeLessThan(45);
    // Le nord du dessin tourne la direction, pas l'azimut vrai.
    const t = positionSoleil({ annee: 2026, mois: 3, jour: 20, heure: 12, latitude: 46, nord: 90 });
    expect(t.azimut).toBeCloseTo(180, 6);
    expect(t.direction.x).toBeCloseTo(-Math.cos((t.hauteur * Math.PI) / 180), 6);
  });

  it("course solaire et masques : un mur au sud masque le soleil d'hiver, pas celui d'été", () => {
    // Mur de 40 m de long, 10 m de haut, à 10 m au sud du point (y négatif = sud quand le nord est sur l'axe vert).
    const positions = [-20, -10, 0, 20, -10, 0, 20, -10, 10, -20, -10, 10];
    const triangles = [0, 1, 2, 0, 2, 3];
    const r = courseSolaire({ point: { x: 0, y: 0, z: 0 }, maillages: [{ positions, triangles }], annee: 2026, latitude: 46, longitude: 6 });
    const decembre = r.courses.find((c) => c.mois === 12)!;
    const juin = r.courses.find((c) => c.mois === 6)!;
    expect(decembre.points.some((p) => p.masque)).toBe(true);
    expect(decembre.masquees.length).toBeGreaterThan(0);
    // À midi en juin le soleil est haut (plus de 60°) : le mur (45° au plus) ne le masque pas.
    const midi = juin.points.reduce((a, b) => (b.hauteur > a.hauteur ? b : a));
    expect(midi.masque).toBe(false);
    // La silhouette plein sud vaut atan(10/10) = 45°.
    expect(r.silhouette.hauteurs[90]).toBeCloseTo(45, 0);
    expect(r.silhouette.hauteurs[0]).toBe(0);
  });

  it("la face où est posé le point ne le masque pas ; rien sous le point non plus", () => {
    const s = silhouetteMasques({ x: 0, y: 0, z: 1 }, [{ positions: [-5, -5, 0, 5, -5, 0, 5, 5, 0], triangles: [0, 1, 2] }]);
    expect(Math.max(...s.hauteurs)).toBe(0);
  });

  it("point posé sur un mur (une fenêtre) : le mur cache tout le demi-espace derrière lui, rien devant", () => {
    // Mur vertical x = 0, normale sortante +x (est) ; le point est sur le mur, à 1 m de haut.
    const positions = [0, -5, 0, 0, 5, 0, 0, 5, 3, 0, -5, 3];
    const triangles = [0, 1, 2, 0, 2, 3];
    const s = silhouetteMasques({ x: 0, y: 0, z: 1 }, [{ positions, triangles }]);
    expect(s.hauteurs[45]).toBe(0); // est (90°)
    expect(s.hauteurs[135]).toBe(90); // ouest (270°)
    // Posé sur le sol (normale vers le haut), rien n'est caché.
    const sol = silhouetteMasques({ x: 1, y: 1, z: 0 }, [{ positions: [-5, -5, 0, 5, -5, 0, 5, 5, 0], triangles: [0, 1, 2] }]);
    expect(Math.max(...sol.hauteurs)).toBe(0);
  });

  it("heure écrite à la française", () => {
    expect(texteHeure(10 + 40 / 60)).toBe("10 h 40");
    expect(texteHeure(7.999)).toBe("8 h 00");
  });
});
