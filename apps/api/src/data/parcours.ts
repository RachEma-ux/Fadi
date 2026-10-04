/**
 * Chargement du registre des 21 étapes du Parcours, des formulaires métier,
 * des référentiels (Harmonie, répartition programmatique) et des exemples
 * importables. Les fichiers JSON à côté de ce module sont une extraction
 * traçable du prototype fourni par l'utilisateur (voir leur champ
 * `sourceVersion`/`sourceBlock` et `scripts/extract-prototype-data.mjs`) —
 * ce module les lit et les type, il ne les invente pas (AGENTS.md : « Treat
 * the supplied geometry package as a traceable extraction, not proof of
 * correctness », appliqué ici au contenu métier plutôt qu'à la géométrie).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SITE_OBSERVATIONS,
  EMPTY_PARCOURS_STEP_CONTENT,
  type BuildingLibraryData,
  type DesignAssumption,
  type HarmonieProfilesData,
  type HarmonyEngineData,
  type ParcoursFieldValue,
  type ParcoursFormField,
  type ParcoursStepContent,
  type ParcoursStepDefinition,
  type ParcoursStepForm,
  type ParcoursStepResult,
  type ProgrammeRepartitionData,
  type ProgrammeSpace,
  type SiteManualGeographic,
  type SiteObservations,
} from "@parcours/domain-model";
import { dataFileUrl } from "../runtime-paths.js";

function readJson<T>(relativeName: string): T {
  return JSON.parse(readFileSync(fileURLToPath(dataFileUrl(relativeName)), "utf8")) as T;
}

/** Contenu vide d'une étape (alias local du modèle de domaine, pour les appels existants). */
export const EMPTY_STEP_CONTENT: ParcoursStepContent = EMPTY_PARCOURS_STEP_CONTENT;

// ---------------------------------------------------------------------------
// Registre des étapes + formulaires métier
// ---------------------------------------------------------------------------

interface ParcoursStepsFile {
  version: string;
  phases: string[];
  steps: Omit<ParcoursStepDefinition, "form">[];
}

interface ParcoursFormsFile {
  sourceVersion: string;
  summary: { intro: string; field: ParcoursFormField };
  decisionChoices: string[];
  intro: Record<string, string>;
  schemas: Record<string, ParcoursFormField[]>;
}

const stepsFile = readJson<ParcoursStepsFile>("parcours-steps.json");
/** Bibliothèque des bâtiments (10 types, 21 cas, 3 variantes chacun, références) — `building-library-data` du prototype, tel quel. */
export const BUILDING_LIBRARY = readJson<BuildingLibraryData>("building-library.json");
const formsFile = readJson<ParcoursFormsFile>("parcours-forms.json");

/**
 * Le formulaire d'une étape, tel que `content()` du prototype le compose :
 * le schéma métier quand il existe, sinon le seul champ « Synthèse /
 * livrable » — sauf pour les étapes outillées (01 parcelle, 10 et 11
 * atelier) qui n'ont pas de formulaire propre.
 */
function formFor(number: number): ParcoursStepForm | null {
  const schema = formsFile.schemas[String(number)];
  if (schema) return { intro: formsFile.intro[String(number)] ?? null, fields: schema };
  if (number === 1 || number === 10 || number === 11) return null;
  return { intro: formsFile.summary.intro, fields: [formsFile.summary.field] };
}

/** Les 21 étapes, numérotées 01 à 21, dans l'ordre d'origine. Jamais réordonnées. */
export const PARCOURS_STEPS: readonly ParcoursStepDefinition[] = stepsFile.steps.map((s) => ({ ...s, form: formFor(s.number) }));
export const PARCOURS_PHASES: readonly string[] = stepsFile.phases;
export const DECISION_CHOICES: readonly string[] = formsFile.decisionChoices;

export function parcoursStepDefinition(number: number): ParcoursStepDefinition | null {
  return PARCOURS_STEPS.find((s) => s.number === number) ?? null;
}

/** `BIZ_SCHEMAS[n]` du prototype : le schéma métier d'une étape (02–09, 12–20), `null` pour les autres — distinct du formulaire de synthèse. */
export function bizSchema(number: number): ParcoursFormField[] | null {
  return formsFile.schemas[String(number)] ?? null;
}

/** Nombre total de champs des schémas métier (`audit(p).fields` du prototype). */
export const BIZ_FIELD_COUNT: number = Object.values(formsFile.schemas).reduce((n, s) => n + s.length, 0);

// ---------------------------------------------------------------------------
// Référentiels : Harmonie, répartition programmatique
// ---------------------------------------------------------------------------

