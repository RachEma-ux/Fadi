/**
 * Module Documents — monté sous `/projects/:projectId/documents` :
 *   GET /                 → catalogue des documents productibles, dernière production et actualité (à jour / périmé)
 *   GET /plan/:levelId    → plan de lecture SVG d'un niveau (`svgPlan` de flow-v62), pièce jointe
 *   GET /surfaces         → tableau des surfaces par niveau et par zone (CSV)
 *   GET /programme        → programme du projet (CSV, `csv` de building-library)
 *   GET /fiches           → fiches d'espaces de l'exemple résolu (CSV, `csv` de p118-resolved-app)
 *   GET /dossier-exemple  → « Dossier complet de l’exemple » (HTML, `fullReport` de p118-resolved-app) — projets issus de l'exemple P.118
 *   POST /dessins         → enregistre un dessin technique / export de l'Atelier (DXF, SVG, PNG, CSV, JSON) avec son niveau,
 *                           sa vue et la révision du modèle courante (corps brut ; en-têtes X-File-Name, X-File-Type, X-Export-Kind,
 *                           X-Export-Level, X-Export-Level-Name, X-Export-View)
 *   GET /dessins/:id      → le fichier enregistré, pièce jointe
 *   DELETE /dessins/:id   → retrait du catalogue
 * Chaque production est enregistrée avec la révision du modèle et
 * l'empreinte des entrées (`produced_documents`).
 */
