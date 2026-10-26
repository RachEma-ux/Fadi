import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { validateStudioDocument } from "./document.js";
import type { StudioDocument } from "./types.js";
import { identifier } from "../noyau/validation.js";
import { studioMesh3d, type StudioMesh3d } from "../mesh-3d.js";
import type { StudioPoint3 } from "../exporteurs/maillage.js";
import type { StudioApparence, StudioFinitionAffichage, StudioScene } from "../scenes/scenes.js";

/**
 * Lectures de la visualisation (lot E.5) : rappel d'une scène, apparence résolue d'un objet, maillage montré par une
 * scène. Ce sont des lectures : le document n'est jamais modifié, la géométrie n'est jamais recalculée autrement que
 * par `studioMesh3d`. Pur : ni React, ni DOM, ni moteur de rendu.
 */

export const studioScenes = (doc: StudioDocument): StudioScene[] => (doc.scenes ?? []).filter((s): s is StudioScene => s.type === "scene");
export const studioApparences = (doc: StudioDocument): StudioApparence[] => (doc.scenes ?? []).filter((s): s is StudioApparence => s.type === "appearance");

/** Rappel d'une scène (lecture, outil `studio.scene.rappeler`) : la scène telle qu'enregistrée, ou null. */
export function studioRappelerScene(document: StudioDocument, id: string): StudioScene | null {
  const d = validateStudioDocument(document);
  identifier(id, "scene.id");
  return studioScenes(d).find((s) => s.id === id) ?? null;
}

export interface StudioApparenceResolue {
  color: string;
  finish?: StudioFinitionAffichage;
  /** D'où vient l'apparence : l'objet lui-même, ou son calque. */
  source: "object" | "layer";
  apparenceId: string;
}

/**
 * Apparence d'affichage d'un objet : la sienne, sinon celle de son calque (`layerId` absent : calque implicite), sinon
 * null (couleurs par défaut de la vue). Ne lit que la liste `scenes`.
 */
export function studioApparenceResolue(doc: StudioDocument, objetId: string, layerId: string | undefined): StudioApparenceResolue | null {
  const apparences = studioApparences(doc);
  const propre = apparences.find((a) => a.target.kind === "object" && a.target.id === objetId);
  const calque = layerId ?? STUDIO_DEFAULT_LAYER_ID;
  const a = propre ?? apparences.find((x) => x.target.kind === "layer" && x.target.id === calque);
  if (!a) return null;
  return { color: a.color, ...(a.finish ? { finish: a.finish } : {}), source: propre ? "object" : "layer", apparenceId: a.id };
}

/**
 * Maillage montré par une scène : les calques nommés par `visibleLayers` sont montrés, les autres non, **quelle que
 * soit** la visibilité enregistrée sur le calque (la scène est un réglage de vue ; le document n'est pas modifié).
 * `visibleLayers` null : la visibilité du document (identique à `studioMesh3d`).
 */
export function studioMeshScene(document: StudioDocument, visibleLayers: readonly string[] | null): StudioMesh3d {
  if (visibleLayers === null) return studioMesh3d(document);
  return studioFiltrerMaillageScene(studioMesh3d(studioDocumentToutVisible(document)), visibleLayers);
}

/**
 * Copie de vue du document, tous calques affichés (validée d'abord) : entrée du maillage d'une scène, jamais enregistrée.
 * La vue 3D la donne au maillage en tâche de fond, puis filtre le résultat par `studioFiltrerMaillageScene`.
 */
export function studioDocumentToutVisible(document: StudioDocument): StudioDocument {
  const doc = validateStudioDocument(document);
  return { ...doc, ...(doc.layers ? { layers: doc.layers.map((l) => ({ ...l, visible: true })) } : {}) };
}

/** Garde du maillage (tous calques affichés) les seuls éléments des calques `visibleLayers` ; emprise et décomptes recalculés. */
export function studioFiltrerMaillageScene(tout: StudioMesh3d, visibleLayers: readonly string[]): StudioMesh3d {
  const montre = new Set(visibleLayers);
  const garde = (o: { layerId?: string }) => montre.has(o.layerId ?? STUDIO_DEFAULT_LAYER_ID);
  const solids = tout.solids.filter(garde), outlines = tout.outlines.filter(garde);
  const freeSolids = tout.freeSolids?.filter(garde), exacts = tout.exacts?.filter(garde), surfaces = tout.surfaces?.filter(garde), subdivisions = tout.subdivisions?.filter(garde), architecture = tout.architecture?.filter(garde);
  const retires = tout.solids.length - solids.length + tout.outlines.length - outlines.length
    + (tout.freeSolids?.length ?? 0) - (freeSolids?.length ?? 0) + (tout.exacts?.length ?? 0) - (exacts?.length ?? 0) + (tout.surfaces?.length ?? 0) - (surfaces?.length ?? 0) + (tout.subdivisions?.length ?? 0) - (subdivisions?.length ?? 0) + (tout.architecture?.length ?? 0) - (architecture?.length ?? 0);
  let bounds: StudioMesh3d["bounds"] = null;
  const etendre = (p: StudioPoint3) => {
    if (!bounds) { bounds = { min: { ...p }, max: { ...p } }; return; }
    bounds.min = { x: Math.min(bounds.min.x, p.x), y: Math.min(bounds.min.y, p.y), z: Math.min(bounds.min.z, p.z) };
    bounds.max = { x: Math.max(bounds.max.x, p.x), y: Math.max(bounds.max.y, p.y), z: Math.max(bounds.max.z, p.z) };
  };
  for (const s of solids) s.vertices.forEach(etendre);
  for (const l of outlines) l.points.forEach(etendre);
  for (const s of freeSolids ?? []) s.vertices.forEach(etendre);
  for (const s of exacts ?? []) s.vertices.forEach(etendre);
  for (const s of surfaces ?? []) s.vertices.forEach(etendre);
  for (const s of subdivisions ?? []) s.vertices.forEach(etendre);
  for (const s of architecture ?? []) s.vertices.forEach(etendre);
  return {
    ...tout, solids, outlines, nonExtruded: outlines.length, hidden: tout.hidden + retires,
    ...(freeSolids ? { freeSolids } : {}), ...(exacts ? { exacts } : {}), ...(surfaces ? { surfaces } : {}), ...(subdivisions ? { subdivisions } : {}), ...(architecture ? { architecture } : {}), bounds,
  };
}
