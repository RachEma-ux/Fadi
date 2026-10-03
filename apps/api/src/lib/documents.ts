/**
 * Module Documents — catalogue des documents que le projet produit depuis
 * sa révision courante (rapports Harmonie, bilan du bâtiment, plans de
 * lecture, tableaux, fiches, archive), enregistrement de chaque production
 * (révision du modèle + empreinte des entrées) et calcul de l'actualité
 * « à jour / périmé » (docs/architecture.md, « Document produit »). Les
 * fichiers sont régénérés à la demande par leurs routes ; seule la trace
 * de production est conservée (`produced_documents`).
 */
import { desc, eq, sql } from "drizzle-orm";
import { PARCOURS_STEPS } from "../data/parcours.js";
import { archiveFileName, documentFreshness, EXAMPLE_REPORT_FILE_NAME, fnv1a, harmonieReportFileName, resolvedSpacesFileName, type DocumentFreshness, type DocumentProduction } from "@parcours/domain-model";
import { drawingExports, producedDocuments } from "../db/schema.js";
import type { DesignContext } from "./design-context.js";
import type { OwnedProject } from "./owned-project.js";
import { ownsExampleDossier } from "./example-report.js";
import { contentOf, type StepContext } from "./step-context.js";
import type { Querier } from "./step-rows.js";

export type DocumentGroup = "harmonie" | "bilan" | "dessins" | "tableaux" | "exemple" | "archive";

export interface DocumentDescriptor {
  kind: string;
  group: DocumentGroup;
  label: string;
  fileName: string;
  /** Chemin de téléchargement, relatif à l'API. */
  href: string;
  stepNumber: number | null;
  /** Révision et empreinte dont le document serait produit maintenant. */
  current: { modelRevision: number; inputHash: string };
  produced: DocumentProduction | null;
  freshness: DocumentFreshness | null;
}

// --- Empreintes des entrées de chaque document ------------------------------

/** « Rapport de cette étape » : empreinte de péremption de l'étape et état Harmonie (propositions, arbitrages). */
export function stepReportHash(ctx: StepContext, n: number): string {
  return fnv1a({ f: ctx.dependencies.get(n)?.fingerprint ?? null, h: contentOf(ctx.rows, n).harmonie });
}

/** « Synthèse des choix Harmonie » : les 21 étapes. */
export function synthesisHash(ctx: StepContext): string {
  return fnv1a(PARCOURS_STEPS.map((d) => stepReportHash(ctx, d.number)));
}

/** « Bilan du bâtiment conçu » : entrées de l'analyse et revue archivée. */
export function designReportHash(dctx: DesignContext): string {
  return fnv1a({ i: dctx.analysis.inputHash, r: dctx.harmony.designReviewV62?.at ?? null });
}

/** Archive du projet : révision du modèle, programme, état et réponses des 21 étapes. */
export function archiveHash(project: OwnedProject, ctx: StepContext): string {
  return fnv1a({
    m: project.modelRevision,
    p: ctx.programmeCase?.revision ?? null,
    s: PARCOURS_STEPS.map((d) => {
      const c = contentOf(ctx.rows, d.number);
      return [d.number, ctx.rows.get(d.number)?.status ?? "a-faire", c.harmonie.revision, fnv1a(c.fields)];
    }),
    site: project.siteObservations ?? null,
    harmony: project.harmony ? fnv1a(project.harmony) : null,
  });
}

// --- Catalogue --------------------------------------------------------------

function base(projectId: string): string {
  return `/projects/${projectId}`;
}

