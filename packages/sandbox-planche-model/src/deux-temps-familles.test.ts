import { describe, expect, it } from "vitest";
import { FAMILLES_DEUX_TEMPS, normaliserRaccourci, secondTemps, texteRecherche, troisTemps } from "./catalogue-outils.js";
import { REGISTRE_SANDBOX } from "./registre-sandbox.js";

describe("raccourcis en trois temps : menu par familles (28 novembre 2026)", () => {
  it("six familles, portes Maj + lettre distinctes", () => {
    expect(FAMILLES_DEUX_TEMPS.map((f) => `${f.porte} ${f.id}`)).toEqual([
      "Maj+I echanges", "Maj+B batiment", "Maj+T site", "Maj+M rendu", "Maj+S mise-en-page", "Maj+L collaboration",
    ]);
    expect(new Set(FAMILLES_DEUX_TEMPS.map((f) => f.porte)).size).toBe(FAMILLES_DEUX_TEMPS.length);
  });
  it("lit l'entrée, la porte et la touche ; refuse une porte inconnue ou un autre nombre de temps", () => {
    expect(troisTemps("Ctrl+Maj+Espace, Maj+I, N")).toEqual({ famille: "echanges", touche: "N" });
    expect(troisTemps("ctrl+maj+espace, maj+b, maj+n")).toEqual({ famille: "batiment", touche: "Maj+N" });
    expect(troisTemps("Ctrl+Maj+Espace, Maj+Q, N")).toBeNull();
    expect(troisTemps("Ctrl+Maj+Espace, N")).toBeNull();
    expect(troisTemps("Ctrl+Maj+R, Maj+I, N")).toBeNull();
    // Un raccourci en trois temps n'est jamais lu comme un second temps.
    expect(secondTemps("Ctrl+Maj+Espace, Maj+I, N")).toBeNull();
    expect(normaliserRaccourci("ctrl+maj+espace, maj+i, n")).toBe("Ctrl+Maj+Espace, Maj+I, N");
  });
  it("aucune commande ne prend une porte comme seconde touche ; chaque touche est unique dans sa famille", () => {
    const portes = new Set(FAMILLES_DEUX_TEMPS.map((f) => f.porte));
    expect(REGISTRE_SANDBOX.filter((e) => portes.has(secondTemps(e.raccourci ?? "") ?? "")).map((e) => e.id)).toEqual([]);
    const vus = new Set<string>();
    for (const e of REGISTRE_SANDBOX) {
      const t = troisTemps(e.raccourci ?? "");
      if (!t) continue;
      const k = `${t.famille} ${t.touche}`;
      expect(vus.has(k), k).toBe(false);
      vus.add(k);
    }
  });
  it("recherche : sans casse ni accents", () => {
    expect(texteRecherche("  Tranche de NUAGE  de points ")).toBe("tranche de nuage de points");
    expect(texteRecherche("Échanges")).toBe("echanges");
  });
});
