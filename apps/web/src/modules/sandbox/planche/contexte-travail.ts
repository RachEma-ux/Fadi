/**
 * Contexte de travail mémorisé (chantier Axes, AX-1 ; décision AX-D3) : repère de travail, plan et verrou de chaque
 * Planche, gardés dans CE navigateur comme une préférence personnelle — jamais dans le document, jamais dans
 * l'historique de géométrie. Lecture validée (un repère illisible est ignoré, jamais « réparé »). Sans React.
 */
import { CONTEXTE_MODELE, PLANS_REPERE, type ContexteTravail, type PlanRepere, type Repere, validerRepere } from "@parcours/sandbox-planche-model";

const CLE = (planche: string) => `fadi.sandbox.contexte-travail.${planche}`;

const estPlan = (x: unknown): x is PlanRepere => typeof x === "string" && (PLANS_REPERE as readonly string[]).includes(x);

/** Contexte lu tel qu'enregistré, ou `null` (absent, illisible, repère invalide). */
export function lireContexte(brut: unknown): ContexteTravail | null {
  if (!brut || typeof brut !== "object") return null;
  const c = brut as Partial<ContexteTravail>;
  if (!estPlan(c.plan) || typeof c.verrou !== "boolean" || !c.source || typeof c.source !== "object") return null;
  const source = c.source;
  if (source.genre !== "modele" && source.genre !== "temporaire" && source.genre !== "enregistre") return null;
  if (source.genre === "enregistre" && (typeof source.id !== "string" || typeof source.revision !== "number")) return null;
  if (c.repere === null || c.repere === undefined) return source.genre === "modele" ? { ...CONTEXTE_MODELE, plan: c.plan, verrou: c.verrou } : null;
  const v = validerRepere(c.repere as Repere);
  return v.ok ? { repere: v.repere, source, plan: c.plan, verrou: c.verrou } : null;
}

export function contexteMemorise(planche: string): ContexteTravail | null {
  try {
    const t = window.localStorage.getItem(CLE(planche));
    return t ? lireContexte(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

export function memoriserContexte(planche: string, c: ContexteTravail): void {
  try {
    window.localStorage.setItem(CLE(planche), JSON.stringify(c));
  } catch {
    // Stockage indisponible (navigation privée) : le contexte reste celui de la session.
  }
}
