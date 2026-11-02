/**
 * Tableau croisé Milieu × Sexe d'un indicateur (fiche d'information, D-GD-39) : lignes = milieu (Urbain, Rural, puis
 * Ensemble en dernier), colonnes = sexe (Ensemble, Masculin, Féminin). La structure est lue dans les déclinaisons
 * présentes de l'indicateur (dimensions en base), jamais écrite pour un indicateur particulier. Logique pure.
 *
 * - Une ligne ou une colonne entièrement « sans objet » (ou sans déclinaison) est masquée (ex. Urbain d'une commune
 *   rurale) ; une donnée non publiée reste une cellule absente avec son motif, jamais zéro.
 * - Contrôle de cohérence (indicateurs de compte seulement) : Urbain + Rural = Ensemble et Masculin + Féminin = Ensemble ;
 *   un écart est signalé, jamais corrigé.
 */
import type { IndicateurDimensionne, Milieu, Sexe } from "./dimensions.js";

/** Ordre de lecture du tableau croisé : le total (Ensemble) en dernier pour les lignes, en premier pour les colonnes. */
export const ORDRE_LIGNES_MILIEU: readonly Milieu[] = ["urbain", "rural", "ensemble"];
export const ORDRE_COLONNES_SEXE: readonly Sexe[] = ["ensemble", "masculin", "feminin"];

export interface CelluleCroisee { readonly valeur: number | null; readonly motifAbsence: string | null }

export interface TableauCroise<T> {
  readonly lignes: readonly Milieu[];
  readonly colonnes: readonly Sexe[];
  /** cellules[ligne][colonne] : la déclinaison publiée, ou null s'il n'y en a pas. */
  readonly cellules: readonly (readonly (T | null)[])[];
}

const sansObjet = (c: CelluleCroisee | null) => !c || (c.valeur === null && c.motifAbsence === "sans-objet");

/**
 * Tableau croisé d'une famille sans modalité, déclinée au moins par milieu ou par sexe ; null si la famille n'a pas
 * cette forme (modalités, ou une seule valeur).
 */
export function tableauCroise<T extends IndicateurDimensionne & CelluleCroisee>(indicateurs: readonly T[]): TableauCroise<T> | null {
  if (!indicateurs.length || indicateurs.some((i) => i.modalite)) return null;
  const trouver = (m: Milieu, s: Sexe) => indicateurs.find((i) => (i.milieu ?? "ensemble") === m && (i.sexe ?? "ensemble") === s) ?? null;
  let lignes = ORDRE_LIGNES_MILIEU.filter((m) => indicateurs.some((i) => (i.milieu ?? "ensemble") === m));
  let colonnes = ORDRE_COLONNES_SEXE.filter((s) => indicateurs.some((i) => (i.sexe ?? "ensemble") === s));
  if (lignes.length * colonnes.length < 2) return null;
  // Ligne ou colonne entièrement sans objet pour cette entité : masquée.
  lignes = lignes.filter((m) => colonnes.some((s) => !sansObjet(trouver(m, s))));
  colonnes = colonnes.filter((s) => lignes.some((m) => !sansObjet(trouver(m, s))));
  if (!lignes.length || !colonnes.length) return null;
  return { lignes, colonnes, cellules: lignes.map((m) => colonnes.map((s) => trouver(m, s))) };
}

/** Indicateur de compte (effectifs) : seule une somme a un sens (un taux, un âge moyen, une taille moyenne ne s'additionnent pas). */
export function estUniteDeCompte(unite: string | null | undefined): boolean {
  return !!unite && !/%|\bpar\b|\bans\b|km/i.test(unite);
}

export interface EcartCoherence {
  readonly controle: "milieu" | "sexe";
  /** Colonne (contrôle milieu) ou ligne (contrôle sexe) concernée. */
  readonly ou: Milieu | Sexe;
  readonly somme: number;
  readonly total: number;
}

/**
 * Contrôles de cohérence d'un tableau croisé : pour chaque colonne, Urbain + Rural = Ensemble ; pour chaque ligne,
 * Masculin + Féminin = Ensemble. Un contrôle n'est fait que si les trois valeurs sont publiées ; les écarts sont renvoyés,
 * jamais corrigés.
 */
export function controlerCoherence<T extends CelluleCroisee>(t: TableauCroise<T>, tolerance = 0.5): EcartCoherence[] {
  const v = (m: Milieu, s: Sexe) => {
    const i = t.lignes.indexOf(m), j = t.colonnes.indexOf(s);
    return i < 0 || j < 0 ? null : (t.cellules[i]![j]?.valeur ?? null);
  };
  const ecarts: EcartCoherence[] = [];
  for (const s of t.colonnes) {
    const u = v("urbain", s), r = v("rural", s), e = v("ensemble", s);
    if (u !== null && r !== null && e !== null && Math.abs(u + r - e) > tolerance) ecarts.push({ controle: "milieu", ou: s, somme: u + r, total: e });
  }
  for (const m of t.lignes) {
    const ma = v(m, "masculin"), fe = v(m, "feminin"), e = v(m, "ensemble");
    if (ma !== null && fe !== null && e !== null && Math.abs(ma + fe - e) > tolerance) ecarts.push({ controle: "sexe", ou: m, somme: ma + fe, total: e });
  }
  return ecarts;
}

/** Part d'une cellule dans le total Ensemble de sa colonne (barre proportionnelle), entre 0 et 1 ; null sans total. */
export function partDansEnsemble<T extends CelluleCroisee>(t: TableauCroise<T>, ligne: number, colonne: number): number | null {
  const i = t.lignes.indexOf("ensemble");
  const total = i < 0 ? null : (t.cellules[i]![colonne]?.valeur ?? null);
  const x = t.cellules[ligne]![colonne]?.valeur ?? null;
  if (x === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(1, x / total));
}
