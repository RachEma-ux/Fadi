import { describe, expect, it } from "vitest";
import { STUDIO_TOOL_IDS } from "@parcours/atelier-model";
import { lireCorpsPreferences, lireLignePreferences, outilsInconnus } from "./studio-preferences.js";

const refus = (body: unknown) => {
  const lu = lireCorpsPreferences(body);
  if (lu.ok) throw new Error("accepté");
  return lu.body;
};

describe("préférences d'outils Studio (validation pure)", () => {
  it("accepte des identifiants du registre et les trois formes de profil", () => {
    for (const profil of ["standard", "personnel", "metier:esquisse-2d"]) {
      expect(lireCorpsPreferences({ profil, favoris: [STUDIO_TOOL_IDS[1]], personnel: [...STUDIO_TOOL_IDS] }))
        .toEqual({ ok: true, preferences: { profil, favoris: [STUDIO_TOOL_IDS[1]], personnel: [...STUDIO_TOOL_IDS] } });
    }
  });
  it("refuse un outil absent du registre (unknown_tool, outils nommés), sans le filtrer", () => {
    expect(refus({ profil: "standard", favoris: ["studio.dessin.ligne", "studio.inconnu"], personnel: ["autre.outil"] }))
      .toMatchObject({ error: "unknown_tool", tools: ["studio.inconnu", "autre.outil"] });
  });
  it("refuse une forme invalide : profil inconnu, doublon, champ en trop ou manquant", () => {
    for (const body of [
      { profil: "equipe", favoris: [], personnel: [] },
      { profil: "standard", favoris: ["studio.dessin.ligne", "studio.dessin.ligne"], personnel: [] },
      { profil: "standard", favoris: [], personnel: [], droits: "admin" },
      { profil: "standard", favoris: [] },
      null,
    ]) expect(refus(body)).toMatchObject({ error: "invalid_input" });
  });
  it("relit une ligne absente comme le profil standard, et écarte un outil retiré du registre en le signalant", () => {
    expect(lireLignePreferences(undefined)).toEqual({ profil: "standard", favoris: [], personnel: [], retires: [] });
    expect(lireLignePreferences({ profile: "metier:cotation", favorites: ["studio.dessin.cote", "retire"], personal: 3 }))
      .toEqual({ profil: "metier:cotation", favoris: ["studio.dessin.cote"], personnel: [], retires: ["retire"] });
    expect(lireLignePreferences({ profile: "inconnu", favorites: [], personal: [] }).profil).toBe("standard");
    expect(outilsInconnus({ favoris: [...STUDIO_TOOL_IDS], personnel: [] })).toEqual([]);
  });
});
