import { prism, type StudioPoint3 } from "../exporteurs/maillage.js";
import { cotesSolide, empriseSolide, translationSommet, type StudioLienSolide, type StudioSolid } from "./solides.js";

/**
 * Maillage dérivé d'un solide libre (vue 3D) : prisme sur l'emprise placée, entre les cotes inférieure et supérieure,
 * dans le repère `local-3d` ; la face d'arrivée d'un prisme oblique (direction saisie, lot F1) est translatée de sa
 * composante plane. Jamais stocké. Le lien éventuel à une source (relation et état dérivé) accompagne le maillage pour
 * que la vue montre un solide « à résoudre » comme tel. Pur.
 */
export interface StudioFreeSolid3d {
  id: string;
  type: StudioSolid["type"];
  layerId?: string;
  kind: "prism";
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  edges: [number, number][];
  /** Lien à la polyligne source (prisme venu d'un profil), présent seulement s'il existe. */
  lien?: StudioLienSolide;
}

export function studioMaillageSolide(s: StudioSolid, lien: StudioLienSolide | null = null): StudioFreeSolid3d {
  const { zMin, zMax } = cotesSolide(s);
  // La boîte est convexe (éventail) ; un profil quelconque est triangulé par oreilles.
  const g = prism(empriseSolide(s), zMin, zMax, s.type === "box");
  const t = translationSommet(s);
  if (t.x !== 0 || t.y !== 0) {
    // Prisme oblique : la face d'arrivée (au-dessus si la direction monte, au-dessous sinon) est translatée en plan.
    const n = g.vertices.length / 2;
    const arrivee = t.z > 0 ? [n, 2 * n] : [0, n];
    for (let i = arrivee[0]!; i < arrivee[1]!; i++) {
      const v = g.vertices[i]!;
      g.vertices[i] = { x: v.x + t.x, y: v.y + t.y, z: v.z };
    }
  }
  return { id: s.id, type: s.type, ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), kind: "prism", ...g, ...(lien ? { lien } : {}) };
}
