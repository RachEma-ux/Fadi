import { describe, expect, it } from "vitest";
import { EXPORT_PATH, supportTarget } from "./support-path.js";

describe("accès support : résolution du projet comme le routeur (revue de sécurité PR #255)", () => {
  it("identifiant encodé en pourcent : décodé comme Express décode :projectId", () => {
    expect(supportTarget("/%70roj_123/documents/surfaces")).toEqual({ projectId: "proj_123", sub: "/documents/surfaces" });
    expect(supportTarget("/proj%5F123")).toEqual({ projectId: "proj_123", sub: "" });
  });
  it("sous-chemin décodé, en minuscules, sans barre oblique finale", () => {
    expect(supportTarget("/p1/DOCUMENTS/Surfaces/")).toEqual({ projectId: "p1", sub: "/documents/surfaces" });
    expect(supportTarget("/p1/%61rchive")).toEqual({ projectId: "p1", sub: "/archive" });
  });
  it("encodage invalide ou chemin hors projet : aucune cible (Express répond 400 sans atteindre la route)", () => {
    expect(supportTarget("/%E0%A4%A/x")).toBeNull();
    expect(supportTarget("/")).toBeNull();
    expect(supportTarget("/import")).toBeNull();
  });
});

describe("accès support : chemins d'export (défense supplémentaire)", () => {
  it.each([
    "/documents/surfaces", "/documents/programme", "/documents/fiches", "/documents/dossier-exemple", "/documents/plan/rdc",
    "/documents/atelier/modele.ifc", "/documents/dessins/x", "/archive", "/copies", "/steps/1/files/abc", "/steps/harmonie/rapport",
    "/steps/3/harmonie/rapport", "/design-review/rapport", "/atelier/journal.csv", "/atelier/planches/p/export.ifc",
    "/atelier/solides-exacts/o/export.step", "/atelier/publications/p/fichiers/v", "/studio/studies/s/variants/v/export",
    "/studio/studies/s/sheets/f/files/pdf", "/studio/studies/s/publications/p/files/ifc",
  ])("%s : export", (sub) => { expect(EXPORT_PATH.test(sub)).toBe(true); });
  it.each(["", "/steps", "/steps/1", "/documents", "/atelier/model", "/programme", "/collaboration", "/support-grants"])("%s : lecture", (sub) => {
    expect(EXPORT_PATH.test(sub)).toBe(false);
  });
});
