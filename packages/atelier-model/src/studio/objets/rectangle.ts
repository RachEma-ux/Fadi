import { prism } from "../exporteurs/maillage.js";
import { ref, refs, studioStepString } from "../exporteurs/ifc-step.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import { extrusionRef, fail, finite, identifier, layerRef, point, record } from "../noyau/validation.js";
import type { StudioExtrusion, StudioPoint } from "../noyau/types.js";
import { id, layerId, point as pointSchema, positive, rectangleExtrusion } from "../registre/schemas-base.js";
import type { StudioTypeObjet } from "./type.js";

export interface StudioRectangle {
  id: string;
  type: "rectangle";
  layerId?: string;
  origin: StudioPoint;
  width: number;
  height: number;
  /** Un rectangle s'extrude en prisme sur son emprise : `thickness` y est refusée. */
  extrusion?: Omit<StudioExtrusion, "thickness">;
}

export const SCHEMA_RECTANGLE = { type: "object", additionalProperties: false, required: ["id", "type", "origin", "width", "height"], properties: { id, type: { const: "rectangle" }, layerId, origin: pointSchema, width: positive, height: positive, extrusion: rectangleExtrusion } } as const;

/** Sommets du rectangle dans l'ordre origine, largeur, opposé, hauteur. */
const sommets = (o: StudioRectangle): StudioPoint[] => {
  const { x, y } = o.origin;
  return [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }];
};

export const RECTANGLE: StudioTypeObjet<StudioRectangle> = {
  type: "rectangle",
  outilCreation: "studio.dessin.rectangle",
  valider(value, path) {
    const o = record(value, ["id", "type", "origin", "width", "height"], path, ["layerId", "extrusion"]);
    const origin = point(o.origin, `${path}.origin`);
    const width = finite(o.width, `${path}.width`);
    const height = finite(o.height, `${path}.height`);
    if (width <= 0 || height <= 0) fail(path, "dimensions strictement positives attendues");
    finite(origin.x + width, `${path}.right`);
    finite(origin.y + height, `${path}.top`);
    return { id: identifier(o.id, `${path}.id`), type: "rectangle", ...layerRef(o, path), origin, width, height, ...extrusionRef(o, path, false) };
  },
  ancre(target, anchor) {
    const { x, y } = target.origin;
    switch (anchor) {
      case "corner-origin": return { x, y };
      case "corner-width": return { x: x + target.width, y };
      case "corner-height": return { x, y: y + target.height };
      case "corner-opposite": return { x: x + target.width, y: y + target.height };
      default: return null;
    }
  },
  translater: (o, t) => ({ ...o, origin: t(o.origin) }),
  svg: (o) => `<rect data-id="${xml(o.id)}" x="${nb(o.origin.x)}" y="${svgY(o.origin.y + o.height)}" width="${nb(o.width)}" height="${nb(o.height)}" vector-effect="non-scaling-stroke"/>`,
  /** R12 n'a pas de LWPOLYLINE : POLYLINE fermée de 4 sommets. */
  dxf: (o, layer, w) => w.closedPolyline(layer, sommets(o)),
  ifc(o, e, c) {
    // Prisme : ni dalle ni poteau ne sont devinés.
    const placement = c.placed(o.origin.x, o.origin.y, e.base);
    const item = c.rectangleSolid(o.width / 2, o.height / 2, o.width, o.height, e.height);
    const rep = c.s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([item])})`);
    const element = c.s.add(`IFCBUILDINGELEMENTPROXY(${c.gid(o.id)},$,${studioStepString(o.id)},${studioStepString("Prisme (rectangle extrudé)")},$,${ref(placement)},${ref(c.shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
    c.summary.prisms++;
    return { element, item, layerId: c.layerOf(o) };
  },
  volume: (o, zMin, zMax) => ({ kind: "prism", geometry: prism(sommets(o), zMin, zMax) }),
};
