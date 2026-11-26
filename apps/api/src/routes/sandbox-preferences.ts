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
 *            Depuis l'écran d'administration (26 novembre 2026) : seulement celles que le compte a installées (son
 *            choix, sinon le réglage « installée d'origine » de la plateforme).
 *   GET /extensions/catalogue → { paquets: [{ id, nom, description, version, etat, commandes, outils, panneaux,
 *            installee }] } — fiches, sans code, des extensions ajoutées que la plateforme propose au compte.
 *   PUT /extensions/:id { installee: booléen } → { paquets } ; extension inconnue → 404 ; corps invalide → 400. Le
 *            choix est rangé à part (`packages`) : la Planche, qui réécrit `extensions` en entier, n'y touche pas.
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
import { basculerPaquet, lireChoixPaquets, type ChoixPaquets } from "@parcours/sandbox-planche-model";
import { fichesComptePaquets, paquetsDuCompte } from "../lib/addon-paquets.js";
import { lireLignesPaquets } from "../lib/addon-paquets-lecture.js";

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

/** Choix du compte parmi les extensions ajoutées à la plateforme (colonne `packages`), relu avec tolérance. */
async function choixPaquetsDe(userId: string): Promise<ChoixPaquets> {
  const [ligne] = await db.select({ packages: sandboxToolPreferences.packages }).from(sandboxToolPreferences).where(eq(sandboxToolPreferences.userId, userId)).limit(1);
  return lireChoixPaquets(ligne?.packages);
}

sandboxPreferencesRouter.get("/extensions", async (req, res) => {
  res.json({ extensions: paquetsDuCompte(await lireLignesPaquets(), await choixPaquetsDe(req.user!.id)) });
});

sandboxPreferencesRouter.get("/extensions/catalogue", async (req, res) => {
  res.json({ paquets: fichesComptePaquets(await lireLignesPaquets(), await choixPaquetsDe(req.user!.id)) });
});

sandboxPreferencesRouter.put("/extensions/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const installee = (req.body as { installee?: unknown } | null)?.installee;
  if (typeof installee !== "boolean" || Object.keys(req.body as object).length !== 1) return void res.status(400).json({ error: "invalid_input", detail: "{ installee: booléen }" });
  const lignes = await lireLignesPaquets();
  if (!lignes.some((l) => l.addonId === id)) return void res.status(404).json({ error: "not_found" });
  const choix = basculerPaquet(await choixPaquetsDe(req.user!.id), id, installee, lignes.map((l) => l.addonId));
  await db.insert(sandboxToolPreferences).values({ userId: req.user!.id, packages: { ...choix } })
    .onConflictDoUpdate({ target: sandboxToolPreferences.userId, set: { packages: { ...choix }, updatedAt: new Date() } });
  res.json({ paquets: fichesComptePaquets(lignes, choix) });
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
