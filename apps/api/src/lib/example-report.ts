/**
 * « Dossier complet de l’exemple » (`fullReport(p)` de p118-resolved-app) —
 * l'entrée du moteur pur `exampleReportHtml` assemblée pour un projet issu
 * de l'exemple P.118 (référence ou copie) : réponses des 21 étapes telles
 * qu'elles sont (modifiées ou non), propositions et intentions calculées
 * sur l'état courant, budget des étapes 14 / 15, analyse vivante du modèle
 * natif, blocs déclarés du modèle V8.19 (escalier B, escalier A,
 * sanitaires), réserves et réponses retenues, fiches par niveau,
 * critères et hypothèses de l'exemple. Rien n'est inventé : un bloc
 * absent est omis, un budget incomplet est dit incomplet.
 */
import {
  designPlanSvg,
  exampleBudget,
  exampleNum,
  exampleReportHtml,
  exampleRoomsHtml,
  programmeCaseSums,
  type ExampleLayoutMeta,
  type ExampleReportInput,
  type ExampleReportStep,
  type ExampleReportTrace,
  type ExampleSanitaryMeta,
  type ExampleServicesMeta,
  type ExampleStairMeta,
  type ParcoursFieldValue,
} from "@parcours/domain-model";
import { BIZ_FIELD_COUNT, bizSchema, EXAMPLE_REPORT_CSS, exampleDossierData, PARCOURS_STEPS } from "../data/parcours.js";
import { P118_EXAMPLE_ID, type DesignContext } from "./design-context.js";
import type { OwnedProject } from "./owned-project.js";
import { contentOf, stepView, type StepView } from "./step-context.js";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Le dossier n'existe que pour un projet issu de l'exemple P.118 (`isDemo(p)` : référence ou copie). */
export function ownsExampleDossier(project: Pick<OwnedProject, "sourceExampleId">): boolean {
  return project.sourceExampleId === P118_EXAMPLE_ID;
}

const stepTitle = (n: number) => `${pad2(n)} · ${PARCOURS_STEPS.find((d) => d.number === n)?.title ?? `Étape ${n}`}`;

/** `traceHTML(p, id)` : intentions reçues et choix (partis) retenus avec leurs destinations, sur l'état courant. */
function traceOf(view: StepView): ExampleReportTrace {
  return {
    stage: view.number,
    incoming: view.incoming.map((q) => ({ origin: q.origin, originLabel: q.originLabel, ref: q.ref, text: q.text, originStale: q.originStale })),
    chosen: view.proposals.filter((q) => q.group === "parti" && q.retained).map((q) => ({ ref: q.ref, text: q.text, targets: q.targets.map(stepTitle) })),
  };
}

/** `answerHTML(p, id)` : le schéma métier quand il existe, sinon les réponses présentes (synthèse, transmissions). */
function answersOf(number: number, fields: Record<string, ParcoursFieldValue>): { label: string; value: string }[] {
  const biz = bizSchema(number);
  if (biz) return biz.map((f) => ({ label: f.label, value: f.type === "number" ? exampleNum(fields[f.key]) : String(fields[f.key] ?? "Non applicable au scénario retenu.") }));
  return Object.keys(fields)
    .filter((k) => k !== "decision")
    .map((k, i) => ({ label: k === "summary" ? "Synthèse / réponse de l’exemple" : `Transmission ${i + 1}`, value: String(fields[k] ?? "Non applicable au scénario retenu.") }));
}

/** `audit(p).missingFields` : champs des schémas métier vides ou non numériques. */
function missingBizFields(ctx: DesignContext): string[] {
  const out: string[] = [];
  for (const def of PARCOURS_STEPS) {
    const schema = bizSchema(def.number);
    if (!schema) continue;
    const fields = contentOf(ctx.steps.rows, def.number).fields;
    for (const f of schema) {
      const v = fields[f.key];
      if (v === null || v === undefined || String(v).trim() === "" || (f.type === "number" && !Number.isFinite(Number(v)))) out.push(`${def.number}/${f.key}`);
    }
  }
  return out;
}

function meta<T>(floor: unknown, key: string): T | null {
  const m = (floor as { meta?: Record<string, unknown> } | null)?.meta;
  const v = m?.[key];
  return v && typeof v === "object" ? (v as T) : null;
}

