/**
 * Style « une couleur par entité » (mode `categories`) : chaque unité d'une couche reçoit sa couleur, prise dans une palette
 * qualitative. Aucune donnée n'est inventée : la couleur n'est qu'un repère visuel, sans valeur ni ordre. Attribution
 * déterministe (même version → mêmes couleurs, rien n'est enregistré dans la composition) :
 * - au plus autant d'unités que de couleurs : une couleur distincte par unité, dans l'ordre des noms ;
 * - au-delà : coloration gloutonne du graphe de voisinage (Welsh-Powell), deux unités voisines n'ont jamais la même
 *   couleur tant que la palette le permet (sinon la couleur la moins présente chez les voisins), et la palette entière est
 *   employée de façon équilibrée.
 */

/**
 * Palette qualitative à 12 couleurs (ColorBrewer « Paired »), teintes foncées puis claires : deux rangs consécutifs ne sont
 * jamais deux nuances d'une même teinte. Le gris est réservé à la valeur absente.
 */
export const PALETTE_CATEGORIES = [
  "#1f78b4", "#33a02c", "#e31a1c", "#ff7f00", "#6a3d9a", "#b15928",
  "#a6cee3", "#b2df8a", "#fb9a99", "#fdbf6f", "#cab2d6", "#ffff99",
] as const;

export interface EntiteCategorie { readonly code: string; readonly nom: string | null }

const comparer = (a: EntiteCategorie, b: EntiteCategorie) => {
  const na = (a.nom ?? a.code).toLocaleLowerCase("fr");
  const nb = (b.nom ?? b.code).toLocaleLowerCase("fr");
  return na < nb ? -1 : na > nb ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
};

/**
 * Rang de couleur (indice dans la palette) de chaque unité. `voisins` : paires de codes d'unités qui se touchent ou se
 * recouvrent (calculées par le serveur sur la géométrie de référence).
 */
export function attribuerCategories(entites: readonly EntiteCategorie[], voisins: readonly (readonly [string, string])[], nombreCouleurs: number = PALETTE_CATEGORIES.length): Map<string, number> {
  const tries = [...entites].sort(comparer);
  const rangs = new Map<string, number>();
  if (nombreCouleurs < 1) return rangs;
  if (tries.length <= nombreCouleurs) {
    tries.forEach((e, i) => rangs.set(e.code, i));
    return rangs;
  }
  const adjacence = new Map<string, Set<string>>(tries.map((e) => [e.code, new Set<string>()]));
  for (const [a, b] of voisins) {
    if (a === b || !adjacence.has(a) || !adjacence.has(b)) continue;
    adjacence.get(a)!.add(b);
    adjacence.get(b)!.add(a);
  }
  // Welsh-Powell : les unités les plus entourées d'abord, puis l'ordre des noms (déterminisme).
  const ordre = tries.map((e, i) => ({ code: e.code, i, degre: adjacence.get(e.code)!.size })).sort((x, y) => y.degre - x.degre || x.i - y.i);
  // Parmi les couleurs absentes du voisinage, la moins employée jusque-là : toute la palette sert, pas seulement les premières.
  const emplois = new Array<number>(nombreCouleurs).fill(0);
  for (const { code } of ordre) {
    const presences = new Array<number>(nombreCouleurs).fill(0);
    for (const v of adjacence.get(code)!) {
      const r = rangs.get(v);
      if (r !== undefined) presences[r]!++;
    }
    const minVoisins = Math.min(...presences);
    let choix = -1;
    for (let k = 0; k < nombreCouleurs; k++) if (presences[k] === minVoisins && (choix < 0 || emplois[k]! < emplois[choix]!)) choix = k;
    rangs.set(code, choix);
    emplois[choix]!++;
  }
  return rangs;
}

export const couleurCategorie = (rang: number): string => PALETTE_CATEGORIES[((rang % PALETTE_CATEGORIES.length) + PALETTE_CATEGORIES.length) % PALETTE_CATEGORIES.length]!;
