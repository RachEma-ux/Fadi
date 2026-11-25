/** Extension « Emplacement » : saisie validée, nord vrai, soleil. */
import { describe, expect, it } from "vitest";
import { directionNord, estEmplacement, lireEmplacement, nordDepuisArete, normaliserNord, soleil } from "./emplacement.js";
import { v3 } from "./vecteur.js";

const SAISIE = { latitude: "46,2", longitude: "6.15", altitude: "", nord: "", lieu: " Atelier " };

describe("Emplacement", () => {
  it("saisie à virgule ou à point ; altitude et nord facultatifs ; lieu nettoyé", () => {
    expect(lireEmplacement(SAISIE)).toEqual({ emplacement: { latitude: 46.2, longitude: 6.15, nord: 0, lieu: "Atelier" } });
    expect(lireEmplacement({ ...SAISIE, altitude: "375", nord: "-20" })).toEqual({ emplacement: { latitude: 46.2, longitude: 6.15, altitude: 375, nord: 340, lieu: "Atelier" } });
  });

  it("champ refusé nommé : latitude et longitude hors bornes, nombres illisibles", () => {
    expect(lireEmplacement({ ...SAISIE, latitude: "91" })).toEqual({ erreur: "latitude" });
    expect(lireEmplacement({ ...SAISIE, latitude: "" })).toEqual({ erreur: "latitude" });
    expect(lireEmplacement({ ...SAISIE, longitude: "181" })).toEqual({ erreur: "longitude" });
    expect(lireEmplacement({ ...SAISIE, altitude: "haut" })).toEqual({ erreur: "altitude" });
    expect(lireEmplacement({ ...SAISIE, nord: "nord" })).toEqual({ erreur: "nord" });
  });

  it("forme vérifiée à la relecture", () => {
    expect(estEmplacement({ latitude: 46, longitude: 6, nord: 0 })).toBe(true);
    expect(estEmplacement({ latitude: 146, longitude: 6, nord: 0 })).toBe(false);
    expect(estEmplacement({ latitude: 46, longitude: 6, nord: 360 })).toBe(false);
    expect(estEmplacement({ latitude: 46, longitude: 6 })).toBe(false);
  });

  it("nord : direction dans le dessin, alignement sur une arête au sens le plus proche du nord actuel", () => {
    expect(normaliserNord(-90)).toBe(270);
    expect(directionNord(90).x).toBeCloseTo(1, 9);
    expect(nordDepuisArete(v3(0, 0, 0), v3(1, 1, 0))).toBeCloseTo(45, 6);
    expect(nordDepuisArete(v3(1, 1, 0), v3(0, 0, 3))).toBeCloseTo(45, 6);
    expect(nordDepuisArete(v3(0, 0, 0), v3(1, 1, 0), 200)).toBeCloseTo(225, 6);
    expect(nordDepuisArete(v3(0, 0, 0), v3(0, 0, 2))).toBeNull();
  });

  it("soleil : plein sud à midi solaire à l'équinoxe, hauteur 90° − latitude ; le nord vrai tourne les ombres", () => {
    const midi = soleil({ jour: 81, heure: 12, latitude: 46 });
    expect(midi.hauteur).toBeCloseTo(44, 6);
    expect(midi.azimut).toBeCloseTo(180, 6);
    expect([midi.direction.x, midi.direction.y].map((x) => Number(x.toFixed(6)))).toEqual([0, Number((-Math.cos((44 * Math.PI) / 180)).toFixed(6))]);
    const tourne = soleil({ jour: 81, heure: 12, latitude: 46, nord: 90 });
    expect(tourne.direction.x).toBeCloseTo(-Math.cos((44 * Math.PI) / 180), 6);
    expect(tourne.direction.y).toBeCloseTo(0, 6);
    expect(soleil({ jour: 81, heure: 9, latitude: 46 }).direction.x).toBeGreaterThan(0);
    expect(soleil({ jour: 81, heure: 0, latitude: 46 }).hauteur).toBeLessThan(0);
  });
});
