/**
 * Générateur pseudo-aléatoire déterministe des corpus de qualification (X.1) : mulberry32, graine entière fixe. Même
 * graine → même suite, sur toute plateforme (arithmétique entière 32 bits seulement). Les valeurs tirées sont des
 * entiers ou des multiples exacts du millimètre : aucune fonction trigonométrique n'intervient dans un tirage.
 */

export interface Alea {
  /** Réel dans [0 ; 1[. */
  reel(): number;
  /** Entier dans [0 ; n[. */
  entier(n: number): number;
  /** Multiple du millimètre dans [0 ; max] (mètres), tiré parmi max × 1 000 + 1 valeurs. */
  millimetres(max: number): number;
}

export function alea(graine: number): Alea {
  let s = graine >>> 0;
  const reel = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entier = (n: number): number => Math.floor(reel() * n);
  return { reel, entier, millimetres: (max) => entier(Math.round(max * 1000) + 1) / 1000 };
}

/** Suite propre au motif `j` d'une scène : ne dépend que de la graine et de `j` (ni de l'ordre, ni de la taille). */
export const aleaMotif = (graine: number, j: number): Alea => alea((Math.imul(graine, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b)) >>> 0);

/** Mémoire du dernier motif tiré : les primitives d'un motif partagent ses paramètres sans retirage. */
export function memoMotif<T>(f: (j: number) => T): (j: number) => T {
  let dernier = -1;
  let valeur: T | undefined;
  return (j) => {
    if (j !== dernier) { valeur = f(j); dernier = j; }
    return valeur as T;
  };
}
