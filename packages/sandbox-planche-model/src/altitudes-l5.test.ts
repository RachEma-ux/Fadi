import { describe, expect, it } from "vitest";
import { altitudeCible, encombrement, lireAltitude, mesureSuivante, versNGF } from "./altitudes-l5.js";
import { ajouterRectangle, modeleVide } from "./geometrie-libre.js";

describe("Cas 2, lot 5 — altitudes", () => {
  it("Tab fait défiler distance, altitude ±0,00 et altitude NGF", () => {
    expect(mesureSuivante(undefined)).toBe("relative");
    expect(mesureSuivante("relative")).toBe("ngf");
    expect(mesureSuivante("ngf")).toBe("distance");
  });

  it("altitude NGF : référence + z, non évaluée sans référence", () => {
    expect(versNGF(3.1, 432.5)).toBeCloseTo(435.6, 9);
    expect(versNGF(3.1, null)).toBeNull();
    expect(altitudeCible(436, "ngf", 432.5)).toBeCloseTo(3.5, 9);
    expect(altitudeCible(-1.2, "relative", null)).toBe(-1.2);
    expect(altitudeCible(436, "ngf", null)).toBeNull();
  });

  it("lecture d'une altitude tapée", () => {
    expect(lireAltitude("436,00")).toBe(436);
    expect(lireAltitude("−1,20")).toBe(-1.2);
    expect(lireAltitude("+3,10 m")).toBe(3.1);
    expect(lireAltitude("432.5 NGF")).toBe(432.5);
    expect(lireAltitude("abc")).toBeNull();
    expect(lireAltitude("")).toBeNull();
  });

  it("encombrement d'une face : altitudes basse et haute, longueur ≥ largeur", () => {
    const r = ajouterRectangle(modeleVide(), { x: 0, y: 0, z: 2.5 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 3, z: 0 });
    const modele = r.modele;
    const face = Object.keys(modele.racine.faces)[0]!;
    const e = encombrement(modele, [face])!;
    expect(e.basse).toBeCloseTo(2.5, 9);
    expect(e.haute).toBeCloseTo(2.5, 9);
    expect(e.longueur).toBeCloseTo(4, 9);
    expect(e.largeur).toBeCloseTo(3, 9);
    expect(e.hauteur).toBeCloseTo(0, 9);
    expect(encombrement(modele, [])).toBeNull();
  });
});
