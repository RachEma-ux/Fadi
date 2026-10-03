/**
 * Empreintes utilisées par l'importeur : délègue à `atelier-empreinte/1` (L1.2, `commandes/empreinte.ts`),
 * seule implémentation de référence.
 */
import { calculerEmpreinte, condensat, jsonCanonique } from "../commandes/empreinte.js";

export { jsonCanonique };

/** Empreinte `atelier-empreinte/1` du modèle produit. */
export const empreinteModele = calculerEmpreinte;

/** Condensat `sha256-…` de la forme canonique de la source. */
export function empreinteSource(dataset: unknown): string {
  return condensat(jsonCanonique(dataset));
}
