import { describe, expect, it } from "vitest";
import { outilQuiEnregistre, outilTerrain, traceDepuisCoordonnees, voletDeOutil, zoneActiveDe, zoneARetablir } from "./outils-ops";

const zones = [
  { id: "a", nature: "zone" },
  { id: "n", nature: "annotation" },
  { id: "b", nature: "zone" },
];

describe("outils de la carte (P6)", () => {
  it("le choix d'un outil ouvre son volet", () => {
    expect(voletDeOutil("navigation")).toBeNull();
    expect(voletDeOutil("altitude")).toBe("terrain");
    expect(voletDeOutil("profil")).toBe("terrain");
    for (const o of ["distance", "surface", "zone", "annotation"] as const) expect(voletDeOutil(o)).toBe("etudes");
  });
  it("outils du terrain et outils qui enregistrent", () => {
    expect(outilTerrain("altitude") && outilTerrain("profil")).toBe(true);
    expect(outilTerrain("distance")).toBe(false);
    expect(outilQuiEnregistre("zone") && outilQuiEnregistre("annotation")).toBe(true);
    expect(outilQuiEnregistre("surface") || outilQuiEnregistre("distance")).toBe(false);
  });
  it("zone active : une zone présente, jamais une annotation", () => {
    expect(zoneActiveDe(zones, "a")?.id).toBe("a");
    expect(zoneActiveDe(zones, "n")).toBeNull();
    expect(zoneActiveDe(zones, "x")).toBeNull();
    expect(zoneActiveDe(zones, null)).toBeNull();
  });
  it("Alt+Z rétablit la dernière zone, sinon la plus récente", () => {
    expect(zoneARetablir(zones, "b")?.id).toBe("b");
    expect(zoneARetablir(zones, "x")?.id).toBe("a");
    expect(zoneARetablir(zones, "n")?.id).toBe("a");
    expect(zoneARetablir([{ id: "n", nature: "annotation" }], null)).toBeNull();
  });
});

describe("tracé saisi au clavier (P7)", () => {
  it("lit longitude puis latitude, un point par ligne ou séparés par « ; »", () => {
    expect(traceDepuisCoordonnees("distance", "-7.6 33.5\n-7.5 33.6")).toEqual({ trace: { outil: "distance", sommets: [[-7.6, 33.5], [-7.5, 33.6]] } });
    expect(traceDepuisCoordonnees("distance", "-7.6, 33.5; -7.5,33.6")).toEqual({ trace: { outil: "distance", sommets: [[-7.6, 33.5], [-7.5, 33.6]] } });
    expect(traceDepuisCoordonnees("altitude", "-7,6 33,5")).toEqual({ trace: { outil: "altitude", sommets: [[-7.6, 33.5]] } });
  });
  it("respecte les minimums et maximums de chaque outil", () => {
    expect(traceDepuisCoordonnees("surface", "0 0\n1 0")).toEqual({ erreur: "Saisissez au moins 3 points." });
    expect(traceDepuisCoordonnees("profil", "0 0")).toEqual({ erreur: "Saisissez au moins 2 points." });
    expect(traceDepuisCoordonnees("annotation", "0 0\n1 1")).toEqual({ erreur: "Un seul point pour cet outil." });
    expect(traceDepuisCoordonnees("altitude", "  ")).toEqual({ erreur: "Saisissez un point." });
    expect("trace" in traceDepuisCoordonnees("zone", "0 0\n1 0\n1 1")).toBe(true);
    expect(traceDepuisCoordonnees("navigation", "0 0")).toEqual({ erreur: "Choisissez d'abord un outil." });
  });
  it("refuse un point hors bornes ou illisible, en le nommant", () => {
    expect(traceDepuisCoordonnees("distance", "0 0\n181 0")).toEqual({ erreur: "Point 2 illisible : longitude −180 à 180 puis latitude −90 à 90, en degrés décimaux." });
    expect("erreur" in traceDepuisCoordonnees("altitude", "0 91")).toBe(true);
    expect("erreur" in traceDepuisCoordonnees("altitude", "abc 1")).toBe(true);
    expect("erreur" in traceDepuisCoordonnees("altitude", "1 2 3")).toBe(true);
    expect("erreur" in traceDepuisCoordonnees("altitude", "1e3 2")).toBe(true);
  });
});
