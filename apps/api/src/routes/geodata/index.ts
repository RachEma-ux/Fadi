/**
 * API de GeoData (9ᵉ module, ADR-GEODATA-01/02), montée sous `/geodata/api` — la page du client est `/geodata` (repli SPA).
 * Compte connecté exigé (401) ; réponses privées non mises en cache ; `GEODATA_ENABLED=false` ferme tout (404). Aucune
 * route ne prend ni ne lit d'identifiant de projet (GEO 04) : l'espace est toujours celui de l'identité vérifiée, jamais
 * un identifiant reçu du client.
 */
import { Router } from "express";
import { capacitesDe } from "@parcours/geodata-model";
import { requireAuth } from "../../middleware/require-auth.js";
import { espacePersonnel, fondsConfigures, geodataActive, rolesDe } from "../../lib/geodata/acces.js";
import { adminRouter } from "./admin.js";
import { cartesRouter } from "./cartes.js";
import { categoriesRouter } from "./categories.js";
import { consultationRouter } from "./consultation.js";
import { etudesRouter } from "./etudes.js";
import { exportsRouter } from "./exports.js";
import { importsRouter } from "./imports.js";

export const geodataRouter = Router();

geodataRouter.use((_req, res, next) => (geodataActive() ? next() : void res.status(404).json({ error: "not_found", message: "GeoData n'est pas activé sur ce serveur." })));
geodataRouter.use(requireAuth);
geodataRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

/** Espace personnel (créé au premier accès), rôles, capacités et fonds disponibles. */
geodataRouter.get("/espace", async (req, res) => {
  const espace = await espacePersonnel(req.user!.id);
  const roles = await rolesDe(req.user!.id);
  res.json({
    espace: { id: espace.id, type: espace.type, creeLe: espace.cree_le },
    roles, capacites: [...capacitesDe(roles)].sort(),
    fonds: fondsConfigures().map((f) => ({ id: f.id, libelle: f.libelle, type: f.type, tuiles: f.tuiles ?? null, attribution: f.attribution, export: f.export, zoomMax: f.zoomMax ?? null })),
    geocodage: { externe: false, message: "Recherche locale des unités et coordonnées « lon … lat … » ; aucun géocodeur externe n'est configuré." },
  });
});

geodataRouter.use(consultationRouter);
geodataRouter.use(categoriesRouter);
geodataRouter.use(cartesRouter);
geodataRouter.use(etudesRouter);
geodataRouter.use(importsRouter);
geodataRouter.use(exportsRouter);
geodataRouter.use(adminRouter);
