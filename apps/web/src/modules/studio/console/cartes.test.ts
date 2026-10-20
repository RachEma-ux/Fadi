/**
 * Cartes de la Console : cinq cartes, dans l'ordre demandé, aux libellés exacts ; « 00 » ne s'ouvre jamais comme un outil ;
 * « 01 » à « 04 » ouvrent l'outil de leur domaine sans projet (aucun identifiant de projet, d'étude ni de variante).
 */
import { describe, expect, it } from "vitest";
import { DOMAINES_STUDIO } from "../domaines/definitions";
import { lireRouteStudio } from "../routes-studio";
import { CARTES_CONSOLE } from "./cartes";
import { contexteConsole } from "./contexte-console";

const lire = (chemin: string) => {
  const [p, q = ""] = chemin.split("?");
  return lireRouteStudio(p!, q ? `?${q}` : "");
};

describe("cartes de la Console", () => {
  it("cinq cartes : 00 Sadbox (bientôt disponible), puis les quatre domaines sous leur libellé exact", () => {
    expect(CARTES_CONSOLE.map((c) => `${c.numero} ${c.libelleFR}`)).toEqual([
      "00 Sadbox", "01 Dessin et modélisation", "02 BIM et coordination", "03 Visualisation, rendu et immersion", "04 Documentation, métrés et collaboration",
    ]);
    expect(CARTES_CONSOLE.filter((c) => c.bientot).map((c) => c.id)).toEqual(["sadbox"]);
  });

  it("la carte 00 ouvre la page « bientôt disponible », jamais un outil", () => {
    expect(lire(CARTES_CONSOLE[0]!.chemin)).toEqual({ vue: "console-sadbox" });
  });

  it("chaque carte de domaine ouvre l'outil de son domaine, sans charger de projet", () => {
    const domaines = CARTES_CONSOLE.slice(1);
    expect(domaines.map((c) => c.id)).toEqual(DOMAINES_STUDIO.map((d) => d.id));
    for (const c of domaines) {
      const r = lire(c.chemin);
      expect(r, c.id).toMatchObject({ vue: "console-outil", domaine: c.id });
      expect(c.chemin).not.toMatch(/projets|etudes|variantes/);
    }
  });

  it("le contexte local est neuf à chaque ouverture : document vide, écriture au brouillon seulement, rien de partagé", () => {
    const a = contexteConsole(), b = contexteConsole();
    expect(a.canWrite).toBe(true);
    expect(a.revision.document.objects).toEqual([]);
    expect(a.revision.document).not.toBe(b.revision.document);
  });
});
