import { studioShapeOutline } from "./courbes.js";
import { studioLayerState, validateStudioDocument, type StudioDocument, type StudioShape } from "./document-2d.js";
import { STUDIO_FRAME_3D, studioLocal2dVers3d, type StudioPoint3, type StudioSolid3d } from "./exporteurs/maillage.js";
import { typeObjet } from "./objets/index.js";
import { studioCotesExtrusion } from "./noyau/types.js";
import { studioLienSolide } from "./commandes/liens-solides.js";
import { studioMaillageSolide, type StudioFreeSolid3d } from "./objets-3d/maillage.js";
import { studioMaillageExact, type StudioExact3d } from "./objets-3d/exacts.js";
import { studioMaillageSurface, type StudioSurface3d } from "./objets-3d/surfaces-libres.js";
import { studioMaillageSubdivision, type StudioSubdivision3d } from "./objets-3d/subdivisions.js";
import { studioMaillageArchitecture, type StudioArchitecture3d } from "./architecture/maillage.js";
import { studioMaillageComposant, studioMaillageOccurrence, type StudioMaillageComposant, type StudioOccurrence3d } from "./batiment/composants.js";

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
  /**
   * Solides exacts (lot F2) des calques visibles, présent seulement si le document en a : maillage calculé par le noyau
   * exact et conservé dans le document (aucun noyau n'est chargé pour l'afficher), arêtes vives dérivées.
   */
  exacts?: StudioExact3d[];
  /**
   * Surfaces libres NURBS (X.1-05) des calques visibles, présent seulement si le document en a : nappe ouverte évaluée
   * depuis ses pôles, degrés et poids (dérivée, jamais stockée), bords et polygone de contrôle.
   */
  surfaces?: StudioSurface3d[];
  /** Surfaces de subdivision (X.1-05) des calques visibles, présent seulement si le document en a : maillage subdivisé (Loop). */
  subdivisions?: StudioSubdivision3d[];
  /**
   * Murs (vides des ouvertures compris) et ouvertures des calques visibles (A.4), présent seulement si le document en a ;
   * mêmes identifiants qu'en 2D.
   */
  architecture?: StudioArchitecture3d[];
  /**
   * Occurrences de composants 3D des calques visibles (lot W3-B), présent seulement si le document en a : maillage de la
   * définition placé par l'occurrence, même identifiant que l'occurrence (table de désignation triangle → occurrence).
   */
  occurrences?: StudioOccurrence3d[];
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
    const { zMin, zMax } = studioCotesExtrusion(e);
    const s = typeObjet(o).volume(o, zMin, zMax);
    if (!s) continue;
    solids.push({ id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), kind: s.kind, ...s.geometry });
  }
  const freeSolids: StudioFreeSolid3d[] = [];
  for (const s of doc.solides ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    freeSolids.push(studioMaillageSolide(s, studioLienSolide(doc, s)));
  }
  const exacts: StudioExact3d[] = [];
  for (const s of doc.exacts ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    exacts.push(studioMaillageExact(s));
  }
  const surfaces: StudioSurface3d[] = [];
  for (const s of doc.surfaces ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    surfaces.push(studioMaillageSurface(s));
  }
  const subdivisions: StudioSubdivision3d[] = [];
  for (const s of doc.subdivisions ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    subdivisions.push(studioMaillageSubdivision(s));
  }
  const architecture = doc.architecture?.length ? studioMaillageArchitecture(doc.architecture, (l) => !!studioLayerState(doc, l)?.visible) : [];
  if (doc.architecture?.length) hidden += doc.architecture.length - architecture.length;
  const occurrences: StudioOccurrence3d[] = [];
  if (doc.occurrences?.length) {
    // Une définition est maillée une fois, puis placée par chacune de ses occurrences.
    const definitions = new Map<string, StudioMaillageComposant>();
    const composants = new Map((doc.composants ?? []).map((c) => [c.id, c]));
    for (const o of doc.occurrences) {
      if (!studioLayerState(doc, o.layerId)?.visible) { hidden++; continue; }
      let d = definitions.get(o.composantId);
      if (!d) definitions.set(o.composantId, d = studioMaillageComposant(composants.get(o.composantId)!));
      occurrences.push(studioMaillageOccurrence(o, d));
    }
  }
  let bounds: StudioMesh3d["bounds"] = null;
  // Boucle plutôt qu'un étalement : 20 000 objets donnent trop de sommets pour Math.min(...).
  for (const p of [...solids.flatMap((s) => s.vertices), ...outlines.flatMap((l) => l.points), ...freeSolids.flatMap((s) => s.vertices), ...exacts.flatMap((s) => s.vertices), ...surfaces.flatMap((s) => s.vertices), ...subdivisions.flatMap((s) => s.vertices), ...architecture.flatMap((s) => s.vertices), ...occurrences.flatMap((s) => s.vertices)]) {
    if (!bounds) { bounds = { min: { ...p }, max: { ...p } }; continue; }
    bounds.min = { x: Math.min(bounds.min.x, p.x), y: Math.min(bounds.min.y, p.y), z: Math.min(bounds.min.z, p.z) };
    bounds.max = { x: Math.max(bounds.max.x, p.x), y: Math.max(bounds.max.y, p.y), z: Math.max(bounds.max.z, p.z) };
  }
  return { frame: STUDIO_FRAME_3D, units: "m", source: { frame: "local-2d", conversion: "(x, y) → (x, y, z)" }, solids, outlines, nonExtruded: outlines.length, hidden, ...(doc.solides?.length ? { freeSolids } : {}), ...(doc.exacts?.length ? { exacts } : {}), ...(doc.surfaces?.length ? { surfaces } : {}), ...(doc.subdivisions?.length ? { subdivisions } : {}), ...(doc.architecture?.length ? { architecture } : {}), ...(doc.occurrences?.length ? { occurrences } : {}), bounds };
}
