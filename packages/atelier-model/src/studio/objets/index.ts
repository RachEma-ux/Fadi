import type { StudioAnchor } from "../noyau/ancres.js";
import type { StudioPoint, StudioShape } from "../noyau/types.js";
import { discriminator, fail } from "../noyau/validation.js";
import { ARC } from "./arc.js";
import { CERCLE } from "./cercle.js";
import { LIGNE } from "./ligne.js";
import { POLYLIGNE } from "./polyligne.js";
import { RECTANGLE } from "./rectangle.js";
import type { StudioTypeObjet } from "./type.js";

/**
 * Table des types de formes de Studio, dans l'ordre du registre (Ligne, Rectangle, Cercle, Arc, Polyligne) : le noyau
 * (validation, commandes) et les exports (SVG, DXF, IFC, 3D) ne connaissent les types que par elle. Les cotes, rangées à
 * part dans le document, ont leur module (`cote.ts`).
 */
export const STUDIO_TYPES_OBJETS: { readonly [K in StudioShape["type"]]: StudioTypeObjet<Extract<StudioShape, { type: K }>> } = {
  line: LIGNE,
  rectangle: RECTANGLE,
  circle: CERCLE,
  arc: ARC,
  polyline: POLYLIGNE,
};

/** Recherche par discriminant non fiable (aucune propriété héritée, `__proto__` compris, n'est un type). */
const PAR_TYPE: ReadonlyMap<unknown, StudioTypeObjet<StudioShape>> = new Map(
  Object.values(STUDIO_TYPES_OBJETS).map((t) => [t.type, t as unknown as StudioTypeObjet<StudioShape>]),
);

/** Module du type d'une forme déjà validée. */
export const typeObjet = <T extends StudioShape>(o: T): StudioTypeObjet<T> => PAR_TYPE.get(o.type) as unknown as StudioTypeObjet<T>;

/** Forme validée (copie canonique privée) ; un type inconnu est refusé, jamais ignoré. */
export function validerForme(value: unknown, path: string): StudioShape {
  const t = PAR_TYPE.get(discriminator(value, path));
  if (!t) return fail(`${path}.type`, "type de géométrie non pris en charge");
  return t.valider(value, path);
}

/** Sommet d'un objet nommé par un lien de cote, ou null si le sommet n'existe pas pour ce type. */
export function studioAnchorPoint(target: StudioShape, anchor: StudioAnchor): StudioPoint | null {
  return typeObjet(target).ancre(target, anchor);
}

/** Translation de tous les points d'une forme (rayons, angles, renflements inchangés). */
export const translaterForme = (o: StudioShape, t: (p: StudioPoint) => StudioPoint): StudioShape => typeObjet(o).translater(o, t);
