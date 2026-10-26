/**
 * Scène de fidélité du rendu 2D (EX-055, TR-EX-055) : lignes, rectangle, cercle, arc, polyligne à renflement, cote,
 * texte, deux calques dont un masqué, et les graphismes du modèle — spline, hachures (opaque et transparente), symboles
 * (opaques et transparents). Donnée de recette **synthétique** (aucune donnée de projet) : tests et recette e2e. Le
 * document est écrit tel quel et validé par le modèle (aucune commande n'est appliquée hors du brouillon, A.5-01).
 */
import { validateStudioDocument, type StudioDocument } from "@parcours/atelier-model";

/** Scène de fidélité EX-055 : toutes les familles de tracé du renderer 2D, deux calques dont un masqué. */
export function sceneFidelite(): StudioDocument {
  return validateStudioDocument({
    id: "fidelite-ex055", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
    layers: [{ id: "plan", name: "Plan", visible: true, locked: false }, { id: "cache", name: "Caché", visible: false, locked: false }],
    objects: [
      { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } },
      { id: "r", type: "rectangle", origin: { x: 0, y: 1 }, width: 3, height: 2, layerId: "plan" },
      { id: "c", type: "circle", center: { x: 9, y: 2 }, radius: 1.5 },
      { id: "a", type: "arc", center: { x: 13, y: 2 }, radius: 1.2, startAngle: 0.3, endAngle: 2.6 },
      { id: "p", type: "polyline", points: [{ x: 0, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 8 }], closed: false, bulges: [0.4, 0] },
      { id: "cachee", type: "line", start: { x: 0, y: 9 }, end: { x: 3, y: 9 }, layerId: "cache" },
    ],
    dimensions: [{ id: "d", type: "dimension", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, offset: -0.6, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false }],
    annotations: [{ id: "t", type: "text", position: { x: 6, y: 6 }, height: 0.4, rotation: 0.4, content: "Séjour", justification: "center" }],
    graphismes: [
      { id: "sp", type: "spline", points: [{ x: 6, y: 9 }, { x: 7, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 9 }, { x: 11, y: 7 }, { x: 13, y: 7 }, { x: 14, y: 9 }] },
      { id: "ha", type: "hachure", layerId: "plan", opacite: 0.5, contour: [{ x: 15, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 4 }, { x: 17, y: 2 }, { x: 15, y: 4 }], angle: Math.PI / 4, espacement: 0.4 },
      { id: "hb", type: "hachure", contour: [{ x: 15, y: 5 }, { x: 19, y: 5 }, { x: 19, y: 8 }, { x: 15, y: 8 }], angle: 0, espacement: 0.5 },
      { id: "sn", type: "symbole", opacite: 0.75, symbole: "nord", position: { x: 22, y: 2 }, rotation: Math.PI / 6, echelle: 2 },
      { id: "sc", type: "symbole", symbole: "croix", position: { x: 22, y: 6 }, rotation: 0, echelle: 1 },
      { id: "sv", type: "symbole", opacite: 0.3, symbole: "niveau", position: { x: 22, y: 9 }, rotation: 0, echelle: 1.5 },
    ],
  });
}
