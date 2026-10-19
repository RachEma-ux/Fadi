import { studioCirclePoints } from "../courbes.js";
import { prism } from "../exporteurs/maillage.js";
import { ref, studioStepReal } from "../exporteurs/ifc-step.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import { centerRadius, extrusionRef, identifier, layerRef, record, REFUS_EPAISSEUR_COURBE } from "../noyau/validation.js";
import type { StudioExtrusion, StudioPoint } from "../noyau/types.js";
import { id, layerId, point as pointSchema, positive, rectangleExtrusion } from "../registre/schemas-base.js";
import type { StudioTypeObjet } from "./type.js";

/** Cercle : centre et rayon strictement positif ; s'extrude en prisme (cylindre) sur son emprise, sans épaisseur. */
export interface StudioCircle {
  id: string;
  type: "circle";
  layerId?: string;
  center: StudioPoint;
  radius: number;
  extrusion?: Omit<StudioExtrusion, "thickness">;
}

export const SCHEMA_CERCLE = { type: "object", additionalProperties: false, required: ["id", "type", "center", "radius"], properties: { id, type: { const: "circle" }, layerId, center: pointSchema, radius: positive, extrusion: rectangleExtrusion } } as const;

export const CERCLE: StudioTypeObjet<StudioCircle> = {
  type: "circle",
  outilCreation: "studio.dessin.cercle",
  valider(value, path) {
    const o = record(value, ["id", "type", "center", "radius"], path, ["layerId", "extrusion"]);
    return { id: identifier(o.id, `${path}.id`), type: "circle", ...layerRef(o, path), ...centerRadius(o, path), ...extrusionRef(o, path, false, REFUS_EPAISSEUR_COURBE) };
  },
  ancre(target, anchor) {
    const { center: c, radius: r } = target;
    switch (anchor) {
      case "center": return { ...c };
      case "quadrant-0": return { x: c.x + r, y: c.y };
      case "quadrant-90": return { x: c.x, y: c.y + r };
      case "quadrant-180": return { x: c.x - r, y: c.y };
      case "quadrant-270": return { x: c.x, y: c.y - r };
      default: return null;
    }
  },
  translater: (o, t) => ({ ...o, center: t(o.center) }),
  svg: (o) => `<circle data-id="${xml(o.id)}" cx="${nb(o.center.x)}" cy="${svgY(o.center.y)}" r="${nb(o.radius)}" vector-effect="non-scaling-stroke"/>`,
  dxf: (o, layer, w) => w.circle(layer, o.center, o.radius),
  ifc(o, e, c) {
    // Prisme d'un IfcCircleProfileDef (exact).
    const placement = c.placed(0, 0, e.base);
    const profile = c.s.add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${ref(c.s.add(`IFCAXIS2PLACEMENT2D(${ref(c.pt2(o.center.x, o.center.y))},$)`))},${studioStepReal(o.radius)})`);
    const item = c.s.add(`IFCEXTRUDEDAREASOLID(${ref(profile)},$,${ref(c.zAxis)},${studioStepReal(e.height)})`);
    c.summary.prisms++;
    return { element: c.proxy(o, "Prisme (cercle extrudé)", item, "SweptSolid", placement), item, layerId: c.layerOf(o) };
  },
  volume: (o, zMin, zMax) => ({ kind: "prism", geometry: prism(studioCirclePoints(o.center, o.radius), zMin, zMax) }),
};
