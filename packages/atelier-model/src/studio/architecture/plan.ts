import type { DxfWriter } from "../exporteurs/dxf.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import type { StudioPoint } from "../noyau/types.js";
import { contourOuverture, montantsOuverture, morceauxPlan } from "./geometrie.js";
import type { StudioArchitectureItem, StudioWall } from "./types.js";
import { lireArchitecture } from "./validation.js";

/**
 * Représentation en plan des objets architecturaux (exports SVG / DXF, planche 2D) : le mur est dessiné par les
 * contours de ses parties pleines, **interrompus** par chaque ouverture déclarée (quelle que soit son allège : aucune
 * hauteur de coupe n'est supposée) ; une ouverture est dessinée par ses deux montants à travers l'épaisseur. Pur.
 */
export interface PlanArchitectural {
  murs: { mur: StudioWall; morceaux: StudioPoint[][]; emprise: StudioPoint[] }[];
  ouvertures: { id: string; hostId: string; kind?: string; layerId?: string; montants: [StudioPoint, StudioPoint][]; contour: StudioPoint[] }[];
}

export function studioPlanArchitecture(items: readonly StudioArchitectureItem[] | undefined): PlanArchitectural {
  const lue = lireArchitecture(items);
  const murs: PlanArchitectural["murs"] = [];
  const ouvertures: PlanArchitectural["ouvertures"] = [];
  for (const { mur, geometrie, ouvertures: placees } of lue.murs.values()) {
    murs.push({ mur, morceaux: morceauxPlan(mur, geometrie, placees), emprise: geometrie.anneau });
    for (const p of placees) {
      ouvertures.push({
        id: p.ouverture.id, hostId: mur.id, ...(p.ouverture.kind ? { kind: p.ouverture.kind } : {}), ...(mur.layerId !== undefined ? { layerId: mur.layerId } : {}),
        montants: montantsOuverture(mur, p), contour: contourOuverture(mur, p),
      });
    }
  }
  return { murs, ouvertures };
}

const points = (pts: readonly StudioPoint[]) => pts.map((p) => `${nb(p.x)},${svgY(p.y)}`).join(" ");

/** Éléments SVG du calque `layer` (`layerKey` : calque d'un mur). */
export function architectureSvg(plan: PlanArchitectural, layer: string, layerKey: (o: { layerId?: string }) => string): string[] {
  const out: string[] = [];
  for (const m of plan.murs) {
    if (layerKey(m.mur) !== layer) continue;
    out.push(`<g data-architecture="wall" data-id="${xml(m.mur.id)}">`);
    for (const q of m.morceaux) out.push(`<polygon points="${points(q)}" vector-effect="non-scaling-stroke"/>`);
    out.push("</g>");
  }
  for (const o of plan.ouvertures) {
    if (layerKey(o) !== layer) continue;
    out.push(`<g data-architecture="opening" data-id="${xml(o.id)}" data-host="${xml(o.hostId)}"${o.kind ? ` data-kind="${o.kind}"` : ""}>`);
    for (const [a, b] of o.montants) out.push(`<line x1="${nb(a.x)}" y1="${svgY(a.y)}" x2="${nb(b.x)}" y2="${svgY(b.y)}" vector-effect="non-scaling-stroke"/>`);
    out.push("</g>");
  }
  return out;
}

/** Entités DXF R12 : POLYLINE fermée par partie pleine de mur, LINE par montant d'ouverture, sur le calque du mur. */
export function architectureDxf(plan: PlanArchitectural, nomCalque: (o: { layerId?: string }) => string, w: DxfWriter): void {
  for (const m of plan.murs) for (const q of m.morceaux) w.closedPolyline(nomCalque(m.mur), q);
  for (const o of plan.ouvertures) for (const [a, b] of o.montants) w.line(nomCalque(o), a, b);
}

/** Points d'emprise (bornes de la vue SVG) par calque. */
export function architecturePoints(plan: PlanArchitectural): { layerId?: string; points: StudioPoint[] }[] {
  return plan.murs.map((m) => ({ ...(m.mur.layerId !== undefined ? { layerId: m.mur.layerId } : {}), points: m.emprise }));
}
