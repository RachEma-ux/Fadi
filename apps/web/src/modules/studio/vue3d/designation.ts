/**
 * Ce qui se désigne d'un clic dans la vue 3D (contrat de `picking.ts`) : un objet encore présent dans le document
 * courant, dont le calque est affiché et déverrouillé (`estSelectionnable`, comme sur la planche 2D). Un solide libre
 * suit son calque ; un mur le sien ; une ouverture celui de son mur hôte. Pur : ni React, ni DOM, ni three.
 */
import type { StudioDocument } from "@parcours/atelier-model";
import { estSelectionnable } from "../planche2d/calques";

/** Solides libres et solides exacts (lot F2) désignables du document courant. */
export function solidesDesignables(doc: StudioDocument): (id: string) => boolean {
  const ids = new Set([...(doc.solides ?? []), ...(doc.exacts ?? [])].filter((s) => estSelectionnable(doc, s.layerId)).map((s) => s.id));
  return (id) => ids.has(id);
}

/** Murs et ouvertures désignables du document courant, parmi ceux du maillage affiché (`affiches`). */
export function architectureDesignable(doc: StudioDocument, affiches: ReadonlySet<string>): (id: string) => boolean {
  const courante = new Map((doc.architecture ?? []).map((x) => [x.id, x]));
  return (id) => {
    const a = courante.get(id);
    if (!a || !affiches.has(id)) return false;
    const hote = a.type === "wall" ? a : courante.get(a.hostId);
    return hote?.type === "wall" && estSelectionnable(doc, hote.layerId);
  };
}

/** L'identifiant désigne-t-il une ouverture du document courant (elle l'emporte sur le mur qu'elle traverse) ? */
export function estOuverture(doc: StudioDocument): (id: string) => boolean {
  const ids = new Set((doc.architecture ?? []).filter((x) => x.type === "opening").map((x) => x.id));
  return (id) => ids.has(id);
}
