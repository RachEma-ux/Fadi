/**
 * Budgets d'interface de Studio (J5, DEC-13 arbitrée par P-04 dans ADR-STUDIO-PILOTE-01) : seuils publiés des Core Web
 * Vitals (web.dev, au 75ᵉ centile) — LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1. Aucun autre seuil n'est fixé ; pour la
 * géométrie on exige l'exactitude, pas la vitesse.
 *
 * Pur : calcul de l'INP (plus longue interaction, ou le 98ᵉ centile au-delà de 50 interactions, comme web-vitals) et du
 * CLS (plus grande fenêtre de session : écart < 1 s, fenêtre ≤ 5 s, décalages sans entrée récente) depuis les entrées
 * relevées dans la page, puis confrontation des séries au budget. Une série vide est « non évaluée », jamais zéro.
 */
import { studioQuantile } from "./statistiques.js";

export const STUDIO_BUDGETS_CWV = Object.freeze({
  source: "DEC-13 (ADR-STUDIO-PILOTE-01, P-04) — seuils publiés des Core Web Vitals (web.dev), p75",
  quantile: 0.75,
  lcpMs: 2500,
  inpMs: 200,
  cls: 0.1,
} as const);

/** Entrée « event » de l'Event Timing API (durée arrondie à 8 ms par le navigateur). */
export interface StudioEntreeEvenement { interactionId: number; duration: number }

/** INP d'une page : `null` sans interaction. */
export function studioInp(entrees: readonly StudioEntreeEvenement[]): number | null {
  const parInteraction = new Map<number, number>();
  for (const e of entrees) {
    if (!e.interactionId) continue;
    parInteraction.set(e.interactionId, Math.max(parInteraction.get(e.interactionId) ?? 0, e.duration));
  }
  const d = [...parInteraction.values()].sort((a, b) => b - a);
  if (d.length === 0) return null;
  return d[Math.min(d.length - 1, Math.floor(d.length / 50))]!;
}

export interface StudioDecalage { startTime: number; value: number; hadRecentInput: boolean }

/** CLS d'une page : plus grande somme d'une fenêtre de session (0 si aucun décalage n'a été observé). */
export function studioCls(decalages: readonly StudioDecalage[]): number {
  let max = 0, somme = 0, debut = -Infinity, dernier = -Infinity;
  for (const d of [...decalages].filter((x) => !x.hadRecentInput).sort((a, b) => a.startTime - b.startTime)) {
    if (d.startTime - dernier < 1000 && d.startTime - debut < 5000) somme += d.value;
    else { somme = d.value; debut = d.startTime; }
    dernier = d.startTime;
    max = Math.max(max, somme);
  }
  return max;
}

export type StudioVerdictBudget = "dans-le-budget" | "hors-budget" | "non-evalue";

export interface StudioConfrontationCwv {
  lcp: { p75: number | null; n: number; budget: number; verdict: StudioVerdictBudget };
  inp: { p75: number | null; n: number; budget: number; verdict: StudioVerdictBudget };
  cls: { p75: number | null; n: number; budget: number; verdict: StudioVerdictBudget };
  verdict: StudioVerdictBudget;
  source: string;
}

/** Confronte des séries (une valeur par chargement mesuré) aux budgets CWV, au p75. */
export function studioConfronterCwv(series: { lcp: readonly (number | null)[]; inp: readonly (number | null)[]; cls: readonly (number | null)[] }): StudioConfrontationCwv {
  const juger = (valeurs: readonly (number | null)[], budget: number) => {
    const v = valeurs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    const p75 = studioQuantile(v, STUDIO_BUDGETS_CWV.quantile);
    return { p75, n: v.length, budget, verdict: (p75 === null ? "non-evalue" : p75 <= budget ? "dans-le-budget" : "hors-budget") as StudioVerdictBudget };
  };
  const lcp = juger(series.lcp, STUDIO_BUDGETS_CWV.lcpMs), inp = juger(series.inp, STUDIO_BUDGETS_CWV.inpMs), cls = juger(series.cls, STUDIO_BUDGETS_CWV.cls);
  const tous = [lcp.verdict, inp.verdict, cls.verdict];
  const verdict: StudioVerdictBudget = tous.includes("hors-budget") ? "hors-budget" : tous.includes("non-evalue") ? "non-evalue" : "dans-le-budget";
  return { lcp, inp, cls, verdict, source: STUDIO_BUDGETS_CWV.source };
}
