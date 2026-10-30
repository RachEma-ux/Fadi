/**
 * Validation et mise en quarantaine des observations d'annonces (Concept §4, Plan §5), puis signalement — jamais
 * suppression — des valeurs atypiques par une règle versionnée.
 *
 * Une observation refusée part en quarantaine avec **tous** ses motifs (codes stables, lus par l'API et l'interface qui
 * en porte les libellés). Une observation admise n'est pas pour autant comparable à toutes les autres : la période du
 * loyer (jour, semaine, mois, an) et la base de surface (parcelle, habitable…) forment des cohortes distinctes
 * (`statistiques.ts`), elles ne sont jamais mélangées.
 */
import { MONNAIES_ADMISES, estBaseSurface, estPeriodePrix, estTransactionPrix, estTypeBien, type ObservationAnnonce } from "./types.js";

/** Version des règles de validation (consignée dans le manifeste des instantanés). */
export const VERSION_VALIDATION_PRIX = "prix-validation-1";

/** Codes stables des motifs de quarantaine. */
export const MOTIFS_QUARANTAINE = [
  "identifiant-absent",
  "date-invalide",
  "transaction-inconnue",
  "type-bien-inconnu",
  "base-surface-inconnue",
  "prix-absent",
  "prix-non-positif",
  "prix-fictif",
  "surface-absente",
  "surface-non-positive",
  "periode-inconnue",
  "periode-incoherente",
  "monnaie-absente",
  "monnaie-non-supportee",
  "base-surface-incoherente",
] as const;
export type MotifQuarantaine = (typeof MOTIFS_QUARANTAINE)[number];

export interface ResultatValidation {
  readonly admis: boolean;
  /** Motifs de refus, dans l'ordre de `MOTIFS_QUARANTAINE` ; vide si admis. */
  readonly motifs: readonly MotifQuarantaine[];
}

