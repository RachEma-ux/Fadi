/**
 * Module Documents — monté sous `/projects/:projectId/documents` :
 *   GET /                 → catalogue des documents productibles, dernière production et actualité (à jour / périmé)
 *   GET /plan/:levelId    → plan de lecture SVG d'un niveau (`svgPlan` de flow-v62), pièce jointe
 *   GET /surfaces         → tableau des surfaces par niveau et par zone (CSV)
 *   GET /programme        → programme du projet (CSV, `csv` de building-library)
 *   GET /fiches           → fiches d'espaces de l'exemple résolu (CSV, `csv` de p118-resolved-app)
 * Chaque production est enregistrée avec la révision du modèle et
 * l'empreinte des entrées (`produced_documents`).
 */
import { Router, type Request, type Response } from "express";
import { buildingCase, designPlanSvg, programmeCsv, resolvedSpacesCsv, surfacesCsv, type LibrarySpace } from "@parcours/domain-model";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";
import { BUILDING_LIBRARY } from "../data/parcours.js";
import { loadDesignContext } from "../lib/design-context.js";
import { documentCatalogue, documentDescriptors, recordProducedDocument } from "../lib/documents.js";
import { projectOr404 } from "../lib/owned-project.js";

export const documentsRouter = Router({ mergeParams: true });
documentsRouter.use(requireAuth);

function attachment(res: Response, fileName: string, type: string, body: string) {
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(body);
}

documentsRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const now = new Date().toISOString();
  const dctx = await loadDesignContext(db, project, now);
  res.json({ modelRevision: project.modelRevision, nativeHash: dctx.analysis.nativeHash, computedAt: now, documents: await documentCatalogue(db, project, dctx) });
});

/** Produit un document du catalogue : le corps par `render`, la trace de production avec la révision et l'empreinte courantes. */
async function produce(req: Request, res: Response, kind: string, render: (dctx: Awaited<ReturnType<typeof loadDesignContext>>) => { body: string; type: string } | null) {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const now = new Date();
  const dctx = await loadDesignContext(db, project, now.toISOString());
  const descriptor = documentDescriptors(project, dctx).find((d) => d.kind === kind);
  if (!descriptor) {
    res.status(404).json({ error: "not_found", message: "Ce document n'est pas productible pour ce projet." });
    return;
  }
  const out = render(dctx);
  if (!out) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await recordProducedDocument(
    db,
    project.id,
    { kind, label: descriptor.label, fileName: descriptor.fileName, modelRevision: descriptor.current.modelRevision, inputHash: descriptor.current.inputHash, stepNumber: descriptor.stepNumber },
    now,
  );
  attachment(res, descriptor.fileName, out.type, out.body);
}

documentsRouter.get("/plan/:levelId", async (req, res) => {
  const levelId = req.params["levelId"] as string;
  await produce(req, res, `plan-lecture-${levelId}`, (dctx) =>
    dctx.analysis.floors.some((f) => f.id === levelId) ? { body: designPlanSvg(dctx.input, dctx.analysis, levelId), type: "image/svg+xml; charset=utf-8" } : null,
  );
});

documentsRouter.get("/surfaces", async (req, res) => {
  await produce(req, res, "tableau-surfaces", (dctx) => ({ body: surfacesCsv(dctx.analysis), type: "text/csv; charset=utf-8" }));
});

documentsRouter.get("/programme", async (req, res) => {
  await produce(req, res, "programme-csv", (dctx) => {
    const a = dctx.steps.programmeCase;
    if (!a) return null;
    // Les colonnes Cas / Type / Sous-type viennent du cas de la bibliothèque quand il existe, sinon du cas appliqué lui-même (cas importé).
    const c = buildingCase(BUILDING_LIBRARY, a.caseId) ?? { title: a.title, type: a.type, subtype: a.subtype };
    return { body: programmeCsv(c, { label: a.scenarioLabel ?? "", spaces: a.spaces as LibrarySpace[] }), type: "text/csv; charset=utf-8" };
  });
});

documentsRouter.get("/fiches", async (req, res) => {
  await produce(req, res, "fiches-espaces-csv", (dctx) => {
    const a = dctx.steps.programmeCase;
    return a ? { body: resolvedSpacesCsv(a.spaces as unknown as Record<string, unknown>[]), type: "text/csv; charset=utf-8" } : null;
  });
});
