import { studioArcEnds, studioArcPoints, studioArcSweep, studioSvgPath } from "../courbes.js";
import { prism, stripSurface } from "../exporteurs/maillage.js";
import { ref, refs, studioStepString } from "../exporteurs/ifc-step.js";
import { nb, xml } from "../exporteurs/texte.js";
import { angle, centerRadius, extrusionRef, fail, identifier, layerRef, record } from "../noyau/validation.js";
import type { StudioExtrusion, StudioPoint } from "../noyau/types.js";
import { angle as angleSchema, id, layerId, lineExtrusion, point as pointSchema, positive } from "../registre/schemas-base.js";
import type { StudioTypeObjet } from "./type.js";

/**
 * Arc de cercle parcouru dans le sens trigonométrique de `startAngle` à `endAngle` (radians, chacun dans [0 ; 2π[,
 * distincts ; repère local-2d, angle 0 sur +x). S'extrude comme une ligne : avec épaisseur (mur courbe centré sur
 * l'arc, épaisseur inférieure au diamètre) ou sans (surface verticale).
 */
export interface StudioArc {
  id: string;
  type: "arc";
  layerId?: string;
  center: StudioPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  extrusion?: StudioExtrusion;
}

export const SCHEMA_ARC = { type: "object", additionalProperties: false, required: ["id", "type", "center", "radius", "startAngle", "endAngle"], properties: { id, type: { const: "arc" }, layerId, center: pointSchema, radius: positive, startAngle: angleSchema, endAngle: angleSchema, extrusion: lineExtrusion } } as const;

/** Mur courbe centré sur l'arc : bord extérieur puis bord intérieur parcouru en retour. */
const couronne = (o: StudioArc, t: number, sweep: number): StudioPoint[] =>
  [...studioArcPoints(o.center, o.radius + t / 2, o.startAngle, sweep), ...studioArcPoints(o.center, o.radius - t / 2, o.startAngle, sweep).reverse()];

export const ARC: StudioTypeObjet<StudioArc> = {
  type: "arc",
  outilCreation: "studio.dessin.arc",
  valider(value, path) {
    const o = record(value, ["id", "type", "center", "radius", "startAngle", "endAngle"], path, ["layerId", "extrusion"]);
    const cr = centerRadius(o, path);
    const startAngle = angle(o.startAngle, `${path}.startAngle`);
    const endAngle = angle(o.endAngle, `${path}.endAngle`);
    if (startAngle === endAngle) fail(path, "angles de début et de fin distincts attendus");
    const extrusion = extrusionRef(o, path, true);
    if (extrusion.extrusion?.thickness !== undefined && extrusion.extrusion.thickness >= 2 * cr.radius) fail(`${path}.extrusion.thickness`, "l’épaisseur d’un arc doit rester inférieure à son diamètre");
    return { id: identifier(o.id, `${path}.id`), type: "arc", ...layerRef(o, path), ...cr, startAngle, endAngle, ...extrusion };
  },
  ancre(target, anchor) {
    if (anchor === "center") return { ...target.center };
    if (anchor !== "start" && anchor !== "end" && anchor !== "mid") return null;
    return studioArcEnds(target)[anchor];
  },
  translater: (o, t) => ({ ...o, center: t(o.center) }),
  svg: (o) => `<path data-id="${xml(o.id)}" data-type="${o.type}" d="${studioSvgPath(o, true, nb)}" vector-effect="non-scaling-stroke"/>`,
  /** ARC : degrés, sens trigonométrique. */
  dxf: (o, layer, w) => w.arc(layer, o.center, o.radius, o.startAngle, o.endAngle),
  ifc(o, e, c) {
    const placement = c.placed(0, 0, e.base);
    const sweep = studioArcSweep(o.startAngle, o.endAngle);
    const t = o.extrusion?.thickness;
    if (t !== undefined) {
      // Mur courbe : profil de couronne discrétisé, centré sur l'arc.
      const item = c.arbitrarySolid(couronne(o, t, sweep), e.height);
      const rep = c.s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([item])})`);
      const element = c.s.add(`IFCWALL(${c.gid(o.id)},$,${studioStepString(o.id)},${studioStepString("Mur courbe (arc extrudé avec épaisseur)")},$,${ref(placement)},${ref(c.shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
      c.summary.walls++;
      return { element, item, layerId: c.layerOf(o) };
    }
    const item = c.stripItem(studioArcPoints(o.center, o.radius, o.startAngle, sweep), e.height);
    c.summary.surfaces++;
    return { element: c.proxy(o, "Surface verticale (arc extrudé sans épaisseur)", item, "Tessellation", placement), item, layerId: c.layerOf(o) };
  },
  volume(o, zMin, zMax) {
    const sweep = studioArcSweep(o.startAngle, o.endAngle);
    const t = o.extrusion?.thickness;
    if (t === undefined) return { kind: "wall-surface", geometry: stripSurface(studioArcPoints(o.center, o.radius, o.startAngle, sweep), zMin, zMax) };
    return { kind: "prism", geometry: prism(couronne(o, t, sweep), zMin, zMax, false) };
  },
};
