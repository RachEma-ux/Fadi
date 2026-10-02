/**
 * Verrou d'édition optionnel — « un seul éditeur actif » (plan
 * d'architecture, module Collaboration). Monté sous `/projects/:projectId/lock`.
 *
 *   GET    /   → { lock, yours } : la réservation en cours (null si libre ou expirée)
 *   PUT    /   → réserve l'édition pour soi (ou prolonge sa réservation) : 200 { lock } ;
 *                423 si quelqu'un d'autre la détient encore
 *   DELETE /   → rend la main (le détenteur) ou libère (le propriétaire) : 204
 *
 * Personne n'est obligé de réserver : sans verrou, les écritures sont
 * sérialisées par projet et départagées par version (409). Avec un verrou,
 * toute écriture d'un autre compte est refusée (423, motif et échéance) ;
 * lectures, commentaires, exports et copies restent possibles. Le verrou
 * expire de lui-même (`EDITING_LOCK_MINUTES`) ; le client du détenteur le
 * prolonge tant que le projet reste ouvert.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects, type EditingLock } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { activeLock, EDITING_LOCK_MINUTES, loadProjectAccess, lockedMessage, roleAllows, FORBIDDEN_MESSAGE } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";

export const lockRouter = Router({ mergeParams: true });
lockRouter.use(requireAuth);

const projectIdOf = (params: unknown) => (params as Record<string, string>)["projectId"] ?? "";

lockRouter.get("/", async (req, res) => {
  const access = await loadProjectAccess(projectIdOf(req.params), req.user!.id);
  if (!access) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const lock = activeLock(access);
  res.json({ lock, yours: lock?.userId === req.user!.id });
});

lockRouter.put("/", async (req, res) => {
  const access = await loadProjectAccess(projectIdOf(req.params), req.user!.id);
  if (!access) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!roleAllows(access.role, "write")) {
    res.status(403).json({ error: "forbidden", message: FORBIDDEN_MESSAGE.write, role: access.role });
    return;
  }
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, access.id);
    const [row] = await tx.select({ editingLock: projects.editingLock }).from(projects).where(eq(projects.id, access.id)).limit(1);
    const now = new Date();
    const current = activeLock({ editingLock: row?.editingLock ?? null }, now);
    if (current && current.userId !== req.user!.id) return { locked: current };
    const lock: EditingLock = {
      userId: req.user!.id,
      email: req.user!.email,
      since: current?.since ?? now.toISOString(),
      expiresAt: new Date(now.getTime() + EDITING_LOCK_MINUTES * 60_000).toISOString(),
    };
    await tx.update(projects).set({ editingLock: lock }).where(eq(projects.id, access.id));
    return { lock };
  });
  if ("locked" in result) {
    res.status(423).json({ error: "locked", message: lockedMessage(result.locked), lock: result.locked });
    return;
  }
  res.json({ lock: result.lock, yours: true });
});

lockRouter.delete("/", async (req, res) => {
  const access = await loadProjectAccess(projectIdOf(req.params), req.user!.id);
  if (!access) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const lock = activeLock(access);
  if (!lock) {
    res.status(204).end();
    return;
  }
  if (lock.userId !== req.user!.id && access.role !== "proprietaire") {
    res.status(403).json({ error: "forbidden", message: `Seul ${lock.email} ou le propriétaire du projet peut libérer cette réservation.` });
    return;
  }
  await db.update(projects).set({ editingLock: null }).where(eq(projects.id, access.id));
  res.status(204).end();
});
