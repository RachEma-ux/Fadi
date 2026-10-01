/**
 * Indicateurs calculés des étapes à formulaire — portés depuis
 * `financeKPIs()` (étape 14, avec la règle « chiffrage incomplet » de
 * flow-v62), `scoreKPIs()` (étape 17) et `decisionPanel()` (étape 19) du
 * prototype. Fonctions pures sur les réponses du formulaire : jamais de
 * valeur par défaut qui transformerait une case vide en zéro.
 */
import type { ParcoursFieldValue } from "./parcours.js";

export type FieldValues = Record<string, ParcoursFieldValue>;

function finite(v: ParcoursFieldValue | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface FinanceKpis {
  investissement: number;
  financement: number;
  solde: number;
}

/** Postes requis avant tout calcul (f1–f6 : investissement ; f9–f10 : fonds propres et dette). */
export const FINANCE_REQUIRED_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6", "f9", "f10"] as const;

/**
 * Étape 14. `null` tant qu'un des postes requis manque ou n'est pas un
 * nombre fini : « Investissement, financement et solde non calculés tant que
 * les postes nécessaires ne sont pas renseignés. Une valeur inconnue n'est
 * pas zéro. »
 */
export function financeKpis(fields: FieldValues): FinanceKpis | null {
  const values: Record<string, number> = {};
  for (const k of FINANCE_REQUIRED_KEYS) {
    const n = finite(fields[k]);
    if (n === null) return null;
    values[k] = n;
  }
  const investissement = values["f1"]! + values["f2"]! + values["f3"]! + values["f4"]! + values["f5"]! + values["f6"]!;
  const financement = values["f9"]! + values["f10"]!;
  return { investissement, financement, solde: financement - investissement };
}

export interface ScoreKpis {
  /** Moyenne des critères renseignés entre 1 et 5, ou `null` si aucun. */
  average: number | null;
  /** Nombre de critères valides (1–5) sur `of`. */
  count: number;
  of: number;
}

/** Étape 17 : huit critères notés de 1 à 5 ; seules les notes dans l'intervalle comptent. */
export function scoreKpis(fields: FieldValues): ScoreKpis {
  const values = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((i) => finite(fields[`f${i}`]))
    .filter((v): v is number => v !== null && v >= 1 && v <= 5);
  return { average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, count: values.length, of: 8 };
}

export const DECISION_CHOICES = ["GO", "GO sous conditions", "À reprendre", "NO GO"] as const;
export type DecisionChoice = (typeof DECISION_CHOICES)[number];

export function isDecisionChoice(v: unknown): v is DecisionChoice {
  return typeof v === "string" && (DECISION_CHOICES as readonly string[]).includes(v);
}
