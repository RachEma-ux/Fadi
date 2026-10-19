import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_MATRICE_ECHANGES } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import { cibleRaccourci, COMMANDES_EDITEUR, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { MANIFESTE_COMMANDES } from "../planche2d/catalogue";
import { entreesFiltrees, resumeMatrice, textesAffiches } from "./echanges-ui";
import { PanneauEchanges } from "./PanneauEchanges";

describe("Matrice d'échanges : boîte en lecture seule (E.6-01 à E.6-05)", () => {
  it("commande « echanges » : barre Exporter, icône propre, raccourci Q non réservé, lecture admise", () => {
    const c = COMMANDES_EDITEUR.find((x) => x.id === "echanges");
    expect(c).toMatchObject({ groupe: "export", ecrit: false, iconeSymbolique: "studio-exchanges", raccourci: "Q" });
    expect(c?.telechargement).toBeUndefined();
    expect(cibleRaccourci("Q")).toEqual({ type: "commande", id: "echanges" });
    expect(RACCOURCIS_RESERVES).not.toContain("Q");
    expect(MANIFESTE_COMMANDES.echanges).toEqual(["planche-2d", "vue-3d", "feuille"]);
  });

  it("affiche chaque entrée de la matrice, sans champ de saisie autre que le filtre ; filtre par statut", () => {
    const html = renderToStaticMarkup(createElement(PanneauEchanges, { surFermer: () => {} }));
    for (const e of STUDIO_MATRICE_ECHANGES.entrees) expect(html).toContain(`data-studio-echange="${e.id}"`);
    expect(html).not.toMatch(/<input|<textarea|contenteditable/);
    expect(html).toContain('data-studio-echange-fidelite="ifc"');
    expect(entreesFiltrees("livre").every((e) => e.statut === "livre")).toBe(true);
    expect(entreesFiltrees("non-livre").map((e) => e.id)).toContain("dwg-export");
    expect(entreesFiltrees("renonce")).toEqual([]);
    expect(resumeMatrice()).toMatch(/^Révision 1 du 2026-10-19 : \d+ entrées — \d+ livrées, \d+ non livrées, 0 renoncées\.$/);
  });

  it("chaque texte affiché a sa traduction anglaise (en.json)", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const cles = new Set(Object.keys(dico));
    const manquants = textesAffiches().filter((s) => !cles.has(s) && t.traduire(s) === s);
    expect(manquants).toEqual([]);
    expect(t.traduire(resumeMatrice())).toMatch(/^Revision 1 of 2026-10-19/);
  });
});
