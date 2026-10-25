import type { StudioPoint } from "../noyau/types.js";
import { fail, finite, record } from "../noyau/validation.js";
import { cotesSolide, empriseSolide, translationSommet } from "../objets-3d/solides.js";
import { studioLayerState, validateStudioDocument } from "./document.js";
import type { StudioDocument } from "./types.js";

/**
 * Coupe plane dérivée (A.3-07) : section des solides libres par un plan horizontal z = cote du repère `local-3d`. Le
 * résultat est une lecture, jamais une commande ni une donnée du document : des segments 2D, chacun avec sa provenance
 * (identifiant du solide coupé), à afficher en surimpression non modifiable. La conversion est explicite : un point du
 * plan de coupe (x, y, z = cote) devient (x, y) du repère `local-2d` du plan. Un solide touché à sa cote inférieure ou
 * supérieure est coupé (face comprise) ; les calques masqués ne sont pas coupés (comptés). Pur.
 */

export interface StudioPlanCoupe {
  /** Cote du plan horizontal dans `local-3d` (mètres). */
  z: number;
}

export interface StudioSegmentCoupe {
  /** Identifiant dérivé, stable : `<solide>#<rang du côté>`. */
  id: string;
  /** Provenance : le solide libre coupé. */
  source: string;
  start: StudioPoint;
  end: StudioPoint;
}

export interface StudioCoupe {
  frame: "local-2d";
  source: { frame: "local-3d"; plan: { normal: "z"; z: number }; conversion: "(x, y, z) → (x, y)" };
  derived: true;
  editable: false;
  segments: StudioSegmentCoupe[];
  /** Solides coupés (ordre du document) et nombre de segments de chacun. */
  sources: { id: string; segments: number }[];
  /** Solides des calques masqués, non coupés. */
  hidden: number;
}

export function couperStudio(document: StudioDocument, plan: StudioPlanCoupe): StudioCoupe {
  const doc = validateStudioDocument(document);
  const z = finite(record(plan, ["z"], "plan").z, "plan.z");
  if (Math.abs(z) > 2e9) fail("plan.z", "cote de 2 000 000 000 m au plus en valeur absolue");
  const segments: StudioSegmentCoupe[] = [];
  const sources: StudioCoupe["sources"] = [];
  let hidden = 0;
  for (const s of doc.solides ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    const { zMin, zMax } = cotesSolide(s);
    if (z < zMin || z > zMax) continue;
    // Prisme oblique (direction saisie, lot F1) : la section à la cote z est l'emprise translatée de la part de la
    // composante plane parcourue depuis le profil ; nulle pour un prisme droit (même contour qu'avant).
    const t = translationSommet(s);
    const k = t.x === 0 && t.y === 0 ? 0 : (z - s.placement.origin.z) / t.z;
    const ring = k === 0 ? empriseSolide(s) : empriseSolide(s).map((p) => ({ x: p.x + k * t.x, y: p.y + k * t.y }));
    ring.forEach((a, i) => segments.push({ id: `${s.id}#${i}`, source: s.id, start: a, end: ring[(i + 1) % ring.length]! }));
    sources.push({ id: s.id, segments: ring.length });
  }
  return { frame: "local-2d", source: { frame: "local-3d", plan: { normal: "z", z }, conversion: "(x, y, z) → (x, y)" }, derived: true, editable: false, segments, sources, hidden };
}
