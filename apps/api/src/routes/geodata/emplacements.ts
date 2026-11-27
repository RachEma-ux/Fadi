/**
 * Emplacements enregistrés dans GeoData (bouton « Emplacements Projets » de la carte, 27 novembre 2026) : lieu,
 * latitude, longitude, altitude et nord vrai, au format de l'Emplacement de la Planche, qui les lit pour les ouvrir.
 * L'espace est toujours celui de l'identité vérifiée ; la révision attendue est obligatoire pour modifier (écriture
 * atomique, 409 si périmée). Le journal ne garde jamais de coordonnée.
 */
import { Router, type Request } from "express";
import { validerEmplacementGeoData } from "@parcours/geodata-model";
import { erreur, espacePersonnel, introuvable, journal, requete } from "../../lib/geodata/acces.js";
import { newId } from "../../lib/ids.js";

export const emplacementsRouter = Router();

const espaceDe = async (req: Request) => (await espacePersonnel(req.user!.id)).id;
const COLONNES = "id, lieu, latitude, longitude, altitude, nord, revision, cree_le, modifie_le";
const vue = (e: Record<string, unknown>) => ({
  id: e["id"], lieu: e["lieu"], latitude: e["latitude"], longitude: e["longitude"], altitude: e["altitude"] ?? null, nord: e["nord"],
  revision: e["revision"], creeLe: e["cree_le"], modifieLe: e["modifie_le"],
});
const MESSAGES = {
  lieu: "Lieu de 1 à 120 caractères.",
  latitude: "Latitude : un nombre de −90 à 90.",
  longitude: "Longitude : un nombre de −180 à 180.",
  altitude: "Altitude : un nombre (m), ou rien.",
  nord: "Nord vrai : un angle en degrés, ou rien.",
} as const;

emplacementsRouter.get("/emplacements", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`SELECT ${COLONNES} FROM geodata_emplacements WHERE espace_id = $1 ORDER BY modifie_le DESC, id LIMIT 500`, [espaceId]);
  res.json({ emplacements: lignes.map(vue) });
});

emplacementsRouter.get("/emplacements/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const [e] = await requete(`SELECT ${COLONNES} FROM geodata_emplacements WHERE id = $1 AND espace_id = $2`, [req.params.id, espaceId]);
  if (!e) return introuvable(res);
  res.json(vue(e));
});

emplacementsRouter.post("/emplacements", async (req, res) => {
  const espaceId = await espaceDe(req);
  const v = validerEmplacementGeoData(req.body);
  if (!v.ok) return erreur(res, 400, "invalid_input", MESSAGES[v.champ], { champs: [v.champ] });
  const id = newId("gdempl");
  const e = v.emplacement;
  const [l] = await requete(
    `INSERT INTO geodata_emplacements (id, espace_id, auteur_id, lieu, latitude, longitude, altitude, nord) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLONNES}`,
    [id, espaceId, req.user!.id, e.lieu, e.latitude, e.longitude, e.altitude, e.nord],
  );
  await journal(req.user!.id, "emplacement.cree", id, "succes");
  res.status(201).json(vue(l!));
});

emplacementsRouter.put("/emplacements/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const { revisionAttendue } = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(revisionAttendue)) return erreur(res, 400, "invalid_input", "Révision attendue obligatoire.", { champs: ["revisionAttendue"] });
  const v = validerEmplacementGeoData(req.body);
  if (!v.ok) return erreur(res, 400, "invalid_input", MESSAGES[v.champ], { champs: [v.champ] });
  const [actuel] = await requete(`SELECT revision FROM geodata_emplacements WHERE id = $1 AND espace_id = $2`, [req.params.id, espaceId]);
  if (!actuel) return introuvable(res);
  const e = v.emplacement;
  const [l] = await requete(
    `UPDATE geodata_emplacements SET lieu = $4, latitude = $5, longitude = $6, altitude = $7, nord = $8, revision = revision + 1, modifie_le = now()
      WHERE id = $1 AND espace_id = $2 AND revision = $3 RETURNING ${COLONNES}`,
    [req.params.id, espaceId, revisionAttendue, e.lieu, e.latitude, e.longitude, e.altitude, e.nord],
  );
  if (!l) return erreur(res, 409, "revision_conflict", "L'emplacement a été modifié ailleurs : rechargez-le.", { revisionCourante: actuel["revision"] });
  await journal(req.user!.id, "emplacement.revise", req.params.id, "succes");
  res.json(vue(l));
});

emplacementsRouter.delete("/emplacements/:id", async (req, res) => {
  const espaceId = await espaceDe(req);
  const lignes = await requete(`DELETE FROM geodata_emplacements WHERE id = $1 AND espace_id = $2 RETURNING id`, [req.params.id, espaceId]);
  if (!lignes.length) return introuvable(res);
  await journal(req.user!.id, "emplacement.supprime", req.params.id, "succes");
  res.status(204).end();
});
