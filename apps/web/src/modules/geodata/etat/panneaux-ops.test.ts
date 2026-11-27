import { describe, expect, it } from "vitest";
import { basculerOnglet, basculerVolet, carteSeule, cibleEchap, ouvrirOnglet, type EtatPanneaux } from "./panneaux-ops";

const e0: EtatPanneaux = { onglet: "catalogue", panneauOuvert: false, volet: "fiche" };

describe("panneaux (P4, comportement d'avant l'extraction)", () => {
  it("ouvrir un onglet : panneau ouvert ; au téléphone le volet se ferme (un seul panneau, GEO 12)", () => {
    expect(ouvrirOnglet(e0, "couches", false)).toEqual({ onglet: "couches", panneauOuvert: true, volet: "fiche" });
    expect(ouvrirOnglet(e0, "couches", true)).toEqual({ onglet: "couches", panneauOuvert: true, volet: null });
  });
  it("bascule d'onglet : referme si le même onglet est déjà ouvert", () => {
    const ouvert = ouvrirOnglet(e0, "legende", false);
    expect(basculerOnglet(ouvert, "legende", false).panneauOuvert).toBe(false);
    expect(basculerOnglet(ouvert, "catalogue", false)).toMatchObject({ onglet: "catalogue", panneauOuvert: true });
  });
  it("volet : ouvre ou referme ; au téléphone le panneau se ferme", () => {
    expect(basculerVolet(e0, "fiche", false).volet).toBeNull();
    expect(basculerVolet({ ...e0, panneauOuvert: true }, "etudes", true)).toEqual({ onglet: "catalogue", panneauOuvert: false, volet: "etudes" });
  });
  it("carte seule : tout fermé", () => expect(carteSeule({ ...e0, panneauOuvert: true })).toMatchObject({ panneauOuvert: false, volet: null }));
  it("Échap : tracé, menu, résultats, mini-barre, puis volet au téléphone seulement", () => {
    const rien = { traceEnCours: false, menuOuvert: false, resultats: false, panneauMini: false, volet: false, telephone: false };
    expect(cibleEchap({ ...rien, traceEnCours: true, menuOuvert: true })).toBe("trace");
    expect(cibleEchap({ ...rien, menuOuvert: true, resultats: true })).toBe("menu");
    expect(cibleEchap({ ...rien, resultats: true, panneauMini: true })).toBe("resultats");
    expect(cibleEchap({ ...rien, panneauMini: true, volet: true })).toBe("panneau-mini");
    expect(cibleEchap({ ...rien, volet: true })).toBeNull();
    expect(cibleEchap({ ...rien, volet: true, telephone: true })).toBe("volet");
  });
});
