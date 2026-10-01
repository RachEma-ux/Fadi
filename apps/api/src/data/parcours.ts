/**
 * Chargement du registre des 21 étapes du Parcours et des exemples
 * importables. Les fichiers JSON à côté de ce module sont une extraction
 * traçable du prototype fourni par l'utilisateur (voir leur champ
 * `sourceVersion`/`sourceId`) — ce module les lit et les type, il ne les
 * invente pas (AGENTS.md : « Treat the supplied geometry package as a
 * traceable extraction, not proof of correctness », appliqué ici au
 * contenu métier plutôt qu'à la géométrie).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParcoursStepContent, ParcoursStepDefinition, ParcoursStepResult } from "@parcours/domain-model";

function readJson<T>(relativePath: string): T {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Contenu vide d'une étape — défini ici plutôt qu'importé comme VALEUR
 * depuis @parcours/domain-model : ce paquet expose ses sources TypeScript
 * directement (`exports: "./src/index.ts"`), ce qui convient à `tsx`/Vite
 * en développement mais pas à `node dist/server.js` en production, qui ne
 * sait pas charger du TypeScript non compilé. Un `import type` (types
 * ci-dessus) est effacé à la compilation et ne pose pas ce problème ; une
 * valeur réellement exécutée au runtime, si.
 */
export const EMPTY_STEP_CONTENT: ParcoursStepContent = {
  status: "a-faire",
  choice: null,
  headline: null,
  decision: null,
  why: null,
  alternatives: null,
  owner: null,
  proof: null,
  result: null,
  sourceStatus: null,
};

interface ParcoursStepsFile {
  version: string;
  phases: string[];
  steps: ParcoursStepDefinition[];
}

const stepsFile = readJson<ParcoursStepsFile>("./parcours-steps.json");

/** Les 21 étapes, numérotées 01 à 21, dans l'ordre d'origine. Jamais réordonnées. */
export const PARCOURS_STEPS: readonly ParcoursStepDefinition[] = stepsFile.steps;
export const PARCOURS_PHASES: readonly string[] = stepsFile.phases;

export function parcoursStepDefinition(number: number): ParcoursStepDefinition | null {
  return PARCOURS_STEPS.find((s) => s.number === number) ?? null;
}

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

const exempleComplet = readJson<ExampleCompletFile>("./examples/p118-exemple-complet.json");
const dossierAnterieur = readJson<ArchiveDossierFile>("./examples/p118-dossier-anterieur.json");

export interface ParcoursExample {
  id: string;
  kind: "exemple-complet" | "archive";
  name: string;
  summary: string;
  /** Nombre d'étapes sur 21 pour lesquelles cet exemple fournit un contenu réel. */
  stepsWithContent: number;
  /** Nombre de décisions documentées (étapes où un choix a réellement été retenu et motivé) — remplace l'ancien compteur "choix retenus" du prototype, qui dépendait d'un mécanisme de propositions Harmonie que Fadi n'a pas encore. */
  documentedDecisions: number;
}

function stepContentFromExample(source: ExampleStepSource | undefined): ParcoursStepContent {
  if (!source) {
    return { ...EMPTY_STEP_CONTENT };
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
  };
}

/** Contenu des 21 étapes pour un exemple donné, prêt à être copié dans un nouveau projet. */
export function exampleStepContents(exampleId: string): Record<number, ParcoursStepContent> | null {
  const out: Record<number, ParcoursStepContent> = {};
  if (exampleId === exempleComplet.id) {
    for (const def of PARCOURS_STEPS) {
      out[def.number] = stepContentFromExample(exempleComplet.steps[String(def.number)]);
    }
    return out;
  }
  if (exampleId === dossierAnterieur.id) {
    // Le dossier antérieur n'est pas un Parcours travaillé : aucune étape
    // n'est marquée terminée (voir son `summary`). Seules les données de
    // zone sont conservées, en pièce jointe du projet importé.
    for (const def of PARCOURS_STEPS) {
      out[def.number] = stepContentFromExample(undefined);
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

export function exampleAttachment(exampleId: string): { legacyBusiness?: unknown; assumptions?: unknown; facts?: unknown; criteria?: unknown } | null {
  if (exampleId === exempleComplet.id) {
    return { facts: exempleComplet.facts, criteria: exempleComplet.criteria, assumptions: exempleComplet.assumptions };
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
