/**
 * Exemples issus des fichiers sources — porté de l'app hôte du prototype
 * (`SOURCE_EXAMPLES`, `EXAMPLE_STAGE_MAP`, `exampleOrigin()`, `exampleText()`,
 * `fillFromExample()`). Les données (10 cas) sont extraites dans
 * `apps/api/src/data/source-examples.json` et passées en paramètre.
 *
 * Ce sont des cas pédagogiques à adapter — jamais des données réelles du
 * projet : les valeurs, coûts, notes et décisions des cas fictifs ne sont ni
 * des références de marché ni des preuves (textes du prototype, repris tels
 * quels dans l'interface).
 */
import type { ParcoursFieldValue, ParcoursFormField } from "./parcours.js";

export interface SourceExampleScenario {
  name: string;
  option?: string;
  capacityNumeric?: number | null;
  areaNumeric?: number | null;
  pros?: string;
  cons?: string;
  acquisition?: number;
  works?: number;
  fees?: number;
  equipment?: number;
  contingency?: number;
  opex?: number;
  revenue?: number;
  months?: number | null;
  [k: string]: unknown;
}

export interface SourceExample {
  key: string;
  title: string;
  location?: string;
  summary?: string;
  need?: string;
  objective?: string;
  capacity?: number | string | null;
  unit?: string;
  capacityUnit?: string;
  users?: string;
  programmeNarrative?: string;
  flows?: string;
  operatingModel?: string;
  marketStudy?: string;
  siteDiagnostic?: string;
  consultationPlan?: string;
  benchmark?: string;
  deliveryPlan?: string;
  decisionRationale?: string;
  assumptions?: string[];
  sources?: { id: string; title: string; scope?: string }[];
  spaces?: { name: string; quantity?: number; area?: number | string; capacity?: string }[];
  needs?: { name: string; capacity?: string; response?: string }[];
  requirements?: { name: string; target?: string; verification?: string }[];
  risks?: { name: string; level?: string; action?: string }[];
  scenarios?: SourceExampleScenario[];
  budgetCap?: number | string | null;
  surfaceConvention?: string;
  [k: string]: unknown;
}

export interface SourceExamplesData {
  origins: { opportunity_atlas: string; parcours_lot118: string; default: string };
  stageMap: Record<string, string[]>;
  examples: SourceExample[];
}

/** `exampleOrigin(e)` du prototype. */
export function sourceExampleOrigin(data: SourceExamplesData, e: SourceExample): string {
  if (e.key === "opportunity_atlas") return data.origins.opportunity_atlas;
  if (e.key === "parcours_lot118") return data.origins.parcours_lot118;
  return data.origins.default;
}

/** Les exemples proposés à une étape (`EXAMPLE_STAGE_MAP[n]`), dans l'ordre du prototype. */
export function sourceExamplesForStep(data: SourceExamplesData, stepNumber: number): SourceExample[] {
  return (data.stageMap[String(stepNumber)] ?? []).map((key) => data.examples.find((e) => e.key === key)).filter((e): e is SourceExample => !!e);
}

const dash = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

