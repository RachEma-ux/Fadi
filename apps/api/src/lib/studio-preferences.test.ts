import { describe, expect, it } from "vitest";
import { STUDIO_TOOL_IDS } from "@parcours/atelier-model";
import { catalogueAutorise, lireCorpsPreferences, lireLignePreferences, MAX_GROUPES, MAX_NOM_GROUPE, motifRefusEcriture, outilsInconnus } from "./studio-preferences.js";

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
    expect(lireLignePreferences(undefined)).toEqual({ profil: "standard", favoris: [], personnel: [], groupes: [], retires: [], manifeste: "studio-tool-manifest/1", raccourcis: {}, ordre: [], profileId: null, proprietaire: null, version: 0, importeDe: null });
    expect(lireLignePreferences({ profile: "metier:cotation", favorites: ["studio.dessin.cote", "retire"], personal: 3 }))
      .toEqual({ profil: "metier:cotation", favoris: ["studio.dessin.cote"], personnel: [], groupes: [], retires: ["retire"], manifeste: "studio-tool-manifest/1", raccourcis: {}, ordre: [], profileId: null, proprietaire: null, version: 0, importeDe: null });
    expect(lireLignePreferences({ profile: "inconnu", favorites: [], personal: [] }).profil).toBe("standard");
    expect(outilsInconnus({ favoris: [...STUDIO_TOOL_IDS], personnel: [] })).toEqual([]);
  });
});

describe("regroupements personnels et manifeste (B.2-02, B.1-04, B.1-06)", () => {
  const base = { profil: "standard", favoris: [], personnel: [] };
  it("accepte des regroupements d'outils du registre ; sans `groupes`, le corps reste sans regroupement (inchangés en base)", () => {
    const groupes = [{ id: "murs", nom: "Murs", outils: ["studio.architecture.mur"] }];
    expect(lireCorpsPreferences({ ...base, groupes })).toEqual({ ok: true, preferences: { ...base, groupes } });
    const sans = lireCorpsPreferences(base);
    expect(sans.ok && "groupes" in sans.preferences).toBe(false);
  });
  it("refuse un regroupement mal formé, en double, trop nombreux, ou citant un outil hors registre", () => {
    for (const groupes of [
      [{ id: "A B", nom: "x", outils: [] }],
      [{ id: "a", nom: "  ", outils: [] }],
      [{ id: "a", nom: "x".repeat(MAX_NOM_GROUPE + 1), outils: [] }],
      [{ id: "a", nom: "Un", outils: [] }, { id: "a", nom: "Deux", outils: [] }],
      [{ id: "a", nom: "Même", outils: [] }, { id: "b", nom: "même", outils: [] }],
      Array.from({ length: MAX_GROUPES + 1 }, (_v, i) => ({ id: `g${i}`, nom: `G${i}`, outils: [] })),
      [{ id: "a", nom: "x", outils: [], partage: "equipe" }],
    ]) expect(refus({ ...base, groupes })).toMatchObject({ error: "invalid_input" });
    expect(refus({ ...base, groupes: [{ id: "a", nom: "x", outils: ["studio.inconnu"] }] })).toMatchObject({ error: "unknown_tool", tools: ["studio.inconnu"] });
  });
  it("relit les regroupements (forme invalide écartée, outil retiré signalé) et la version du manifeste", () => {
    const lu = lireLignePreferences({ profile: "standard", favorites: [], personal: [], groups: [{ id: "a", nom: "A", outils: ["studio.dessin.arc", "retire"] }, { id: "BAD", nom: "b", outils: [] }, 4] });
    expect(lu).toEqual({ profil: "standard", favoris: [], personnel: [], groupes: [{ id: "a", nom: "A", outils: ["studio.dessin.arc"] }], retires: ["retire"], manifeste: "studio-tool-manifest/1", raccourcis: {}, ordre: [], profileId: null, proprietaire: null, version: 0, importeDe: null });
    expect(lireLignePreferences({ profile: "standard", favorites: [], personal: [], groups: null }).groupes).toEqual([]);
  });
});

describe("catalogue autorisé : droit réel d'exécution (B.2-06)", () => {
  it("un lecteur voit chaque outil, seules les lectures autorisées, avec le motif du refus", () => {
    const droit = motifRefusEcriture({ status: 403, body: { error: "forbidden", role: "lecteur" } });
    expect(droit).toEqual({ ecriture: false, motif: "role" });
    const c = catalogueAutorise(droit, "lecteur");
    expect(c.entrees.map((e) => e.toolId)).toEqual([...STUDIO_TOOL_IDS]);
    expect(c.entrees.filter((e) => e.autorise).map((e) => e.toolId)).toEqual(["studio.dessin.selection", "studio.scene.rappeler"]);
    expect(c.droits).toEqual({ lecture: true, ecriture: false, motif: "role" });
  });
  it("éditeur : tout est autorisé ; verrou et référence protégée sont nommés", () => {
    expect(catalogueAutorise(motifRefusEcriture(null), "editeur").entrees.every((e) => e.autorise)).toBe(true);
    expect(motifRefusEcriture({ status: 423, body: { error: "locked" } }).motif).toBe("verrou");
    expect(motifRefusEcriture({ status: 403, body: { error: "forbidden", motif: "reference-protegee" } }).motif).toBe("reference-protegee");
  });
});
