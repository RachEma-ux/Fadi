/**
 * Lecture de l'emprise (D-GD-39) : ce que montre la vue courante, calculé sur les objets en base qui la recoupent (jamais
 * sur ce que le moteur a dessiné). Logique pure : synthèse d'une couche dans la vue et grille du regroupement des points
 * dans les tuiles. Une valeur absente n'est jamais comptée comme zéro : elle est « non évaluée » et reste hors du min, de
 * la moyenne et du max.
 */
import type { ValeurIndicateur } from "./valeurs.js";

/** Emprise d'une vue en WGS 84 : ouest, sud, est, nord. */
export type EmpriseVue = readonly [number, number, number, number];

/** Borne une emprise reçue (navigateur, adresse) au domaine des tuiles ; null si elle est vide ou mal formée. */
export function bornerEmprise(x: readonly unknown[]): EmpriseVue | null {
  if (x.length !== 4 || !x.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [o, s, e, n] = x as number[];
  const b: EmpriseVue = [Math.max(-180, o!), Math.max(-85.05, s!), Math.min(180, e!), Math.min(85.05, n!)];
  return b[0] < b[2] && b[1] < b[3] ? b : null;
}

/** Statistiques d'un indicateur sur les entités de la vue ; min, moyenne et max sont nuls si aucune n'est évaluée. */
export interface StatistiquesVue {
  readonly evaluees: number;
  readonly nonEvaluees: number;
  readonly min: number | null;
  /** Moyenne simple des entités évaluées, non pondérée (une commune vaut une commune, quelle que soit sa taille). */
  readonly moyenne: number | null;
  readonly max: number | null;
}

export interface SyntheseCouche {
  /** Objets de la couche qui recoupent la vue (après le filtre de la couche, s'il y en a un). */
  readonly dansVue: number;
  /** Objets de la couche (après son filtre). */
  readonly total: number;
  /** Statistiques de l'indicateur actif ; null sans indicateur sur cette couche. */
  readonly indicateur: StatistiquesVue | null;
}

/**
 * Synthèse d'une couche dans la vue. `codes` : codes des objets qui recoupent la vue, lus en base. `retenus` : codes
 * retenus par le filtre de la couche (absent = aucun filtre). `valeurs` : valeurs de l'indicateur actif (code → valeur) ;
 * un objet sans valeur connue est « non évalué ».
 */
export function syntheseCouche(p: {
  readonly codes: readonly string[];
  readonly total: number;
  readonly retenus?: ReadonlySet<string> | null;
  readonly valeurs?: ReadonlyMap<string, ValeurIndicateur> | null;
}): SyntheseCouche {
  const codes = p.retenus ? p.codes.filter((c) => p.retenus!.has(c)) : p.codes;
  const total = p.retenus ? p.retenus.size : p.total;
  if (!p.valeurs) return { dansVue: codes.length, total, indicateur: null };
  let evaluees = 0, somme = 0, min = Infinity, max = -Infinity;
  for (const c of codes) {
    const v = p.valeurs.get(c);
    if (!v || v.valeur === null) continue;
    evaluees++;
    somme += v.valeur;
    if (v.valeur < min) min = v.valeur;
    if (v.valeur > max) max = v.valeur;
  }
  return {
    dansVue: codes.length, total,
    indicateur: evaluees
      ? { evaluees, nonEvaluees: codes.length - evaluees, min, moyenne: somme / evaluees, max }
      : { evaluees: 0, nonEvaluees: codes.length, min: null, moyenne: null, max: null },
  };
}

/**
 * Regroupement des points dans les tuiles (D-GD-39) : jusqu'au zoom 13 compris, les points d'une couche regroupée sont
 * réunis par cellule d'une grille Web Mercator de 8 × 8 cellules par tuile ; à partir du zoom 14 (dernier zoom des
 * tuiles), chaque point est servi seul.
 */
export const ZOOM_FIN_REGROUPEMENT = 14;
export const CELLULES_PAR_TUILE = 8;
/** Demi-circonférence terrestre en Web Mercator (EPSG:3857), en mètres. */
export const ORIGINE_MERCATOR = 20_037_508.342789244;

/**
 * Côté d'une cellule de regroupement au zoom `z`, en mètres Web Mercator, et origine de la grille : la grille est décalée
 * d'une demi-cellule pour que `ST_SnapToGrid` ramène chaque point au centre de sa cellule, et que les bords des cellules
 * tombent sur les bords des tuiles (une grappe n'est jamais coupée entre deux tuiles).
 */
export function grilleRegroupement(z: number): { readonly cote: number; readonly origine: number } {
  const cote = (2 * ORIGINE_MERCATOR) / 2 ** z / CELLULES_PAR_TUILE;
  return { cote, origine: -ORIGINE_MERCATOR + cote / 2 };
}

export const regroupementActif = (z: number): boolean => z < ZOOM_FIN_REGROUPEMENT;

/** Zoom visé au clic sur une grappe : deux crans plus près, sans dépasser le zoom où les points sont servis seuls. */
export const zoomSurGrappe = (zoom: number): number => Math.min(Math.max(zoom + 2, Math.floor(zoom) + 1), ZOOM_FIN_REGROUPEMENT + 0.5);
