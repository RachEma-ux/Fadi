/**
 * Sélection par nombre de clics (D-GD-34, D-GD-35) : des clics rapides au même endroit montrent les niveaux administratifs
 * un par un, **du plus élémentaire au plus global**, en suivant les niveaux réels de l'endroit cliqué lus en base
 * (la profondeur varie : une ville à arrondissements a plus de niveaux qu'une commune ordinaire). Si des couches de limites sont chargées, seuls leurs niveaux comptent ; sinon ceux du découpage en base. Le
 * premier clic sélectionne tout de suite le plus petit niveau, sans attente ; chaque clic suivant dans le délai remplace
 * la sélection par le niveau au-dessus ; au-delà du dernier niveau, rien ne change. Pur : aucun DOM, aucun moteur.
 */
import type { RangAdministratif } from "./limites.js";

/** Délai entre deux clics d'une même série (celui du navigateur, environ 300 ms) et déplacement toléré du pointeur. */
export const DELAI_CLICS_MS = 300;
export const TOLERANCE_CLICS_PX = 8;

export interface ClicCarte { readonly t: number; readonly x: number; readonly y: number }
/** Série de clics en cours : rang du dernier clic (1 = premier), instant et position du dernier. */
export interface SerieClics extends ClicCarte { readonly n: number }

/** Le clic prolonge la série (délai et position respectés) ou en commence une nouvelle (n = 1). */
export function compterClic(serie: SerieClics | null, clic: ClicCarte, delaiMs = DELAI_CLICS_MS, tolerancePx = TOLERANCE_CLICS_PX): SerieClics {
  const proche = serie !== null && clic.t - serie.t >= 0 && clic.t - serie.t <= delaiMs && Math.hypot(clic.x - serie.x, clic.y - serie.y) <= tolerancePx;
  return { n: proche ? serie.n + 1 : 1, t: clic.t, x: clic.x, y: clic.y };
}

/**
 * Niveaux parcourus par les clics, du plus élémentaire au plus global : ceux des couches chargées s'il y en a, sinon ceux
 * du découpage en base. Sans aucun niveau, la liste est vide (aucune sélection possible).
 */
export function niveauxDeSelection(rangsCharges: readonly RangAdministratif[], rangsBase: readonly RangAdministratif[]): RangAdministratif[] {
  const charges = [...new Set(rangsCharges)];
  const base = charges.length ? charges : [...new Set(rangsBase)];
  return base.sort((a, b) => b - a);
}

/** Niveau du n-ième clic : le n-ième de la liste, ou le dernier au-delà ; null sans niveau. */
export function rangPourClics(niveaux: readonly RangAdministratif[], n: number): RangAdministratif | null {
  if (!niveaux.length || n < 1) return null;
  return niveaux[Math.min(n, niveaux.length) - 1] ?? null;
}

/**
 * Niveaux réels de l'endroit cliqué (D-GD-35) : rangs de l'entité la plus fine qui contient le point et de ses ancêtres
 * (liens parent → enfant en base), du plus élémentaire au plus global ; avec des couches de limites chargées, seuls les
 * rangs de ces couches comptent. Aucun nombre de niveaux n'est supposé : la profondeur est celle du lieu.
 */
export function niveauxDuPoint(rangsDuPoint: readonly RangAdministratif[], rangsCharges: readonly RangAdministratif[]): RangAdministratif[] {
  const charges = new Set(rangsCharges);
  return niveauxDeSelection([], charges.size ? rangsDuPoint.filter((r) => charges.has(r)) : rangsDuPoint);
}
