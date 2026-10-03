/**
 * Le contexte des 21 étapes d'un projet, chargé une fois par requête : lignes
 * des étapes, profil Harmonie, contexte de site (étape 01), analyse du modèle
 * natif (étapes 10/11), cas de programme appliqué, et les dépendances entre
 * étapes — empreintes, péremption (« À réexaminer ») et intentions reçues
 * (`dependencies.ts` du modèle de domaine, `fingerprint`/`incoming` du
 * prototype). `stepView` en dérive la vue d'une étape telle que le client
 * l'affiche ; `harmonieReport` les rapports HTML.
 */
import {
  buildHarmonieProposals,
  computeStepDependencies,
  harmonieProfile,
  harmonieReportHtml,
  harmonyDossier,
  localHarmonieOptions,
  programmeCaseSums,
  recommendedDesignOption,
  recommendedSiteOption,
  siteContextHash,
  siteProposalComputation,
  type HarmonieProfile,
  type HarmonieProposalComputation,
  type HarmonieReportStep,
  type ModelAnalysis,
  type ParcoursStepDefinition,
  type ProgrammeCase,
  type SiteContext,
  type StepDependency,
  type StepFingerprintSources,
} from "@parcours/domain-model";
import { EMPTY_STEP_CONTENT, HARMONIE_PROFILES, HARMONIE_REPORT_CSS, PARCOURS_STEPS } from "../data/parcours.js";
import { loadProgrammeRepartition } from "../routes/programme.js";
import { analyseNativeDomains, loadNativeDomains, type NativeDomains } from "./model-context.js";
import { loadActiveProgrammeCase } from "./programme-case.js";
import { loadSiteContext } from "./site-context.js";
import { loadStepRows, type Querier, type StepRows } from "./step-rows.js";

export interface StepContextProject {
  id: string;
  name: string;
  siteObservations: Record<string, unknown> | null;
  /** Dossier Harmony (références directionnelles dans l'empreinte des étapes de conception). */
  harmony?: Record<string, unknown> | null;
}

export interface StepContext {
  project: StepContextProject;
  rows: StepRows;
  profile: HarmonieProfile;
  site: SiteContext;
  domains: NativeDomains | null;
  model: ModelAnalysis | null;
  programmeCase: ProgrammeCase | null;
  sources: StepFingerprintSources;
  dependencies: Map<number, StepDependency>;
}

/** Les propositions calculées d'une étape : site (01), locaux du modèle (10/11), sinon celles de la définition. */
export function computationFor(ctx: Pick<StepContext, "site" | "model" | "profile">, n: number): HarmonieProposalComputation | null {
  if (n === 1) return siteProposalComputation(ctx.site);
  if ((n === 10 || n === 11) && ctx.model) {
    return { options: null, recommendedKey: n === 10 ? recommendedDesignOption(ctx.model).key : "A", locals: localHarmonieOptions(ctx.model, n, ctx.profile.usage) };
  }
  return null;
}

export function contentOf(rows: StepRows, n: number) {
  return rows.get(n)?.content ?? EMPTY_STEP_CONTENT;
}

function dependenciesOf(base: Omit<StepContext, "dependencies" | "sources">, rows: StepRows, programmeRepartition: unknown): Pick<StepContext, "sources" | "dependencies"> {
  const sources: StepFingerprintSources = {
    siteHash: siteContextHash(base.site),
    profileKey: base.profile.key,
    business: new Map([...rows].map(([n, r]) => [n, r.content.fields])),
    programmeCase: base.programmeCase,
    programmeRepartition,
    parcelSetback: (base.domains?.parcel as { setback?: unknown } | null)?.setback ?? null,
    model: base.domains ? { floor: base.domains.floor, levels: base.domains.levels, footprint: base.domains.footprint } : null,
    // Références directionnelles du bâtiment (`harmony.compass`), telles que saisies.
    compass: harmonyDossier(base.project.harmony ?? null, "").compass,
  };
  const dependencies = computeStepDependencies(
    HARMONIE_PROFILES,
    PARCOURS_STEPS.map((def) => ({ def, state: contentOf(rows, def.number).harmonie, computed: computationFor(base, def.number) })),
    base.profile,
    sources,
  );
  return { sources, dependencies };
}

/**
 * Charge tout ce dont les vues d'étapes ont besoin. `rows` peut être fourni
 * quand l'appelant les a déjà lues (ou modifiées) dans sa transaction.
 */
export async function loadStepContext(q: Querier, project: StepContextProject, rows?: StepRows): Promise<StepContext> {
  const stepRows = rows ?? (await loadStepRows(q, project.id));
  const rep = await loadProgrammeRepartition(project.id, q);
  const profile = harmonieProfile(HARMONIE_PROFILES, rep.stored ? rep.type : null, rep.components);
  const site = await loadSiteContext(q, project, profile);
  const domains = await loadNativeDomains(q, project.id);
  const programmeCase = await loadActiveProgrammeCase(q, project.id);
  const model = analyseNativeDomains(domains, programmeCase);
  const base = { project, rows: stepRows, profile, site, domains, model, programmeCase };
  const programmeRepartition = rep.stored ? { type: rep.type, baseArea: rep.baseArea, mode: rep.mode, custom: rep.custom, components: rep.components } : null;
  return { ...base, ...dependenciesOf(base, stepRows, programmeRepartition) };
}

