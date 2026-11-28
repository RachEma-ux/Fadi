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
 *   POST /fichiers, GET /fichiers, GET /fichiers/:id — protocole des extensions 1.2 : fichiers de données ouverts
 *            par une extension (table de règles, bibliothèque de types), archivés tels quels en base
 *            (`sandbox_fichiers_extensions`, voir plus bas).
 *
 * Réservées au compte connecté (401 sinon) ; personnelles, les mêmes sur tous ses appareils ; aucune donnée de projet
 * ni de dessin (le brouillon du Sandbox reste dans le navigateur). Seules routes serveur du Sandbox.
 */
import express, { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sandboxToolPreferences } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { lireCorpsPreferencesSandbox, reponsePreferences } from "../lib/sandbox-preferences.js";
import { lireReglagesPlateforme } from "../lib/addons-lecture.js";
import { basculerPaquet, extensionSandbox, lireChoixPaquets, reglageEnVigueur, type ChoixPaquets } from "@parcours/sandbox-planche-model";
import { fichesComptePaquets, paquetsDuCompte } from "../lib/addon-paquets.js";
import { lireLignesPaquets } from "../lib/addon-paquets-lecture.js";
import { archiverFichierExtension, BORNES_ARCHIVE, estNomArchive, lireArchive, lireOctetsArchive, listerArchives } from "../lib/sandbox-fichiers.js";

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

/** Version d'une extension livrée du Sandbox si elle est active pour le compte (son choix, sinon le réglage de la plateforme). */
/**
 * Fichiers de données du cœur de la Planche (cas 2, lots 4 et 6, 27 novembre 2026) : un gabarit d'agence, un fichier
 * importé (IFC, OBJ) et son rapport d'échange sont rangés tels quels en base pour le compte, sous cet identifiant réservé, avec la version de son format.
 */
export const FICHIERS_DU_COEUR: Readonly<Record<string, string>> = { "planche-gabarit": "fadi-gabarit/1", "planche-echange": "fadi-echange/1", "planche-composant": "fadi-composant/1" };

async function versionExtensionLivreeActive(userId: string, id: string): Promise<string | null> {
  const x = extensionSandbox(id);
  if (!x) return null;
  const reglage = reglageEnVigueur(x, await lireReglagesPlateforme());
  if (reglage.etat === "retiree") return null;
  const [ligne] = await db.select({ extensions: sandboxToolPreferences.extensions }).from(sandboxToolPreferences).where(eq(sandboxToolPreferences.userId, userId)).limit(1);
  const choix = (ligne?.extensions ?? {}) as Readonly<Record<string, boolean>>;
  return (choix[id] ?? reglage.activeParDefaut) ? x.version : null;
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

/**
 * Protocole des extensions 1.2 (27 novembre 2026) — fichiers de données ouverts par une extension, archivés tels quels :
 *   POST /fichiers { extension, nom, contenu (octets du fichier en base 64) } → 201 { archive } (200 si ce même fichier était déjà rangé) ; extension
 *        que le compte n'a pas installée → 404 ; forme invalide ou texte non UTF-8 → 400 ; plus de 200 000 caractères
 *        ou de 800 000 octets → 413. Les octets sont rangés tels quels (marque d'ordre comprise) et l'empreinte est la leur.
 *   GET  /fichiers[?extension=…] → { archives: [{ id, extension, version, nom, taille, empreinte, ajouteLe }] }
 *   GET  /fichiers/:id → l'archive, ses octets tels qu'ils ont été rangés (`contenu`, base 64) et leur `texte` ; 404 si elle
 *        n'est pas au compte.
 */
// Corps lu ici (limite dédiée, app.ts l'exempte de la limite générale de 256 ko) : les octets d'un fichier de
// 200 000 caractères peuvent dépasser 256 ko une fois en base 64.
sandboxPreferencesRouter.post("/fichiers", express.json({ limit: BORNES_ARCHIVE.corps }), async (req, res) => {
  const corps = req.body as Record<string, unknown> | null;
  const { extension, nom, contenu } = corps ?? {};
  if (!corps || typeof corps !== "object" || Object.keys(corps).some((k) => !["extension", "nom", "contenu"].includes(k)) || typeof extension !== "string" || !/^[a-z0-9-]{1,40}$/.test(extension) || !estNomArchive(nom)) {
    return void res.status(400).json({ error: "invalid_input", detail: `{ extension, nom (${BORNES_ARCHIVE.nom} caractères au plus, sans chemin), contenu (base 64) }` });
  }
  const octets = lireOctetsArchive(contenu);
  if (!octets.ok) return void res.status(octets.statut).json({ error: octets.statut === 413 ? "too_large" : "invalid_input", detail: octets.detail });
  // Seule une extension que ce compte a installée (paquet) ou activée (extension livrée du Sandbox, par exemple « Contrôle
  // et nettoyage » pour ses fichiers de règles des pièces du permis) peut faire archiver ; sa version est gardée avec le fichier.
  const paquet = paquetsDuCompte(await lireLignesPaquets(), await choixPaquetsDe(req.user!.id)).find((p) => p.fiche.id === extension);
  const version = paquet?.fiche.version ?? FICHIERS_DU_COEUR[extension] ?? (await versionExtensionLivreeActive(req.user!.id, extension));
  if (!version) return void res.status(404).json({ error: "not_found" });
  const { archive, deja } = await archiverFichierExtension(req.user!.id, extension, version, nom, octets.octets);
  res.status(deja ? 200 : 201).json({ archive });
});

sandboxPreferencesRouter.get("/fichiers", async (req, res) => {
  const extension = req.query["extension"];
  if (extension !== undefined && (typeof extension !== "string" || !/^[a-z0-9-]{1,40}$/.test(extension))) return void res.status(400).json({ error: "invalid_input" });
  res.json({ archives: await listerArchives(req.user!.id, typeof extension === "string" ? extension : null) });
});

sandboxPreferencesRouter.get("/fichiers/:id", async (req, res) => {
  const archive = await lireArchive(req.user!.id, String(req.params["id"]));
  if (!archive) return void res.status(404).json({ error: "not_found" });
  res.json(archive);
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
