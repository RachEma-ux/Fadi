import { studioPolylinePath, studioPolylineSegmentCount, studioPolylineSegments, studioRingSimple, studioSegmentMid, studioSvgPath } from "../courbes.js";
import { prism, stripSurface } from "../exporteurs/maillage.js";
import { nb, xml } from "../exporteurs/texte.js";
import { STUDIO_INDEXED_ANCHOR } from "../noyau/ancres.js";
import { STUDIO_BULGE_MAX, STUDIO_LIMITS } from "../noyau/limites.js";
import { array, boolean, extrusionRef, fail, finite, identifier, layerRef, point, record, REFUS_EPAISSEUR_COURBE, same } from "../noyau/validation.js";
import type { StudioExtrusion, StudioPoint } from "../noyau/types.js";
import type { StudioShape } from "./formes.js";
import { id, layerId, point as pointSchema, rectangleExtrusion } from "../registre/schemas-base.js";
import type { StudioTypeObjet } from "./type.js";

/**
 * Polyligne : deux sommets au moins, consécutifs distincts (fermeture comprise), `closed` explicite ; `bulges`
 * facultatif, un renflement par segment (`tan(θ/4)`, 0 = droit, comme le DXF), omis quand tous sont nuls (forme
 * canonique). Extrusion sans épaisseur seulement : fermée, prisme sur son emprise (contour simple exigé) ; ouverte,
 * surface verticale. Une épaisseur (mur) n'y est pas définie aux jonctions : elle est refusée.
 */
export interface StudioPolyline {
  id: string;
  type: "polyline";
  layerId?: string;
  points: StudioPoint[];
  closed: boolean;
  bulges?: number[];
  extrusion?: Omit<StudioExtrusion, "thickness">;
}

export const SCHEMA_POLYLIGNE = {
  type: "object", additionalProperties: false, required: ["id", "type", "points", "closed"],
  properties: {
    id, type: { const: "polyline" }, layerId, points: { type: "array", minItems: 2, maxItems: STUDIO_LIMITS.polylinePoints, items: pointSchema }, closed: { type: "boolean" },
    bulges: { type: "array", maxItems: STUDIO_LIMITS.polylinePoints, items: { type: "number", minimum: -STUDIO_BULGE_MAX, maximum: STUDIO_BULGE_MAX } }, extrusion: rectangleExtrusion,
  },
} as const;

/**
 * Contrôle de simplicité (O(n²)) mémorisé par contour : un document relu (chaque lecture, chaque lot) ne repaie pas le
 * contrôle de ses contours déjà vus. Mémoire bornée (les plus anciens contours sont oubliés). Le résultat ne dépend que
 * des coordonnées : la mémoire ne change jamais une décision.
 */
const MEMO_ANNEAUX = new Map<string, boolean>();
const MEMO_ANNEAUX_MAX = 4096;
function anneauSimpleMemo(ring: readonly StudioPoint[]): boolean {
  const cle = ring.map((p) => `${p.x},${p.y}`).join(";");
  const vu = MEMO_ANNEAUX.get(cle);
  if (vu !== undefined) return vu;
  const simple = studioRingSimple(ring);
  if (MEMO_ANNEAUX.size >= MEMO_ANNEAUX_MAX) MEMO_ANNEAUX.delete(MEMO_ANNEAUX.keys().next().value!);
  MEMO_ANNEAUX.set(cle, simple);
  return simple;
}

/** Sommets discrétisés des polylignes fermées extrudées d'un document (charge des contrôles de simplicité). */
export function studioExtrudedRingVertices(objects: readonly StudioShape[]): number {
  let n = 0;
  for (const o of objects) if (o.type === "polyline" && o.closed && o.extrusion) n += studioPolylinePath(o).length;
  return n;
}

