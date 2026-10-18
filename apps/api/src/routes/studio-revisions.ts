/**
 * Révisions d'une variante de Studio, montées sous `/projects/:projectId/studio/etudes/:etudeId/variantes/:variantId/revisions`.
 * Une révision est immuable (déclencheur SQL) ; la créer est une commande : identité et droits relus par le serveur,
 * parenté projet → étude → variante vérifiée, contenu validé en entier (document 2D), `baseRevisionId` comparé à la tête
 * (sinon conflit, jamais d'écrasement), `requestId` rejoué sans double effet.
 */
import { createHash } from "node:crypto";
import express, { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { studio2d } from "@parcours/domain-model";
import { db } from "../db/client.js";
import { studioRevisions, studioVariantes } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { projectOr404 } from "../lib/owned-project.js";

export const studioRevisionsRouter = Router({ mergeParams: true });
studioRevisionsRouter.use(requireAuth);

type Ligne = typeof studioRevisions.$inferSelect;
const entete = (r: Ligne) => ({ id: r.id, varianteId: r.varianteId, numero: r.numero, parentId: r.parentId, documentId: r.documentId, schemaVersion: r.schemaVersion, empreinte: r.empreinte, authorId: r.authorId, createdAt: r.createdAt });
const complete = (r: Ligne) => ({ ...entete(r), contenu: r.contenu });
const empreinte = (contenu: unknown) => `sha256:${createHash("sha256").update(studio2d.canoniserDocument2D(contenu)).digest("hex")}`;

const commande = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  baseRevisionId: z.string().min(1).max(128).nullable(),
  contenu: z.unknown(),
});

/** Variante de l'étude et du projet indiqués ; une combinaison d'identifiants de parents différents est introuvable. */
async function varianteDe(projectId: string, etudeId: string, variantId: string) {
  const [v] = await db.select({ id: studioVariantes.id }).from(studioVariantes).where(and(eq(studioVariantes.projectId, projectId), eq(studioVariantes.etudeId, etudeId), eq(studioVariantes.id, variantId))).limit(1);
  return v ?? null;
}

async function contexte(req: express.Request, res: express.Response, need: "read" | "write") {
  const project = await projectOr404(req, res, need);
  if (!project) return null;
  const variante = await varianteDe(project.id, String(req.params["etudeId"]), String(req.params["variantId"]));
  if (!variante) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return { project, variante };
}

const tete = async (varianteId: string) => (await db.select().from(studioRevisions).where(eq(studioRevisions.varianteId, varianteId)).orderBy(desc(studioRevisions.numero)).limit(1))[0] ?? null;

studioRevisionsRouter.get("/", async (req, res) => {
  const ctx = await contexte(req, res, "read");
  if (!ctx) return;
  const rows = await db.select().from(studioRevisions).where(eq(studioRevisions.varianteId, ctx.variante.id)).orderBy(asc(studioRevisions.numero));
  res.json(rows.map(entete));
});

studioRevisionsRouter.get("/:revisionId", async (req, res) => {
  const ctx = await contexte(req, res, "read");
  if (!ctx) return;
  const [r] = await db.select().from(studioRevisions).where(and(eq(studioRevisions.varianteId, ctx.variante.id), eq(studioRevisions.id, String(req.params["revisionId"])))).limit(1);
  if (!r) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(complete(r));
});

// Un document peut dépasser la limite générale de 256 ko : lecture de corps dédiée (app.ts l'exempte).
studioRevisionsRouter.post("/", express.json({ limit: "2mb" }), async (req, res) => {
  const ctx = await contexte(req, res, "write");
  if (!ctx) return;
  const parsed = commande.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { requestId, baseRevisionId, contenu } = parsed.data;
  const validation = studio2d.validerDocument2D(contenu);
  if (!validation.ok) {
    res.status(400).json({ error: "document_invalide", erreurs: validation.erreurs.slice(0, 50) });
    return;
  }
  const signature = empreinte(validation.contenu);

  // Même requête rejouée (coupure réseau, double envoi) : la révision déjà créée est rendue, sans second effet.
  const rejeu = async () => {
    const [deja] = await db.select().from(studioRevisions).where(and(eq(studioRevisions.varianteId, ctx.variante.id), eq(studioRevisions.requestId, requestId))).limit(1);
    if (!deja) return false;
    if (deja.empreinte !== signature || deja.parentId !== baseRevisionId) res.status(409).json({ error: "requete_reutilisee", message: "Cet identifiant de requête a déjà servi à une autre révision." });
    else res.status(200).json({ ...complete(deja), rejoue: true });
    return true;
  };
  if (await rejeu()) return;

  const courante = await tete(ctx.variante.id);
  if ((courante?.id ?? null) !== baseRevisionId) {
    res.status(409).json({ error: "conflit_revision", message: "Une révision plus récente existe : rien n’a été enregistré.", teteRevisionId: courante?.id ?? null, teteNumero: courante?.numero ?? null });
    return;
  }
  try {
    const [cree] = await db
      .insert(studioRevisions)
      .values({
        id: newId("rev"),
        varianteId: ctx.variante.id,
        projectId: ctx.project.id,
        numero: (courante?.numero ?? 0) + 1,
        parentId: courante?.id ?? null,
        documentId: courante?.documentId ?? newId("doc"),
        requestId,
        schemaVersion: studio2d.SCHEMA_DOCUMENT2D,
        contenu: validation.contenu,
        empreinte: signature,
        authorId: req.user!.id,
      })
      .returning();
    res.status(201).json(complete(cree!));
  } catch (err) {
    const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code !== "23505") throw err;
    // Deux enregistrements simultanés : l'index unique tranche ; le perdant est un rejeu ou un conflit, jamais un écrasement.
    if (await rejeu()) return;
    const gagnante = await tete(ctx.variante.id);
    res.status(409).json({ error: "conflit_revision", message: "Une révision plus récente existe : rien n’a été enregistré.", teteRevisionId: gagnante?.id ?? null, teteNumero: gagnante?.numero ?? null });
  }
});