import { chargerModele } from "../lib/atelier-modele.js";
import { atelierDocumentDescriptors, rendreDocumentAtelier } from "../lib/atelier-documents.js";
import { traitsExternesPour } from "../lib/atelier-refexterne.js";
import { randomUUID } from "node:crypto";
import { raw, Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { atelierCommands, drawingExports, projects } from "../db/schema.js";
import { lockProject } from "../lib/step-rows.js";
import { buildingCase, designPlanSvg, programmeCsv, resolvedSpacesCsv, surfacesCsv, type LibrarySpace } from "@parcours/domain-model";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";
import { BUILDING_LIBRARY } from "../data/parcours.js";
import { loadDesignContext } from "../lib/design-context.js";
import { documentCatalogue, documentDescriptors, recordProducedDocument } from "../lib/documents.js";
import { exampleReportFor } from "../lib/example-report.js";
import { projectOr404, type OwnedProject } from "../lib/owned-project.js";

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
async function produce(req: Request, res: Response, kind: string, render: (dctx: Awaited<ReturnType<typeof loadDesignContext>>, project: OwnedProject) => { body: string; type: string } | null) {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const now = new Date();
  const dctx = await loadDesignContext(db, project, now.toISOString());
  const descriptor = documentDescriptors(project, dctx).find((d) => d.kind === kind);
  if (!descriptor) {
    res.status(404).json({ error: "not_found", message: "Ce document n'est pas productible pour ce projet." });
    return;
  }
  const out = render(dctx, project);
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

documentsRouter.get("/dossier-exemple", async (req, res) => {
  await produce(req, res, "dossier-exemple", (dctx, project) => {
    const html = exampleReportFor(project, dctx);
    return html ? { body: html, type: "text/html; charset=utf-8" } : null;
  });
});

// --- Documents dérivés du modèle typé (lot 5) : vues, feuilles, tableaux, quantités ----------------------------------

async function produceAtelier(req: Request, res: Response, kind: string) {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const now = new Date();
  const charge = await chargerModele(db, project.id);
  const descriptor = atelierDocumentDescriptors(project, charge?.etat ?? null).find((d) => d.kind === kind);
  // Instant de la révision exportée (dernière entrée du journal) : en-tête IFC reproductible.
  const derniere = kind === "atelier-ifc" ? (await db.select({ createdAt: atelierCommands.createdAt }).from(atelierCommands).where(eq(atelierCommands.projectId, project.id)).orderBy(desc(atelierCommands.resultRevision)).limit(1))[0] : undefined;
  // Références externes : traits des publications sources, lus avec les droits du demandeur (R13).
  const externes = charge && /^atelier-(vue|feuille)-/.test(kind) ? await traitsExternesPour(req.user!.id, charge.etat) : [];
  const out = descriptor && charge ? rendreDocumentAtelier(kind, project, charge.etat, derniere?.createdAt.toISOString().replace(/\.\d{3}Z$/, ""), { externes }) : null;
  if (!descriptor || !out) {
    res.status(404).json({ error: "not_found", message: "Ce document n'existe pas (ou plus) dans le modèle de l'Atelier." });
    return;
  }
  await recordProducedDocument(db, project.id, { kind, label: descriptor.label, fileName: descriptor.fileName, modelRevision: descriptor.current.modelRevision, inputHash: descriptor.current.inputHash, stepNumber: descriptor.stepNumber }, now);
  res.setHeader("Content-Type", out.type);
  res.setHeader("Content-Disposition", `attachment; filename="${descriptor.fileName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Model-Revision", String(descriptor.current.modelRevision));
  res.setHeader("X-Input-Hash", descriptor.current.inputHash);
  res.send(out.body);
}

documentsRouter.get("/atelier/modele.ifc", async (req, res) => {
  await produceAtelier(req, res, "atelier-ifc");
});

documentsRouter.get("/atelier/quantites.html", async (req, res) => {
  await produceAtelier(req, res, "atelier-quantites");
});

documentsRouter.get("/atelier/:dossier/:fichier", async (req, res) => {
  const dossier = req.params["dossier"] as string;
  const fichier = req.params["fichier"] as string;
  const m = /^(.+)\.(pdf|dxf|svg|csv)$/.exec(fichier);
  const kind = !m ? null : dossier === "vues" && m[2] !== "csv" ? `atelier-vue-${m[1]}-${m[2]}` : dossier === "feuilles" && m[2] !== "csv" ? `atelier-feuille-${m[1]}-${m[2]}` : dossier === "tableaux" && m[2] === "csv" ? `atelier-tableau-${m[1]}` : null;
  if (!kind) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await produceAtelier(req, res, kind);
});

// --- Dessins techniques et exports de l'Atelier -------------------------------------------------------------------

/** 25 Mo : un PNG 2000 × 1360 ou un DXF du modèle complet tiennent largement. */
const DRAWING_LIMIT = 25 * 1024 * 1024;
const DRAWING_KINDS = new Set(["dxf", "svg", "png", "csv", "json"]);
const EXPORT_ID = /^[0-9a-f-]{36}$/;

function headerText(req: Request, name: string, max: number): string | null {
  const v = req.get(name);
  if (!v) return null;
  const decoded = decodeURIComponent(v).replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return decoded.length ? decoded.slice(0, max) : null;
}

documentsRouter.post("/dessins", raw({ type: () => true, limit: DRAWING_LIMIT }), async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const fileName = headerText(req, "x-file-name", 255);
  const kind = (headerText(req, "x-export-kind", 10) ?? fileName?.split(".").pop() ?? "").toLowerCase();
  if (!fileName || !DRAWING_KINDS.has(kind)) {
    res.status(400).json({ error: "invalid_input", details: { kind: "Export attendu : dxf, svg, png, csv ou json (en-têtes X-File-Name / X-Export-Kind)" } });
    return;
  }
  const content = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (content.length === 0) {
    res.status(400).json({ error: "invalid_input", details: { content: "Fichier vide" } });
    return;
  }
  let view: Record<string, unknown> = {};
  const rawView = req.get("x-export-view");
  if (rawView) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(rawView));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) view = parsed as Record<string, unknown>;
    } catch {
      /* vue illisible : ignorée, l'export reste enregistré */
    }
  }
  const now = new Date();
  const dctx = await loadDesignContext(db, project, now.toISOString());
  const row = {
    id: randomUUID(),
    projectId: project.id,
    kind,
    fileName,
    mime: (req.get("x-file-type") ?? "").replace(/[^\w./+;=-]/g, "").slice(0, 120) || "application/octet-stream",
    content,
    size: content.length,
    levelId: headerText(req, "x-export-level", 80),
    levelName: headerText(req, "x-export-level-name", 120),
    view,
    modelRevision: project.modelRevision,
    nativeHash: dctx.analysis.nativeHash,
    createdBy: req.user!.id,
    createdAt: now,
  };
  await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    await tx.insert(drawingExports).values(row);
    await tx.update(projects).set({ updatedAt: now }).where(eq(projects.id, project.id));
  });
  res.status(201).json({ id: row.id, kind, fileName, size: row.size, levelId: row.levelId, levelName: row.levelName, modelRevision: row.modelRevision, nativeHash: row.nativeHash, createdAt: now.toISOString() });
});

documentsRouter.get("/dessins/:exportId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const id = String((req.params as Record<string, string>)["exportId"] ?? "");
  const row = EXPORT_ID.test(id) ? (await db.select().from(drawingExports).where(and(eq(drawingExports.id, id), eq(drawingExports.projectId, project.id))).limit(1))[0] : undefined;
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${row.fileName.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(row.content);
});

documentsRouter.delete("/dessins/:exportId", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const id = String((req.params as Record<string, string>)["exportId"] ?? "");
  if (!EXPORT_ID.test(id)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const deleted = await db.delete(drawingExports).where(and(eq(drawingExports.id, id), eq(drawingExports.projectId, project.id))).returning({ id: drawingExports.id });
  if (!deleted.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});
