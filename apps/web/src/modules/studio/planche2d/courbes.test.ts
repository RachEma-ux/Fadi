/**
 * Courbes de la planche 2D : outils Cercle, Arc, Polyligne et Décaler (registre, raccourcis, barres), accrochage aux
 * centres, milieux et sommets, sélection par rectangle d'une courbe, saisie des sommets, rendu SVG et extrusion.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioDocument } from "@parcours/atelier-model";
import { commandesExtrusion } from "../vue3d/extrusion";
import { Dessin2D } from "./Dessin2D";
import { accrocher, CADRE_INITIAL, ecrireSommets, emprise, lireSommets, pointsAccroche } from "./geometrie-2d";
import { cibleRaccourci, COMMANDES_EDITEUR, OUTILS_MODES, OUTILS_TRACE, outilsDeBarre } from "./raccourcis";
import { segments, selectionParRectangle } from "./selection";

const doc = (): StudioDocument => ({
  ...newStudioDocument("d"),
  objects: [
    { id: "c", type: "circle", center: { x: 5, y: 5 }, radius: 1 },
    { id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2 },
    { id: "p", type: "polyline", points: [{ x: 10, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 2 }], closed: true, bulges: [0, 0, 0.4] },
  ],
});

describe("Courbes : outils, raccourcis et barres", () => {
  it("Cercle (C), Arc (A), Polyligne (P) dans la barre Dessin ; Décaler (O) dans Modification", () => {
    expect(cibleRaccourci("C")).toEqual({ type: "outil", toolId: "studio.dessin.cercle" });
    expect(cibleRaccourci("A")).toEqual({ type: "outil", toolId: "studio.dessin.arc" });
    expect(cibleRaccourci("P")).toEqual({ type: "outil", toolId: "studio.dessin.polyligne" });
    expect(cibleRaccourci("O")).toEqual({ type: "outil", toolId: "studio.dessin.decaler" });
    expect(cibleRaccourci("Shift+O")).toEqual({ type: "commande", id: "outils" });
    expect(outilsDeBarre("dessin").map((t) => t.toolId)).toEqual(["studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne", "studio.dessin.cote", "studio.dessin.cote-angulaire", "studio.dessin.texte"]);
    expect(outilsDeBarre("modification").map((t) => t.toolId)).toContain("studio.dessin.decaler");
    for (const t of ["studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne"] as const) expect(OUTILS_TRACE.has(t) && OUTILS_MODES.has(t), t).toBe(true);
    expect(OUTILS_MODES.has("studio.dessin.decaler") && !OUTILS_TRACE.has("studio.dessin.decaler")).toBe(true);
  });

  it("Entrée termine, Maj+Entrée ferme la polyligne : commandes d'écriture de la barre Édition, icônes propres", () => {
    expect(cibleRaccourci("Enter")).toEqual({ type: "commande", id: "terminer-polyligne" });
    expect(cibleRaccourci("Shift+Enter")).toEqual({ type: "commande", id: "fermer-polyligne" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "terminer-polyligne")).toMatchObject({ groupe: "edition", ecrit: true, iconeSymbolique: "studio-polyline-finish" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "fermer-polyligne")).toMatchObject({ groupe: "edition", ecrit: true, iconeSymbolique: "studio-polyline-close" });
  });
});

describe("Courbes : accrochage, emprise, sélection", () => {
  it("centre et quadrants du cercle, extrémités / milieu / centre de l'arc, sommets et milieux de polyligne", () => {
    const pts = pointsAccroche(doc().objects, () => true);
    expect(accrocher(pts, { x: 5.02, y: 5 }, 0.1)).toMatchObject({ objectId: "c", anchor: "center" });
    expect(accrocher(pts, { x: 6, y: 5.05 }, 0.1)).toMatchObject({ objectId: "c", anchor: "quadrant-0", point: { x: 6, y: 5 } });
    expect(accrocher(pts, { x: 1.41, y: 1.41 }, 0.1)).toMatchObject({ objectId: "a", anchor: "mid" });
    expect(accrocher(pts, { x: 12, y: 1.95 }, 0.1)).toMatchObject({ objectId: "p", anchor: "vertex-2", point: { x: 12, y: 2 } });
    expect(accrocher(pts, { x: 11, y: 0.02 }, 0.1)).toMatchObject({ objectId: "p", anchor: "mid-0", point: { x: 11, y: 0 } });
  });

  it("emprise exacte (cercle, arc, segment courbe) et sélection par fenêtre ou capture", () => {
    const e = emprise(doc(), () => true)!;
    expect(e.min.x).toBeCloseTo(0, 9);
    expect(e.max).toEqual({ x: 12, y: 6 });
    expect(segments(doc().objects[0]!)).toHaveLength(64);
    expect(selectionParRectangle(doc(), { x: 3.9, y: 3.9 }, { x: 6.1, y: 6.1 })).toEqual(["c"]);
    // Capture (de droite à gauche) : l'arc touché suffit.
    expect(selectionParRectangle(doc(), { x: 2.1, y: 0.5 }, { x: 1.5, y: -0.5 })).toEqual(["a"]);
    expect(selectionParRectangle(doc(), { x: 0.5, y: 0.5 }, { x: 1, y: 1 })).toEqual([]);
  });

  it("saisie des sommets : « x y ; … », virgule ou point décimal, illisible = null", () => {
    expect(lireSommets("0 0; 4,5 0;\n4 3")).toEqual([{ x: 0, y: 0 }, { x: 4.5, y: 0 }, { x: 4, y: 3 }]);
    expect(lireSommets("0 0; 4")).toBeNull();
    expect(lireSommets("0 0; a b")).toBeNull();
    expect(lireSommets("")).toBeNull();
    expect(ecrireSommets([{ x: 0, y: 0 }, { x: 4.5, y: -1 }])).toBe("0 0; 4.5 -1");
  });
});

describe("Courbes : rendu et extrusion", () => {
  it("planche : <circle>, <path> à arcs exacts, tracé ouvert sans remplissage ; aperçu d'une courbe en cours", () => {
    const html = renderToStaticMarkup(createElement(Dessin2D, {
      svgRef: null, doc: doc(), cadre: CADRE_INITIAL, pas: 1, outil: "studio.dessin.arc", selection: new Set(["c"]), trace: { point: { x: 0, y: 0 }, accroche: null }, survol: { point: { x: 1, y: 1 }, accroche: null },
      rectangle: null, glissement: false, apercuForme: { id: "apercu", type: "circle", center: { x: 0, y: 0 }, radius: 1 }, sommetsPoses: [{ x: 2, y: 0 }],
      clicsVersPlanche: () => false, surPlanche: () => {}, surSurvol: () => {}, surPointeurBas: () => {}, surPointeurHaut: () => {}, surClicCapture: () => {}, surSelection: () => {},
    }));
    expect(html).toMatch(/aria-label="Cercle c"[^>]*data-studio-type="circle"[^>]*><circle cx="5" cy="5" r="1">/);
    expect(html).toMatch(/aria-label="Arc a"[^>]*><path class="studio-ouvert" d="M 2 0 A 2 2 0 0 1 0 2">/);
    expect(html).toMatch(/aria-label="Polyligne p"[^>]*><path d="M 10 0 L 12 0 L 12 2 A /);
    expect(html).toContain('data-studio-apercu-forme="circle"');
    expect(html).toContain('data-studio-sommet-pose="0"');
  });

  it("épaisseur pour lignes et arcs seulement ; cercles et polylignes en prisme sans épaisseur", () => {
    const r = commandesExtrusion(doc(), ["c", "a", "p"], { base: 0, hauteur: 3, epaisseur: 0.2, direction: "+z" });
    if (!("commandes" in r)) throw new Error("commandes attendues");
    expect(r.commandes).toEqual([
      { toolId: "studio.objet.extruder", params: { ids: ["a"], base: 0, height: 3, thickness: 0.2, direction: "+z" } },
      { toolId: "studio.objet.extruder", params: { ids: ["c", "p"], base: 0, height: 3, direction: "+z" } },
    ]);
    expect(r.info).toBe("L’épaisseur ne s’applique qu’aux lignes et aux arcs : les autres objets s’extrudent sans épaisseur.");
    expect(applyStudioCommands(doc(), r.commandes).objects.every((o) => o.extrusion)).toBe(true);
  });
});