/** Le même contexte, avec des lignes d'étapes modifiées : les dépendances sont recalculées, le reste est conservé. */
export function withRows(ctx: StepContext, rows: StepRows): StepContext {
  const { sources } = ctx;
  return { ...ctx, rows, ...dependenciesOf(ctx, rows, sources.programmeRepartition) };
}

/** Le bloc « site » de l'étape 01 : faits de la parcelle, géolocalisation, observations déclarées et proposition de départ (`siteDataHTML` du prototype). */
function siteView(c: SiteContext) {
  return {
    parcel: {
      parcelNumber: c.parcel.parcelNumber,
      commune: c.parcel.commune,
      crs: c.parcel.crs,
      units: c.parcel.units,
      vertexIds: c.parcel.vertexIds,
      vertexCount: c.parcel.vertices.length,
      officialArea: c.parcel.officialArea,
      sourceFile: c.parcel.sourceFile,
      area: c.area,
      /** Contour dans le repère local (origine au centroïde) — jamais mélangé au repère cadastral. */
      local: c.local,
    },
    geo: c.geo,
    frontage: c.frontage,
    observations: c.observations,
    recommendation: recommendedSiteOption(c.observations),
  };
}

/** La vue complète d'une étape : définition, contenu, propositions (avec péremption), intentions reçues, faits mobilisés. */
export function stepView(def: ParcoursStepDefinition, ctx: StepContext) {
  const row = ctx.rows.get(def.number);
  const content = row?.content ?? EMPTY_STEP_CONTENT;
  const dep = ctx.dependencies.get(def.number) ?? null;
  const proposals = buildHarmonieProposals(HARMONIE_PROFILES, def, ctx.profile, content.harmonie, computationFor(ctx, def.number), dep?.fingerprint ?? null);
  const programme = def.number >= 7 && ctx.programmeCase ? { spaceCount: ctx.programmeCase.spaces.length, total: programmeCaseSums(ctx.programmeCase.spaces).total } : null;
  return {
    ...def,
    status: row?.status ?? EMPTY_STEP_CONTENT.status,
    content,
    proposals,
    incoming: dep?.incoming ?? [],
    retainedCount: proposals.filter((q) => q.retained).length,
    /** « À réexaminer » : générée sur d'autres données (`isStageStale`) ; les choix sont conservés. */
    stale: dep?.stale ?? false,
    staleRetainedCount: proposals.filter((q) => q.retained && q.stale).length,
    profile: ctx.profile,
    site: def.number === 1 ? siteView(ctx.site) : null,
    /** Étapes 10/11 : la proposition de départ calculée sur le modèle (`recommended(10)`). */
    recommendation: def.number === 10 && ctx.model ? recommendedDesignOption(ctx.model) : null,
    /** Étapes 10/11 : l'empreinte du modèle lu (`nativeHash`) et ses niveaux. */
    model: (def.number === 10 || def.number === 11) && ctx.model ? { nativeHash: ctx.model.nativeHash, floors: ctx.model.floors, roomCount: ctx.model.rooms.length } : null,
    /** Étapes ≥ 07 avec cas appliqué : « Programme : N fiches · X m² de cibles de travail ». */
    programme,
  };
}

export type StepView = ReturnType<typeof stepView>;

/**
 * « Rapport de cette étape » (une étape) ou « Synthèse des choix Harmonie »
 * (les étapes effectivement ouvertes : générées ou arbitrées) — `reportHTML`.
 */
export function harmonieReport(ctx: StepContext, stepNumber: number | null, now: string): string {
  const opened = (n: number) => {
    const h = contentOf(ctx.rows, n).harmonie;
    return h.revision > 0 || Object.keys(h.proposals).length > 0;
  };
  const defs = stepNumber === null ? PARCOURS_STEPS.filter((d) => opened(d.number)) : PARCOURS_STEPS.filter((d) => d.number === stepNumber);
  const steps: HarmonieReportStep[] = defs.map((def) => {
    const dep = ctx.dependencies.get(def.number) ?? null;
    const sketch = ctx.site.local.length >= 3 ? { local: ctx.site.local, area: ctx.site.area, vertexIds: ctx.site.parcel.vertexIds, crs: ctx.site.parcel.crs, approachStatus: ctx.site.observations.approachStatus } : null;
    return {
      def,
      proposals: buildHarmonieProposals(HARMONIE_PROFILES, def, ctx.profile, contentOf(ctx.rows, def.number).harmonie, computationFor(ctx, def.number), dep?.fingerprint ?? null),
      incoming: dep?.incoming ?? [],
      stale: dep?.stale ?? false,
      site: def.number === 1 ? { geoSource: ctx.site.geo.source, sketch } : null,
    };
  });
  return harmonieReportHtml({ projectName: ctx.project.name, stepNumber, steps, definitions: PARCOURS_STEPS, states: HARMONIE_PROFILES.states, css: HARMONIE_REPORT_CSS, now });
}
