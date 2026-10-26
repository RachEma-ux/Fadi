import { prism, type Geometrie3d, type StudioPoint3 } from "../exporteurs/maillage.js";
import { contourOuverture, morceauxVolume } from "./geometrie.js";
import { volumesEchelle } from "./echelle.js";
import type { StudioArchitectureItem, StudioOpeningKind } from "./types.js";
import { lireArchitecture } from "./validation.js";

/**
 * Maillage dérivé des objets architecturaux (vue 3D, repère `local-3d`) : chaque mur est la réunion de prismes droits
 * (morceaux de `morceauxVolume`), vides des ouvertures compris ; chaque ouverture est la boîte de son vide (faces pour
 * la désignation, arêtes pour le dessin), avec le **même identifiant** qu'en 2D. Jamais stocké. Pur.
 */
export interface StudioArchitecture3d {
  id: string;
  type: "wall" | "opening" | "ladder";
  /** Calque du mur (une ouverture suit le calque de son hôte). */
  layerId?: string;
  /** Ouverture : mur hôte et type déclaré. */
  hostId?: string;
  kind?: StudioOpeningKind;
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  edges: [number, number][];
}

function fusion(parts: readonly Geometrie3d[]): Geometrie3d {
  const out: Geometrie3d = { vertices: [], triangles: [], edges: [] };
  for (const p of parts) {
    const k = out.vertices.length;
    out.vertices.push(...p.vertices);
    out.triangles.push(...p.triangles.map(([a, b, c]) => [a + k, b + k, c + k] as [number, number, number]));
    out.edges.push(...p.edges.map(([a, b]) => [a + k, b + k] as [number, number]));
  }
  return out;
}

/** Maillages des murs (avec vides) et des ouvertures des calques retenus par `visible`. */
export function studioMaillageArchitecture(items: readonly StudioArchitectureItem[], visible: (layerId: string | undefined) => boolean): StudioArchitecture3d[] {
  const lue = lireArchitecture(items);
  const out: StudioArchitecture3d[] = [];
  for (const it of items) {
    if (it.type === "wall") {
      if (!visible(it.layerId)) continue;
      const m = lue.murs.get(it.id)!;
      const g = fusion(morceauxVolume(it, m.geometrie, m.ouvertures).map((p) => prism(p.plan, p.zMin, p.zMax)));
      out.push({ id: it.id, type: "wall", ...(it.layerId !== undefined ? { layerId: it.layerId } : {}), ...g });
    } else if (it.type === "ladder") {
      // Échelle d'accès (EX-027) : montants et échelons, même identifiant qu'en plan.
      if (!visible(it.layerId)) continue;
      out.push({ id: it.id, type: "ladder", ...(it.layerId !== undefined ? { layerId: it.layerId } : {}), ...fusion(volumesEchelle(it)) });
    } else {
      const p = lue.ouvertures.get(it.id)!;
      const hote = lue.murs.get(it.hostId)!.mur;
      if (!visible(hote.layerId)) continue;
      const z0 = hote.base + it.sill;
      const g = prism(contourOuverture(hote, p), z0, z0 + it.height);
      out.push({
        id: it.id, type: "opening", ...(hote.layerId !== undefined ? { layerId: hote.layerId } : {}), hostId: it.hostId, ...(it.kind ? { kind: it.kind } : {}),
        ...g,
      });
    }
  }
  return out;
}