export const HARMONIE_PROFILES: HarmonieProfilesData = readJson<HarmonieProfilesData>("harmonie-profiles.json");
/** Moteur Harmony V6 : types, phases, lectures, 69 règles, directions, Gua, sources (`harmony-engine-v6` du prototype, tables telles quelles). */
export const HARMONY_ENGINE: HarmonyEngineData = readJson<HarmonyEngineData>("harmony-engine.json");

interface HarmonyDossierFile {
  exampleId: string;
  harmony: Record<string, unknown>;
  georeference: { parcelVertices: [number, number][]; latitude: number; longitude: number; projectNorth: number; crs: string; method: string; status: string; source: string };
  assumptions: DesignAssumption[];
  stages: Record<string, Record<string, string>>;
}
const harmonyDossierFile = readJson<HarmonyDossierFile>("examples/p118-harmony-dossier.json");

/** Le dossier Harmony de l'exemple P.118 (`p.data.harmony` du prototype, tel quel) et ses données V6.2 (géoréférencement, hypothèses H-*). */
export function exampleHarmonyDossier(exampleId: string): HarmonyDossierFile | null {
  return exampleId === harmonyDossierFile.exampleId ? harmonyDossierFile : null;
}

/** Dossier d'étude déclaré de l'exemple (`project.data.structure`, `.circulation`, `.webSources` du prototype, tels quels). */
export interface StudyDossierFile {
  exampleId: string;
  structure: Record<string, unknown> | null;
  circulation: { revision?: number; spaces?: { code: string; name: string; levels: string[]; area: number; dimension: string; use: string }[]; totals?: Record<string, number>; note?: string } | null;
  webSources: { title: string; url: string; note: string }[];
}
const studyDossierFile = readJson<StudyDossierFile>("examples/p118-study-dossier.json");

/** Exigences de structure, circulations mesurées et sources web de l'exemple P.118 — données déclarées, jamais recalculées. */
export function exampleStudyDossier(exampleId: string | null): StudyDossierFile | null {
  return exampleId !== null && exampleId === studyDossierFile.exampleId ? studyDossierFile : null;
}

/** « Documents de base intégrés » de l'exemple (SEED888_FILES du prototype) : les deux fichiers, rattachés aux sources des étapes 01 et 02 à l'import. */
export interface ExampleBaseDocument {
  file: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
  stepNumber: number;
  note: string;
}
interface BaseDocumentsFile {
  exampleId: string;
  caption: string;
  files: ExampleBaseDocument[];
}
const baseDocumentsFile = readJson<BaseDocumentsFile>("examples/p118-base-documents.json");

export function exampleBaseDocuments(exampleId: string | null): { caption: string; files: ExampleBaseDocument[] } | null {
  return exampleId !== null && exampleId === baseDocumentsFile.exampleId ? { caption: baseDocumentsFile.caption, files: baseDocumentsFile.files } : null;
}

/** Les octets d'un document de base, tels qu'extraits du prototype (empreinte vérifiée dans `p118-base-documents.json`). */
export function exampleBaseDocumentContent(doc: ExampleBaseDocument): Buffer {
  return readFileSync(fileURLToPath(dataFileUrl(`examples/files/${doc.file}`)));
}

/** Feuille de style du panneau Harmonie (`<style id="h7-css">` du prototype, telle quelle) embarquée dans les rapports HTML téléchargés. */
export const HARMONIE_REPORT_CSS: string = readFileSync(fileURLToPath(dataFileUrl("harmonie-report.css")), "utf8");
/** Feuille de style du bilan du bâtiment conçu (`<style id="flow-v62-css">`), telle quelle : rapport téléchargé et bilan en ligne. */
export const DESIGN_REPORT_CSS: string = readFileSync(fileURLToPath(dataFileUrl("design-report.css")), "utf8");
/** Feuille de style de l'exemple résolu (`<style id="ex81-css">`), telle quelle : « Dossier complet de l’exemple » (P118_Exemple_Resolu_V8_19.html). */
export const EXAMPLE_REPORT_CSS: string = readFileSync(fileURLToPath(dataFileUrl("example-report.css")), "utf8");
export const PROGRAMME_REPARTITION: ProgrammeRepartitionData = readJson<ProgrammeRepartitionData>("programme-repartition.json");

// ---------------------------------------------------------------------------
// Exemples importables
// ---------------------------------------------------------------------------

interface ExampleStepSource {
  stage: number;
  title: string;
  choice: string | null;
  headline: string | null;
  decision: string | null;
  why: string | null;
  alternatives: string | null;
  owner: string | null;
  proof: string | null;
  result: ParcoursStepResult;
  sourceStatus: string | null;
}

