import { prism, wallSurface } from "../exporteurs/maillage.js";
import { ref, refs, studioStepReal, studioStepString } from "../exporteurs/ifc-step.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import { extrusionRef, fail, identifier, layerRef, point, record, same } from "../noyau/validation.js";
import type { StudioExtrusion, StudioPoint } from "../noyau/types.js";
import { id, layerId, lineExtrusion, point as pointSchema } from "../registre/schemas-base.js";
import type { StudioTypeObjet } from "./type.js";

/** Ligne : deux points distincts ; s'extrude en mur (avec épaisseur, centré sur la ligne) ou en surface verticale. */
export interface StudioLine {
  id: string;
  type: "line";
  layerId?: string;
  start: StudioPoint;
  end: StudioPoint;
  extrusion?: StudioExtrusion;
}

export const SCHEMA_LIGNE = { type: "object", additionalProperties: false, required: ["id", "type", "start", "end"], properties: { id, type: { const: "line" }, layerId, start: pointSchema, end: pointSchema, extrusion: lineExtrusion } } as const;

/** Emprise d'un mur droit : demi-épaisseur de part et d'autre de la ligne (normale à gauche) ; null sans épaisseur. */
function footprint(o: StudioLine, thickness: number | undefined): StudioPoint[] | null {
  if (thickness === undefined) return null;
  const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
  const l = Math.hypot(dx, dy);
  // Normale à gauche, demi-épaisseur de part et d'autre de la ligne.
  const nx = (-dy / l) * (thickness / 2), ny = (dx / l) * (thickness / 2);
  return [
    { x: o.start.x - nx, y: o.start.y - ny },
    { x: o.end.x - nx, y: o.end.y - ny },
    { x: o.end.x + nx, y: o.end.y + ny },
    { x: o.start.x + nx, y: o.start.y + ny },
  ];
}

export const LIGNE: StudioTypeObjet<StudioLine> = {
  type: "line",
  outilCreation: "studio.dessin.ligne",
  valider(value, path) {
    const o = record(value, ["id", "type", "start", "end"], path, ["layerId", "extrusion"]);
    const start = point(o.start, `${path}.start`);
    const end = point(o.end, `${path}.end`);
    if (same(start, end)) fail(path, "la ligne doit avoir deux points distincts");
    return { id: identifier(o.id, `${path}.id`), type: "line", ...layerRef(o, path), start, end, ...extrusionRef(o, path, true) };
  },
  ancre(target, anchor) {
    return anchor === "start" ? { ...target.start } : anchor === "end" ? { ...target.end }
      : anchor === "mid" ? { x: (target.start.x + target.end.x) / 2, y: (target.start.y + target.end.y) / 2 } : null;
  },
  translater: (o, t) => ({ ...o, start: t(o.start), end: t(o.end) }),
  svg: (o) => `<line data-id="${xml(o.id)}" x1="${nb(o.start.x)}" y1="${svgY(o.start.y)}" x2="${nb(o.end.x)}" y2="${svgY(o.end.y)}" vector-effect="non-scaling-stroke"/>`,
  dxf: (o, layer, w) => w.line(layer, o.start, o.end),
  ifc(o, e, c) {
    const { s } = c;
    const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
    if (e.thickness !== undefined) {
      // Mur : IfcExtrudedAreaSolid d'un IfcRectangleProfileDef longueur × épaisseur, centré et orienté le long de la ligne.
      const l = Math.hypot(dx, dy);
      const placement = c.placed(o.start.x, o.start.y, e.base, dx / l, dy / l);
      const item = c.rectangleSolid(l / 2, 0, l, e.thickness, e.height);
      const axisCurve = s.add(`IFCPOLYLINE(${refs([c.pt2(0, 0), c.pt2(l, 0)])})`);
      // Corps d'abord : les lecteurs qui ne prennent qu'une représentation construisent le volume.
      const reps = [
        s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([item])})`),
        s.add(`IFCSHAPEREPRESENTATION(${ref(c.axis)},'Axis','Curve2D',${refs([axisCurve])})`),
      ];
      const element = s.add(`IFCWALL(${c.gid(o.id)},$,${studioStepString(o.id)},$,$,${ref(placement)},${ref(c.shape(reps))},${studioStepString(o.id)},.NOTDEFINED.)`);
      c.summary.walls++;
      return { element, item, layerId: c.layerOf(o) };
    }
    const l = Math.hypot(dx, dy), h = e.height;
    const placement = c.placed(o.start.x, o.start.y, e.base, dx / l, dy / l);
    // Surface verticale dans le plan local xz : (0,0,0) (l,0,0) (l,0,h) (0,0,h), deux triangles, ouverte.
    const coords = [[0, 0, 0], [l, 0, 0], [l, 0, h], [0, 0, h]].map((p) => `(${p.map(studioStepReal).join(",")})`).join(",");
    const list = s.add(`IFCCARTESIANPOINTLIST3D((${coords}),$)`);
    const item = s.add(`IFCTRIANGULATEDFACESET(${ref(list)},$,.F.,((1,2,3),(1,3,4)),$)`);
    const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','Tessellation',${refs([item])})`);
    const element = s.add(`IFCBUILDINGELEMENTPROXY(${c.gid(o.id)},$,${studioStepString(o.id)},${studioStepString("Surface verticale (ligne extrudée sans épaisseur)")},$,${ref(placement)},${ref(c.shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
    c.summary.surfaces++;
    return { element, item, layerId: c.layerOf(o) };
  },
  volume(o, zMin, zMax) {
    const ring = footprint(o, o.extrusion?.thickness);
    return ring ? { kind: "prism", geometry: prism(ring, zMin, zMax) } : { kind: "wall-surface", geometry: wallSurface(o.start, o.end, zMin, zMax) };
  },
};
