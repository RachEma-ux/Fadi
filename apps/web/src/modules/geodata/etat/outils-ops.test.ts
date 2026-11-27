import { describe, expect, it } from "vitest";
import { outilQuiEnregistre, outilTerrain, voletDeOutil, zoneActiveDe, zoneARetablir } from "./outils-ops";

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
