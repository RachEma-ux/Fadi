/**
 * Valeurs d'indicateur (INV-06, GEO 06) : une valeur est soit un nombre (zéro compris), soit **absente avec un motif**.
 * Une absence n'est jamais lue, classée, agrégée ni exportée comme zéro.
 */
export const MOTIFS_ABSENCE = {
  "non-publiee": "Valeur non publiée par le producteur",
  "secret-statistique": "Valeur couverte par le secret statistique",
  "hors-couverture": "Territoire hors de la couverture de la source",
  "non-appariee": "Unité non appariée entre l'indicateur et les limites",
  "non-comparable": "Valeur non comparable (définition ou période différente)",
  "non-evaluee": "Non évaluée",
} as const;

export type MotifAbsence = keyof typeof MOTIFS_ABSENCE;

export type ValeurIndicateur =
  | { readonly valeur: number; readonly motifAbsence: null }
  | { readonly valeur: null; readonly motifAbsence: MotifAbsence };

export const estMotifAbsence = (x: unknown): x is MotifAbsence => typeof x === "string" && Object.hasOwn(MOTIFS_ABSENCE, x);

/** Lit une valeur reçue (base, API) ; une forme incohérente (ni nombre ni motif, ou les deux) devient « non évaluée ». */
export function lireValeur(valeur: unknown, motif: unknown): ValeurIndicateur {
  if (typeof valeur === "number" && Number.isFinite(valeur) && (motif === null || motif === undefined)) return { valeur, motifAbsence: null };
  if ((valeur === null || valeur === undefined) && estMotifAbsence(motif)) return { valeur: null, motifAbsence: motif };
  return { valeur: null, motifAbsence: "non-evaluee" };
}

export const libelleAbsence = (m: MotifAbsence): string => MOTIFS_ABSENCE[m];
