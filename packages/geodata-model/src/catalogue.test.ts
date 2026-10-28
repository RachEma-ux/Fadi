import { describe, expect, it } from "vitest";
import { CATEGORIES_CATALOGUE, categorieDe, categorieDuTheme, compterParType, regrouperCatalogue, validerLibelleCategorie } from "./catalogue.js";

const c = (id: string, titre: string, theme: string, typeGeometrie = "polygone") => ({ id, titre, typeGeometrie, version: { source: { id: `src-${id}`, theme } } });
const couches = [
  c("a", "Régions", "limites-administratives"),
  c("b", "Barrages", "agriculture", "point"),
  c("c", "Altitude", "relief", "raster"),
  c("d", "Aéroports", "infrastructures", "point"),
  c("e", "Musées", "patrimoine", "point"),
  c("f", "Hôtels", "tourisme", "point"),
  c("g", "Inconnue", "theme-non-repertorie"),
];

describe("catalogue rangé par catégorie", () => {
  it("chaque thème appartient à une seule catégorie", () => {
    const themes = CATEGORIES_CATALOGUE.flatMap((k) => k.themes);
    expect(new Set(themes).size).toBe(themes.length);
  });
  it("vecteurs : catégories dans l'ordre, couches triées, actives comptées ; thème inconnu dans « Autres »", () => {
    const g = regrouperCatalogue(couches, "vecteurs", new Set(["e"]));
    expect(g.map((x) => x.categorie.cle)).toEqual(["limites", "agriculture", "infrastructures", "tourisme", "autres"]);
    const tourisme = g.find((x) => x.categorie.cle === "tourisme")!;
    expect(tourisme.couches.map((x) => x.id)).toEqual(["f", "e"]);
    expect(tourisme.actives).toBe(1);
    expect(categorieDuTheme("theme-non-repertorie").libelle).toBe("Autres");
  });
  it("limites administratives (D-GD-35) : couches rangées dans l'ordre de la table des niveaux, puis les autres par titre", () => {
    const n = (id: string, titre: string, rang: number) => ({ ...c(id, titre, "limites-administratives"), niveauAdministratif: { rang } });
    const g = regrouperCatalogue([n("z", "A — niveau fin", 5), c("y", "Autre limite", "limites-administratives"), n("x", "Z — niveau global", 1), n("w", "M — niveau intermédiaire", 4)], "vecteurs", new Set());
    expect(g[0]!.couches.map((x) => x.id)).toEqual(["x", "w", "z", "y"]);
  });
  it("imagerie : seules les couches raster", () => {
    const g = regrouperCatalogue(couches, "imagerie", new Set());
    expect(g.map((x) => [x.categorie.cle, x.couches.length, x.actives])).toEqual([["relief", 1, 0]]);
    expect(compterParType(couches)).toEqual({ vecteurs: 6, imagerie: 1 });
  });
  it("catégories gérées : affectation explicite prioritaire, catégorie supprimée → thème puis « Autres »", () => {
    const categories = [{ cle: "gdcat-x", libelle: "Ma catégorie", themes: [] }, { cle: "limites", libelle: "Limites", themes: ["limites-administratives"] }];
    const r = { categories, affectations: new Map([["src-b", "gdcat-x"], ["src-d", "gdcat-supprimee"]]) };
    expect(categorieDe(couches[1]!, r).cle).toBe("gdcat-x");
    expect(categorieDe(couches[3]!, r).cle).toBe("autres");
    expect(categorieDe(couches[0]!, r).cle).toBe("limites");
    expect(regrouperCatalogue(couches, "vecteurs", new Set(), r).map((g) => [g.categorie.cle, g.couches.length])).toEqual([["gdcat-x", 1], ["limites", 1], ["autres", 4]]);
  });
  it("libellé de catégorie : longueur, doublon et « Autres » refusés", () => {
    expect(validerLibelleCategorie("  Forêts   et végétation ")).toEqual({ ok: true, libelle: "Forêts et végétation" });
    expect(validerLibelleCategorie("x").ok).toBe(false);
    expect(validerLibelleCategorie("autres").ok).toBe(false);
    expect(validerLibelleCategorie("Géologie", ["géologie"]).ok).toBe(false);
  });
});
