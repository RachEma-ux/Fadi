import { studioShapeOutline } from "./courbes.js";
import { studioLayerState, validateStudioDocument, type StudioDocument, type StudioShape } from "./document-2d.js";
import { STUDIO_FRAME_3D, studioLocal2dVers3d, type StudioPoint3, type StudioSolid3d } from "./exporteurs/maillage.js";
import { typeObjet } from "./objets/index.js";
import { studioMaillageSolide, type StudioFreeSolid3d } from "./objets-3d/maillage.js";

export { STUDIO_FRAME_3D, studioLocal2dVers3d, type StudioPoint3, type StudioSolid3d } from "./exporteurs/maillage.js";

/**
 * Vue 3D dérivée d'un document Studio (`studio-document/1`). Le document reste dans le repère `local-2d` (mètres) ; la
 * géométrie 3D est produite dans un repère déclaré `local-3d` (z vers le haut, mètres) par une conversion explicite
 * (`studioLocal2dVers3d` : (x, y) du plan → (x, y, z)), jamais stockée. Seuls les objets dont l'utilisateur a déclaré
 * l'extrusion deviennent des volumes ; les autres sont comptés « non extrudés » et rendus comme contours plats à z = 0.
 * Aucune hauteur ni épaisseur n'est supposée. Pur : ni React, ni DOM, ni moteur de rendu.
 * Le volume de chaque objet est celui de son type (`objets/<type>.ts`, `volume`, primitives `exporteurs/maillage.ts`).
 */

/** Contour plat (z = 0) d'un objet non extrudé, discrétisé pour les courbes ; `closed` pour une forme fermée. */
export interface StudioOutline3d {
  id: string;
  type: StudioShape["type"];
  layerId?: string;
  points: StudioPoint3[];
  closed: boolean;
}

export interface StudioMesh3d {
  frame: typeof STUDIO_FRAME_3D;
  units: "m";
  /** Repère du document source et règle de conversion appliquée. */
  source: { frame: "local-2d"; conversion: "(x, y) → (x, y, z)" };
  solids: StudioSolid3d[];
  outlines: StudioOutline3d[];
  /** Objets visibles sans extrusion déclarée (rendus à plat). */
  nonExtruded: number;
  /** Objets des calques masqués, ni comptés ni rendus. */
  hidden: number;
  /**
   * Solides libres (`solides` du document) des calques visibles, présent seulement si le document en a : ils sont créés
   * dans l'espace et ne sont jamais des objets 2D extrudés.
   */
  freeSolids?: StudioFreeSolid3d[];
  /** Emprise de tout ce qui est rendu ; null si rien n'est rendu. */
  bounds: { min: StudioPoint3; max: StudioPoint3 } | null;
}

function outline(o: StudioShape): StudioOutline3d {
  const { points, closed } = studioShapeOutline(o);
  return { id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), points: points.map((p) => studioLocal2dVers3d(p, 0)), closed };
}

/** Géométrie 3D dérivée du document (validé d'abord) ; les calques masqués ne sont pas rendus. */
export function studioMesh3d(document: StudioDocument): StudioMesh3d {
  const doc = validateStudioDocument(document);
  const solids: StudioSolid3d[] = [];
  const outlines: StudioOutline3d[] = [];
  let hidden = 0;
  for (const o of doc.objects) {
    if (!studioLayerState(doc, o.layerId)?.visible) { hidden++; continue; }
    const e = o.extrusion;
    if (!e) { outlines.push(outline(o)); continue; }
    const s = typeObjet(o).volume(o, e.base, e.base + e.height);
    if (!s) continue;
    solids.push({ id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), kind: s.kind, ...s.geometry });
  }
  const freeSolids: StudioFreeSolid3d[] = [];
  for (const s of doc.solides ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    freeSolids.push(studioMaillageSolide(s));
  }
  let bounds: StudioMesh3d["bounds"] = null;
  // Boucle plutôt qu'un étalement : 20 000 objets donnent trop de sommets pour Math.min(...).
  for (const p of [...solids.flatMap((s) => s.vertices), ...outlines.flatMap((l) => l.points), ...freeSolids.flatMap((s) => s.vertices)]) {
    if (!bounds) { bounds = { min: { ...p }, max: { ...p } }; continue; }
    bounds.min = { x: Math.min(bounds.min.x, p.x), y: Math.min(bounds.min.y, p.y), z: Math.min(bounds.min.z, p.z) };
    bounds.max = { x: Math.max(bounds.max.x, p.x), y: Math.max(bounds.max.y, p.y), z: Math.max(bounds.max.z, p.z) };
  }
  return { frame: STUDIO_FRAME_3D, units: "m", source: { frame: "local-2d", conversion: "(x, y) → (x, y, z)" }, solids, outlines, nonExtruded: outlines.length, hidden, ...(doc.solides?.length ? { freeSolids } : {}), bounds };
}
