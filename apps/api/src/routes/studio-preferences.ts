/**
 * Préférences d'outils Studio du compte (monté par `studio.ts` sous `/projects/:projectId/studio/preferences`) :
 *
 *   GET /outils → { profil, favoris, personnel, groupes, raccourcis, ordre, profileId, proprietaire, version, importeDe,
 *                 retires, manifeste, updatedAt } — préférences et profil persistant du compte (défaut : standard,
 *                 aucun favori, aucun regroupement, version 0 ; `updatedAt` null tant que rien n'est enregistré) ;
 *   PUT /outils { profil, favoris, personnel, groupes?, raccourcis?, ordre? } → remplace l'ensemble (sans `groupes`,
 *                 `raccourcis` ou `ordre`, les valeurs enregistrées restent) ; version +1 ; forme invalide → 400
 *                 invalid_input ; capacité absente du registre → 400 unknown_tool ; raccourcis en conflit → 409
 *                 shortcut_conflict ; capacité exigeant un droit absent → 403 permission_non_conferee ;
 *   GET /outils/export → fichier de profil `fadi-studio-profil/1` (EX-034) ;
 *   POST /outils/import { profil, resolution? } → importe un fichier de profil (EX-033, EX-034, INV-009) : aucun droit
 *                 conféré (403 permission_non_conferee, rien d'écrit), conflits de raccourcis détectés et nommés (409
 *                 shortcut_conflict, rien d'écrit ; `resolution: "ecarter"` importe sans eux, rendus dans `ecartes`),
 *                 version +1, provenance gardée (`importeDe`), propriétaire = le compte qui importe ;
 *   GET /catalogue → { manifeste, role, droits, entrees: [{ toolId, droit, autorise }] } — catalogue autorisé :
 *                 droit réel d'exécution de chaque outil pour ce compte dans ce projet (B.2-06), lecture seule.
 *                 Droit au niveau du PROJET : l'archivage d'une étude ou d'une variante n'y figure pas ; il reste
 *                 refusé à l'écriture (409 archived) et affiché par l'espace de travail de la variante.
 *
 * Personnelles au compte (les mêmes dans tous ses projets) ; le projet de l'adresse doit lui être lisible (sinon
 * même refus que les autres routes Studio). Visibilité dans les barres seulement : ni la disponibilité ni le droit
 * d'exécution ne sont réglés ici (B.2-06, B.2-07) — un lecteur règle ses barres, ses commandes restent refusées.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { STUDIO_MANIFESTE_OUTILS_VERSION } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioToolPreferences } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { accessAllows, loadProjectAccess, projectAccessRefusal, type AccessibleProject } from "../lib/owned-project.js";
import { catalogueAutorise, lireCorpsPreferences, lireLignePreferences, motifRefusEcriture } from "../lib/studio-preferences.js";
import {
  capacitesInconnues, capacitesSansDroit, conflitsRaccourcis, ecarterConflits, estCapacite, importProfilSchema, profilExporteSchema, STUDIO_FORMAT_PROFIL,
  type ConflitRaccourci,
} from "../lib/studio-profils.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_CATALOGUE_OUTILS, CONTRAT_PREFERENCES_ECRIRE, CONTRAT_PREFERENCES_LIRE, CONTRAT_PROFIL_EXPORTER, CONTRAT_PROFIL_IMPORTER } from "../lib/studio-contrats-routes.js";

export const studioPreferencesRouter = Router({ mergeParams: true });

/** Le projet de l'adresse doit être lisible ; sinon la réponse de refus est envoyée et `null` rendu. */
async function accessible(req: Request, res: Response): Promise<AccessibleProject | null> {
  const userId = req.user!.id;
  const projectId = String((req.params as Record<string, string>)["projectId"] ?? "");
  const access = await loadProjectAccess(projectId, userId);
  const refusal = projectAccessRefusal(access, userId, "read");
  if (refusal) { res.status(refusal.status).json(refusal.body); return null; }
  return access;
}
function endpoint(handler: (req: Request, res: Response, access: AccessibleProject) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const access = await accessible(req, res);
      if (access) await handler(req, res, access);
    } catch (error) { next(error); }
  };
}

const ligneDu = async (userId: string) => (await db.select().from(studioToolPreferences).where(eq(studioToolPreferences.userId, userId)).limit(1))[0];
/** Droits réels du compte pour les capacités hors registre (EX-033 : un profil n'en confère aucun). */
const droitsDe = (access: AccessibleProject) => ({ publish: accessAllows(access, "publish"), approve: accessAllows(access, "approve") });
const refusDroit = (res: Response, capacites: string[]) => res.status(403).json({
  error: "permission_non_conferee", capacites,
  message: "Un profil ne confère aucun droit : ce profil place une capacité que votre compte ne peut pas exécuter dans ce projet. Rien n'a été enregistré.",
});
const refusConflit = (res: Response, conflits: ConflitRaccourci[]) => res.status(409).json({
  error: "shortcut_conflict", conflits,
  message: "Raccourcis personnels en conflit : rien n'a été enregistré. Résolvez les conflits, ou importez sans les raccourcis en conflit.",
});

studioPreferencesRouter.get("/outils", avecContrat(CONTRAT_PREFERENCES_LIRE), endpoint(async (req, res) => {
  const row = await ligneDu(req.user!.id);
  res.json({ ...lireLignePreferences(row), updatedAt: row ? row.updatedAt.toISOString() : null });
}));

