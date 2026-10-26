import { geometrieMur } from "../architecture/geometrie.js";
import type { StudioArchitectureItem, StudioWall } from "../architecture/types.js";
import { STUDIO_INDEXED_ANCHOR, type StudioAnchor } from "../noyau/ancres.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioResolveurLien } from "../objets/cote.js";
import type { StudioShape } from "../objets/formes.js";
import { studioAnchorPoint } from "../objets/index.js";
import type { StudioPolyline } from "../objets/polyligne.js";

/**
 * Cote associative sur objet architectural (AC-001) : une cote se lie à une forme, ou à un mur. Un mur se cote par les
 * sommets (`vertex-i`) et milieux (`mid-i`) du contour de son emprise — la polyligne fermée que la planche accroche sous
 * l'identifiant du mur (côté gauche de l'axe dans son sens, puis côté droit en retour). La cote suit le mur modifié tant
 * que ce contour garde le même nombre de sommets (`suivreCotesMurs`, `commandes/etat.ts`) ; sinon, ou si le mur est
 * supprimé, elle passe « à résoudre » — jamais rattachée en silence à un autre sommet (A.4-05).
 */
export type StudioCibleCote = StudioShape | StudioWall;

/** Contour de l'emprise d'un mur en polyligne fermée (même identifiant), ou null si sa géométrie est invalide. */
export function studioContourMur(w: StudioWall): StudioPolyline | null {
  const g = geometrieMur(w);
  return g.ok ? { id: w.id, type: "polyline", points: g.valeur.anneau.map((p) => ({ ...p })), closed: true } : null;
}

/** Sommet nommé d'une cible de cote (forme ou mur), ou null s'il n'existe pas. */
export function studioPointCibleCote(t: StudioCibleCote, anchor: StudioAnchor): StudioPoint | null {
  if (t.type === "wall") {
    if (!STUDIO_INDEXED_ANCHOR.test(anchor)) return null;
    const c = studioContourMur(t);
    return c ? studioAnchorPoint(c, anchor) : null;
  }
  return studioAnchorPoint(t, anchor);
}

/** Résolveur des liens de cote sur les formes et les murs d'un document. */
export function studioResolveurCotes(formes: Iterable<StudioShape>, architecture: readonly StudioArchitectureItem[]): StudioResolveurLien {
  const cibles = new Map<string, StudioCibleCote>();
  for (const f of formes) cibles.set(f.id, f);
  for (const a of architecture) if (a.type === "wall") cibles.set(a.id, a);
  return (id, anchor) => { const t = cibles.get(id); return t ? studioPointCibleCote(t, anchor) : undefined; };
}