interface ExampleCompletFile {
  id: string;
  kind: "exemple-complet";
  sourceId: string;
  sourceVersion: string;
  name: string;
  summary: string;
  mode: string;
  date: string;
  reviewDate: string;
  source: string;
  criteria: string[];
  facts: Record<string, number | boolean>;
  assumptions: { id: string; title: string; value: string; stages: string; status: string }[];
  steps: Record<string, ExampleStepSource>;
  /** Réponses des formulaires métier par étape (p118-resolved-data.business). */
  business: Record<string, Record<string, ParcoursFieldValue>>;
  /** Données du site déclarées par l'exemple (étape 01, `harmonieEtapesV7.site` du prototype). */
  siteObservations?: Partial<SiteObservations> & { geographic?: (SiteManualGeographic & { at?: string }) | null };
  /** Réponses retenues aux réserves du modèle (`issueAnswers` de p118-resolved-app) et rôle de démonstration. */
  issueAnswers: Record<string, string>;
  demoRole: string;
}

interface ArchiveDossierFile {
  id: string;
  kind: "archive";
  sourceVersion: string;
  name: string;
  summary: string;
  date: string;
  legacyBusiness: Record<string, Record<string, string>>;
  georeference: Record<string, unknown>;
  assumptions: { id: string; topic: string; value: string; source: string; validation: string; owner: string; status: string }[];
}

interface ProgrammeCaseFile {
  sourceVersion: string;
  exampleId: string;
  harmonyConfig: { type: string; phase: number; components: string[] };
  programme: {
    schema: string;
    caseId: string;
    title: string;
    type: string;
    subtype: string;
    capacity: number;
    unit: string;
    users: string;
    scenarioId: string;
    scenarioLabel: string;
    scenarioNote: string;
    revision: number;
    spaces: (ProgrammeSpace & Record<string, unknown>)[];
    [key: string]: unknown;
  };
  roomResponses: Record<string, unknown>[];
}

interface ParcelFile {
  sourceVersion: string;
  exampleId: string;
  parcelNumber: string;
  commune: string;
  crs: string;
  crsHypothesis: string;
  units: string;
  vertexOrder: string[];
  vertices: { id: string; frame: "cadastral"; crs: string; x: number; y: number }[];
  bornesWgs84FromSource: { id: string; lambert: { frame: "cadastral"; crs: string; x: number; y: number }; wgs84: { frame: "geographic"; lat: number; lon: number } }[];
  areaLambert: number;
  officialArea: number;
  correctedAreaPrinted: number;
  perimeter: number;
  sideLengths: number[];
  centroid: { frame: "cadastral"; crs: string; x: number; y: number };
  notice: string;
}

const exempleComplet = readJson<ExampleCompletFile>("examples/p118-exemple-complet.json");
const dossierAnterieur = readJson<ArchiveDossierFile>("examples/p118-dossier-anterieur.json");
const programmeCase = readJson<ProgrammeCaseFile>("examples/p118-programme-case.json");
const parcel = readJson<ParcelFile>("examples/p118-parcel.json");

// ---------------------------------------------------------------------------
// Modèle natif de P.118 — extraction verbatim de p118-resolved-template.native, source de l'importeur du lot 1
// (`importerP118`) qui l'écrit dans le modèle typé de l'Atelier à l'import de l'exemple (D-052).
// ---------------------------------------------------------------------------

export interface NativeModelFile {
  sourceVersion: string;
  exampleId: string;
  nativeId: string;
  registry: { id: string; name: string; parcel: string; location: string };
  domains: Record<string, unknown>;
}

const nativeModel = readJson<NativeModelFile>("examples/p118-native-model.json");

/** Le jeu de données natif de l'exemple ; `null` pour un exemple sans modèle. */
export function exampleNativeModel(exampleId: string): NativeModelFile | null {
  return exampleId === exempleComplet.id ? nativeModel : null;
}

/** Le cas de programme (bibliothèque des bâtiments) et les 74 fiches d'espaces de l'exemple complet. */
export function exampleProgrammeCase(exampleId: string): ProgrammeCaseFile | null {
  if (exampleId === exempleComplet.id) return programmeCase;
  return null;
}

/** La parcelle P.118 : bornes cadastrales (EPSG:26191) et leurs coordonnées WGS84 telles que fournies par la source. */
export function exampleParcel(exampleId: string): ParcelFile | null {
  if (exampleId === exempleComplet.id) return parcel;
  return null;
}

