/**
 * Préférences d'outils Studio du compte (monté par `studio.ts` sous `/projects/:projectId/studio/preferences`) :
 *
 *   GET /outils → { profil, favoris, personnel, retires, updatedAt } — préférences du compte (défaut : standard,
 *                 aucun favori ; `updatedAt` null tant que rien n'est enregistré) ;
 *   PUT /outils { profil, favoris, personnel } → remplace l'ensemble (idempotent) ; forme invalide → 400
 *                 invalid_input ; outil absent du registre STUDIO_TOOLS → 400 unknown_tool (outils nommés).
 *
 * Personnelles au compte (les mêmes dans tous ses projets) ; le projet de l'adresse doit lui être lisible (sinon
 * même refus que les autres routes Studio). Visibilité dans les barres seulement : ni la disponibilité ni le droit
 * d'exécution ne sont réglés ici (B.2-06, B.2-07) — un lecteur règle ses barres, ses commandes restent refusées.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { studioToolPreferences } from "../db/schema.js";
import { loadProjectAccess, projectAccessRefusal } from "../lib/owned-project.js";
import { lireCorpsPreferences, lireLignePreferences } from "../lib/studio-preferences.js";

export const studioPreferencesRouter = Router({ mergeParams: true });

/** Le projet de l'adresse doit être lisible ; sinon la réponse de refus est envoyée et `false` rendu. */
async function accessible(req: Request, res: Response): Promise<boolean> {
  const userId = req.user!.id;
  const projectId = String((req.params as Record<string, string>)["projectId"] ?? "");
  const refusal = projectAccessRefusal(await loadProjectAccess(projectId, userId), userId, "read");
  if (refusal) { res.status(refusal.status).json(refusal.body); return false; }
  return true;
}
function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      if (await accessible(req, res)) await handler(req, res);
    } catch (error) { next(error); }
  };
}

studioPreferencesRouter.get("/outils", endpoint(async (req, res) => {
  const [row] = await db.select().from(studioToolPreferences).where(eq(studioToolPreferences.userId, req.user!.id)).limit(1);
  res.json({ ...lireLignePreferences(row), updatedAt: row ? row.updatedAt.toISOString() : null });
}));

studioPreferencesRouter.put("/outils", endpoint(async (req, res) => {
  const lu = lireCorpsPreferences(req.body);
  if (!lu.ok) { res.status(400).json(lu.body); return; }
  const { profil, favoris, personnel } = lu.preferences;
  const at = new Date();
  const valeurs = { profile: profil, favorites: favoris, personal: personnel, updatedAt: at };
  await db.insert(studioToolPreferences).values({ userId: req.user!.id, ...valeurs })
    .onConflictDoUpdate({ target: studioToolPreferences.userId, set: valeurs });
  res.json({ profil, favoris, personnel, retires: [], updatedAt: at.toISOString() });
}));
