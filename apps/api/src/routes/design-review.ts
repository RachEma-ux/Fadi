/**
 * Bilan Harmonie du bâtiment conçu (module Atelier architectural, étapes 10
 * et 11) — `designHTML` / `openReport` / `review` / `reportHTML` / `compassHTML`
 * de flow-v62 et h7-app. Monté sous `/projects/:projectId/design-review`.
 *
 *   GET  /            → analyse vivante du modèle, audit des transmissions, revue archivée, hypothèses, références directionnelles, plans SVG
 *   POST /review      → « Actualiser la revue de conception » (revue archivée sur les entrées courantes, historique de 12)
 *   GET  /rapport     → « Exporter le bilan HTML » (Bilan_Harmonie_Batiment_V7.html, pièce jointe)
 *   PUT  /compass     → « Enregistrer les références » directionnelles (save-compass)
 */
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { designReviewSnapshot } from "@parcours/domain-model";
import { db } from "../db/client.js";
import { projects } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { DESIGN_REPORT_CSS } from "../data/parcours.js";
import { designReportFor, designReviewView, loadDesignContext } from "../lib/design-context.js";
import { loadOwnedProject, type OwnedProject } from "../lib/owned-project.js";

export const designReviewRouter = Router({ mergeParams: true });
designReviewRouter.use(requireAuth);

async function ownedProjectOr404(req: Request, res: Response): Promise<OwnedProject | null> {
  const project = await loadOwnedProject((req.params as Record<string, string>)["projectId"] ?? "", req.user!.id);
  if (!project) res.status(404).json({ error: "not_found" });
  return project;
}

designReviewRouter.get("/", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  res.json({ ...designReviewView(await loadDesignContext(db, project, new Date().toISOString())), css: DESIGN_REPORT_CSS });
});

/** `review(p)` : la revue de conception archivée est rattachée aux entrées courantes ; l'ancienne rejoint l'historique. Aucune réserve n'est levée. */
designReviewRouter.post("/review", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    const ctx = await loadDesignContext(tx, project, now);
    const snap = designReviewSnapshot(ctx.harmony, ctx.analysis, now, false);
    const harmony = { ...ctx.harmony, ...snap, updated: now } as unknown as Record<string, unknown>;
    await tx.update(projects).set({ harmony, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return designReviewView(await loadDesignContext(tx, { ...project, harmony }, now));
  });
  res.json(result);
});

designReviewRouter.get("/rapport", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const html = designReportFor(await loadDesignContext(db, project, new Date().toISOString()), DESIGN_REPORT_CSS);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Bilan_Harmonie_Batiment_V7.html"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(html);
});

const numberish = z.union([z.number().finite(), z.string().max(40), z.null()]).optional();
const compassSchema = z.object({
  facing: numberish,
  source: z.string().max(1000).optional(),
  facadeReason: z.string().max(1000).optional(),
  date: z.string().max(40).optional(),
  uncertainty: numberish,
  declination: numberish,
  declinationSource: z.string().max(1000).optional(),
  basis: z.enum(["", "magnetic", "geographic", "grid"]).optional(),
  confirmed: z.boolean().optional(),
});

/** `save-compass` : les champs saisis sont conservés tels quels (nombres ou chaînes vides) ; le statut est recalculé par le moteur. */
designReviewRouter.put("/compass", async (req, res) => {
  const project = await ownedProjectOr404(req, res);
  if (!project) return;
  const parsed = compassSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    const ctx = await loadDesignContext(tx, project, now);
    const compass = { ...ctx.harmony.compass, ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)), updated: now };
    const harmony = { ...ctx.harmony, compass, updated: now } as unknown as Record<string, unknown>;
    await tx.update(projects).set({ harmony, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return designReviewView(await loadDesignContext(tx, { ...project, harmony }, now));
  });
  res.json(result);
});
