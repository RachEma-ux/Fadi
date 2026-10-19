/**
 * Caractérisation du découpage S0 : le balisage de la planche (`Dessin2D`, rendus par type) est comparé, chaîne pour
 * chaîne, à `caracterisation.fixtures.json`, généré AVANT le découpage depuis la base 0f02cb3. Régénérer
 * (`STUDIO_CARACTERISATION_ECRIRE=1 npx vitest run caracterisation`) n'est permis que pour un changement délibéré.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Dessin2D, TraceForme, type Dessin2DProps } from "./Dessin2D";
import { CADRE_INITIAL } from "./geometrie-2d";

const FICHIER = new URL("./caracterisation.fixtures.json", import.meta.url);

const doc = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "verrou", name: "Verrou", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0.1 } } },
  { toolId: "studio.dessin.ligne", params: { id: "lv", type: "line", layerId: "verrou", start: { x: 0, y: 1 }, end: { x: 4, y: 1 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 1, y: 2 }, width: 2, height: 1.5 } },
  { toolId: "studio.dessin.rectangle", params: { id: "rc", type: "rectangle", layerId: "cache", origin: { x: 1, y: 2 }, width: 2, height: 1.5 } },
  { toolId: "studio.dessin.cercle", params: { id: "c", type: "circle", center: { x: 5, y: 5 }, radius: 1 } },
  { toolId: "studio.dessin.arc", params: { id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2 } },
  { toolId: "studio.dessin.arc", params: { id: "a2", type: "arc", center: { x: 3, y: 3 }, radius: 1 / 3, startAngle: 5, endAngle: 1 } },
  { toolId: "studio.dessin.polyligne", params: { id: "p", type: "polyline", points: [{ x: 10, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 2 }], closed: true, bulges: [0, 0, 0.4] } },
  { toolId: "studio.dessin.polyligne", params: { id: "po", type: "polyline", points: [{ x: 10, y: 5 }, { x: 12.123456789, y: 5 }, { x: 12, y: 7 }], closed: false } },
  { toolId: "studio.dessin.cote", params: { id: "d1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0.1 }, offset: 0.5, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d2", type: "dimension", start: { x: 1, y: 2 }, end: { x: 3, y: 3.5 }, offset: -0.4, links: { start: { objectId: "r", anchor: "corner-origin" }, end: null }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d3", type: "dimension", layerId: "verrou", start: { x: 8, y: 0 }, end: { x: 6, y: -3 }, offset: 1, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d4", type: "dimension", layerId: "cache", start: { x: 8, y: 0 }, end: { x: 6, y: -3 }, offset: 1, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.dessin.supprimer", params: { ids: ["r"] } },
  { toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 1, y: 2 }, width: 2, height: 1.5 } },
  { toolId: "studio.calque.modifier", params: { id: "verrou", name: "Verrou", visible: true, locked: true } },
] as StudioCommand[]);

const base = (): Dessin2DProps => ({
  svgRef: null, doc: doc(), cadre: CADRE_INITIAL, pas: 1, outil: "studio.dessin.selection", selection: new Set(), trace: null, survol: null,
  rectangle: null, glissement: false, clicsVersPlanche: () => false,
  surPlanche: () => {}, surSurvol: () => {}, surPointeurBas: () => {}, surPointeurHaut: () => {}, surClicCapture: () => {}, surSelection: () => {},
});

const CAS: Record<string, Partial<Dessin2DProps>> = {
  repos: {},
  selection: { selection: new Set(["l", "d1", "c", "lv"]), glissement: true, pas: 0.25, cadre: { x: -3, y: -2, w: 30, h: 20 } },
  "trace-rectangle": { outil: "studio.dessin.rectangle", trace: { point: { x: 1, y: 1 }, accroche: null }, survol: { point: { x: 3, y: -1 }, accroche: { objectId: "c", anchor: "center", point: { x: 5, y: 5 } } } },
  "trace-ligne": { outil: "studio.dessin.ligne", trace: { point: { x: 1, y: 1 }, accroche: null }, survol: { point: { x: 3, y: -1 }, accroche: null } },
  "trace-polyligne": { outil: "studio.dessin.polyligne", trace: { point: { x: 1, y: 1 }, accroche: null }, survol: { point: { x: 3, y: -1 }, accroche: null }, sommetsPoses: [{ x: 2, y: 2 }, { x: 2.5, y: 0 }],
    apercuForme: { id: "apercu", type: "polyline", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 2.5, y: 0 }, { x: 3, y: -1 }], closed: false } },
  "trace-arc": { outil: "studio.dessin.arc", trace: { point: { x: 0, y: 0 }, accroche: null }, survol: { point: { x: 1, y: 1 }, accroche: null }, sommetsPoses: [{ x: 2, y: 0 }],
    apercuForme: { id: "apercu", type: "arc", center: { x: 1, y: 0 }, radius: 1, startAngle: 0, endAngle: Math.PI } },
  "trace-cercle": { outil: "studio.dessin.cercle", trace: { point: { x: 0, y: 0 }, accroche: null }, survol: { point: { x: 1, y: 1 }, accroche: null },
    apercuForme: { id: "apercu", type: "circle", center: { x: 0, y: 0 }, radius: Math.SQRT2 } },
  "rectangle-fenetre": { rectangle: { debut: { x: 0, y: 0 }, fin: { x: 5, y: 4 }, mode: "fenetre" } },
  "rectangle-capture": { rectangle: { debut: { x: 5, y: 4 }, fin: { x: 0, y: 0 }, mode: "capture" } },
  "vers-planche": { outil: "studio.dessin.deplacer", clicsVersPlanche: (o) => o.id !== "c", trace: { point: { x: 0, y: 0 }, accroche: null } },
};

function sorties(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [nom, props] of Object.entries(CAS)) out[`dessin/${nom}`] = renderToStaticMarkup(createElement(Dessin2D, { ...base(), ...props }));
  for (const o of doc().objects) {
    out[`trace/${o.id}`] = renderToStaticMarkup(createElement(TraceForme, { o }));
    out[`trace/${o.id}/classe`] = renderToStaticMarkup(createElement(TraceForme, { o, className: "x" }));
  }
  return out;
}

describe("Planche : caractérisation du découpage (balisage identique à la base)", () => {
  const actual = sorties();
  if (process.env.STUDIO_CARACTERISATION_ECRIRE === "1") writeFileSync(FICHIER, JSON.stringify(actual, null, 1) + "\n");
  const expected = JSON.parse(readFileSync(FICHIER, "utf8")) as Record<string, string>;
  it("couvre les mêmes cas", () => expect(Object.keys(actual)).toEqual(Object.keys(expected)));
  it.each(Object.keys(expected))("%s", (k) => expect(actual[k]).toBe(expected[k]));
});
