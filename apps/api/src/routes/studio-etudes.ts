/**
 * Études de Studio et leurs variantes, montées sous `/projects/:projectId/studio/etudes`. Le droit est relu à chaque requête
 * (`projectOr404`) : lecture pour consulter, écriture pour créer ; une étude ou une variante d'un autre projet (ou
 * d'une autre étude) reste introuvable.
 */
import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { studioEtudes, studioVariantes } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { projectOr404 } from "../lib/owned-project.js";
import { studioRevisionsRouter } from "./studio-revisions.js";

export const studioEtudesRouter = Router({ mergeParams: true });
studioEtudesRouter.use(requireAuth);
studioEtudesRouter.use("/:etudeId/variantes/:variantId/revisions", studioRevisionsRouter);

type Ligne = typeof studioEtudes.$inferSelect;
const vue = (e: Ligne) => ({ id: e.id, projectId: e.projectId, nom: e.nom, description: e.description, createdAt: e.createdAt, updatedAt: e.updatedAt });

const creation = z.object({
  nom: z.string().trim().min(1, "Nom de l’étude requis").max(120),
  description: z.string().trim().max(2000).optional(),
});

studioEtudesRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db.select().from(studioEtudes).where(eq(studioEtudes.projectId, project.id)).orderBy(asc(studioEtudes.createdAt));
  res.json(rows.map(vue));
});

studioEtudesRouter.post("/", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = creation.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { nom, description = "" } = parsed.data;
  const [doublon] = await db.select({ id: studioEtudes.id }).from(studioEtudes).where(and(eq(studioEtudes.projectId, project.id), sql`lower(${studioEtudes.nom}) = lower(${nom})`)).limit(1);
  if (doublon) {
    res.status(409).json({ error: "conflit", message: `Une étude « ${nom} » existe déjà dans ce projet.` });
    return;
  }
  try {
    const [cree] = await db.insert(studioEtudes).values({ id: newId("etu"), projectId: project.id, nom, description, authorId: req.user!.id }).returning();
    res.status(201).json(vue(cree!));
  } catch (err) {
    // Deux créations simultanées du même nom : l'index unique tranche, la seconde reçoit le même 409.
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code !== "23505") throw err;
    res.status(409).json({ error: "conflit", message: `Une étude « ${nom} » existe déjà dans ce projet.` });
  }
});

studioEtudesRouter.get("/:etudeId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const [etude] = await db.select().from(studioEtudes).where(and(eq(studioEtudes.projectId, project.id), eq(studioEtudes.id, String(req.params["etudeId"])))).limit(1);
  if (!etude) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(vue(etude));
});

type LigneVariante = typeof studioVariantes.$inferSelect;
const vueVariante = (v: LigneVariante) => ({ id: v.id, etudeId: v.etudeId, projectId: v.projectId, nom: v.nom, createdAt: v.createdAt });
const creationVariante = z.object({ nom: z.string().trim().min(1, "Nom de la variante requis").max(120) });

async function etudeDuProjet(projectId: string, etudeId: string) {
  const [etude] = await db.select({ id: studioEtudes.id }).from(studioEtudes).where(and(eq(studioEtudes.projectId, projectId), eq(studioEtudes.id, etudeId))).limit(1);
  return etude ?? null;
}

studioEtudesRouter.get("/:etudeId/variantes", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const etude = await etudeDuProjet(project.id, String(req.params["etudeId"]));
  if (!etude) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rows = await db.select().from(studioVariantes).where(and(eq(studioVariantes.projectId, project.id), eq(studioVariantes.etudeId, etude.id))).orderBy(asc(studioVariantes.createdAt));
  res.json(rows.map(vueVariante));
});

studioEtudesRouter.post("/:etudeId/variantes", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const etude = await etudeDuProjet(project.id, String(req.params["etudeId"]));
  if (!etude) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const parsed = creationVariante.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { nom } = parsed.data;
  const conflit = () => res.status(409).json({ error: "conflit", message: `Une variante « ${nom} » existe déjà dans cette étude.` });
  const [doublon] = await db.select({ id: studioVariantes.id }).from(studioVariantes).where(and(eq(studioVariantes.etudeId, etude.id), sql`lower(${studioVariantes.nom}) = lower(${nom})`)).limit(1);
  if (doublon) {
    conflit();
    return;
  }
  try {
    const [cree] = await db.insert(studioVariantes).values({ id: newId("var"), etudeId: etude.id, projectId: project.id, nom, authorId: req.user!.id }).returning();
    res.status(201).json(vueVariante(cree!));
  } catch (err) {
    const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code !== "23505") throw err;
    conflit();
  }
});

studioEtudesRouter.get("/:etudeId/variantes/:variantId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const [variante] = await db
    .select()
    .from(studioVariantes)
    .where(and(eq(studioVariantes.projectId, project.id), eq(studioVariantes.etudeId, String(req.params["etudeId"])), eq(studioVariantes.id, String(req.params["variantId"]))))
    .limit(1);
  if (!variante) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(vueVariante(variante));
});
