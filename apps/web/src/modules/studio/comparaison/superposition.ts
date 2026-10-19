/**
 * Superposition d'une comparaison Studio : traits à dessiner (avant en gris, ajouté en vert, supprimé en rouge pointillé,
 * modifié en orange) et cadre commun. Pur : ni React ni DOM. Repère `local-2d` en mètres ; l'axe y est retourné pour
 * le SVG (y vers le haut dans le document, vers le bas à l'écran), comme l'export SVG.
 */
import { studioShapeSegments, type StudioDifferenceDocuments, type StudioDimension, type StudioShape } from "@parcours/atelier-model";

export type CoucheSuperposition = "avant" | "ajoute" | "supprime" | "modifie";
export type FormeSuperposition =
  | { kind: "ligne"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "rectangle"; x: number; y: number; w: number; h: number };
export interface TraceSuperposition { cle: string; id: string; couche: CoucheSuperposition; forme: FormeSuperposition }
export interface Superposition { traces: TraceSuperposition[]; viewBox: string | null }

/** Ordre de dessin : le gris d'abord, la couleur par-dessus. */
const ORDRE: Record<CoucheSuperposition, number> = { avant: 0, supprime: 1, modifie: 2, ajoute: 3 };

/** Traits d'un objet : rectangle entier, ligne ou cote, et contour discrétisé (segments) d'un cercle, d'un arc ou d'une polyligne. */
function formes(o: StudioShape | StudioDimension): FormeSuperposition[] {
  if (o.type === "rectangle") return [{ kind: "rectangle", x: o.origin.x, y: -(o.origin.y + o.height), w: o.width, h: o.height }];
  if (o.type === "line" || o.type === "dimension") return [{ kind: "ligne", x1: o.start.x, y1: -o.start.y, x2: o.end.x, y2: -o.end.y }];
  return studioShapeSegments(o).map(([a, b]) => ({ kind: "ligne", x1: a.x, y1: -a.y, x2: b.x, y2: -b.y }));
}

export function superposition(difference: StudioDifferenceDocuments): Superposition {
  const traces: TraceSuperposition[] = [];
  const familles: [string, { id: string; etat: string; avant: StudioShape | StudioDimension | null; apres: StudioShape | StudioDimension | null }[]][] = [
    ["o", difference.objets], ["c", difference.cotes],
  ];
  for (const [prefixe, items] of familles) {
    items.forEach((d, i) => {
      const cle = `${prefixe}${i}`;
      // Une seule trace par objet droit (clé inchangée) ; une courbe donne une trace par segment (clé suffixée).
      const poser = (suffixe: string, couche: CoucheSuperposition, o: StudioShape | StudioDimension) => {
        const f = formes(o);
        f.forEach((forme, k) => traces.push({ cle: f.length === 1 ? `${cle}-${suffixe}` : `${cle}-${suffixe}${k}`, id: d.id, couche, forme }));
      };
      if (d.etat === "supprime" && d.avant) poser("s", "supprime", d.avant);
      if (d.etat === "ajoute" && d.apres) poser("a", "ajoute", d.apres);
      if ((d.etat === "identique" || d.etat === "modifie") && d.avant) poser("g", "avant", d.avant);
      if (d.etat === "modifie" && d.apres) poser("m", "modifie", d.apres);
    });
  }
  traces.sort((a, b) => ORDRE[a.couche] - ORDRE[b.couche]);
  if (!traces.length) return { traces, viewBox: null };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { forme: f } of traces) {
    const xs = f.kind === "ligne" ? [f.x1, f.x2] : [f.x, f.x + f.w];
    const ys = f.kind === "ligne" ? [f.y1, f.y2] : [f.y, f.y + f.h];
    minX = Math.min(minX, ...xs); maxX = Math.max(maxX, ...xs);
    minY = Math.min(minY, ...ys); maxY = Math.max(maxY, ...ys);
  }
  const marge = Math.max(maxX - minX, maxY - minY, 1) * 0.05;
  const nb = (v: number) => String(Math.round(v * 1e6) / 1e6);
  return { traces, viewBox: [minX - marge, minY - marge, maxX - minX + 2 * marge, maxY - minY + 2 * marge].map(nb).join(" ") };
}