/** Les documents productibles du projet, avec leur empreinte courante (sans les productions). */
export function documentDescriptors(project: OwnedProject, dctx: DesignContext): Omit<DocumentDescriptor, "produced" | "freshness">[] {
  const ctx = dctx.steps;
  const rev = project.modelRevision;
  const b = base(project.id);
  const out: Omit<DocumentDescriptor, "produced" | "freshness">[] = [];
  out.push({
    kind: "harmonie-synthese",
    group: "harmonie",
    label: "Synthèse des choix Harmonie (21 étapes)",
    fileName: harmonieReportFileName(null),
    href: `${b}/steps/harmonie/rapport`,
    stepNumber: null,
    current: { modelRevision: rev, inputHash: synthesisHash(ctx) },
  });
  for (const d of PARCOURS_STEPS) {
    out.push({
      kind: `harmonie-etape-${String(d.number).padStart(2, "0")}`,
      group: "harmonie",
      label: `Rapport Harmonie de l'étape ${String(d.number).padStart(2, "0")} · ${d.title}`,
      fileName: harmonieReportFileName(d.number),
      href: `${b}/steps/${d.number}/harmonie/rapport`,
      stepNumber: d.number,
      current: { modelRevision: rev, inputHash: stepReportHash(ctx, d.number) },
    });
  }
  out.push({
    kind: "bilan-batiment",
    group: "bilan",
    label: "Bilan Harmonie du bâtiment conçu (HTML)",
    fileName: "Bilan_Harmonie_Batiment_V7.html",
    href: `${b}/design-review/rapport`,
    stepNumber: 10,
    current: { modelRevision: rev, inputHash: designReportHash(dctx) },
  });
  for (const f of dctx.analysis.floors) {
    out.push({
      kind: `plan-lecture-${f.id}`,
      group: "bilan",
      label: `Plan de lecture · ${f.name} (SVG)`,
      fileName: `Plan_lecture_${f.id}_V7.svg`,
      href: `${b}/documents/plan/${encodeURIComponent(f.id)}`,
      stepNumber: 10,
      current: { modelRevision: rev, inputHash: fnv1a({ n: dctx.analysis.nativeHash, g: dctx.analysis.geo?.projectNorth ?? null, e: dctx.analysis.entry?.id ?? null }) },
    });
  }
  if (dctx.analysis.floors.length) {
    out.push({
      kind: "tableau-surfaces",
      group: "tableaux",
      label: "Tableau des surfaces par niveau et par zone (CSV)",
      fileName: "Tableau_surfaces_V7.csv",
      href: `${b}/documents/surfaces`,
      stepNumber: 10,
      current: { modelRevision: rev, inputHash: fnv1a({ n: dctx.analysis.nativeHash, t: dctx.analysis.rooms.map((x) => [x.id, x.target]) }) },
    });
  }
  const a = ctx.programmeCase;
  if (a) {
    out.push({
      kind: "programme-csv",
      group: "tableaux",
      label: `Programme du projet · ${a.title} (CSV)`,
      fileName: `Programme_projet_${a.caseId}.csv`,
      href: `${b}/documents/programme`,
      stepNumber: 7,
      current: { modelRevision: rev, inputHash: fnv1a({ r: a.revision, s: a.spaces }) },
    });
    if (project.exampleMode === "reference") {
      out.push({
        kind: "fiches-espaces-csv",
        group: "tableaux",
        label: "Fiches d'espaces de l'exemple résolu (CSV)",
        fileName: resolvedSpacesFileName(a.caseId),
        href: `${b}/documents/fiches`,
        stepNumber: 7,
        current: { modelRevision: rev, inputHash: fnv1a({ r: a.revision, s: a.spaces }) },
      });
    }
  }
  // « Dossier complet de l’exemple » (`fullReport` de p118-resolved-app) : projets issus de l'exemple P.118, référence ou copie ; mêmes entrées que l'archive.
  if (ownsExampleDossier(project)) {
    out.push({
      kind: "dossier-exemple",
      group: "exemple",
      label: "Dossier complet de l’exemple résolu (HTML)",
      fileName: EXAMPLE_REPORT_FILE_NAME,
      href: `${b}/documents/dossier-exemple`,
      stepNumber: null,
      current: { modelRevision: rev, inputHash: archiveHash(project, ctx) },
    });
  }
  out.push({
    kind: "archive-projet",
    group: "archive",
    label: "Sauvegarde du projet (JSON)",
    fileName: archiveFileName(project.name),
    href: `${b}/archive`,
    stepNumber: null,
    current: { modelRevision: rev, inputHash: archiveHash(project, ctx) },
  });
  return out;
}

export async function loadProductions(q: Querier, projectId: string): Promise<Map<string, DocumentProduction>> {
  const rows = await q.select().from(producedDocuments).where(eq(producedDocuments.projectId, projectId));
  return new Map(rows.map((r) => [r.kind, { producedAt: r.producedAt.toISOString(), modelRevision: r.modelRevision, inputHash: r.inputHash, count: r.count }]));
}

