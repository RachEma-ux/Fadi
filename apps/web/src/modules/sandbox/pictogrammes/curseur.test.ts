/** Curseur propre à chaque outil (lot 4) : image SVG au pictogramme de l'outil, point actif (4, 4), repli crosshair. */
import { describe, expect, it } from "vitest";
import { OUTILS, entreeOutil } from "@parcours/sandbox-planche-model";
import { curseurOutil } from "./curseur";

describe("curseur des outils", () => {
  it("chaque outil de dessin, de modification, de mesure et de caméra a son curseur ; Sélection et Lasso gardent la flèche", () => {
    expect(curseurOutil("selection", entreeOutil("selection").pictogramme)).toBe("default");
    expect(curseurOutil("lasso", entreeOutil("lasso").pictogramme)).toBe("default");
    const vus = new Set<string>();
    for (const o of OUTILS.filter((x) => x.id !== "selection" && x.id !== "lasso")) {
      const c = curseurOutil(o.id, entreeOutil(o.id).pictogramme);
      expect(c, o.id).toMatch(/^url\("data:image\/svg\+xml,[^"]+"\) 4 4, crosshair$/);
      vus.add(c);
    }
    // Deux outils ne partagent jamais un curseur (leurs pictogrammes sont uniques).
    expect(vus.size).toBe(OUTILS.length - 2);
  });

  it("le dessin est celui du pictogramme, à la teinte de sa famille, sans texte", () => {
    const svg = decodeURIComponent(/data:image\/svg\+xml,([^"]+)/.exec(curseurOutil("ligne", entreeOutil("ligne").pictogramme))![1]!);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="32" height="32"/);
    expect(svg).toContain('stroke="#1f6fd1"');
    expect(svg.replace(/<[^>]+>/g, "")).toBe("");
  });
});
