import { validateStudioDocument } from "./document.js";
import type { StudioDocument } from "./types.js";
import { aireProfil, hauteurPerpendiculaire, type StudioLienSolide, type StudioSolid } from "../objets-3d/solides.js";
import { studioLienSolide } from "../commandes/liens-solides.js";

/**
 * Quantités géométriques des solides libres, pour le module de quantités (qui pourra les appeler) : volume et aire
 * d'emprise, dérivés des seules dimensions saisies. Ce sont des mesures, pas des métrés d'ouvrage : aucun matériau,
 * aucune catégorie, aucun coefficient n'est appliqué (A.3-09). Le volume d'un prisme oblique (lot F1) est l'aire du
 * profil × la hauteur perpendiculaire au profil. Un prisme lié « à résoudre » (source absente, invalide ou modifiée)
 * n'a ni emprise ni volume évalués (`null`) : sa dernière géométrie n'est jamais servie comme une réponse à jour. Pur.
 */

export interface StudioQuantiteSolide {
  id: string;
  type: StudioSolid["type"];
  layerId?: string;
  /** Aire du profil (emprise), m² ; null pour un solide lié à résoudre. */
  footprint: number | null;
  /** Volume, m³ (aire du profil × hauteur perpendiculaire) ; null pour un solide lié à résoudre. */
  volume: number | null;
  /** Lien à une polyligne source, présent seulement s'il existe (état dérivé). */
  lien?: StudioLienSolide;
}

/** Volume géométrique d'un solide libre (m³), sans lecture du document (voir `studioQuantitesSolides` pour un solide lié). */
export const studioVolumeSolide = (s: StudioSolid): number => aireProfil(s) * hauteurPerpendiculaire(s);

export function studioQuantitesSolides(document: StudioDocument): { units: { footprint: "m2"; volume: "m3" }; items: StudioQuantiteSolide[]; totalVolume: number | null } {
  const doc = validateStudioDocument(document);
  const items = (doc.solides ?? []).map((s): StudioQuantiteSolide => {
    const lien = studioLienSolide(doc, s);
    const evalue = lien?.etat !== "a-resoudre";
    return {
      id: s.id, type: s.type, ...(s.layerId !== undefined ? { layerId: s.layerId } : {}),
      footprint: evalue ? aireProfil(s) : null, volume: evalue ? studioVolumeSolide(s) : null, ...(lien ? { lien } : {}),
    };
  });
  // Un total qui omettrait un volume non évalué serait faux : il n'est alors pas évalué non plus.
  const totalVolume = items.some((q) => q.volume === null) ? null : items.reduce((t, q) => t + (q.volume ?? 0), 0);
  return { units: { footprint: "m2", volume: "m3" }, items, totalVolume };
}
