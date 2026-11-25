/**
 * Catalogue des extensions — réglages de la plateforme (demande du maître d'ouvrage du 25 novembre 2026, premier lot).
 * Monté dans `adminRouter`, donc derrière `requirePlatformRole("admin")` : 404 pour tout non-administrateur.
 *
 *   GET   /admin/addons       { addons: [{ id, libelle, description, version, etat, activeParDefaut,
 *                             activeParDefautLivre, contenu, reglee, updatedAt, updatedBy }] } — toutes les extensions
 *                             livrées, avec le réglage en vigueur.
 *   PATCH /admin/addons/:id   { etat?: "disponible" | "experimentale" | "retiree", activeParDefaut?: boolean } →
 *                             { addon } ; extension inconnue → 404 ; corps invalide → 400 invalid_input. `retiree`
 *                             retire l'extension à tous les comptes dès leur prochaine lecture des préférences (le
 *                             choix de chacun est gardé et revient si elle est rétablie).
 *
 * Chaque changement réel est journalisé (`admin.addon.updated` : version, réglage avant et après) dans la transaction
 * de l'écriture ; une demande qui ne change rien n'écrit rien.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { extensionSandbox, validerChangementReglage } from "@parcours/sandbox-planche-model";
import { db } from "../../db/client.js";
import { addonPlatformSettings } from "../../db/schema.js";
import { audit, clientIp } from "../../lib/audit.js";
import { ficheAdminAddon, fichesAdminAddons, reglageDeLigne } from "../../lib/addons.js";
import { lireLignesReglages } from "../../lib/addons-lecture.js";

export const adminAddonsRouter = Router();

adminAddonsRouter.get("/addons", async (_req, res) => {
  res.json({ addons: fichesAdminAddons(await lireLignesReglages()) });
});

adminAddonsRouter.patch("/addons/:id", async (req, res) => {
  const x = extensionSandbox(String(req.params["id"]));
  if (!x) return void res.status(404).json({ error: "not_found" });
  const lu = validerChangementReglage(req.body);
  if (!lu.ok) return void res.status(400).json({ error: "invalid_input", detail: lu.detail });
  const ligne = await db.transaction(async (tx) => {
    // Ligne créée au besoin avec le réglage livré (sans effet si elle existe), puis verrouillée : deux administrateurs
    // qui règlent la même extension passent l'un après l'autre, et le journal décrit le vrai « avant ».
    await tx.insert(addonPlatformSettings).values({ addonId: x.id, state: "disponible", defaultActive: x.activeParDefaut, updatedBy: null }).onConflictDoNothing();
    const [actuelle] = await tx.select().from(addonPlatformSettings).where(eq(addonPlatformSettings.addonId, x.id)).for("update");
    const avant = reglageDeLigne(actuelle!);
    const apres = { ...avant, ...lu.reglage };
    if (apres.etat === avant.etat && apres.activeParDefaut === avant.activeParDefaut) return actuelle!;
    const [ecrite] = await tx.update(addonPlatformSettings)
      .set({ state: apres.etat, defaultActive: apres.activeParDefaut, updatedBy: req.user!.id, updatedAt: new Date() })
      .where(eq(addonPlatformSettings.addonId, x.id))
      .returning();
    await audit(tx, { actorId: req.user!.id, action: "admin.addon.updated", target: { type: "addon", id: x.id }, metadata: { version: x.version, avant, apres }, ip: clientIp(req) });
    return ecrite!;
  });
  res.json({ addon: ficheAdminAddon(x, ligne) });
});
