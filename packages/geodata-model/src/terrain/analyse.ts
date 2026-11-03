/**
 * Terrain haute résolution — calculs numériques sur une grille d'altitudes (plan v1.0, lot TER-03, Issue #381). Logique
 * pure, sans DOM ni disque : pente (méthode de Horn), ombrage, courbes de niveau (carrés marchants), valeur au point
 * (cellule ou bilinéaire), espacement métrique d'une grille géographique sur l'ellipsoïde WGS 84, équidistance minimale
 * liée à la précision (TER-D17).
 *
 * Règles : une cellule NoData n'est jamais zéro ; tout calcul qui touche une cellule sans valeur rend « sans valeur »
 * (NaN dans les grilles dérivées, null ailleurs) ; les unités horizontales et verticales sont des mètres (une grille
 * géographique est d'abord ramenée en mètres, ligne par ligne) ; aucun lissage des données.
 */

export interface GrilleAltitudes {
  readonly largeur: number;
  readonly hauteur: number;
  /** Valeurs ligne par ligne, du nord au sud, d'ouest en est. */
  readonly valeurs: ArrayLike<number>;
  readonly nodata: number | null;
  /** Pas en mètres : constant, ou par ligne (grille géographique). */
  readonly pasX: number | ((ligne: number) => number);
  readonly pasY: number;
}

export const sansValeur = (v: number, nodata: number | null): boolean => !Number.isFinite(v) || (nodata !== null && v === nodata);
const pasXde = (g: GrilleAltitudes, l: number) => (typeof g.pasX === "number" ? g.pasX : g.pasX(l));

/** Demi-grand axe et aplatissement de l'ellipsoïde WGS 84 (EPSG:7030). */
const A_WGS84 = 6378137;
const F_WGS84 = 1 / 298.257223563;

/**
 * Longueur en mètres d'un pas en longitude et en latitude à la latitude donnée, sur l'ellipsoïde WGS 84 (rayons de
 * courbure méridien M et normal N) : conversion d'unités explicite, aucune reprojection.
 */
export function espacementMetrique(latitudeDeg: number, pasLonDeg: number, pasLatDeg: number): { pasX: number; pasY: number } {
  const e2 = F_WGS84 * (2 - F_WGS84);
  const phi = (latitudeDeg * Math.PI) / 180;
  const w = Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const n = A_WGS84 / w;
  const m = (A_WGS84 * (1 - e2)) / w ** 3;
  return { pasX: (n * Math.cos(phi) * pasLonDeg * Math.PI) / 180, pasY: (m * pasLatDeg * Math.PI) / 180 };
}

/**
 * Pente en degrés par la méthode de Horn (fenêtre 3 × 3). Bord de grille ou voisin sans valeur : NaN (jamais 0). Exacte
 * pour un plan incliné.
 */
