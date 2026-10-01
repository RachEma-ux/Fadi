/**
 * Module Atelier — magasin du moteur natif. Monté sous
 * `/projects/:projectId/atelier`. Le moteur (apps/web/public/atelier-native)
 * lit et écrit des clés `design.v13.*` au format qui est le sien ; ce
 * routeur les persiste par projet avec une révision par clé :
 *
 * - `GET /store` : toutes les clés du projet avec leur révision ;
 * - `PUT /store/:key` : écriture qui annonce la révision lue
 *   (`expectedRevision`) — refusée (409) si une autre écriture est passée
 *   entre-temps, avec la valeur courante pour que le client puisse garder son
 *   travail sous une forme récupérable ;
 * - `DELETE /store/:key`.
 *
 * Une écriture des domaines qui décrivent le bâtiment (`levels`,
 * `floorDesign`) avance `projects.modelRevision` et régénère la projection
 * `levels` / `architectural_objects` du projet natif actif.
 */
import { Router, json, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { atelierStore, projects } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { loadOwnedProject } from "../lib/owned-project.js";
import { isNativeFloorDesign, isNativeLevelArray, projectNativeModel, replaceProjection } from "../lib/native-projection.js";

export const atelierRouter = Router({ mergeParams: true });
atelierRouter.use(requireAuth);
// Le domaine floorDesign de P.118 pèse ~1,2 Mo : limite dédiée, au-dessus
// de celle de l'API (256 ko), bornée pour autant.
atelierRouter.use(json({ limit: "8mb" }));

const KEY_PATTERN = /^design\.v13\.(registry|activeProject|project\.[A-Za-z0-9_.:-]{1,80}\.[A-Za-z0-9_-]{1,40}(\.backup\.[A-Za-z0-9_.-]{1,40})?)$/;
export const MODEL_DOMAINS = new Set(["levels", "floorDesign", "nativeParcel", "buildingFootprint"]);

const projectIdOf = (req: Request) => (req.params as Record<string, string>)["projectId"] ?? "";

function domainOf(key: string): { nativeId: string; domain: string } | null {
  const m = /^design\.v13\.project\.(.+)\.([A-Za-z0-9_-]+)$/.exec(key);
  return m ? { nativeId: m[1]!, domain: m[2]! } : null;
}

atelierRouter.get("/store", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rows = await db.select().from(atelierStore).where(eq(atelierStore.projectId, project.id));
  const entries: Record<string, unknown> = {};
  const revisions: Record<string, number> = {};
  for (const r of rows) {
    entries[r.key] = r.value;
    revisions[r.key] = r.revision;
  }
  res.json({ entries, revisions, modelRevision: project.modelRevision });
});

const putSchema = z.object({
  value: z.unknown(),
  expectedRevision: z.number().int().min(0).nullable(),
});

atelierRouter.put("/store/:key", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const key = req.params["key"] as string;
  if (!KEY_PATTERN.test(key)) {
    res.status(400).json({ error: "invalid_input", details: { key: "Clé hors du magasin de l'Atelier" } });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.value === undefined) {
    res.status(400).json({ error: "invalid_input", details: parsed.success ? { value: "Valeur requise" } : parsed.error.flatten() });
    return;
  }
  const value = parsed.data.value;
  const expected = parsed.data.expectedRevision;

  const result = await db.transaction(async (tx) => {
    const existing = (await tx.select().from(atelierStore).where(and(eq(atelierStore.projectId, project.id), eq(atelierStore.key, key))).limit(1))[0];
    const current = existing?.revision ?? 0;
    if ((expected ?? 0) !== current) {
      return { conflict: true as const, revision: current, value: existing?.value ?? null };
    }
    const revision = current + 1;
    await tx
      .insert(atelierStore)
      .values({ projectId: project.id, key, value, revision, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [atelierStore.projectId, atelierStore.key], set: { value, revision, updatedAt: new Date() } });

    let modelRevision = project.modelRevision;
    const d = domainOf(key);
    if (d && MODEL_DOMAINS.has(d.domain)) {
      modelRevision = project.modelRevision + 1;
      await tx.update(projects).set({ modelRevision, updatedAt: new Date() }).where(eq(projects.id, project.id));
      if (d.domain === "levels" || d.domain === "floorDesign") {
        // Projection dérivée : niveaux + objets du projet natif actif.
        const active = (await tx.select().from(atelierStore).where(and(eq(atelierStore.projectId, project.id), eq(atelierStore.key, "design.v13.activeProject"))).limit(1))[0]?.value;
        if (active === d.nativeId) {
          const read = async (domain: string) => (key.endsWith(`.${domain}`) ? value : (await tx.select().from(atelierStore).where(and(eq(atelierStore.projectId, project.id), eq(atelierStore.key, `design.v13.project.${d.nativeId}.${domain}`))).limit(1))[0]?.value);
          const nativeLevels = await read("levels");
          const floorDesign = await read("floorDesign");
          if (isNativeLevelArray(nativeLevels) && isNativeFloorDesign(floorDesign)) {
            await replaceProjection(tx, project.id, projectNativeModel(project.id, nativeLevels, floorDesign, modelRevision));
          }
        }
      }
    } else {
      await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, project.id));
    }
    return { conflict: false as const, revision, modelRevision };
  });

  if (result.conflict) {
    res.status(409).json({ error: "conflict", revision: result.revision, value: result.value });
    return;
  }
  res.json({ key, revision: result.revision, modelRevision: result.modelRevision });
});

atelierRouter.delete("/store/:key", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const key = req.params["key"] as string;
  await db.delete(atelierStore).where(and(eq(atelierStore.projectId, project.id), eq(atelierStore.key, key)));
  res.status(204).end();
});