export interface ParcoursExample {
  id: string;
  kind: "exemple-complet" | "archive";
  name: string;
  summary: string;
  /** Nombre d'étapes sur 21 pour lesquelles cet exemple fournit un contenu réel. */
  stepsWithContent: number;
  /** Nombre de décisions documentées (étapes où un choix a réellement été retenu et motivé). */
  documentedDecisions: number;
}

const EXAMPLE_HARMONIE_NOW = "2026-09-30T00:00:00.000Z";

function stepContentFromExample(number: number, source: ExampleStepSource | undefined, business: Record<string, ParcoursFieldValue> | undefined): ParcoursStepContent {
  if (!source) {
    return { ...EMPTY_STEP_CONTENT, fields: {}, harmonie: { revision: 0, generatedAt: null, proposals: {} } };
  }
  // Le choix Harmonie illustré par l'exemple (« choice »: A/B/C) devient une
  // proposition retenue, avec le responsable et la preuve que l'exemple
  // déclare — rien n'est ajouté : sans choix, aucune proposition retenue.
  const proposals: ParcoursStepContent["harmonie"]["proposals"] = {};
  const def = parcoursStepDefinition(number);
  // L'étape 01 a toujours ses trois propositions de site (calculées sur la parcelle du projet).
  const optionCount = number === 1 ? 3 : (def?.harmonieOptions.length ?? 0);
  if (source.choice && def && optionCount > 0) {
    const index = "ABC".indexOf(source.choice);
    if (index >= 0 && index < optionCount) {
      const id = `H${String(number - 1).padStart(2, "0")}-${source.choice}`;
      proposals[id] = {
        status: "retained",
        notes: "",
        owner: source.owner ?? "",
        proof: source.proof ?? "",
        link: "",
        adaptedText: null,
        decisionVersion: 1,
        updatedAt: EXAMPLE_HARMONIE_NOW,
        history: [],
      };
    }
  }
  return {
    status: "termine",
    choice: source.choice,
    headline: source.headline,
    decision: source.decision,
    why: source.why,
    alternatives: source.alternatives,
    owner: source.owner,
    proof: source.proof,
    result: source.result,
    sourceStatus: source.sourceStatus,
    fields: { ...(business ?? {}) },
    harmonie: { revision: 1, generatedAt: EXAMPLE_HARMONIE_NOW, proposals },
  };
}

/** Contenu des 21 étapes pour un exemple donné, prêt à être copié dans un nouveau projet. */
export function exampleStepContents(exampleId: string): Record<number, ParcoursStepContent> | null {
  const out: Record<number, ParcoursStepContent> = {};
  if (exampleId === exempleComplet.id) {
    for (const def of PARCOURS_STEPS) {
      out[def.number] = stepContentFromExample(def.number, exempleComplet.steps[String(def.number)], exempleComplet.business[String(def.number)]);
    }
    return out;
  }
  if (exampleId === dossierAnterieur.id) {
    // Le dossier antérieur n'est pas un Parcours travaillé : aucune étape
    // n'est marquée terminée (voir son `summary`). Seules les données de
    // zone sont conservées, en pièce jointe du projet importé.
    for (const def of PARCOURS_STEPS) {
      out[def.number] = stepContentFromExample(def.number, undefined, undefined);
    }
    return out;
  }
  return null;
}

export function listParcoursExamples(): ParcoursExample[] {
  const completContents = exampleStepContents(exempleComplet.id)!;
  const archiveContents = exampleStepContents(dossierAnterieur.id)!;
  const countDecisions = (contents: Record<number, ParcoursStepContent>) =>
    Object.values(contents).filter((c) => c.decision && c.decision.trim().length > 0).length;
  const countWithContent = (contents: Record<number, ParcoursStepContent>) =>
    Object.values(contents).filter((c) => c.status === "termine").length;

  return [
    {
      id: exempleComplet.id,
      kind: exempleComplet.kind,
      name: exempleComplet.name,
      summary: exempleComplet.summary,
      stepsWithContent: countWithContent(completContents),
      documentedDecisions: countDecisions(completContents),
    },
    {
      id: dossierAnterieur.id,
      kind: dossierAnterieur.kind,
      name: dossierAnterieur.name,
      summary: dossierAnterieur.summary,
      stepsWithContent: countWithContent(archiveContents),
      documentedDecisions: countDecisions(archiveContents),
    },
  ];
}

