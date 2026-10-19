import type { StudioItem } from "../noyau/types.js";
import { discriminator } from "../noyau/validation.js";
import { estAnnotation, validerAnnotation } from "./annotation.js";
import { validerCote } from "./cote.js";
import { validerForme } from "./index.js";

/** Élément du document : cote (discriminant `dimension`), annotation (cote angulaire, texte) ou forme. */
export function validerElement(value: unknown, path: string): StudioItem {
  const type = discriminator(value, path);
  return type === "dimension" ? validerCote(value, path) : estAnnotation(type) ? validerAnnotation(value, path) : validerForme(value, path);
}
