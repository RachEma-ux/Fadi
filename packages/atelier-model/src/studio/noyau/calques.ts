import { STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS } from "./limites.js";
import type { StudioLayer } from "./types.js";
import { boolean, fail, identifier, record } from "./validation.js";

/** Calques du document Studio : validation d'un calque et état d'affichage / d'édition (calque implicite compris). */

export function validerCalque(value: unknown, path: string): StudioLayer {
  const o = record(value, ["id", "name", "visible", "locked"], path);
  const name = o.name;
  if (typeof name !== "string" || !name.trim() || name.includes("\0") || name.length > STUDIO_LIMITS.layerName) fail(`${path}.name`, `nom non vide de ${STUDIO_LIMITS.layerName} caractères au plus attendu`);
  return { id: identifier(o.id, `${path}.id`), name, visible: boolean(o.visible, `${path}.visible`), locked: boolean(o.locked, `${path}.locked`) };
}

/** État d'affichage et d'édition d'un calque ; le calque implicite non matérialisé est visible et déverrouillé. */
export interface StudioLayerState {
  id: string;
  visible: boolean;
  locked: boolean;
  implicit: boolean;
}
/**
 * État d'un calque parmi `layers` (calques matérialisés d'un document, ou d'un lot de commandes en cours) ; `null` si le
 * calque est inconnu. Lecture publique sur un document : `studioLayerState` (`composition/document.ts`).
 */
export function etatCalque(layers: readonly StudioLayer[] | undefined, layerId: string | undefined): StudioLayerState | null {
  const id = layerId ?? STUDIO_DEFAULT_LAYER_ID;
  const found = layers?.find((l) => l.id === id);
  if (found) return { id, visible: found.visible, locked: found.locked, implicit: false };
  return id === STUDIO_DEFAULT_LAYER_ID ? { id, visible: true, locked: false, implicit: true } : null;
}
