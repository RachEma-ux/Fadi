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
 *
 * Extensions installées (protocole des extensions 1.0, lot 3) — paquets `fadi-addon/1` rangés en base, sans écran pour
 * l'instant :
 *
 *   GET    /admin/addons/paquets       { paquets: [{ id, nom, description, version, auteur, protocole, permissions,
 *                                      commandes, outils, panneaux, servie, importedAt, importedBy }] } — sans code.
 *   POST   /admin/addons/paquets       corps = le paquet (1,3 Mo au plus) → 201 { paquet } (200 s'il remplace une
 *                                      extension de même identifiant) ; refus → 400 { error: "invalid_package", motif,
 *                                      detail } : forme_invalide, hors_bornes, version_non_prise_en_charge,
 *                                      identifiant_reserve, raccourci_refuse, icone_invalide.
 *   DELETE /admin/addons/paquets/:id   → 204 ; inconnue → 404. Les comptes ne la reçoivent plus dès leur prochaine
 *                                      lecture.
 *
 * Import et retrait sont journalisés (`admin.addon.package.imported`, `admin.addon.package.removed`) dans la transaction
 * de l'écriture. Le serveur valide et range un paquet ; il ne l'exécute jamais.
 */
import express, { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { BORNES_EXTENSION, extensionSandbox, jugerImportPaquet, validerChangementReglage } from "@parcours/sandbox-planche-model";
import { db } from "../../db/client.js";
import { addonPackages, addonPlatformSettings } from "../../db/schema.js";
import { fichesAdminPaquets, paquetsDeLignes } from "../../lib/addon-paquets.js";
import { lireLignesPaquets } from "../../lib/addon-paquets-lecture.js";
import { audit, clientIp } from "../../lib/audit.js";
import { ficheAdminAddon, fichesAdminAddons, reglageDeLigne } from "../../lib/addons.js";
import { lireLignesReglages } from "../../lib/addons-lecture.js";

export const adminAddonsRouter = Router();

adminAddonsRouter.get("/addons", async (_req, res) => {
  res.json({ addons: fichesAdminAddons(await lireLignesReglages()) });
});

adminAddonsRouter.get("/addons/paquets", async (_req, res) => {
  res.json({ paquets: fichesAdminPaquets(await lireLignesPaquets()) });
});

/** Le paquet entier tient en 1 000 000 de caractères (bornes du protocole) ; marge pour l'échappement JSON. */
export const LIMITE_CORPS_PAQUET = Math.ceil(BORNES_EXTENSION.paquet * 1.3);
const corpsPaquet = express.json({ limit: LIMITE_CORPS_PAQUET });

adminAddonsRouter.post("/addons/paquets", corpsPaquet, async (req, res) => {
  const resultat = await db.transaction(async (tx) => {
    // Un import à la fois : le jugement des raccourcis lit les autres extensions installées.
    await tx.execute(sql`LOCK TABLE addon_packages IN SHARE ROW EXCLUSIVE MODE`);
    const lignes = await tx.select().from(addonPackages);
    const jugement = jugerImportPaquet(req.body, paquetsDeLignes(lignes));
    if (!jugement.ok) return jugement;
    const p = jugement.paquet;
    const remplace = lignes.find((l) => l.addonId === p.fiche.id);
    const valeurs = { version: p.fiche.version, package: p as unknown as Record<string, unknown>, importedBy: req.user!.id, importedAt: new Date() };
    const [ecrite] = await tx.insert(addonPackages).values({ addonId: p.fiche.id, ...valeurs }).onConflictDoUpdate({ target: addonPackages.addonId, set: valeurs }).returning();
    await audit(tx, {
      actorId: req.user!.id,
      action: "admin.addon.package.imported",
      target: { type: "addon", id: p.fiche.id },
      metadata: { version: p.fiche.version, versionRemplacee: remplace?.version ?? null, auteur: p.fiche.auteur, protocole: p.fiche.protocole, permissions: [...p.fiche.permissions], commandes: p.fiche.commandes.length },
      ip: clientIp(req),
    });
    return { ok: true as const, ligne: ecrite!, remplace: remplace !== undefined };
  });
  if (!resultat.ok) return void res.status(400).json({ error: "invalid_package", motif: resultat.erreur, detail: resultat.detail });
  res.status(resultat.remplace ? 200 : 201).json({ paquet: fichesAdminPaquets([resultat.ligne])[0] });
});

adminAddonsRouter.delete("/addons/paquets/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const retiree = await db.transaction(async (tx) => {
    const [ligne] = await tx.delete(addonPackages).where(eq(addonPackages.addonId, id)).returning();
    if (!ligne) return false;
    await audit(tx, { actorId: req.user!.id, action: "admin.addon.package.removed", target: { type: "addon", id }, metadata: { version: ligne.version }, ip: clientIp(req) });
    return true;
  });
  if (!retiree) return void res.status(404).json({ error: "not_found" });
  res.status(204).end();
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
