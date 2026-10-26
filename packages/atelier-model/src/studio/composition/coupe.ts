import type { StudioPoint } from "../noyau/types.js";
import { fail, finite, record } from "../noyau/validation.js";
import { cotesSolide, empriseSolide, translationSommet } from "../objets-3d/solides.js";
import { studioMaillageSolide } from "../objets-3d/maillage.js";
import { studioLayerState, validateStudioDocument } from "./document.js";
import type { StudioDocument } from "./types.js";

/**
 * Coupe plane dérivée (A.3-07) : section des solides libres et des solides exacts (maillage du noyau, lot F2) par un plan horizontal z = cote du repère `local-3d`. Le
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
  /**
   * Solides exacts (lot F2) que le plan rencontre exactement sur une face horizontale de leur maillage : leur section
   * n'est pas dérivée (elle serait incomplète), ils sont comptés ici, jamais omis en silence.
   */
  exactsNonCoupes: string[];
}

const EPS = 1e-9;
/**
 * Section du maillage d'un solide exact par le plan z : un segment par triangle traversé (les triangles d'une même face
 * plane donnent des segments colinéaires qui la couvrent). Null si un triangle est contenu dans le plan (face
 * horizontale à la cote du plan) : la section n'est alors pas dérivée.
 */
function couperMaillage(positions: number[], indices: number[], z: number): { start: StudioPoint; end: StudioPoint }[] | null {
  const out: { start: StudioPoint; end: StudioPoint }[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const v = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map((k) => ({ x: positions[3 * k]!, y: positions[3 * k + 1]!, z: positions[3 * k + 2]! - z }));
    if (v.every((p) => Math.abs(p.z) <= EPS)) return null;
    const pts: StudioPoint[] = [];
    for (let i = 0; i < 3; i++) {
      const a = v[i]!, b = v[(i + 1) % 3]!;
      if (Math.abs(a.z) <= EPS) pts.push({ x: a.x, y: a.y });
      if ((a.z < -EPS && b.z > EPS) || (a.z > EPS && b.z < -EPS)) {
        const k = a.z / (a.z - b.z);
        pts.push({ x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y) });
      }
    }
    const uniques = pts.filter((p, i) => pts.findIndex((q) => Math.abs(q.x - p.x) <= EPS && Math.abs(q.y - p.y) <= EPS) === i);
    if (uniques.length === 2) out.push({ start: uniques[0]!, end: uniques[1]! });
  }
  return out;
}

export function couperStudio(document: StudioDocument, plan: StudioPlanCoupe): StudioCoupe {
  const doc = validateStudioDocument(document);
  const z = finite(record(plan, ["z"], "plan").z, "plan.z");
  if (Math.abs(z) > 2e9) fail("plan.z", "cote de 2 000 000 000 m au plus en valeur absolue");
  const segments: StudioSegmentCoupe[] = [];
  const sources: StudioCoupe["sources"] = [];
  let hidden = 0;
  const exactsNonCoupes: string[] = [];
  for (const s of doc.solides ?? []) {
    if (!studioLayerState(doc, s.layerId)?.visible) { hidden++; continue; }
    if (s.placement.basculement) {
      // Solide basculé (A.3-03) : section exacte de son maillage par le plan horizontal.
      const m = studioMaillageSolide(s);
      const morceaux = couperMaillage(m.vertices.flatMap((v) => [v.x, v.y, v.z]), m.triangles.flat(), z);
      if (morceaux === null) { exactsNonCoupes.push(s.id); continue; }
      if (!morceaux.length) continue;
      morceaux.forEach((mo, i) => segments.push({ id: `${s.id}#${i}`, source: s.id, start: mo.start, end: mo.end }));
      sources.push({ id: s.id, segments: morceaux.length });
      continue;
    }
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
  for (const e of doc.exacts ?? []) {
    if (!studioLayerState(doc, e.layerId)?.visible) { hidden++; continue; }
    const morceaux = couperMaillage(e.resultat.maillage.positions, e.resultat.maillage.indices, z);
    if (morceaux === null) { exactsNonCoupes.push(e.id); continue; }
    if (!morceaux.length) continue;
    morceaux.forEach((m, i) => segments.push({ id: `${e.id}#${i}`, source: e.id, start: m.start, end: m.end }));
    sources.push({ id: e.id, segments: morceaux.length });
  }
  return { frame: "local-2d", source: { frame: "local-3d", plan: { normal: "z", z }, conversion: "(x, y, z) → (x, y)" }, derived: true, editable: false, segments, sources, hidden, exactsNonCoupes };
}
