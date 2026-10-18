import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StudioDocument } from "@parcours/atelier-model";
import { angleNord, cartoucheCourant, cartoucheInitial, dateRevision, nomFichierFeuille, REGLAGES_INITIAUX, svgSansProlog } from "./feuille-ui";
import { PanneauFeuille } from "./PanneauFeuille";

const doc: StudioDocument = { id: "d1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }] };

describe("Feuille — cartouche prérempli par les seules données réelles", () => {
  it("projet, étude, variante, révision et date lus ; titre jamais proposé ; auteur seulement si c'est vous avec un nom affiché", () => {
    const sources = { projet: { code: "P.118", name: "Maison" }, etude: { name: "Implantation nord" }, variante: { name: "Variante A" }, revision: { id: "rev-9", createdAt: "2026-10-18T09:30:00", authorId: "u1" } };
    expect(cartoucheInitial({ ...sources, utilisateur: { id: "u1", displayName: "Fadi B." } })).toEqual({
      projectCode: "P.118", projectName: "Maison", study: "Implantation nord", variant: "Variante A", title: "", revisionId: "rev-9", revisionDate: "2026-10-18", author: "Fadi B.",
    });
    expect(cartoucheInitial({ ...sources, utilisateur: { id: "u2", displayName: "Autre" } }).author).toBe("");
    expect(cartoucheInitial({ ...sources, utilisateur: { id: "u1", displayName: null } }).author).toBe("");
    // Rien de lu : tout reste vide (la feuille affichera « — »).
    expect(Object.values(cartoucheInitial({})).every((v) => v === "")).toBe(true);
    expect(dateRevision("illisible")).toBe("");
  });

  it("la saisie l'emporte sur la donnée lue, même vidée", () => {
    const initial = cartoucheInitial({ etude: { name: "Implantation nord" } });
    expect(cartoucheCourant(initial, { study: "" }).study).toBe("");
    expect(cartoucheCourant(initial, { title: "Plan masse" })).toMatchObject({ study: "Implantation nord", title: "Plan masse" });
  });

  it("nord : aucun angle tant qu'il n'est pas déclaré ; nom de fichier sûr", () => {
    expect(REGLAGES_INITIAUX).toMatchObject({ format: "A3", orientation: "paysage", scale: "ajuster", scaleBar: false, nord: false });
    expect(angleNord({ ...REGLAGES_INITIAUX, nord: true })).toBeNull();
    expect(angleNord({ ...REGLAGES_INITIAUX, nord: true, angleNord: "12,5" })).toBe(12.5);
    expect(angleNord({ ...REGLAGES_INITIAUX, nord: false, angleNord: "12" })).toBeNull();
    expect(nomFichierFeuille({ projectCode: "P.118", study: "Implantation nord / été" }, { format: "A3", orientation: "paysage" }, "svg")).toBe("feuille-P.118-Implantation-nord-ete-A3-paysage.svg");
    expect(svgSansProlog('<?xml version="1.0"?>\n<svg/>')).toBe("<svg/>");
  });
});

describe("Boîte « Feuille »", () => {
  it("réglages, cartouche et aperçu de la feuille (non traduit) avec le nom de l'étude ; boutons Imprimer et Télécharger", () => {
    const html = renderToStaticMarkup(createElement(PanneauFeuille, { doc, cartouche: cartoucheInitial({ etude: { name: "Implantation nord" } }), brouillonNonEnregistre: true, surFermer: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toMatch(/<div[^>]*translate="no"[^>]*data-studio-feuille-apercu/);
    expect(html).toMatch(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="420mm" height="297mm"/);
    expect(html).toMatch(/<text data-id="cartouche\.study"[^>]*>Implantation nord<\/text>/);
    expect(html).toContain("Nord : non orienté");
    expect(html).toContain("data-studio-feuille-imprimer");
    expect(html).toContain("Télécharger la feuille SVG");
    expect(html).toContain("les modifications non enregistrées n’y figurent pas");
  });
});
