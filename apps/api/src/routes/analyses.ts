/**
 * Module Analyses métier — `GET /projects/:projectId/analyses` : quantités
 * dérivées du modèle courant, contrôles traçables (domaine, source, version,
 * résultat), résultats calculés des étapes, dossier de structure déclaré,
 * circulations mesurées et comparaison des variantes de programme. Tout est
 * calculé à la lecture sur les mêmes entrées que le bilan de conception
 * (`loadDesignContext`) et tagué de la révision du modèle et de l'empreinte
 * des entrées — un résultat porte toujours la révision dont il provient
 * (docs/architecture.md, « Coherent, reversible operations »).
 */
import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import {
  BUSINESS_CHECKS_VERSION,
  checkTotals,
  derivedQuantities,
  designChecks,
  financeCheck,
  programmeCaseSums,
  programmeScenarios,
  stepResults,
  structureCheck,
  structureStatements,
  transmissionChecks,
  type DeclaredStructure,
  type ProgrammeCase,
  type TraceableCheck,
} from "@parcours/domain-model";
import { db } from "../db/client.js";
import { programmeCases } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { exampleStudyDossier, type StudyDossierFile } from "../data/parcours.js";
import { loadDesignContext } from "../lib/design-context.js";
import { projectOr404, type OwnedProject } from "../lib/owned-project.js";

export const analysesRouter = Router({ mergeParams: true });
analysesRouter.use(requireAuth);

/** Le dossier d'étude déclaré : pièce jointe du projet (import), sinon celui de l'exemple d'origine ; jamais inventé. */
function studyDossier(project: OwnedProject): { structure: DeclaredStructure | null; circulation: StudyDossierFile["circulation"]; webSources: StudyDossierFile["webSources"] } {
  const att = project.sourceAttachment ?? {};
  const example = exampleStudyDossier(project.sourceExampleId ?? null);
  const structure = (att["structure"] ?? example?.structure ?? null) as DeclaredStructure | null;
  const circulation = (att["circulation"] ?? example?.circulation ?? null) as StudyDossierFile["circulation"];
  const webSources = (Array.isArray(att["webSources"]) ? att["webSources"] : (example?.webSources ?? [])) as StudyDossierFile["webSources"];
  return { structure, circulation, webSources };
}

export async function analysesView(project: OwnedProject, now: string) {
  const ctx = await loadDesignContext(db, project, now);
  const { analysis: r, input } = ctx;
  const fields = (n: number) => ctx.steps.rows.get(n)?.content.fields ?? {};
  const study = studyDossier(project);
  const checks: TraceableCheck[] = [...designChecks(input, r), ...transmissionChecks(ctx.audit), financeCheck(fields(14)), structureCheck(study.structure)];
  const caseRows = await db.select().from(programmeCases).where(eq(programmeCases.projectId, project.id)).orderBy(asc(programmeCases.revision));
  const active = ctx.steps.programmeCase;
  const scenarios = programmeScenarios(
    caseRows.map((row) => {
      const a = row.data as unknown as ProgrammeCase;
      return {
        revision: a.revision,
        title: a.title,
        scenarioLabel: a.scenarioLabel,
        updated: a.updated,
        archived: active && a.revision === active.revision ? null : row.createdAt.toISOString(),
        spaces: a.spaces,
      };
    }),
  );
  const { structure, circulation, webSources: _sources } = study;
  return {
    version: BUSINESS_CHECKS_VERSION,
    computedAt: now,
    /** `CalculatedResult` : révision du modèle et empreintes dont tout ce qui suit provient. */
    modelRevision: project.modelRevision,
    nativeHash: r.nativeHash,
    inputHash: r.inputHash,
    profileLabel: ctx.profileLabel,
    example: input.example,
    quantities: derivedQuantities(r, r.floors, active ? programmeCaseSums(active.spaces) : null),
    checks,
    totals: checkTotals(checks),
    results: stepResults(fields(14), fields(17), fields(19)),
    structure: structure
      ? {
          statements: structureStatements(structure),
          source: "Dossier d'étude du projet (project.data.structure) — exigences enregistrées, charges supposées, état de dimensionnement ; aucun calcul de structure n'est effectué ici.",
        }
      : null,
    circulation: circulation
      ? {
          revision: circulation.revision ?? null,
          spaces: circulation.spaces ?? [],
          totals: circulation.totals ?? {},
          note: circulation.note ?? "",
          source: "Dossier d'étude du projet (project.data.circulation) — surfaces dédiées déclarées, calculées depuis les plans de l'exemple.",
        }
      : null,
    scenarios,
  };
}

analysesRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  res.json(await analysesView(project, new Date().toISOString()));
});
