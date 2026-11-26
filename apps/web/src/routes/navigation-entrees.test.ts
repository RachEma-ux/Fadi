import { describe, expect, it } from "vitest";
import { entreeActive, entreesBarre, entreesPlus } from "./navigation-entrees";

describe("navigation au téléphone (N6, lot Design L5)", () => {
  it("barre : quatre liens dans l'ordre Accueil, Projets, Studio, GeoData (Plus est le 5ᵉ, un bouton)", () => {
    expect(entreesBarre().map((e) => e.libelle)).toEqual(["Accueil", "Projets", "Studio", "GeoData"]);
    expect(entreesBarre().find((e) => e.cle === "geodata")?.marque).toBe(true);
  });
  it("feuille Plus : ordre fixe ; le rôle n'ajoute que l'Administration", () => {
    const base = entreesPlus({ administration: false, collaboration: "/collaboration" }).map((e) => e.cle);
    expect(base).toEqual(["collaboration", "bibliotheque", "harmonie", "revues", "organisations", "extensions", "parametres"]);
    expect(entreesPlus({ administration: true, collaboration: "/collaboration" }).map((e) => e.cle)).toEqual([...base, "administration"]);
  });
  it("entrée active : une seule, Collaboration d'un projet n'active pas Projets", () => {
    expect(entreeActive("/accueil", "")).toBe("accueil");
    expect(entreeActive("/projets", "")).toBe("projets");
    expect(entreeActive("/projets/p1", "?module=parcours&etape=3")).toBe("projets");
    expect(entreeActive("/projets/p1", "?module=collaboration")).toBe("collaboration");
    expect(entreeActive("/studio/projets/p1", "")).toBe("studio");
    expect(entreeActive("/sandbox", "")).toBe("studio");
    expect(entreeActive("/geodata", "")).toBe("geodata");
    expect(entreeActive("/admin/utilisateurs", "")).toBe("administration");
    expect(entreeActive("/inconnue", "")).toBeNull();
  });
});