/** Assemble l'entrée du dossier complet ; `null` hors d'un projet issu de l'exemple. */
export function exampleReportInput(project: OwnedProject, dctx: DesignContext): ExampleReportInput | null {
  if (!ownsExampleDossier(project)) return null;
  const ctx = dctx.steps;
  const attachment = (project.sourceAttachment ?? {}) as Record<string, unknown>;
  const dataset = exampleDossierData(project.sourceExampleId);
  const criteria = Array.isArray(attachment["criteria"]) ? (attachment["criteria"] as string[]) : (dataset?.criteria ?? []);
  const assumptions = Array.isArray(attachment["assumptions"]) ? (attachment["assumptions"] as ExampleReportInput["assumptions"]) : (dataset?.assumptions ?? []);
  const issueAnswers = attachment["issueAnswers"] && typeof attachment["issueAnswers"] === "object" ? (attachment["issueAnswers"] as Record<string, string>) : (dataset?.issueAnswers ?? {});

  const views = PARCOURS_STEPS.map((def) => stepView(def, ctx));
  const steps: ExampleReportStep[] = views.map((v) => ({
    number: v.number,
    title: v.title,
    headline: v.content.headline ?? "",
    decision: v.content.decision ?? "",
    why: v.content.why ?? "",
    alternatives: v.content.alternatives ?? "",
    answers: answersOf(v.number, v.content.fields),
    trace: traceOf(v),
    retained: v.proposals.filter((q) => q.group === "parti" && q.retained).length,
    stale: v.stale,
  }));

  const programme = ctx.programmeCase;
  const analysis = dctx.analysis;
  const hasModel = dctx.input.nativeId !== null && analysis.floors.length > 0;
  const programmeArea = programme ? programmeCaseSums(programme.spaces).total : Number.NaN;
  const audit = {
    fields: BIZ_FIELD_COUNT,
    filled: BIZ_FIELD_COUNT - missingBizFields(dctx).length,
    linkedSpaces: programme ? Object.values(programme.roomLinks ?? {}).filter((x) => Array.isArray(x) && x.length > 0).length : 0,
    stageCount: PARCOURS_STEPS.length,
    areaDelta: hasModel ? programmeArea - analysis.facts.roomArea : Number.NaN,
  };

  const content10 = contentOf(ctx.rows, 10);
  const floor = ctx.domains?.floor ?? null;
  const building = hasModel
    ? {
        headline: content10.headline ?? "",
        decision: content10.decision ?? "",
        footprint: analysis.facts.footprint,
        roomCount: analysis.rooms.length,
        roomArea: analysis.facts.roomArea,
        layout: meta<ExampleLayoutMeta>(floor, "layoutV819"),
        stair: meta<ExampleStairMeta>(floor, "stairAV818"),
        services: meta<ExampleServicesMeta>(floor, "servicesV815"),
        sanitary: meta<ExampleSanitaryMeta>(floor, "sanitaryV817"),
        trace: traceOf(views.find((v) => v.number === 10)!),
        issues: analysis.issues.map((x) => ({ id: x.id, title: x.title, body: x.body })),
        issueAnswers,
        floors: analysis.floors.map((f) => ({ name: f.name, rooms: f.rooms, planSvg: designPlanSvg(dctx.input, analysis, f.id), roomsHtml: exampleRoomsHtml(dctx.input, analysis, f.id) })),
      }
    : null;

  return {
    // `p.name` du prototype porte le code (« P.118 — … ») ; Fadi affiche `code — nom`, le dossier aussi.
    projectName: project.code ? `${project.code} — ${project.name}` : project.name,
    criteria,
    audit,
    steps,
    budget: exampleBudget(contentOf(ctx.rows, 14).fields, contentOf(ctx.rows, 15).fields),
    building,
    assumptions,
    css: EXAMPLE_REPORT_CSS,
  };
}

/** Le document HTML (`fullReport`), ou `null` hors d'un projet issu de l'exemple. */
export function exampleReportFor(project: OwnedProject, dctx: DesignContext): string | null {
  const input = exampleReportInput(project, dctx);
  return input ? exampleReportHtml(input) : null;
}
