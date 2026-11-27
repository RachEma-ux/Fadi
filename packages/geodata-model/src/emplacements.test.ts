import { describe, expect, it } from "vitest";
import { lireSaisieEmplacementGeoData, validerEmplacementGeoData } from "./emplacements.js";

describe("emplacements GeoData", () => {
  it("valide un emplacement complet et ramène le nord dans [0, 360)", () => {
    const r = validerEmplacementGeoData({ lieu: "  Casablanca  ", latitude: 33.57, longitude: -7.59, altitude: 50, nord: -10 });
    expect(r).toEqual({ ok: true, emplacement: { lieu: "Casablanca", latitude: 33.57, longitude: -7.59, altitude: 50, nord: 350 } });
  });
  it("une altitude absente reste absente (jamais zéro) ; un nord absent vaut l'axe vert", () => {
    const r = validerEmplacementGeoData({ lieu: "A", latitude: 0, longitude: 0 });
    expect(r).toEqual({ ok: true, emplacement: { lieu: "A", latitude: 0, longitude: 0, altitude: null, nord: 0 } });
  });
  it("un angle arrondi à un tour complet reste dans [0, 360) (contrainte de la base)", () => {
    const r = validerEmplacementGeoData({ lieu: "A", latitude: 0, longitude: 0, nord: -0.0000001 });
    expect(r.ok && r.emplacement.nord).toBe(0);
  });
  it("nomme le premier champ refusé", () => {
    expect(validerEmplacementGeoData({ lieu: "", latitude: 0, longitude: 0 })).toEqual({ ok: false, champ: "lieu" });
    expect(validerEmplacementGeoData({ lieu: "x".repeat(121), latitude: 0, longitude: 0 })).toEqual({ ok: false, champ: "lieu" });
    expect(validerEmplacementGeoData({ lieu: "A", latitude: 91, longitude: 0 })).toEqual({ ok: false, champ: "latitude" });
    expect(validerEmplacementGeoData({ lieu: "A", latitude: 0, longitude: "3" })).toEqual({ ok: false, champ: "longitude" });
    expect(validerEmplacementGeoData({ lieu: "A", latitude: 0, longitude: 0, altitude: Number.NaN })).toEqual({ ok: false, champ: "altitude" });
    expect(validerEmplacementGeoData({ lieu: "A", latitude: 0, longitude: 0, nord: "nord" })).toEqual({ ok: false, champ: "nord" });
  });
  it("lit une saisie à virgule décimale", () => {
    const r = lireSaisieEmplacementGeoData({ lieu: "Rabat", latitude: "34,02", longitude: "-6,83", altitude: "", nord: "" });
    expect(r).toEqual({ ok: true, emplacement: { lieu: "Rabat", latitude: 34.02, longitude: -6.83, altitude: null, nord: 0 } });
    expect(lireSaisieEmplacementGeoData({ lieu: "Rabat", latitude: "34", longitude: "-6", altitude: "haut", nord: "" })).toEqual({ ok: false, champ: "altitude" });
  });
});
