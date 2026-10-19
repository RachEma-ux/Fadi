import { validateStudioDocument } from "./document.js";
import type { StudioDocument } from "./types.js";
import { aireProfil, type StudioSolid } from "../objets-3d/solides.js";

/**
 * Quantités géométriques des solides libres, pour le module de quantités (qui pourra les appeler) : volume et aire
 * d'emprise, dérivés des seules dimensions saisies. Ce sont des mesures, pas des métrés d'ouvrage : aucun matériau,
 * aucune catégorie, aucun coefficient n'est appliqué (A.3-09). Pur.
 */

export interface StudioQuantiteSolide {
  id: string;
  type: StudioSolid["type"];
  layerId?: string;
  /** Aire du profil (emprise), m². */
  footprint: number;
  /** Volume, m³ (aire du profil × hauteur). */
  volume: number;
}

/** Volume d'un solide libre (m³). */
export const studioVolumeSolide = (s: StudioSolid): number => aireProfil(s) * s.height;

export function studioQuantitesSolides(document: StudioDocument): { units: { footprint: "m2"; volume: "m3" }; items: StudioQuantiteSolide[]; totalVolume: number } {
  const doc = validateStudioDocument(document);
  const items = (doc.solides ?? []).map((s): StudioQuantiteSolide => ({
    id: s.id, type: s.type, ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), footprint: aireProfil(s), volume: studioVolumeSolide(s),
  }));
  return { units: { footprint: "m2", volume: "m3" }, items, totalVolume: items.reduce((t, q) => t + q.volume, 0) };
}
