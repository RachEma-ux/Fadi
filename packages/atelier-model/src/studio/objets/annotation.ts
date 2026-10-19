import type { DxfWriter } from "../exporteurs/dxf.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioAnnotation, StudioShape } from "./formes.js";
import { discriminator, fail } from "../noyau/validation.js";
import {
  controlerLiensAngulaires, coteAngulaireDxf, coteAngulairePoints, coteAngulaireSvg, dessinerCoteAngulaire, validerCoteAngulaire, type DessinCoteAngulaire,
} from "./cote-angulaire.js";
import { studioTextBox, texteDxf, texteSvg, validerTexte, type StudioText } from "./texte.js";

/** Annotations du document (`StudioDocument.annotations`) : cote angulaire (`angular-dimension`) ou texte (`text`). */

export const STUDIO_TYPES_ANNOTATIONS = Object.freeze(["angular-dimension", "text"] as const);
export const estAnnotation = (type: unknown): type is StudioAnnotation["type"] => type === "angular-dimension" || type === "text";

/** Annotation validée (copie canonique) ; un type inconnu est refusé, jamais ignoré. */
export function validerAnnotation(value: unknown, path: string): StudioAnnotation {
  const type = discriminator(value, path);
  if (type === "angular-dimension") return validerCoteAngulaire(value, path);
  if (type === "text") return validerTexte(value, path);
  return fail(`${path}.type`, "type d’annotation non pris en charge");
}

/** Liens d'une annotation vers les formes (seules les cotes angulaires en ont). */
export function controlerLiensAnnotation(a: StudioAnnotation, shapes: ReadonlyMap<string, StudioShape>, path: string): void {
  if (a.type === "angular-dimension") controlerLiensAngulaires(a, shapes, path);
}

// ——— Exports de fichier (SVG, DXF) ———

/** Dessin dérivé d'une annotation pour l'export : cote angulaire (arc, libellé) ou texte (tel quel). */
export type DessinAnnotation = { annotation: StudioAnnotation; cote: DessinCoteAngulaire | null };

export const dessinerAnnotation = (a: StudioAnnotation, locale: string, textHeight: number): DessinAnnotation =>
  ({ annotation: a, cote: a.type === "angular-dimension" ? dessinerCoteAngulaire(a, locale, textHeight) : null });

/** Points d'emprise : arc, attaches et libellé d'une cote angulaire ; coins approchés d'un texte. */
export function annotationPoints(d: DessinAnnotation): StudioPoint[] {
  if (d.cote) return [d.cote.dimension.vertex, ...coteAngulairePoints(d.cote), d.cote.text, ...d.cote.extensions.flat()];
  return studioTextBox(d.annotation as StudioText);
}

export function annotationSvg(d: DessinAnnotation, textHeight: number): string[] {
  return d.cote ? coteAngulaireSvg(d.cote, textHeight) : [texteSvg(d.annotation as StudioText)];
}

export function annotationDxf(d: DessinAnnotation, layer: string, textHeight: number, w: DxfWriter): void {
  if (d.cote) coteAngulaireDxf(d.cote, layer, textHeight, w);
  else texteDxf(d.annotation as StudioText, layer, w);
}