/** `exampleText(e, n)` du prototype : le contenu du cas pertinent pour une étape, paragraphes séparés par une ligne vide. */
export function sourceExampleText(e: SourceExample, stepNumber: number): string {
  const scenarios = (e.scenarios ?? []).map((x) => `${x.name}: ${x.option ?? ""}; capacité ${dash(x.capacityNumeric)}; surface ${dash(x.areaNumeric)} m²; ${x.pros ?? ""} ${x.cons ?? ""}`).join("\n");
  const spaces = (e.spaces ?? []).map((x) => `${x.name} — ${x.quantity || 1} × ${x.area ?? "—"} m² — ${x.capacity ?? ""}`).join("\n");
  const needs = (e.needs ?? []).map((x) => `${x.name}: ${x.capacity ?? ""}; ${x.response ?? ""}`).join("\n");
  const req = (e.requirements ?? []).map((x) => `${x.name}: ${x.target ?? ""}; vérification ${x.verification ?? ""}`).join("\n");
  const risks = (e.risks ?? []).map((x) => `${x.name} [${x.level ?? ""}] — ${x.action ?? ""}`).join("\n");
  const finance = (e.scenarios ?? [])
    .map((x) => `${x.name}: acquisition ${x.acquisition ?? 0}; travaux ${x.works ?? 0}; honoraires ${x.fees ?? 0}; équipements ${x.equipment ?? 0}; aléas ${x.contingency ?? 0}; OPEX ${x.opex ?? 0}; recettes ${x.revenue ?? 0}; délai ${dash(x.months)} mois.`)
    .join("\n");
  const assumptions = (e.assumptions ?? []).join("\n");
  const sources = (e.sources ?? []).map((x) => `${x.id} — ${x.title} — ${x.scope ?? ""}`).join("\n");
  const m: Record<number, (string | undefined)[]> = {
    2: [e.siteDiagnostic, assumptions],
    3: [e.marketStudy, e.benchmark, e.users],
    4: [e.objective, e.operatingModel, e.decisionRationale, scenarios],
    5: [e.need, e.users, e.consultationPlan, e.benchmark, needs],
    6: [e.objective, e.programmeNarrative, `Capacité: ${e.capacity} ${e.unit}`, `Budget plafond: ${e.budgetCap ?? "à définir"}`],
    7: [e.programmeNarrative, spaces, e.flows, e.surfaceConvention],
    8: [req, assumptions],
    9: [e.siteDiagnostic, risks, e.programmeNarrative],
    12: [scenarios, e.decisionRationale],
    13: [e.siteDiagnostic, risks],
    14: [finance, e.operatingModel],
    15: [finance, assumptions],
    16: [risks, sources],
    17: [e.decisionRationale, risks],
    18: [e.summary, e.programmeNarrative, e.decisionRationale],
    19: [e.decisionRationale, scenarios, risks],
    20: [e.deliveryPlan, e.consultationPlan],
    21: [e.summary, e.deliveryPlan, e.decisionRationale],
  };
  return (m[stepNumber] ?? [e.summary]).filter((p): p is string => !!p).join("\n\n");
}

export interface ExampleFillResult {
  fields: Record<string, ParcoursFieldValue>;
  /** Clés effectivement renseignées (les réponses déjà saisies ne sont jamais écrasées). */
  filled: string[];
}

/**
 * `fillFromExample(e)` du prototype : chaque rubrique vide du formulaire
 * reçoit, dans l'ordre, un paragraphe du contenu pertinent ; à l'étape 19,
 * une décision absente devient « À reprendre » — jamais GO.
 *
 * Adaptation : une rubrique typée (nombre, date) n'est renseignée que si le
 * paragraphe est effectivement un nombre ou une date — le prototype y
 * écrivait du texte qu'un champ numérique n'affichait pas ; Fadi garde le
 * type des réponses.
 */
export function fillFromSourceExample(fields: Record<string, ParcoursFieldValue>, schema: readonly ParcoursFormField[], e: SourceExample, stepNumber: number): ExampleFillResult {
  const parts = sourceExampleText(e, stepNumber).split(/\n\n+/);
  const next = { ...fields };
  const filled: string[] = [];
  schema.forEach((f, i) => {
    const current = next[f.key];
    const empty = current === null || current === undefined || String(current).trim() === "";
    const part = parts[i];
    if (!empty || !part) return;
    if (f.type === "number") {
      const n = Number(part.trim().replace(",", "."));
      if (!Number.isFinite(n)) return;
      next[f.key] = n;
    } else if (f.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(part.trim())) return;
      next[f.key] = part.trim();
    } else {
      next[f.key] = part;
    }
    filled.push(f.key);
  });
  if (stepNumber === 19 && !next["decision"]) {
    next["decision"] = "À reprendre";
    filled.push("decision");
  }
  return { fields: next, filled };
}
