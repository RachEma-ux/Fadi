/**
 * API des sites de projet (27 novembre 2026), montée sous `/sites/api` : la base dédiée `sites_*` servie aux trois
 * endroits qui l'utilisent — menu « Sites » de la Planche du Sandbox, bouton « Sites » de GeoData, étape 01 du Parcours
 * (cette dernière passe par sa route de projet, `parcours-steps.ts`, qui vérifie les droits du projet).
 *
 * Compte connecté exigé (401) ; un site n'est visible que de son propriétaire (404 sinon, l'existence n'est jamais
 * révélée) ; la sauvegarde exige la révision attendue (409 si périmée) ; un champ fautif est nommé (400). Les fichiers
 * importés sont archivés tels quels. Réponses privées, jamais mises en cache.
 */
import { Router, type Request, type Response } from "express";
import { fichierSite, GENRES_LIEN, lireFichierSite, validerContenuSite, type ChampSite, type GenreLien, type LienSite } from "@parcours/domain-model";
import { requireAuth } from "../middleware/require-auth.js";
import { archiverFichier, creerSite, lireSite, lierSeul, listerSites, sauvegarderSite, transaction } from "../lib/sites/depot.js";
import { toWgs84 } from "../lib/site-context.js";

export const sitesRouter = Router();
sitesRouter.use(requireAuth);
sitesRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

const MESSAGES: Record<ChampSite | "format" | "lien", string> = {
  nom: "Nom du site : 1 à 120 caractères.",
  nature: "Nature des travaux : construction neuve ou rénovation.",
  lieu: "Lieu : 120 caractères au plus.",
  parcelle: "Parcelle : au moins trois sommets et un système de coordonnées déclaré.",
  observations: "Données du site invalides.",
  altimetrie: "Altimétrie invalide : 1 à 50 points (longitude, latitude, altitude).",
  zone: "Zone indicative invalide : au moins trois points en WGS 84 et une provenance.",
  nord: "Nord vrai : un angle en degrés, avec sa source.",
  altitudeReference: "Altitude de référence : un nombre (m), avec sa source.",
  position: "Position : longitude de −180 à 180, latitude de −90 à 90.",
  format: "Ce fichier n'est pas un fichier de site de projet Fadi.",
  lien: "Lien : genre « planche » ou « zone-geodata » et une cible de 1 à 200 caractères.",
};

const erreur = (res: Response, statut: number, code: string, message: string, extra: Record<string, unknown> = {}) => void res.status(statut).json({ error: code, message, ...extra });
const invalide = (res: Response, champ: keyof typeof MESSAGES) => erreur(res, 400, "invalid_input", MESSAGES[champ], { champs: [champ] });
const introuvable = (res: Response) => erreur(res, 404, "not_found", "Site introuvable.");
const moi = (req: Request) => req.user!.id;

/** Lien demandé par le client : seuls la Planche et la zone GeoData se lient ici (le projet passe par sa route). */
function lienDe(v: unknown): LienSite | null | "invalide" {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") return "invalide";
  const { genre, cible } = v as Record<string, unknown>;
  if ((genre !== "planche" && genre !== "zone-geodata") || typeof cible !== "string" || !cible.trim() || cible.length > 200) return "invalide";
  return { genre, cible: cible.trim() };
}

sitesRouter.get("/sites", async (req, res) => {
  const genre = req.query["genre"];
  const cible = req.query["cible"];
  if (genre !== undefined || cible !== undefined) {
    if (!GENRES_LIEN.includes(genre as GenreLien) || typeof cible !== "string" || !cible) return invalide(res, "lien");
    return void res.json({ sites: await listerSites(moi(req), { genre: genre as GenreLien, cible }) });
  }
  res.json({ sites: await listerSites(moi(req), null) });
});

sitesRouter.get("/sites/:id", async (req, res) => {
  const s = await lireSite(moi(req), req.params["id"]!);
  if (!s) return introuvable(res);
  res.json(s);
});

sitesRouter.post("/sites", async (req, res) => {
  const v = validerContenuSite(req.body);
  if (!v.ok) return invalide(res, v.champ);
  const lien = lienDe((req.body as Record<string, unknown>)["lien"]);
  if (lien === "invalide") return invalide(res, "lien");
  const id = await transaction(async (tx) => {
    const id = await creerSite(moi(req), v.valeur, [], tx);
    if (lien) await lierSeul(moi(req), id, lien, tx);
    return id;
  });
  res.status(201).json(await lireSite(moi(req), id));
});

