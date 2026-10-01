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
  EMPTY_PARCOURS_STEP_CONTENT,
  type HarmonieProfilesData,
  type ParcoursFieldValue,
  type ParcoursFormField,
  type ParcoursStepContent,
  type ParcoursStepDefinition,
  type ParcoursStepForm,
  type ParcoursStepResult,
  type ProgrammeRepartitionData,
  type ProgrammeSpace,
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

// ---------------------------------------------------------------------------
// Référentiels : Harmonie, répartition programmatique
// ---------------------------------------------------------------------------

export const HARMONIE_PROFILES: HarmonieProfilesData = readJson<HarmonieProfilesData>("harmonie-profiles.json");
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
// Modèle architectural natif de P.118 (niveaux + objets) — extraction directe
// de native.domains.floorDesign dans le prototype, pas une illustration.
// ---------------------------------------------------------------------------

interface NativeArchitectureObject {
  id: string;
  kind: string;
  properties: Record<string, unknown>;
  relations: { kind: string; targetId: string }[];
}

interface NativeArchitectureFile {
  sourceVersion: string;
  sourceNativeId: string;
  note: string;
  levels: { id: string; label: string; elevation: number; position: number }[];
  objectsByLevel: Record<string, NativeArchitectureObject[]>;
}

const nativeArchitecture = readJson<NativeArchitectureFile>("examples/p118-native-architecture.json");

/**
 * Le modèle architectural complet de P.118 (niveaux + ~1750 objets : murs,
 * poteaux, portes, fenêtres, escaliers, dalles/zones, cotations, repères,
 * locaux), ou `null` pour un exemple qui n'en a pas (le dossier antérieur
 * n'est qu'un dossier de zone, sans modèle de bâtiment).
 */
export function exampleNativeArchitecture(exampleId: string): NativeArchitectureFile | null {
  if (exampleId === exempleComplet.id) return nativeArchitecture;
  return null;
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
  if (source.choice && def && def.harmonieOptions.length > 0) {
    const index = "ABC".indexOf(source.choice);
    if (index >= 0 && index < def.harmonieOptions.length) {
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
      programmeCase: programmeCase.programme,
      roomResponses: programmeCase.roomResponses,
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

export function exampleRegistryName(exampleId: string): { code: string; name: string } | null {
  if (exampleId === exempleComplet.id) return { code: "P.118", name: stripCodePrefix("P.118", exempleComplet.name) };
  if (exampleId === dossierAnterieur.id)
    return { code: "P.118-ARCH", name: stripCodePrefix("P.118", dossierAnterieur.name) };
  return null;
}

/** Type de bâtiment et composantes déclarés par l'exemple lui-même (`harmony.config` du prototype) — `null` sans cas de programme. */
export function exampleBuildingType(exampleId: string): { type: string; components: string[] } | null {
  if (exampleId === exempleComplet.id) {
    return { type: programmeCase.programme.type, components: programmeCase.harmonyConfig.components.slice() };
  }
  return null;
}
