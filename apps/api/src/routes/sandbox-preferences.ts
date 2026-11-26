/**
 * Préférences d'outils du Sandbox du compte connecté (lot 5, décision du maître d'ouvrage du 20 octobre 2026), montées
 * sous `/sandbox/preferences` :
 *
 *   GET /  → { profil, barrePersonnelle, favoris, regroupements, extensions, scripts, format, compte, updatedAt, catalogue } — préférences du compte (défaut :
 *            profil Standard, rien de choisi, `updatedAt` null tant que rien n'est enregistré) ; `catalogue` : état et
 *            réglage d'origine de chaque extension, tels que la plateforme les a réglés (`addon_platform_settings`) ;
 *   PUT /  { profil, barrePersonnelle, favoris, regroupements, extensions?, scripts? } → remplace l'ensemble (idempotent) ; forme
 *            invalide → 400 invalid_input ; entrée absente du registre du Sandbox → 400 unknown_entry (entrées nommées) ;
 *            extension absente de la liste du Sandbox → 400 unknown_extension. `extensions` omis = aucun choix.
 *            `scripts` (« Mes scripts » de l'extension Scripts : texte rangé, jamais exécuté par le serveur) omis = les
 *            scripts déjà enregistrés sont gardés, pour qu'un navigateur resté sur une ancienne version ne les efface pas.
 *
 *   GET /extensions → { extensions: [paquet…] } — extensions installées sur la plateforme (protocole des extensions 1.0,
 *            lot 3) : paquets `fadi-addon/1` importés par l'administrateur (`addon_packages`), fiche, code en texte et
 *            pages. Le navigateur les relit et les exécute dans un espace isolé ; le serveur ne les exécute jamais.
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
import { lireReglagesPlateforme } from "../lib/addons-lecture.js";
import { lirePaquetsServis } from "../lib/addon-paquets-lecture.js";

export const sandboxPreferencesRouter = Router();
sandboxPreferencesRouter.use(requireAuth);
sandboxPreferencesRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

sandboxPreferencesRouter.get("/", async (req, res) => {
  const [ligne] = await db.select().from(sandboxToolPreferences).where(eq(sandboxToolPreferences.userId, req.user!.id)).limit(1);
  res.json(reponsePreferences(req.user!.id, ligne, await lireReglagesPlateforme()));
});

sandboxPreferencesRouter.get("/extensions", async (_req, res) => {
  res.json({ extensions: await lirePaquetsServis() });
});

sandboxPreferencesRouter.put("/", async (req, res) => {
  const lu = lireCorpsPreferencesSandbox(req.body);
  if (!lu.ok) {
    res.status(400).json(lu.body);
    return;
  }
  const valeurs = { ...lu.valeurs, updatedAt: new Date() };
  const { scripts: _scripts, ...sansScripts } = valeurs;
  const [ligne] = await db.insert(sandboxToolPreferences).values({ userId: req.user!.id, ...valeurs })
    .onConflictDoUpdate({ target: sandboxToolPreferences.userId, set: lu.scriptsFournis ? valeurs : sansScripts })
    .returning();
  res.json(reponsePreferences(req.user!.id, ligne, await lireReglagesPlateforme()));
});
