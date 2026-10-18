import { describe, expect, it } from "vitest";
import { cheminProjetStudio, estRouteStudio, lireRouteStudio } from "./routes-studio";

describe("adresses de Studio (lot I)", () => {
  it("accueil : /studio, avec ou sans barre finale", () => {
    expect(lireRouteStudio("/studio")).toEqual({ vue: "accueil" });
    expect(lireRouteStudio("/studio/")).toEqual({ vue: "accueil" });
  });

  it("projet : identifiant opaque, aller-retour exact", () => {
    const id = "3f2b6c1e-9a4d-4c55-8e0f-0a1b2c3d4e5f";
    expect(lireRouteStudio(cheminProjetStudio(id))).toEqual({ vue: "projet", projectId: id });
    expect(lireRouteStudio(`/studio/projets/${id}/`)).toEqual({ vue: "projet", projectId: id });
  });

  it("adresse inconnue ou identifiant non admis : écran explicite, jamais un repli silencieux", () => {
    for (const chemin of ["/studio/inconnu", "/studio/projets", "/studio/projets/a/b", "/studio/projets/..%2Fapi", "/studio/projets/%E0%A4%A", "/studio/projets/x%20y"]) {
      expect(lireRouteStudio(chemin).vue).toBe("inconnue");
    }
  });

  it("seules les adresses /studio relèvent de Studio ; /studio-x et /projets n'en sont pas", () => {
    expect(estRouteStudio("/studio")).toBe(true);
    expect(estRouteStudio("/studio/projets/p1")).toBe(true);
    expect(estRouteStudio("/studio-x")).toBe(false);
    expect(estRouteStudio("/projets/p1")).toBe(false);
  });
});