studioPreferencesRouter.put("/outils", avecContrat(CONTRAT_PREFERENCES_ECRIRE), endpoint(async (req, res, access) => {
  const lu = lireCorpsPreferences(req.body);
  if (!lu.ok) { res.status(400).json(lu.body); return; }
  const { profil, favoris, personnel, groupes, raccourcis, ordre } = lu.preferences;
  const hors = [...(ordre ?? []), ...Object.keys(raccourcis ?? {})].filter((id) => !estCapacite(id));
  if (hors.length) { res.status(400).json({ error: "unknown_tool", message: "Outil absent du registre de Studio.", tools: [...new Set(hors)] }); return; }
  const sansDroit = capacitesSansDroit({ ordre: ordre ?? [], raccourcis: raccourcis ?? {} }, droitsDe(access));
  if (sansDroit.length) { refusDroit(res, sansDroit); return; }
  const conflits = conflitsRaccourcis(raccourcis ?? {});
  if (conflits.length) { refusConflit(res, conflits); return; }
  const avant = await ligneDu(req.user!.id);
  const at = new Date();
  const valeurs = {
    profile: profil, favorites: favoris, personal: personnel, manifestVersion: STUDIO_MANIFESTE_OUTILS_VERSION, updatedAt: at,
    profileId: avant?.profileId ?? newId("studio_profil"), profileVersion: (avant?.profileVersion ?? 0) + 1,
    ...(groupes === undefined ? {} : { groups: groupes }),
    ...(raccourcis === undefined ? {} : { shortcuts: raccourcis }),
    ...(ordre === undefined ? {} : { capabilityOrder: ordre }),
  };
  const [row] = await db.insert(studioToolPreferences).values({ userId: req.user!.id, ...valeurs })
    .onConflictDoUpdate({ target: studioToolPreferences.userId, set: valeurs })
    .returning();
  res.json({ ...lireLignePreferences(row), retires: [], updatedAt: at.toISOString() });
}));

studioPreferencesRouter.get("/outils/export", avecContrat(CONTRAT_PROFIL_EXPORTER), endpoint(async (req, res) => {
  const row = await ligneDu(req.user!.id);
  const p = lireLignePreferences(row);
  if (!p.profileId) { res.status(404).json({ error: "not_found", message: "Aucun profil enregistré pour ce compte : enregistrez d'abord vos préférences." }); return; }
  res.json({
    format: STUDIO_FORMAT_PROFIL, profileId: p.profileId, proprietaire: p.proprietaire ?? undefined, version: p.version, manifeste: p.manifeste,
    profil: p.profil, favoris: p.favoris, personnel: p.personnel, groupes: p.groupes, ordre: p.ordre, raccourcis: p.raccourcis,
  });
}));

studioPreferencesRouter.post("/outils/import", avecContrat(CONTRAT_PROFIL_IMPORTER), endpoint(async (req, res, access) => {
  const corps = importProfilSchema.safeParse(req.body);
  if (!corps.success) { res.status(400).json({ error: "invalid_input", details: corps.error.flatten() }); return; }
  const lu = profilExporteSchema.safeParse(corps.data.profil);
  if (!lu.success) { res.status(400).json({ error: "invalid_profile", message: "Fichier de profil illisible (format fadi-studio-profil/1 attendu).", details: lu.error.flatten() }); return; }
  const p = lu.data;
  const inconnues = capacitesInconnues(p);
  if (inconnues.length) { res.status(400).json({ error: "unknown_tool", message: "Outil absent du registre de Studio.", tools: inconnues }); return; }
  // EX-033 / INV-009 : importer un profil ne confère aucune permission.
  const sansDroit = capacitesSansDroit(p, droitsDe(access));
  if (sansDroit.length) { refusDroit(res, sansDroit); return; }
  // EX-034 : conflits détectés et explicités ; la configuration source (fichier, préférences enregistrées) reste intacte.
  const conflits = conflitsRaccourcis(p.raccourcis);
  if (conflits.length && corps.data.resolution !== "ecarter") { refusConflit(res, conflits); return; }
  const { raccourcis, ecartes } = ecarterConflits(p.raccourcis, conflits);
  const avant = await ligneDu(req.user!.id);
  const at = new Date();
  const valeurs = {
    profile: p.profil, favorites: p.favoris, personal: p.personnel, groups: p.groupes, shortcuts: raccourcis, capabilityOrder: p.ordre,
    manifestVersion: STUDIO_MANIFESTE_OUTILS_VERSION, updatedAt: at,
    profileId: avant?.profileId ?? newId("studio_profil"), profileVersion: (avant?.profileVersion ?? 0) + 1, importedFrom: `${p.profileId}@${p.version}`,
  };
  const [row] = await db.insert(studioToolPreferences).values({ userId: req.user!.id, ...valeurs })
    .onConflictDoUpdate({ target: studioToolPreferences.userId, set: valeurs })
    .returning();
  res.json({ ...lireLignePreferences(row), retires: [], ecartes, updatedAt: at.toISOString() });
}));

studioPreferencesRouter.get("/catalogue", avecContrat(CONTRAT_CATALOGUE_OUTILS), endpoint(async (req, res, access) => {
  res.json(catalogueAutorise(motifRefusEcriture(projectAccessRefusal(access, req.user!.id, "modify")), access.role));
}));
