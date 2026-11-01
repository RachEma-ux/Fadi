/**
 * Administration des données GeoData (concept § 3, plan GD-03) : préparer (gestionnaire de données), publier ou retirer
 * (responsable de publication), attribuer les rôles (administrateur GeoData). Trois capacités séparées, attribuées dans
 * `geodata_roles` ; aucun rôle de projet ni de plateforme n'en donne. La publication exige des contrôles réussis et des
 * droits de consultation et de tuiles autorisés : un droit inconnu bloque la publication (concept § 7.2).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { estRoleGeoData, lireDroits, lireQualification, qualificationAdmise, verifierUsage, type Capacite } from "@parcours/geodata-model";
import { capacites, erreur, introuvable, journal, requete } from "../../lib/geodata/acces.js";
import { sourcesProvisoiresAdmises } from "../../lib/geodata/provisoires.js";
import { COLONNES_VERSION, lireVersion } from "./consultation.js";

export const adminRouter = Router();

const exiger = (...c: Capacite[]) => async (req: Request, res: Response, next: NextFunction) => {
  const caps = await capacites(req.user!.id);
  if (!c.some((x) => caps.has(x))) {
    await journal(req.user!.id, "admin.refuse", req.path, "refus", { capacites: c });
    return erreur(res, 403, "forbidden", "Rôle GeoData requis pour cette action.");
  }
  next();
};

adminRouter.get("/admin/versions", exiger("preparer-version", "publier-version"), async (_req, res) => {
  const lignes = await requete(`SELECT ${COLONNES_VERSION}, v.preparee_le, (SELECT count(*) FROM geodata_couches c WHERE c.version_id = v.id) AS couches
    FROM geodata_versions v JOIN geodata_sources s ON s.id = v.source_id WHERE v.espace_id IS NULL ORDER BY v.preparee_le DESC LIMIT 200`);
  res.json({ versions: lignes.map((l) => ({ ...lireVersion(l), prepareeLe: l["preparee_le"], couches: Number(l["couches"]) })) });
});

adminRouter.post("/admin/versions/:id/publier", exiger("publier-version"), async (req, res) => {
  const [v] = await requete(`SELECT id, etat, droits, controles, qualification, qualification_motif, qualification_decision FROM geodata_versions WHERE id = $1 AND espace_id IS NULL`, [String(req.params["id"])]);
  if (!v) return introuvable(res);
  if (v["etat"] !== "preparation") return erreur(res, 409, "deja_publiee", "Seule une version en préparation se publie.", { etat: v["etat"] });
  const motifs: string[] = [];
  const droits = lireDroits(v["droits"]);
  for (const u of ["consultation", "tuiles"] as const) { const d = verifierUsage(droits, u); if (!d.ok) motifs.push(d.motif); }
  if ((v["controles"] as Record<string, unknown>)?.["ok"] !== true) motifs.push("Contrôles de qualité non réussis.");
  // Source provisoire (D-GD-54) : publiée seulement sur un environnement qui admet les sources provisoires.
  const q = qualificationAdmise(lireQualification(v["qualification"], v["qualification_motif"], v["qualification_decision"]), sourcesProvisoiresAdmises());
  if (!q.ok) motifs.push(q.motif);
  if (motifs.length) {
    await journal(req.user!.id, "version.publication_refusee", String(req.params["id"]), "refus", { motifs });
    return erreur(res, 409, "publication_bloquee", "Publication bloquée.", { motifs });
  }
  await requete(`UPDATE geodata_versions SET etat = 'publiee', publiee_par = $2, publiee_le = now() WHERE id = $1`, [String(req.params["id"]), req.user!.id]);
  await journal(req.user!.id, "version.publiee", String(req.params["id"]), "succes");
  res.json({ id: String(req.params["id"]), etat: "publiee" });
});

adminRouter.post("/admin/versions/:id/retirer", exiger("publier-version"), async (req, res) => {
  const { motif } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof motif !== "string" || motif.trim().length < 3 || motif.length > 500) return erreur(res, 400, "invalid_input", "Motif de retrait obligatoire (3 à 500 caractères).", { champs: ["motif"] });
  const lignes = await requete(`UPDATE geodata_versions SET etat = 'retiree', retiree_le = now(), motif_retrait = $2 WHERE id = $1 AND espace_id IS NULL AND etat = 'publiee' RETURNING id`, [String(req.params["id"]), motif.trim()]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "version.retiree", String(req.params["id"]), "succes");
  res.json({ id: String(req.params["id"]), etat: "retiree" });
});

adminRouter.get("/admin/roles", exiger("gerer-roles"), async (_req, res) => {
  const lignes = await requete(`SELECT r.user_id, r.role, r.attribue_le, u.email FROM geodata_roles r JOIN users u ON u.id = r.user_id ORDER BY u.email, r.role`);
  res.json({ roles: lignes.map((l) => ({ userId: l["user_id"], email: l["email"], role: l["role"], attribueLe: l["attribue_le"] })) });
});

adminRouter.put("/admin/roles/:userId/:role", exiger("gerer-roles"), async (req, res) => {
  if (!estRoleGeoData(String(req.params["role"]))) return erreur(res, 400, "invalid_input", "Rôle GeoData inconnu.", { champs: ["role"] });
  const [u] = await requete(`SELECT id FROM users WHERE id = $1`, [String(req.params["userId"])]);
  if (!u) return introuvable(res);
  await requete(`INSERT INTO geodata_roles (user_id, role, attribue_par) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [String(req.params["userId"]), String(req.params["role"]), req.user!.id]);
  await journal(req.user!.id, "role.attribue", String(req.params["userId"]), "succes", { role: String(req.params["role"]) });
  res.json({ userId: String(req.params["userId"]), role: String(req.params["role"]) });
});

adminRouter.delete("/admin/roles/:userId/:role", exiger("gerer-roles"), async (req, res) => {
  const lignes = await requete(`DELETE FROM geodata_roles WHERE user_id = $1 AND role = $2 RETURNING user_id`, [String(req.params["userId"]), String(req.params["role"])]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "role.retire", String(req.params["userId"]), "succes", { role: String(req.params["role"]) });
  res.status(204).end();
});