const DRAWING_KIND_LABEL: Record<string, string> = { dxf: "Dessin technique DXF", svg: "Plan SVG", png: "Image PNG", csv: "Métrés CSV", json: "Modèle JSON" };

/** Libellé de la vue du moteur au moment de l'export (`captureView` : `tech` = plan / coupe / façade…, `mode` = volume / filaire…). */
function drawingViewLabel(view: Record<string, unknown>): string {
  const tech = typeof view["tech"] === "string" && view["tech"] ? String(view["tech"]) : null;
  const mode = typeof view["mode"] === "string" ? String(view["mode"]) : null;
  const scope = typeof view["levelScope"] === "string" ? String(view["levelScope"]) : null;
  const parts = [tech ? `dessin ${tech}` : mode ? `vue ${mode}` : null, scope === "building" ? "bâtiment" : scope === "roof" ? "toiture" : null].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Les dessins techniques et exports de l'Atelier enregistrés (`drawing_exports`) : un document chacun, produit une fois à sa
 * révision — à jour tant que la révision et l'empreinte du modèle n'ont pas bougé, périmé ensuite (le fichier reste
 * téléchargeable tel quel).
 */
export async function drawingExportDescriptors(q: Querier, project: OwnedProject, dctx: DesignContext): Promise<DocumentDescriptor[]> {
  const rows = await q
    .select({ id: drawingExports.id, kind: drawingExports.kind, fileName: drawingExports.fileName, levelId: drawingExports.levelId, levelName: drawingExports.levelName, view: drawingExports.view, modelRevision: drawingExports.modelRevision, nativeHash: drawingExports.nativeHash, createdAt: drawingExports.createdAt, size: drawingExports.size })
    .from(drawingExports)
    .where(eq(drawingExports.projectId, project.id))
    .orderBy(desc(drawingExports.createdAt));
  const current = { modelRevision: project.modelRevision, inputHash: dctx.analysis.nativeHash };
  return rows.map((r) => {
    const produced: DocumentProduction = { producedAt: r.createdAt.toISOString(), modelRevision: r.modelRevision, inputHash: r.nativeHash, count: 1 };
    const where = [r.levelName ?? r.levelId ?? null, drawingViewLabel(r.view)].filter(Boolean).join(" · ");
    return {
      kind: `dessin:${r.id}`,
      group: "dessins",
      label: `${DRAWING_KIND_LABEL[r.kind] ?? r.kind.toUpperCase()}${where ? ` · ${where}` : ""} · révision ${r.modelRevision}`,
      fileName: r.fileName,
      href: `/projects/${project.id}/documents/dessins/${r.id}`,
      stepNumber: 10,
      current,
      produced,
      freshness: documentFreshness(current, produced),
    };
  });
}

export async function documentCatalogue(q: Querier, project: OwnedProject, dctx: DesignContext): Promise<DocumentDescriptor[]> {
  const productions = await loadProductions(q, project.id);
  const generated = documentDescriptors(project, dctx).map((d) => {
    const produced = productions.get(d.kind) ?? null;
    return { ...d, produced, freshness: documentFreshness(d.current, produced) };
  });
  return [...generated, ...(await drawingExportDescriptors(q, project, dctx))];
}

/** Enregistre une production : dernière date, révision et empreinte, compteur incrémenté. */
export async function recordProducedDocument(
  q: Querier,
  projectId: string,
  doc: { kind: string; label: string; fileName: string; modelRevision: number; inputHash: string; stepNumber: number | null },
  now: Date,
): Promise<void> {
  await q
    .insert(producedDocuments)
    .values({ projectId, kind: doc.kind, label: doc.label, fileName: doc.fileName, modelRevision: doc.modelRevision, inputHash: doc.inputHash, stepNumber: doc.stepNumber, producedAt: now, count: 1 })
    .onConflictDoUpdate({
      target: [producedDocuments.projectId, producedDocuments.kind],
      set: {
        label: doc.label,
        fileName: doc.fileName,
        modelRevision: doc.modelRevision,
        inputHash: doc.inputHash,
        stepNumber: doc.stepNumber,
        producedAt: now,
        count: sql`${producedDocuments.count} + 1`,
      },
    });
}
