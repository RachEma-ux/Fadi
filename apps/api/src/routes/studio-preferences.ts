/**
 * Préférences d'outils Studio du compte (monté par `studio.ts` sous `/projects/:projectId/studio/preferences`) :
 *
 *   GET /outils → { profil, favoris, personnel, groupes, retires, manifeste, updatedAt } — préférences du compte
 *                 (défaut : standard, aucun favori, aucun regroupement ; `updatedAt` null tant que rien n'est enregistré) ;
 *   PUT /outils { profil, favoris, personnel, groupes? } → remplace l'ensemble (idempotent ; sans `groupes`, les
 *                 regroupements enregistrés restent) ; forme invalide → 400 invalid_input ; outil absent du registre
 *                 STUDIO_TOOLS → 400 unknown_tool (outils nommés) ;
 *   GET /catalogue → { manifeste, role, droits, entrees: [{ toolId, droit, autorise }] } — catalogue autorisé :
 *                 droit réel d'exécution de chaque outil pour ce compte dans ce projet (B.2-06), lecture seule.
 *
 * Personnelles au compte (les mêmes dans tous ses projets) ; le projet de l'adresse doit lui être lisible (sinon
 * même refus que les autres routes Studio). Visibilité dans les barres seulement : ni la disponibilité ni le droit
 * d'exécution ne sont réglés ici (B.2-06, B.2-07) — un lecteur règle ses barres, ses commandes restent refusées.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { STUDIO_MANIFESTE_OUTILS_VERSION } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioToolPreferences } from "../db/schema.js";
import { loadProjectAccess, projectAccessRefusal, type AccessibleProject } from "../lib/owned-project.js";
import { catalogueAutorise, lireCorpsPreferences, lireLignePreferences, motifRefusEcriture } from "../lib/studio-preferences.js";

export const studioPreferencesRouter = Router({ mergeParams: true });

/** Le projet de l'adresse doit être lisible ; sinon la réponse de refus est envoyée et `null` rendu. */
async function accessible(req: Request, res: Response): Promise<AccessibleProject | null> {
  const userId = req.user!.id;
  const projectId = String((req.params as Record<string, string>)["projectId"] ?? "");
  const access = await loadProjectAccess(projectId, userId);
  const refusal = projectAccessRefusal(access, userId, "read");
  if (refusal) { res.status(refusal.status).json(refusal.body); return null; }
  return access;
}
function endpoint(handler: (req: Request, res: Response, access: AccessibleProject) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const access = await accessible(req, res);
      if (access) await handler(req, res, access);
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
  const { profil, favoris, personnel, groupes } = lu.preferences;
  const at = new Date();
  const valeurs = {
    profile: profil, favorites: favoris, personal: personnel, manifestVersion: STUDIO_MANIFESTE_OUTILS_VERSION, updatedAt: at,
    ...(groupes === undefined ? {} : { groups: groupes }),
  };
  const [row] = await db.insert(studioToolPreferences).values({ userId: req.user!.id, ...valeurs })
    .onConflictDoUpdate({ target: studioToolPreferences.userId, set: valeurs })
    .returning();
  res.json({ ...lireLignePreferences(row), retires: [], updatedAt: at.toISOString() });
}));

studioPreferencesRouter.get("/catalogue", endpoint(async (req, res, access) => {
  res.json(catalogueAutorise(motifRefusEcriture(projectAccessRefusal(access, req.user!.id, "modify")), access.role));
}));