/** Date calendaire AAAA-MM-JJ valide (année, mois, jour existants). */
export function estDateIso(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [a, m, j] = x.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/**
 * Prix de remplissage (règle `prix-validation-1`) : 1, ou un entier d'au moins cinq chiffres tous identiques
 * (11 111, 99 999 999), ou la suite croissante 12345… d'au moins cinq chiffres. Ces valeurs signalent une saisie fictive,
 * pas un prix ; tout autre montant positif est conservé, même extrême (il pourra être signalé atypique).
 */
export function estPrixFictif(prix: number): boolean {
  if (prix === 1) return true;
  if (!Number.isInteger(prix)) return false;
  const s = String(prix);
  if (s.length >= 5 && /^(\d)\1+$/.test(s)) return true;
  return s.length >= 5 && "1234567890".startsWith(s);
}

/** Valide une observation d'annonce ; renvoie tous les motifs de refus (codes stables). */
export function validerObservation(o: ObservationAnnonce): ResultatValidation {
  const motifs = new Set<MotifQuarantaine>();
  if (!o.source || !o.idAnnonce) motifs.add("identifiant-absent");
  if (!estDateIso(o.dateObservation)) motifs.add("date-invalide");
  if (!estTransactionPrix(o.transaction)) motifs.add("transaction-inconnue");
  if (!estTypeBien(o.typeBien)) motifs.add("type-bien-inconnu");
  if (!estBaseSurface(o.baseSurface)) motifs.add("base-surface-inconnue");

  if (o.prix === null || o.prix === undefined || Number.isNaN(o.prix)) motifs.add("prix-absent");
  else if (!Number.isFinite(o.prix) || o.prix <= 0) motifs.add("prix-non-positif");
  else if (estPrixFictif(o.prix)) motifs.add("prix-fictif");

  if (o.surface === null || o.surface === undefined || Number.isNaN(o.surface)) motifs.add("surface-absente");
  else if (!Number.isFinite(o.surface) || o.surface <= 0) motifs.add("surface-non-positive");

  if (!estPeriodePrix(o.periode)) motifs.add("periode-inconnue");
  else if (estTransactionPrix(o.transaction)) {
    // Une vente est un prix total ; un loyer se rapporte toujours à une période (jamais « total »).
    if ((o.transaction === "vente") !== (o.periode === "total")) motifs.add("periode-incoherente");
  }

  if (!o.monnaie) motifs.add("monnaie-absente");
  else if (!MONNAIES_ADMISES.includes(o.monnaie)) motifs.add("monnaie-non-supportee");

  // Un terrain se mesure à la parcelle : une surface de plancher déclarée pour un terrain est incohérente.
  if (o.typeBien === "terrain" && estBaseSurface(o.baseSurface) && o.baseSurface !== "parcelle" && o.baseSurface !== "inconnue") {
    motifs.add("base-surface-incoherente");
  }
  const liste = MOTIFS_QUARANTAINE.filter((m) => motifs.has(m));
  return { admis: liste.length === 0, motifs: liste };
}

export interface ObservationEnQuarantaine {
  readonly observation: ObservationAnnonce;
  readonly motifs: readonly MotifQuarantaine[];
}

export interface ResultatTri {
  readonly admises: readonly ObservationAnnonce[];
  readonly quarantaine: readonly ObservationEnQuarantaine[];
  /** Nombre de refus par motif (une observation refusée pour deux motifs compte dans les deux). */
  readonly parMotif: Readonly<Partial<Record<MotifQuarantaine, number>>>;
}

/** Trie un lot d'observations entre admises et quarantaine, en conservant l'ordre d'entrée. */
export function trierObservations(observations: readonly ObservationAnnonce[]): ResultatTri {
  const admises: ObservationAnnonce[] = [], quarantaine: ObservationEnQuarantaine[] = [];
  const parMotif: Partial<Record<MotifQuarantaine, number>> = {};
  for (const o of observations) {
    const r = validerObservation(o);
    if (r.admis) admises.push(o);
    else {
      quarantaine.push({ observation: o, motifs: r.motifs });
      for (const m of r.motifs) parMotif[m] = (parMotif[m] ?? 0) + 1;
    }
  }
  return { admises, quarantaine, parMotif };
}

// ——— Valeurs atypiques : signalées, conservées ———

/** Règle versionnée de signalement des valeurs atypiques. */
export interface RegleAtypique {
  readonly version: string;
  /** Multiplicateur de l'écart interquartile : atypique hors de [Q1 − k·IQR, Q3 + k·IQR]. */
  readonly k: number;
  /** Effectif minimal de la cohorte en dessous duquel aucun signalement n'est fait (quartiles trop instables). */
  readonly effectifMinimal: number;
}

/** Règle par défaut : k = 3 (valeurs « très éloignées » de Tukey), quartiles de type 7, au moins 5 valeurs. */
export const REGLE_ATYPIQUE_V1: RegleAtypique = { version: "atypique-iqr3-v1", k: 3, effectifMinimal: 5 };

export interface SignalementAtypique {
  readonly cle: string;
  readonly valeur: number;
  readonly atypique: boolean;
}

export interface ResultatAtypiques {
  readonly regle: RegleAtypique;
  /** Bornes calculées, ou null si l'effectif est inférieur au minimum. */
  readonly bornes: { readonly basse: number; readonly haute: number } | null;
  /** Une entrée par valeur, dans l'ordre d'entrée ; aucune valeur n'est retirée. */
  readonly signalements: readonly SignalementAtypique[];
}

/** Quantile de type 7 (Hyndman–Fan) d'une liste **triée** non vide ; voir `quantileType7` dans `statistiques.ts`. */
export function quantileTrie(tries: readonly number[], p: number): number {
  if (!tries.length) throw new RangeError("quantile d'une liste vide");
  if (!(p >= 0 && p <= 1)) throw new RangeError("probabilité hors de [0, 1]");
  const h = (tries.length - 1) * p;
  const bas = Math.floor(h);
  const xb = tries[bas]!;
  const xh = tries[Math.min(bas + 1, tries.length - 1)]!;
  return xb + (h - bas) * (xh - xb);
}

/**
 * Signale les valeurs (prix unitaires d'une même cohorte) hors de [Q1 − k·IQR, Q3 + k·IQR]. Les valeurs signalées sont
 * conservées : le signalement sert à rapporter la sensibilité de la médiane, jamais à écarter un sous-marché.
 */
export function signalerAtypiques(valeurs: readonly { readonly cle: string; readonly valeur: number }[], regle: RegleAtypique = REGLE_ATYPIQUE_V1): ResultatAtypiques {
  if (valeurs.length < regle.effectifMinimal) {
    return { regle, bornes: null, signalements: valeurs.map((v) => ({ cle: v.cle, valeur: v.valeur, atypique: false })) };
  }
  const tries = valeurs.map((v) => v.valeur).sort((a, b) => a - b);
  const q1 = quantileTrie(tries, 0.25), q3 = quantileTrie(tries, 0.75);
  const iqr = q3 - q1;
  const bornes = { basse: q1 - regle.k * iqr, haute: q3 + regle.k * iqr };
  return {
    regle,
    bornes,
    signalements: valeurs.map((v) => ({ cle: v.cle, valeur: v.valeur, atypique: v.valeur < bornes.basse || v.valeur > bornes.haute })),
  };
}
