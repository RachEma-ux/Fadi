/**
 * Surveillance d'exploitation — consultation par l'administrateur de la plateforme (R.5-03, OPS-08). Monté dans
 * `adminRouter`, donc derrière `requirePlatformRole("admin")` : 404 pour tout non-administrateur, double
 * authentification exigée comme pour le reste de l'administration.
 *
 *   GET /admin/surveillance   observation agrégée (mémoire du processus, noyaux exact et rendu, boucles de fond, jobs
 *                             Studio, file des courriels), règles d'alerte avec leur seuil et sa source — ou « non
 *                             évaluée » —, et résultat de leur évaluation.
 *
 * Lecture seule ; aucune donnée de projet (comptages et durées seulement).
 */
import { Router } from "express";
import { observerSurveillance } from "../../lib/studio-surveillance-db.js";
import { estSourcee, evaluerAlertes, REGLES_ALERTE_STUDIO } from "../../lib/studio-surveillance.js";

export const SCHEMA_SURVEILLANCE = "studio-surveillance/1";

export const adminSurveillanceRouter = Router();

adminSurveillanceRouter.get("/surveillance", async (_req, res) => {
  const observation = await observerSurveillance();
  const resultats = evaluerAlertes(observation);
  res.json({
    schema: SCHEMA_SURVEILLANCE,
    observation,
    regles: REGLES_ALERTE_STUDIO.map((r) => ({ id: r.id, portee: r.portee, description: r.description, mesure: r.mesure, seuil: estSourcee(r.seuil) ? { valeur: r.seuil.valeur, unite: r.seuil.unite, source: r.seuil.source } : { nonEvalue: true, raison: r.seuil.nonEvalue } })),
    resultats,
    alertes: resultats.filter((r) => r.etat === "alerte"),
  });
});