export function exampleAttachment(exampleId: string): Record<string, unknown> | null {
  if (exampleId === exempleComplet.id) {
    return {
      facts: exempleComplet.facts,
      criteria: exempleComplet.criteria,
      assumptions: exempleComplet.assumptions,
      /** Réponses retenues aux réserves du modèle (« Réserves du modèle : une réponse pour chacune » du dossier complet). */
      issueAnswers: exempleComplet.issueAnswers,
      /** Données V6.2 du dossier (flow-v62) : géoréférencement calculé et hypothèses de travail H-* du bilan du bâtiment conçu. */
      dossierV62: { georeference: harmonyDossierFile.georeference, assumptions: harmonyDossierFile.assumptions, stages: harmonyDossierFile.stages },
      programmeCase: programmeCase.programme,
      roomResponses: programmeCase.roomResponses,
      /** Dossier d'étude déclaré (structure, circulations, sources web) : lu par Analyses métier et Projets et sources. */
      structure: studyDossierFile.structure,
      circulation: studyDossierFile.circulation,
      webSources: studyDossierFile.webSources,
      parcel: {
        parcelNumber: parcel.parcelNumber,
        commune: parcel.commune,
        crs: parcel.crs,
        crsHypothesis: parcel.crsHypothesis,
        vertexOrder: parcel.vertexOrder,
        vertices: parcel.vertices,
        bornesWgs84FromSource: parcel.bornesWgs84FromSource,
        areaLambert: parcel.areaLambert,
        officialArea: parcel.officialArea,
        perimeter: parcel.perimeter,
        sideLengths: parcel.sideLengths,
      },
    };
  }
  if (exampleId === dossierAnterieur.id) {
    return { legacyBusiness: dossierAnterieur.legacyBusiness, assumptions: dossierAnterieur.assumptions };
  }
  return null;
}

/** Le nom de l'exemple répète déjà son code ("P.118 — ...") ; l'écran de projet affiche `{code} — {name}`, donc on retire le préfixe ici pour ne pas le doubler. */
function stripCodePrefix(code: string, name: string): string {
  const prefix = `${code} — `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** Les arbitrages de l'exemple résolu (`makeProject` de p118-resolved-app) : choix et textes par étape, réponses par local (`roomResponses`), rôle de démonstration. */
export interface ExampleDecisionSources {
  steps: Record<string, ExampleStepSource>;
  roomResponses: { id: string; decision: string; name: string; level: string }[];
  role: string;
}
export function exampleDecisionSources(exampleId: string | null): ExampleDecisionSources | null {
  if (exampleId !== exempleComplet.id) return null;
  return {
    steps: exempleComplet.steps,
    roomResponses: programmeCase.roomResponses.map((r) => ({ id: String(r["id"]), decision: String(r["decision"] ?? ""), name: String(r["name"] ?? ""), level: String(r["level"] ?? "") })),
    role: exempleComplet.demoRole,
  };
}

/** Critères, hypothèses et réponses aux réserves de l'exemple complet (repli quand la pièce jointe d'un projet importé avant leur extraction ne les porte pas). */
export function exampleDossierData(exampleId: string | null): { criteria: string[]; assumptions: ExampleCompletFile["assumptions"]; issueAnswers: Record<string, string> } | null {
  if (exampleId !== exempleComplet.id) return null;
  return { criteria: exempleComplet.criteria, assumptions: exempleComplet.assumptions, issueAnswers: exempleComplet.issueAnswers };
}

export function exampleRegistryName(exampleId: string): { code: string; name: string } | null {
  if (exampleId === exempleComplet.id) return { code: "P.118", name: stripCodePrefix("P.118", exempleComplet.name) };
  if (exampleId === dossierAnterieur.id)
    return { code: "P.118-ARCH", name: stripCodePrefix("P.118", dossierAnterieur.name) };
  return null;
}

/** Données du site déclarées par l'exemple (côté d'approche, contextes, source, repère) — `null` quand l'exemple n'en déclare pas. */
export function exampleSiteObservations(exampleId: string): SiteObservations | null {
  if (exampleId !== exempleComplet.id || !exempleComplet.siteObservations) return null;
  const { geographic, ...rest } = exempleComplet.siteObservations;
  return { ...DEFAULT_SITE_OBSERVATIONS, ...rest, geographic: geographic ? { longitude: geographic.longitude, latitude: geographic.latitude, source: geographic.source } : null };
}

/** Type de bâtiment et composantes déclarés par l'exemple lui-même (`harmony.config` du prototype) — `null` sans cas de programme. */
export function exampleBuildingType(exampleId: string): { type: string; components: string[] } | null {
  if (exampleId === exempleComplet.id) {
    return { type: programmeCase.programme.type, components: programmeCase.harmonyConfig.components.slice() };
  }
  return null;
}
