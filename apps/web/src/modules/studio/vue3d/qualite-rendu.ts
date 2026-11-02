/**
 * Dégradation sûre de la vue 3D sous charge (EX-057, TR-EX-057) : politique pure, sans three.js ni DOM.
 *
 * EX-057 (référentiel technique, § 631) : « En cas de surcharge, réduire d'abord ombres, effets, anti-crénelage et
 * résolution de présentation. Ne jamais désactiver silencieusement un accrochage indispensable, modifier l'objet
 * enregistré ou assouplir une tolérance géométrique métier pour augmenter le FPS. »
 *
 * Paliers, dans l'ordre (le premier palier non applicable est sauté) : 0 qualité complète ; 1 ombres coupées ;
 * 2 résolution de présentation à 75 % ; 3 résolution à 50 % ; 4 anti-crénelage coupé. La sortie (`ReglageQualite`) ne
 * porte **que** ces trois réglages de présentation : aucun accrochage, aucune tolérance, aucun objet du document n'y
 * figure (contrôlé par test) ; la dégradation est toujours annoncée (`qualiteReduite` → indicateur « Qualité
 * d'affichage réduite »), jamais silencieuse.
 *
 * Mesure et seuils : le temps de trame mesuré est la durée CPU de `renderer.render()` (la mesure PERF-05 de la vue,
 * jamais assimilée au coût GPU, EX-097). `BUDGET_TRAME_MS` est la durée d'une trame d'un affichage à 60 Hz : une borne
 * de rendu choisie par Fadi (comme `LOTS_PAR_ASPECT`), pas un seuil de qualité métier — les budgets de performance
 * relèvent de DEC-13. Le jugement porte sur la médiane des `FENETRE_TRAMES` dernières trames, pour qu'une trame isolée
 * (premier rendu, reconstruction d'un lot) ne dégrade rien ; le retour se fait un palier à la fois, sous la moitié du
 * budget (hystérésis : pas d'oscillation entre deux paliers).
 */

/** Durée d'une trame d'un affichage à 60 Hz (ms) : borne de rendu déclarée, pas un seuil métier (DEC-13). */
export const BUDGET_TRAME_MS = 1000 / 60;
/** Retour au palier précédent : médiane sous la moitié du budget (hystérésis). */
export const SEUIL_RETOUR_MS = BUDGET_TRAME_MS / 2;
/** Trames jugées ensemble (médiane), et trames observées après un changement avant d'en juger un autre. */
export const FENETRE_TRAMES = 8;

/** Réglages de présentation, et eux seuls. */
export interface ReglageQualite {
  /** Ombres portées calculées. */
  readonly ombres: boolean;
  /** Facteur appliqué au rapport de pixels de l'appareil (résolution de présentation). */
  readonly resolution: number;
  /** Anti-crénelage (multi-échantillonnage du rendu). */
  readonly antiCrenelage: boolean;
}

export const PALIERS_QUALITE: readonly ReglageQualite[] = Object.freeze([
  { ombres: true, resolution: 1, antiCrenelage: true },
  { ombres: false, resolution: 1, antiCrenelage: true },
  { ombres: false, resolution: 0.75, antiCrenelage: true },
  { ombres: false, resolution: 0.5, antiCrenelage: true },
  { ombres: false, resolution: 0.5, antiCrenelage: false },
].map((p) => Object.freeze(p)));

/** Leviers que la vue sait effectivement actionner (un palier sans effet est sauté). */
export interface CapacitesRendu {
  /** La scène calcule des ombres portées. */
  readonly ombres: boolean;
  /** L'anti-crénelage peut être coupé. */
  readonly antiCrenelage: boolean;
}

/** Réglage effectif d'un palier, compte tenu des leviers disponibles (un levier absent reste à sa valeur sans effet). */
export function reglageEffectif(p: ReglageQualite, c: CapacitesRendu): ReglageQualite {
  return { ombres: c.ombres && p.ombres, resolution: p.resolution, antiCrenelage: c.antiCrenelage ? p.antiCrenelage : true };
}

const memeReglage = (a: ReglageQualite, b: ReglageQualite) => a.ombres === b.ombres && a.resolution === b.resolution && a.antiCrenelage === b.antiCrenelage;

/** Paliers applicables, dans l'ordre : un palier identique au précédent (levier absent) est sauté. */
export function paliersApplicables(c: CapacitesRendu): ReglageQualite[] {
  const out: ReglageQualite[] = [];
  for (const p of PALIERS_QUALITE) {
    const r = reglageEffectif(p, c);
    if (!out.length || !memeReglage(out[out.length - 1]!, r)) out.push(r);
  }
  return out;
}

export interface EtatQualite {
  /** Rang dans `paliersApplicables` (0 : qualité complète). */
  readonly palier: number;
  /** Dernières durées de trame (ms), au plus `FENETRE_TRAMES`, depuis le dernier changement. */
  readonly trames: readonly number[];
  /** Changements de palier depuis l'ouverture (dégradations et retours). */
  readonly changements: number;
}

export const ETAT_QUALITE_INITIAL: EtatQualite = Object.freeze({ palier: 0, trames: Object.freeze([]) as readonly number[], changements: 0 });

function mediane(v: readonly number[]): number {
  const t = [...v].sort((a, b) => a - b), m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

/**
 * Observe une trame de `dureeMs` : rend l'état suivant. Une durée non finie ou négative n'est pas une mesure (ignorée,
 * jamais comptée comme nulle). Le palier ne change qu'une fois `FENETRE_TRAMES` trames observées depuis le dernier
 * changement : médiane au-dessus du budget → palier suivant ; sous le seuil de retour → palier précédent.
 */
export function observerTrame(e: EtatQualite, dureeMs: number, c: CapacitesRendu): EtatQualite {
  if (!Number.isFinite(dureeMs) || dureeMs < 0) return e;
  const n = paliersApplicables(c).length;
  const palier = Math.min(e.palier, n - 1);
  const trames = [...e.trames, dureeMs].slice(-FENETRE_TRAMES);
  if (trames.length < FENETRE_TRAMES) return { palier, trames, changements: e.changements };
  const m = mediane(trames);
  if (m > BUDGET_TRAME_MS && palier < n - 1) return { palier: palier + 1, trames: [], changements: e.changements + 1 };
  if (m < SEUIL_RETOUR_MS && palier > 0) return { palier: palier - 1, trames: [], changements: e.changements + 1 };
  return { palier, trames, changements: e.changements };
}

/** Réglage de présentation de l'état. */
export function reglageQualite(e: EtatQualite, c: CapacitesRendu): ReglageQualite {
  const p = paliersApplicables(c);
  return p[Math.min(e.palier, p.length - 1)]!;
}

/** Vrai dès qu'un réglage est en dessous de la qualité complète : l'indicateur visible le dit. */
export const qualiteReduite = (e: EtatQualite): boolean => e.palier > 0;

/** Ce qui est réduit, pour l'indicateur (texte français ; traduit par le dictionnaire de l'interface). */
export function descriptionReduction(r: ReglageQualite, c: CapacitesRendu): string[] {
  const out: string[] = [];
  if (c.ombres && !r.ombres) out.push("ombres coupées");
  if (r.resolution < 1) out.push(`résolution à ${Math.round(r.resolution * 100)} %`);
  if (c.antiCrenelage && !r.antiCrenelage) out.push("anti-crénelage coupé");
  return out;
}

/** Rapport de pixels du rendu : celui de l'appareil (borné à 2, comme avant la dégradation) multiplié par la résolution. */
export const rapportPixels = (devicePixelRatio: number, r: ReglageQualite): number => Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, 2) * r.resolution;
