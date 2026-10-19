import type { StudioItem } from "../noyau/types.js";
import { discriminator } from "../noyau/validation.js";
import { validerCote } from "./cote.js";
import { validerForme } from "./index.js";

/** Élément du document : cote (discriminant `dimension`) ou forme. */
export function validerElement(value: unknown, path: string): StudioItem {
  return discriminator(value, path) === "dimension" ? validerCote(value, path) : validerForme(value, path);
}
