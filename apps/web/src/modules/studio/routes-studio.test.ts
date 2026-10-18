import { describe, expect, it } from "vitest";
import { cheminEtudeStudio, cheminProjetStudio, cheminVarianteStudio, estRouteStudio, lireRouteStudio } from "./routes-studio";

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

  it("étude : projet et étude opaques, aller-retour exact", () => {
    expect(lireRouteStudio(cheminEtudeStudio("p_1", "etu_2"))).toEqual({ vue: "etude", projectId: "p_1", etudeId: "etu_2" });
    expect(lireRouteStudio("/studio/projets/p_1/etudes").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/etu_2/x").vue).toBe("inconnue");
    expect(lireRouteStudio("/studio/projets/p_1/autre/etu_2").vue).toBe("inconnue");
  });

  it("variante : domaine et planche dans l'adresse, aller-retour exact", () => {
    const lire = (chemin: string) => {
      const [p, q = ""] = chemin.split("?");
      return lireRouteStudio(p!, q ? `?${q}` : "");
    };
    const base = { vue: "variante", projectId: "p_1", etudeId: "etu_2", variantId: "var_3", revision: null };
    expect(lire(cheminVarianteStudio("p_1", "etu_2", "var_3"))).toEqual({ ...base, domaine: "dessin", planche: null });
    expect(lire(cheminVarianteStudio("p_1", "etu_2", "var_3", "dessin", "3d"))).toEqual({ ...base, domaine: "dessin", planche: "3d" });
    expect(lire(cheminVarianteStudio("p_1", "etu_2", "var_3", "bim", "2d"))).toEqual({ ...base, domaine: "bim", planche: null });
    expect(cheminVarianteStudio("p_1", "etu_2", "var_3", "bim", "2d")).not.toContain("planche");
    expect(lireRouteStudio("/studio/projets/p_1/etudes/etu_2/variantes/var_3")).toEqual({ ...base, domaine: "dessin", planche: null });
    expect(lire(cheminVarianteStudio("p_1", "etu_2", "var_3", "dessin", "2d", "rev_9"))).toEqual({ ...base, domaine: "dessin", planche: "2d", revision: "rev_9" });
    expect(cheminVarianteStudio("p_1", "etu_2", "var_3", "dessin", "3d", "rev_9")).not.toContain("revision");
    for (const domaine of ["visualisation", "documentation"]) expect(lire(cheminVarianteStudio("p_1", "etu_2", "var_3", domaine as "bim"))).toMatchObject({ domaine });
  });

  it("variante : domaine inconnu, planche hors dessin, paramètre répété ou étranger → adresse non reconnue", () => {
    const chemin = "/studio/projets/p_1/etudes/etu_2/variantes/var_3";
    for (const q of ["?domaine=rendu", "?domaine=bim&planche=2d", "?planche=4d", "?domaine=dessin&domaine=bim", "?planche=2d&planche=3d", "?vue=x", "?domaine=", "?planche=3d&revision=rev_1", "?revision=rev_1", "?planche=2d&revision=../x", "?planche=2d&revision=a&revision=b"]) {
      expect(lireRouteStudio(chemin, q).vue).toBe("inconnue");
    }
    expect(lireRouteStudio("/studio/projets/p_1/etudes/etu_2/variantes").vue).toBe("inconnue");
    expect(lireRouteStudio(`${chemin}/x`).vue).toBe("inconnue");
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
