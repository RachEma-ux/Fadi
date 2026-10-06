/**
 * Préférences personnelles synchronisées entre les appareils d'un même compte (D-118, DA-05-03) :
 *
 *   GET /preferences/atelier-ensembles  → { ensembles, version } — les ensembles d'affichage personnels de l'Atelier
 *                                          (classes et calques masqués pour soi, étage associé), version = date serveur
 *                                          du dernier enregistrement (null tant que rien n'est enregistré) ;
 *   PUT /preferences/atelier-ensembles  { ensembles, base } → enregistre si `base` est la version courante ; sinon
 *                                          409 `version_perimee` avec la version du serveur (un autre appareil a
 *                                          enregistré entre-temps : l'appareil fusionne puis renvoie).
 *
 * Rien n'est partagé : c'est l'affaire du seul compte (les ensembles partagés avec l'équipe restent des définitions
 * du modèle, `ensemble.enregistrer`). Aucune donnée de projet n'est lue ni écrite ici.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";

export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);

const ident = z.string().min(1).max(200);
export const ensembleSchema = z.object({
  nom: z.string().trim().min(1).max(120),
  niveauId: ident.nullable(),
  classesMasquees: z.array(ident).max(200),
  calquesMasques: z.array(ident).max(500),
});
const putSchema = z.object({
  ensembles: z.array(ensembleSchema).max(100),
  base: z.string().max(40).nullable(),
});

async function lire(userId: string): Promise<{ ensembles: z.infer<typeof ensembleSchema>[]; version: string | null }> {
  const [u] = await db.select({ e: users.atelierEnsembles, at: users.atelierEnsemblesAt }).from(users).where(eq(users.id, userId));
  const parsed = z.array(ensembleSchema).safeParse(u?.e ?? []);
  return { ensembles: parsed.success ? parsed.data : [], version: u?.at ? u.at.toISOString() : null };
}

preferencesRouter.get("/atelier-ensembles", async (req, res) => {
  res.json(await lire(req.user!.id));
});

preferencesRouter.put("/atelier-ensembles", async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const noms = parsed.data.ensembles.map((e) => e.nom);
  if (new Set(noms).size !== noms.length) {
    res.status(400).json({ error: "invalid_input", message: "deux ensembles portent le même nom" });
    return;
  }
  const userId = req.user!.id;
  const resultat = await db.transaction(async (tx) => {
    const [u] = await tx.select({ at: users.atelierEnsemblesAt }).from(users).where(eq(users.id, userId)).for("update");
    const courante = u?.at ? u.at.toISOString() : null;
    if (courante !== parsed.data.base) return { conflit: true as const };
    const at = new Date();
    // Strictement postérieure à la version précédente (deux enregistrements dans la même milliseconde).
    if (u?.at && at.getTime() <= u.at.getTime()) at.setTime(u.at.getTime() + 1);
    await tx.update(users).set({ atelierEnsembles: parsed.data.ensembles, atelierEnsemblesAt: at }).where(eq(users.id, userId));
    return { conflit: false as const, version: at.toISOString() };
  });
  if (resultat.conflit) {
    res.status(409).json({ error: "version_perimee", message: "un autre appareil a enregistré ses ensembles entre-temps", ...(await lire(userId)) });
    return;
  }
  res.json({ ensembles: parsed.data.ensembles, version: resultat.version });
});
