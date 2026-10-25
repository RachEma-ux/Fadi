import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STUDIO_MATRICE_ECHANGES } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import { cibleRaccourci, COMMANDES_EDITEUR, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { MANIFESTE_COMMANDES } from "../planche2d/catalogue";
import { entreesFiltrees, nomDetails, resumeMatrice, textesAffiches } from "./echanges-ui";
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
    expect(resumeMatrice()).toMatch(new RegExp(`^Révision ${STUDIO_MATRICE_ECHANGES.revision} du 2026-10-25 : \\d+ entrées — \\d+ livrées, \\d+ non livrées, 0 renoncées\\.$`));
  });

  it("a11y : chaque bloc de détails porte un nom distinct (format, sens, objet) ; intertitres h3 sous le h2 de la boîte", () => {
    const html = renderToStaticMarkup(createElement(PanneauEchanges, { surFermer: () => {} }));
    const noms = [...html.matchAll(/<summary[^>]*>([^<]*)<\/summary>/g)].map((m) => m[1]);
    expect(noms).toHaveLength(STUDIO_MATRICE_ECHANGES.entrees.length);
    expect(new Set(noms).size).toBe(noms.length);
    expect(new Set(STUDIO_MATRICE_ECHANGES.entrees.map(nomDetails)).size).toBe(STUDIO_MATRICE_ECHANGES.entrees.length);
    expect(html.match(/<h2/g)).toHaveLength(1);
    expect(html).not.toMatch(/<h[1456]/);
    expect(html).toMatch(/<h3>/);
  });

  it("sources : référence non traduite (translate=\"no\"), commentaire en prose traduit ; entités IFC non traduites", () => {
    const html = renderToStaticMarkup(createElement(PanneauEchanges, { surFermer: () => {} }));
    expect(html).toContain('<cite translate="no">docs/atelier/decisions.md, D-179</cite> — <span>DWG et DGN renoncés pour l’Atelier P2 seulement</span>');
    expect(html).not.toMatch(/data-studio-echange-sources[^>]*translate/);
    expect(html).toContain('<code>IfcTriangulatedFaceSet</code>');
    const t = new Traducteur(dico as Record<string, string>);
    for (const e of STUDIO_MATRICE_ECHANGES.entrees) for (const s of e.sources) if (s.commentaire) expect(t.traduire(s.commentaire), s.commentaire).not.toBe(s.commentaire);
  });

  it("chaque texte affiché a sa traduction anglaise (en.json)", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const cles = new Set(Object.keys(dico));
    const manquants = textesAffiches().filter((s) => !cles.has(s) && t.traduire(s) === s);
    expect(manquants).toEqual([]);
    expect(t.traduire(resumeMatrice())).toMatch(new RegExp(`^Revision ${STUDIO_MATRICE_ECHANGES.revision} of 2026-10-25`));
    expect(t.traduire(nomDetails(STUDIO_MATRICE_ECHANGES.entrees.find((e) => e.id === "feuille-pdf")!))).toBe("Entities, check and sources of PDF (Export): Presentation sheet of a revision");
  });
});