export const POLYLIGNE: StudioTypeObjet<StudioPolyline> = {
  type: "polyline",
  outilCreation: "studio.dessin.polyligne",
  valider(value, path) {
    const o = record(value, ["id", "type", "points", "closed"], path, ["layerId", "bulges", "extrusion"]);
    const raw = array(o.points, `${path}.points`);
    if (raw.length < 2) fail(`${path}.points`, "deux sommets au moins attendus");
    if (raw.length > STUDIO_LIMITS.polylinePoints) fail(`${path}.points`, `${STUDIO_LIMITS.polylinePoints} sommets au plus`);
    const points = raw.map((p, i) => point(p, `${path}.points[${i}]`));
    const closed = boolean(o.closed, `${path}.closed`);
    const segments = closed ? points.length : points.length - 1;
    for (let i = 0; i < segments; i++) if (same(points[i]!, points[(i + 1) % points.length]!)) fail(`${path}.points[${(i + 1) % points.length}]`, "sommets consécutifs confondus");
    let bulges: number[] | undefined;
    if (Object.hasOwn(o, "bulges")) {
      const b = array(o.bulges, `${path}.bulges`);
      if (b.length !== segments) fail(`${path}.bulges`, `un renflement par segment attendu (${segments})`);
      bulges = b.map((v, i) => {
        const x = finite(v, `${path}.bulges[${i}]`);
        if (Math.abs(x) > STUDIO_BULGE_MAX) fail(`${path}.bulges[${i}]`, "renflement de valeur absolue 1 000 000 au plus");
        return Object.is(x, -0) ? 0 : x;
      });
      // Forme canonique : des renflements tous nuls s'omettent.
      if (bulges.every((x) => x === 0)) bulges = undefined;
    }
    if (closed && points.length < 3 && !bulges) fail(`${path}.points`, "une polyligne fermée sans segment courbe a trois sommets au moins");
    const extrusion = extrusionRef(o, path, false, REFUS_EPAISSEUR_COURBE);
    const out: StudioPolyline = { id: identifier(o.id, `${path}.id`), type: "polyline", ...layerRef(o, path), points, closed, ...(bulges ? { bulges } : {}), ...extrusion };
    if (extrusion.extrusion && closed) {
      const ring = studioPolylinePath(out);
      if (ring.length > STUDIO_LIMITS.extrudedRing) fail(`${path}.extrusion`, `contour de ${STUDIO_LIMITS.extrudedRing} sommets discrétisés au plus pour une extrusion`);
      if (!anneauSimpleMemo(ring)) fail(`${path}.extrusion`, "une polyligne fermée extrudée doit avoir un contour simple (sans croisement)");
    }
    return out;
  },
  ancre(target, anchor) {
    const m = STUDIO_INDEXED_ANCHOR.exec(anchor);
    if (!m) return null;
    const i = Number(m[2]);
    if (m[1] === "vertex") return i < target.points.length ? { ...target.points[i]! } : null;
    return i < studioPolylineSegmentCount(target) ? studioSegmentMid(studioPolylineSegments(target)[i]!) : null;
  },
  translater: (o, t) => ({ ...o, points: o.points.map(t) }),
  svg: (o) => `<path data-id="${xml(o.id)}" data-type="${o.type}" d="${studioSvgPath(o, true, nb)}" vector-effect="non-scaling-stroke"/>`,
  /** POLYLINE (70 = 1 si fermée) ; chaque VERTEX porte le renflement de son segment (code 42, omis s'il est nul). */
  dxf: (o, layer, w) => w.polyline(layer, o.points, o.closed, o.bulges),
  ifc(o, e, c) {
    const placement = c.placed(0, 0, e.base);
    if (o.closed) {
      // Prisme d'un IfcArbitraryClosedProfileDef sur le contour discrétisé.
      const item = c.arbitrarySolid(studioPolylinePath(o), e.height);
      c.summary.prisms++;
      return { element: c.proxy(o, "Prisme (polyligne fermée extrudée)", item, "SweptSolid", placement), item, layerId: c.layerOf(o) };
    }
    const item = c.stripItem(studioPolylinePath(o), e.height);
    c.summary.surfaces++;
    return { element: c.proxy(o, "Surface verticale (polyligne ouverte extrudée)", item, "Tessellation", placement), item, layerId: c.layerOf(o) };
  },
  volume(o, zMin, zMax) {
    const path = studioPolylinePath(o);
    return o.closed ? { kind: "prism", geometry: prism(path, zMin, zMax, false) } : { kind: "wall-surface", geometry: stripSurface(path, zMin, zMax) };
  },
};
