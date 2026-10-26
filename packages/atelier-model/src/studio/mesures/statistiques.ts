/**
 * Statistiques des mesures Studio (EX-097 : « répétitions, outliers et méthode statistique ») — pures, sans horloge.
 *
 * Méthode retenue, écrite dans chaque rapport (`STUDIO_METHODE_STATISTIQUE`) : quantiles au rang le plus proche sur
 * l'échantillon trié ; valeurs aberrantes repérées par la règle de Tukey (au-delà de 1,5 × l'écart interquartile) et
 * **signalées, jamais retirées** ; la valeur comparée est la médiane (p50) pour les volumes, le p75 pour les Core Web
 * Vitals (DEC-13).
 */

export const STUDIO_METHODE_STATISTIQUE =
  "quantiles au rang le plus proche sur l'échantillon trié ; aberrants selon Tukey (1,5 × écart interquartile), signalés et conservés ; volumes comparés par la médiane, Core Web Vitals par le p75" as const;

/** Quantile au rang le plus proche (q dans [0 ; 1]) ; `null` sur un échantillon vide. */
export function studioQuantile(valeurs: readonly number[], q: number): number | null {
  const v = valeurs.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const rang = Math.max(1, Math.ceil(q * v.length));
  return v[Math.min(rang, v.length) - 1]!;
}

export interface StudioDistribution {
  n: number;
  min: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  max: number | null;
  /** Valeurs hors de [Q1 − 1,5 × EIQ ; Q3 + 1,5 × EIQ] (Tukey), signalées et conservées dans le calcul. */
  aberrants: number[];
}

/** Distribution d'un échantillon (valeurs non finies ignorées). */
export function studioDistribution(valeurs: readonly (number | null | undefined)[]): StudioDistribution {
  const v = valeurs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const q1 = studioQuantile(v, 0.25), q3 = studioQuantile(v, 0.75);
  const eiq = q1 === null || q3 === null ? null : q3 - q1;
  const aberrants = eiq === null ? [] : v.filter((x) => x < q1! - 1.5 * eiq || x > q3! + 1.5 * eiq);
  return {
    n: v.length,
    min: v.length ? Math.min(...v) : null,
    p50: studioQuantile(v, 0.5),
    p75: studioQuantile(v, 0.75),
    p95: studioQuantile(v, 0.95),
    max: v.length ? Math.max(...v) : null,
    aberrants,
  };
}