export function pente(g: GrilleAltitudes): Float32Array {
  const { largeur: L, hauteur: H, valeurs: z, nodata } = g;
  const sortie = new Float32Array(L * H).fill(Number.NaN);
  for (let l = 1; l < H - 1; l++) {
    const dx = pasXde(g, l);
    for (let c = 1; c < L - 1; c++) {
      const v = (ll: number, cc: number) => z[ll * L + cc]!;
      const f = [v(l - 1, c - 1), v(l - 1, c), v(l - 1, c + 1), v(l, c - 1), v(l, c), v(l, c + 1), v(l + 1, c - 1), v(l + 1, c), v(l + 1, c + 1)];
      if (f.some((x) => sansValeur(x, nodata))) continue;
      const [a, b, cc, d, , ff, gg, h, i] = f as [number, number, number, number, number, number, number, number, number];
      const dzdx = (cc + 2 * ff + i - (a + 2 * d + gg)) / (8 * dx);
      const dzdy = (gg + 2 * h + i - (a + 2 * b + cc)) / (8 * g.pasY);
      sortie[l * L + c] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
  }
  return sortie;
}

/**
 * Ombrage (0 à 1) d'une lumière d'azimut et de hauteur données (degrés ; 315° / 45° par défaut), dérivées de Horn.
 * Rendu seulement : jamais une donnée d'analyse. NaN sans valeur.
 */
export function ombrage(g: GrilleAltitudes, azimutDeg = 315, hauteurDeg = 45): Float32Array {
  const { largeur: L, hauteur: H, valeurs: z, nodata } = g;
  const sortie = new Float32Array(L * H).fill(Number.NaN);
  const zen = ((90 - hauteurDeg) * Math.PI) / 180;
  const az = ((360 - azimutDeg + 90) % 360) * (Math.PI / 180);
  for (let l = 1; l < H - 1; l++) {
    const dx = pasXde(g, l);
    for (let c = 1; c < L - 1; c++) {
      const v = (ll: number, cc: number) => z[ll * L + cc]!;
      const f = [v(l - 1, c - 1), v(l - 1, c), v(l - 1, c + 1), v(l, c - 1), v(l, c), v(l, c + 1), v(l + 1, c - 1), v(l + 1, c), v(l + 1, c + 1)];
      if (f.some((x) => sansValeur(x, nodata))) continue;
      const [a, b, cc, d, , ff, gg, h, i] = f as [number, number, number, number, number, number, number, number, number];
      const dzdx = (cc + 2 * ff + i - (a + 2 * d + gg)) / (8 * dx);
      const dzdy = (gg + 2 * h + i - (a + 2 * b + cc)) / (8 * g.pasY);
      const pen = Math.atan(Math.hypot(dzdx, dzdy));
      const asp = Math.atan2(dzdy, -dzdx);
      sortie[l * L + c] = Math.max(0, Math.cos(zen) * Math.cos(pen) + Math.sin(zen) * Math.sin(pen) * Math.cos(az - asp));
    }
  }
  return sortie;
}

/** Valeur de la cellule qui contient le point (coordonnées de grille : colonne, ligne, origine au coin nord-ouest). */
export function valeurCellule(g: GrilleAltitudes, col: number, lig: number): number | null {
  const c = Math.floor(col);
  const l = Math.floor(lig);
  if (c < 0 || l < 0 || c >= g.largeur || l >= g.hauteur) return null;
  const v = g.valeurs[l * g.largeur + c]!;
  return sansValeur(v, g.nodata) ? null : v;
}

/**
 * Valeur bilinéaire entre les centres des quatre cellules voisines ; null si l'une est sans valeur ou hors grille
 * (jamais extrapolée). Exacte pour un plan.
 */
export function valeurBilineaire(g: GrilleAltitudes, col: number, lig: number): number | null {
  const x = col - 0.5;
  const y = lig - 0.5;
  const c0 = Math.floor(x);
  const l0 = Math.floor(y);
  if (c0 < 0 || l0 < 0 || c0 + 1 >= g.largeur || l0 + 1 >= g.hauteur) return null;
  const tx = x - c0;
  const ty = y - l0;
  const q = [g.valeurs[l0 * g.largeur + c0]!, g.valeurs[l0 * g.largeur + c0 + 1]!, g.valeurs[(l0 + 1) * g.largeur + c0]!, g.valeurs[(l0 + 1) * g.largeur + c0 + 1]!];
  if (q.some((v) => sansValeur(v, g.nodata))) return null;
  return q[0]! * (1 - tx) * (1 - ty) + q[1]! * tx * (1 - ty) + q[2]! * (1 - tx) * ty + q[3]! * tx * ty;
}

export interface Courbe {
  readonly altitude: number;
  readonly maitresse: boolean;
  /** Lignes en coordonnées de grille (colonne, ligne ; centres des cellules en x + 0,5) ; fermée si début = fin. */
  readonly lignes: readonly (readonly (readonly [number, number])[])[];
}

/**
 * Courbes de niveau par carrés marchants entre centres de cellules, aux altitudes multiples de l'équidistance ; une
 * courbe maîtresse toutes les `maitresseTous` équidistances. Un carré qui touche une cellule sans valeur est ignoré :
 * la courbe s'interrompt (jamais prolongée à travers un NoData). Aucun lissage.
 */
export function courbesDeNiveau(g: GrilleAltitudes, equidistance: number, maitresseTous = 5): Courbe[] {
  if (!(equidistance > 0)) throw new Error("Équidistance strictement positive requise.");
  const { largeur: L, hauteur: H, valeurs: z, nodata } = g;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < L * H; i++) {
    const v = z[i]!;
    if (sansValeur(v, nodata)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return [];
  const courbes: Courbe[] = [];
  for (let k = Math.ceil(min / equidistance); k * equidistance <= max; k++) {
    const niveau = k * equidistance;
    const segments: [number, number, number, number][] = [];
    for (let l = 0; l < H - 1; l++) {
      for (let c = 0; c < L - 1; c++) {
        const tl = z[l * L + c]!, tr = z[l * L + c + 1]!, bl = z[(l + 1) * L + c]!, br = z[(l + 1) * L + c + 1]!;
        if ([tl, tr, bl, br].some((v) => sansValeur(v, nodata))) continue;
        const idx = (tl >= niveau ? 8 : 0) | (tr >= niveau ? 4 : 0) | (br >= niveau ? 2 : 0) | (bl >= niveau ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x0 = c + 0.5, y0 = l + 0.5;
        const t = (a: number, b: number) => (niveau - a) / (b - a);
        const haut = (): [number, number] => [x0 + t(tl, tr), y0];
        const droite = (): [number, number] => [x0 + 1, y0 + t(tr, br)];
        const bas = (): [number, number] => [x0 + t(bl, br), y0 + 1];
        const gauche = (): [number, number] => [x0, y0 + t(tl, bl)];
        // Un segment de longueur nulle (niveau passant exactement par un nœud) n'est pas une ligne : il casserait l'assemblage.
        const seg = (p: [number, number], q: [number, number]) => { if (p[0] !== q[0] || p[1] !== q[1]) segments.push([p[0], p[1], q[0], q[1]]); };
        const centre = (tl + tr + bl + br) / 4 >= niveau;
        switch (idx) {
          case 1: case 14: seg(gauche(), bas()); break;
          case 2: case 13: seg(bas(), droite()); break;
          case 3: case 12: seg(gauche(), droite()); break;
          case 4: case 11: seg(haut(), droite()); break;
          case 6: case 9: seg(haut(), bas()); break;
          case 7: case 8: seg(gauche(), haut()); break;
          case 5: if (centre) { seg(gauche(), haut()); seg(bas(), droite()); } else { seg(gauche(), bas()); seg(haut(), droite()); } break;
          case 10: if (centre) { seg(haut(), droite()); seg(gauche(), bas()); } else { seg(gauche(), haut()); seg(bas(), droite()); } break;
        }
      }
    }
    courbes.push({ altitude: niveau, maitresse: k % maitresseTous === 0, lignes: assembler(segments) });
  }
  return courbes.filter((c) => c.lignes.length > 0);
}

/** Assemble des segments en polylignes par leurs extrémités communes (clé arrondie à 1e-9). */
function assembler(segments: readonly [number, number, number, number][]): [number, number][][] {
  const cle = (x: number, y: number) => `${Math.round(x * 1e9)},${Math.round(y * 1e9)}`;
  const parExtremite = new Map<string, number[]>();
  segments.forEach((s, i) => {
    for (const k of [cle(s[0], s[1]), cle(s[2], s[3])]) {
      const l = parExtremite.get(k);
      if (l) l.push(i); else parExtremite.set(k, [i]);
    }
  });
  const utilise = new Uint8Array(segments.length);
  const lignes: [number, number][][] = [];
  const suivant = (x: number, y: number): [number, number] | null => {
    for (const i of parExtremite.get(cle(x, y)) ?? []) {
      if (utilise[i]) continue;
      utilise[i] = 1;
      const s = segments[i]!;
      return cle(s[0], s[1]) === cle(x, y) ? [s[2], s[3]] : [s[0], s[1]];
    }
    return null;
  };
  for (let i = 0; i < segments.length; i++) {
    if (utilise[i]) continue;
    utilise[i] = 1;
    const s = segments[i]!;
    const ligne: [number, number][] = [[s[0], s[1]], [s[2], s[3]]];
    for (let p = suivant(s[2], s[3]); p; p = suivant(p[0], p[1])) ligne.push(p);
    const debut = ligne[0]!;
    if (cle(debut[0], debut[1]) !== cle(ligne[ligne.length - 1]![0], ligne[ligne.length - 1]![1])) {
      const avant: [number, number][] = [];
      for (let p = suivant(debut[0], debut[1]); p; p = suivant(p[0], p[1])) avant.push(p);
      ligne.unshift(...avant.reverse());
    }
    lignes.push(ligne);
  }
  return lignes;
}

/** Équidistances proposées à l'interface (mètres). */
export const EQUIDISTANCES = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100] as const;
/** Fond mondial (≈ 30 m, précision métrique) : 10 m au moins, maîtresses tous les 50 m (TER-D17). */
export const EQUIDISTANCE_MIN_MONDIALE = 10;

/**
 * Équidistance minimale permise (TER-D17) : au moins 2 × RMSEz mesurée, à défaut 2 × précision verticale déclarée ;
 * précision « non évaluée » → seulement l'équidistance du fond mondial ; un jeu mondial jamais sous 10 m. Arrondie à la
 * valeur proposée immédiatement supérieure.
 */
export function equidistanceMinimale(p: { readonly niveau: "mondial" | "regional-officiel" | "leve-local"; readonly rmsezMesuree: number | null; readonly verticaleDeclaree: number | null }): number {
  const base = p.rmsezMesuree !== null ? 2 * p.rmsezMesuree : p.verticaleDeclaree !== null ? 2 * p.verticaleDeclaree : EQUIDISTANCE_MIN_MONDIALE;
  const brute = p.niveau === "mondial" ? Math.max(EQUIDISTANCE_MIN_MONDIALE, base) : base;
  return EQUIDISTANCES.find((e) => e >= brute - 1e-12) ?? EQUIDISTANCES[EQUIDISTANCES.length - 1]!;
}

export type VerdictEquidistance = { readonly ok: true } | { readonly ok: false; readonly minimum: number; readonly message: string };
/** Une équidistance plus fine que ce que la précision permet est refusée, avec un message explicite (TER-D17). */
export function verifierEquidistance(demandee: number, minimum: number): VerdictEquidistance {
  if (!(demandee > 0)) return { ok: false, minimum, message: "Équidistance invalide." };
  if (demandee + 1e-12 < minimum) return { ok: false, minimum, message: `Équidistance de ${demandee} m refusée : la précision de la source ne permet pas moins de ${minimum} m.` };
  return { ok: true };
}

/**
 * Couverture valide d'une grille en rectangles de cellules [col0, lig0, col1, lig1[ (bornes exclusives) : suites de
 * cellules valides par ligne, fusionnées verticalement quand elles se répètent. L'union exacte de ces rectangles est
 * l'emprise réelle des données (NoData exclu), jamais le rectangle englobant.
 */
export function rectanglesValides(g: Pick<GrilleAltitudes, "largeur" | "hauteur" | "valeurs" | "nodata">): [number, number, number, number][] {
  const { largeur: L, hauteur: H, valeurs: z, nodata } = g;
  const ouverts = new Map<string, [number, number, number, number]>();
  const fermes: [number, number, number, number][] = [];
  for (let l = 0; l < H; l++) {
    const suites: [number, number][] = [];
    let debut = -1;
    for (let c = 0; c <= L; c++) {
      const ok = c < L && !sansValeur(z[l * L + c]!, nodata);
      if (ok && debut < 0) debut = c;
      if (!ok && debut >= 0) { suites.push([debut, c]); debut = -1; }
    }
    const cles = new Set(suites.map(([a, b]) => `${a}:${b}`));
    for (const [k, r] of ouverts) if (!cles.has(k)) { fermes.push(r); ouverts.delete(k); }
    for (const [a, b] of suites) {
      const k = `${a}:${b}`;
      const r = ouverts.get(k);
      if (r) r[3] = l + 1; else ouverts.set(k, [a, l, b, l + 1]);
    }
  }
  return [...fermes, ...ouverts.values()];
}
