/**
 * Tables de désignation de la vue 3D (C.2-02, C.2-03) : quand des maillages sont fusionnés en un lot pour le rendu,
 * la table range, dans l'ordre du lot, le premier triangle de chaque objet ; un clic sur le triangle `t` du lot se
 * résout par recherche dichotomique en l'identifiant Studio de l'objet. La table porte la version de la projection
 * dont elle est issue.
 *
 * Résolution d'un clic (`designer`) : les impacts sont examinés du plus proche au plus lointain ; un identifiant qui
 * n'est plus dans le document courant (objet supprimé, maillage affiché encore antérieur au document) est écarté, et
 * l'impact suivant (l'objet derrière) est examiné : la désignation ne rend jamais un identifiant périmé.
 *
 * Pur : ni React, ni DOM, ni three.
 */

export interface MembreLot {
  id: string;
  /** Nombre de triangles de l'objet dans le lot. */
  triangles: number;
}

export interface TablePicking {
  /** Version de la projection dont la table est issue (`revision:contenu`). */
  readonly version: string;
  readonly ids: readonly string[];
  /** Premier triangle de chaque objet, croissant. */
  readonly debuts: Uint32Array;
  readonly triangles: number;
  /** Identifiant de l'objet du triangle `t` du lot ; null hors du lot. */
  resoudre(t: number): string | null;
  /** Plage [premier, dernier + 1[ des triangles d'un objet ; null s'il n'est pas dans le lot. */
  plage(id: string): readonly [number, number] | null;
}

export function tablePicking(version: string, membres: readonly MembreLot[]): TablePicking {
  const ids = membres.map((m) => m.id);
  const debuts = new Uint32Array(membres.length);
  let total = 0;
  membres.forEach((m, i) => { debuts[i] = total; total += m.triangles; });
  const rang = new Map(ids.map((id, i) => [id, i]));
  return {
    version, ids, debuts, triangles: total,
    resoudre(t) {
      if (!Number.isInteger(t) || t < 0 || t >= total) return null;
      // Dernier objet dont le premier triangle est ≤ t (les objets sans triangle n'occupent aucune place).
      let bas = 0, haut = debuts.length - 1;
      while (bas < haut) {
        const milieu = (bas + haut + 1) >> 1;
        if (debuts[milieu]! <= t) bas = milieu; else haut = milieu - 1;
      }
      return ids[bas] ?? null;
    },
    plage(id) {
      const i = rang.get(id);
      if (i === undefined) return null;
      return [debuts[i]!, i + 1 < debuts.length ? debuts[i + 1]! : total];
    },
  };
}

/** Impact d'un rayon : objet désigné directement (`id`) ou triangle d'un lot (`table`, `triangle`). */
export interface Impact {
  distance: number;
  id?: string;
  table?: TablePicking;
  triangle?: number | null;
}

/** Identifiant de l'impact (direct, ou par la table du lot) ; null si rien ne se résout. */
export function idImpact(i: Impact): string | null {
  if (i.id !== undefined) return i.id;
  if (i.table && typeof i.triangle === "number") return i.table.resoudre(i.triangle);
  return null;
}

/**
 * Objet désigné : le plus proche dont l'identifiant est encore `designable` (présent dans le document courant, calque
 * affiché et déverrouillé) ; un impact périmé laisse passer l'objet derrière. Null si aucun.
 */
export function designer(impacts: readonly Impact[], designable: (id: string) => boolean): { id: string; distance: number } | null {
  for (const i of [...impacts].sort((a, b) => a.distance - b.distance)) {
    const id = idImpact(i);
    if (id !== null && designable(id)) return { id, distance: i.distance };
  }
  return null;
}
