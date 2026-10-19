import { prism, type StudioPoint3 } from "../exporteurs/maillage.js";
import { cotesSolide, empriseSolide, type StudioSolid } from "./solides.js";

/**
 * Maillage dérivé d'un solide libre (vue 3D) : prisme droit sur l'emprise placée, entre les cotes inférieure et
 * supérieure, dans le repère `local-3d`. Jamais stocké. Pur.
 */
export interface StudioFreeSolid3d {
  id: string;
  type: StudioSolid["type"];
  layerId?: string;
  kind: "prism";
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  edges: [number, number][];
}

export function studioMaillageSolide(s: StudioSolid): StudioFreeSolid3d {
  const { zMin, zMax } = cotesSolide(s);
  // La boîte est convexe (éventail) ; un profil quelconque est triangulé par oreilles.
  const g = prism(empriseSolide(s), zMin, zMax, s.type === "box");
  return { id: s.id, type: s.type, ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), kind: "prism", ...g };
}
