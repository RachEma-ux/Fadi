/**
 * Préférences d'outils du Sandbox du compte connecté (lot 5, décision du maître d'ouvrage du 20 octobre 2026), montées
 * sous `/sandbox/preferences` :
 *
 *   GET /  → { profil, barrePersonnelle, favoris, regroupements, format, compte, updatedAt } — préférences du compte (défaut :
 *            profil Standard, rien de choisi, `updatedAt` null tant que rien n'est enregistré) ;
 *   PUT /  { profil, barrePersonnelle, favoris, regroupements } → remplace l'ensemble (idempotent) ; forme invalide →
 *            400 invalid_input ; entrée absente du registre du Sandbox → 400 unknown_entry (entrées nommées).
 *
 * Réservées au compte connecté (401 sinon) ; personnelles, les mêmes sur tous ses appareils ; aucune donnée de projet
 * ni de dessin (le brouillon du Sandbox reste dans le navigateur). Seules routes serveur du Sandbox.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sandboxToolPreferences } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { lireCorpsPreferencesSandbox, reponsePreferences } from "../lib/sandbox-preferences.js";

export const sandboxPreferencesRouter = Router();
sandboxPreferencesRouter.use(requireAuth);
sandboxPreferencesRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

sandboxPreferencesRouter.get("/", async (req, res) => {
  const [ligne] = await db.select().from(sandboxToolPreferences).where(eq(sandboxToolPreferences.userId, req.user!.id)).limit(1);
  res.json(reponsePreferences(req.user!.id, ligne));
});

sandboxPreferencesRouter.put("/", async (req, res) => {
  const lu = lireCorpsPreferencesSandbox(req.body);
  if (!lu.ok) {
    res.status(400).json(lu.body);
    return;
  }
  const valeurs = { ...lu.valeurs, updatedAt: new Date() };
  const [ligne] = await db.insert(sandboxToolPreferences).values({ userId: req.user!.id, ...valeurs })
    .onConflictDoUpdate({ target: sandboxToolPreferences.userId, set: valeurs })
    .returning();
  res.json(reponsePreferences(req.user!.id, ligne));
});