sitesRouter.put("/sites/:id", async (req, res) => {
  const { revisionAttendue } = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(revisionAttendue)) return erreur(res, 400, "invalid_input", "Révision attendue obligatoire.", { champs: ["revisionAttendue"] });
  const v = validerContenuSite(req.body);
  if (!v.ok) return invalide(res, v.champ);
  const lien = lienDe((req.body as Record<string, unknown>)["lien"]);
  if (lien === "invalide") return invalide(res, "lien");
  const r = await transaction(async (tx) => {
    const r = await sauvegarderSite(moi(req), req.params["id"]!, revisionAttendue as number, v.valeur, tx);
    if (typeof r === "number" && lien) await lierSeul(moi(req), req.params["id"]!, lien, tx);
    return r;
  });
  if (r === null) return introuvable(res);
  if (r === "conflit") return erreur(res, 409, "revision_conflict", "Le site a été modifié ailleurs : rouvrez-le avant de sauvegarder.", { revisionCourante: (await lireSite(moi(req), req.params["id"]!))?.revision ?? null });
  res.json(await lireSite(moi(req), req.params["id"]!));
});

/** Rattacher le site ouvert (Ouvrir un site… dans la Planche) : la Planche suit désormais ce site, en base. */
sitesRouter.post("/sites/:id/lien", async (req, res) => {
  const lien = lienDe((req.body as Record<string, unknown> | undefined)?.["lien"]);
  if (!lien || lien === "invalide") return invalide(res, "lien");
  if (!(await lireSite(moi(req), req.params["id"]!))) return introuvable(res);
  await transaction((tx) => lierSeul(moi(req), req.params["id"]!, lien, tx));
  res.json(await lireSite(moi(req), req.params["id"]!));
});

/** « Sauvegarder sous… » : copie du site sous un autre nom (contenu reçu, ou celui du site s'il n'est pas fourni). */
sitesRouter.post("/sites/:id/copie", async (req, res) => {
  const source = await lireSite(moi(req), req.params["id"]!);
  if (!source) return introuvable(res);
  const corps = (req.body ?? {}) as Record<string, unknown>;
  const v = validerContenuSite({ parcelle: source.parcelle, observations: source.observations, altimetrie: source.altimetrie, zone: source.zone, ...corps, fiche: { ...source.fiche, ...(typeof corps["fiche"] === "object" && corps["fiche"] ? corps["fiche"] : {}) } });
  if (!v.ok) return invalide(res, v.champ);
  if (v.valeur.fiche.nom === source.fiche.nom) return erreur(res, 400, "invalid_input", "Choisissez un autre nom que celui du site ouvert.", { champs: ["nom"] });
  const lien = lienDe(corps["lien"]);
  if (lien === "invalide") return invalide(res, "lien");
  const id = await transaction(async (tx) => {
    const id = await creerSite(moi(req), v.valeur, [], tx);
    if (lien) await lierSeul(moi(req), id, lien, tx);
    return id;
  });
  res.status(201).json(await lireSite(moi(req), id));
});

/** « Importer un site… » : le fichier d'échange est contrôlé, devient un nouveau site et est archivé tel quel. */
sitesRouter.post("/import", async (req, res) => {
  const corps = (req.body ?? {}) as Record<string, unknown>;
  const texte = corps["contenu"];
  const nom = typeof corps["nom"] === "string" ? corps["nom"] : "site.json";
  if (typeof texte !== "string" || texte.length > 2_000_000) return invalide(res, "format");
  let donnees: unknown;
  try {
    donnees = JSON.parse(texte);
  } catch {
    return invalide(res, "format");
  }
  const v = lireFichierSite(donnees);
  if (!v.ok) return invalide(res, v.champ);
  const lien = lienDe(corps["lien"]);
  if (lien === "invalide") return invalide(res, "lien");
  const id = await transaction(async (tx) => {
    const id = await creerSite(moi(req), v.valeur, [], tx);
    if (lien) await lierSeul(moi(req), id, lien, tx);
    await archiverFichier(id, nom, "application/json", Buffer.from(texte, "utf8"), tx);
    return id;
  });
  res.status(201).json(await lireSite(moi(req), id));
});

/** « Exporter le site… » : fiche, parcelle, données du site, altimétrie, zone, et le contour en GeoJSON WGS 84. */
sitesRouter.get("/sites/:id/export", async (req, res) => {
  const s = await lireSite(moi(req), req.params["id"]!);
  if (!s) return introuvable(res);
  const f = fichierSite({ fiche: s.fiche, parcelle: s.parcelle, observations: s.observations, altimetrie: s.altimetrie, zone: s.zone }, toWgs84, new Date().toISOString());
  const nomFichier = `${s.fiche.nom.normalize("NFD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "site"}.site.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${nomFichier}"`);
  res.type("application/json").send(JSON.stringify(f, null, 2));
});
