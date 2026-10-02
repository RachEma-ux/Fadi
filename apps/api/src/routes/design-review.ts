/**
 * Bilan Harmonie du bâtiment conçu (module Atelier architectural, étapes 10
 * et 11) — `designHTML` / `openReport` / `review` / `reportHTML` / `compassHTML`
 * de flow-v62 et h7-app. Monté sous `/projects/:projectId/design-review`.
 *
 *   GET  /            → analyse vivante du modèle, audit des transmissions, revue archivée, hypothèses, références directionnelles, plans SVG
 *   POST /review      → « Actualiser la revue de conception » (revue archivée sur les entrées courantes, historique de 12)
 *   GET  /rapport     → « Exporter le bilan HTML » (Bilan_Harmonie_Batiment_V7.html, pièce jointe)
 *   PUT  /compass     → « Enregistrer les références » directionnelles (save-compass)
 *   PUT  /observation → « Enregistrer comme observation déclarée » (site-note : contexte extérieur, 20 caractères minimum)
 *   PUT  /elevation   → « Collecter l'altitude indicative du centre » (altitude reçue du service par le navigateur)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { declareSiteObservation, designReviewSnapshot, harmonyFullAssessment, HarmonieError, withCenterElevation } from "@parcours/domain-model";
import { db } from "../db/client.js";
import { projects } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { DESIGN_REPORT_CSS, HARMONY_ENGINE } from "../data/parcours.js";
import { designReportFor, designReviewView, loadDesignContext } from "../lib/design-context.js";
import { projectOr404, type OwnedProject } from "../lib/owned-project.js";
import { designReportHash, recordProducedDocument } from "../lib/documents.js";
import { lockProject } from "../lib/step-rows.js";
import { revisionJournal } from "./collaboration.js";

export const designReviewRouter = Router({ mergeParams: true });
designReviewRouter.use(requireAuth);

/** « Derniers événements » de l'onglet Transmission (flow-v62 : `transmissionV62.events`, 10 derniers) : relus du journal daté du projet (modèle, programme, parcelle, revue, MapTiler), jamais d'un journal séparé. */
const TRANSMISSION_KINDS = new Set(["modele", "programme", "parcelle", "revue", "maptiler"]);
async function transmissionEvents(project: OwnedProject): Promise<{ at: string; kind: string; label: string; detail: string }[]> {
  return (await revisionJournal(project))
    .filter((e) => TRANSMISSION_KINDS.has(e.kind))
    .slice(0, 10)
    .map((e) => ({ at: e.at, kind: e.kind, label: e.label, detail: e.detail }));
}

designReviewRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  res.json({ ...designReviewView(await loadDesignContext(db, project, new Date().toISOString())), events: await transmissionEvents(project), css: DESIGN_REPORT_CSS });
});

/**
 * `review(p)` : la revue de conception archivée est rattachée aux entrées courantes ; l'ancienne rejoint l'historique ;
 * une revue documentaire (analyse automatique, validation humaine non acquise) s'ajoute au dossier Harmony. Aucune
 * réserve n'est levée.
 */
designReviewRouter.post("/review", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const ctx = await loadDesignContext(tx, project, now);
    const assessment = harmonyFullAssessment(HARMONY_ENGINE, ctx.harmony, ctx.input.programmeCase?.type ? { type: ctx.input.programmeCase.type } : null, ctx.input.example, ctx.analysis.nativeHash);
    const snap = designReviewSnapshot(ctx.harmony, ctx.analysis, now, false, assessment);
    const harmony = { ...ctx.harmony, ...snap, updated: now } as unknown as Record<string, unknown>;
    await tx.update(projects).set({ harmony, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return designReviewView(await loadDesignContext(tx, { ...project, harmony }, now));
  });
  res.json({ ...result, events: await transmissionEvents(project) });
});

designReviewRouter.get("/rapport", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const now = new Date();
  const dctx = await loadDesignContext(db, project, now.toISOString());
  await recordProducedDocument(
    db,
    project.id,
    {
      kind: "bilan-batiment",
      label: "Bilan Harmonie du bâtiment conçu (HTML)",
      fileName: "Bilan_Harmonie_Batiment_V7.html",
      modelRevision: project.modelRevision,
      inputHash: designReportHash(dctx),
      stepNumber: 10,
    },
    now,
  );
  const html = designReportFor(dctx, DESIGN_REPORT_CSS);
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
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = compassSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const ctx = await loadDesignContext(tx, project, now);
    const compass = { ...ctx.harmony.compass, ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)), updated: now };
    const harmony = { ...ctx.harmony, compass, updated: now } as unknown as Record<string, unknown>;
    await tx.update(projects).set({ harmony, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return designReviewView(await loadDesignContext(tx, { ...project, harmony }, now));
  });
  res.json({ ...result, events: await transmissionEvents(project) });
});

const observationSchema = z.object({ note: z.string().max(4000) });

/**
 * `site-note` de flow-v62 : l'observation du contexte extérieur, distincte de
 * la simple collecte — voies, masses voisines, date, source, limites. Elle
 * lève la réserve « Contexte extérieur non observé » (avec un
 * géoréférencement) et périme le bilan produit avant elle. Statut toujours
 * « Déclaration utilisateur, non contrôle indépendant » ; aucune collecte
 * MapTiler n'est faite ici.
 */
designReviewRouter.put("/observation", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = observationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  let siteContext;
  try {
    siteContext = declareSiteObservation(parsed.data.note, now, project.siteContext ?? null);
  } catch (err) {
    if (err instanceof HarmonieError) {
      res.status(422).json({ error: "harmonie_rule", message: err.message });
      return;
    }
    throw err;
  }
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    await tx.update(projects).set({ siteContext, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return designReviewView(await loadDesignContext(tx, { ...project, siteContext }, now));
  });
  res.json({ ...result, events: await transmissionEvents({ ...project, siteContext }) });
});

const centerElevationSchema = z.object({ point: z.tuple([z.number(), z.number(), z.number()]) });

/**
 * « Collecter l'altitude indicative du centre » (`collectElevation` de
 * flow-v62) : l'altitude reçue du service par le navigateur est posée sur le
 * contexte extérieur (« service numérique, non relevé topographique ») ;
 * l'observation déclarée est conservée, l'empreinte du bilan change.
 */
designReviewRouter.put("/elevation", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = centerElevationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  let siteContext;
  try {
    siteContext = withCenterElevation(project.siteContext ?? null, parsed.data.point, now);
  } catch (err) {
    if (err instanceof HarmonieError) {
      res.status(422).json({ error: "harmonie_rule", message: err.message });
      return;
    }
    throw err;
  }
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    await tx.update(projects).set({ siteContext, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return designReviewView(await loadDesignContext(tx, { ...project, siteContext }, now));
  });
  res.json({ ...result, events: await transmissionEvents({ ...project, siteContext }) });
});
