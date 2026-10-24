/**
 * Demandes de précision (Collaboration partagée, COM-D10) — montées sous `/projects/:projectId/collaboration/demandes` :
 *   GET  /                    → demandes lisibles (audience E1) ; `?a-repondre=1` : celles qui attendent votre réponse
 *   POST /                    → { question, responderId, echeance?, audience?, refs?, clientRequestId? } : 201 (rejeu 200)
 *   GET  /:id                 → détail et journal
 *   POST /:id/transitions     → { action: repondre | cloturer | rouvrir | reattribuer, body?, responderId? }
 *
 * Une demande est l'enregistrement de référence : COM (`routes/com.ts`) la crée par action liée et en affiche l'état,
 * sans en tenir un second (COM-R7).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { ComError } from "../lib/com.js";
import { creerDemande, demandeCreationSchema, demandeTransitionSchema, lireDemandes, transitionDemande } from "../lib/demandes.js";
import { projectOr404 } from "../lib/owned-project.js";

export const demandesRouter = Router({ mergeParams: true });
demandesRouter.use(requireAuth);

const endpoint = (f: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await f(req, res); } catch (e) { if (e instanceof ComError) res.status(e.status).json(e.body); else next(e); }
};

demandesRouter.get("/", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "read");
  if (!access) return;
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await lireDemandes(access.id, req.user!.id, access.role, { aRepondre: req.query["a-repondre"] === "1" }));
}));

demandesRouter.post("/", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "comment");
  if (!access) return;
  const parsed = demandeCreationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const r = await creerDemande(access, req.user!.id, parsed.data);
  const [v] = await lireDemandes(access.id, req.user!.id, access.role, { ids: [r.id], journal: true });
  res.status(r.replayed ? 200 : 201).json({ ...v, replayed: r.replayed });
}));

demandesRouter.get("/:demandeId", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "read");
  if (!access) return;
  const [v] = await lireDemandes(access.id, req.user!.id, access.role, { ids: [String(req.params["demandeId"])], journal: true });
  if (!v) { res.status(404).json({ error: "not_found" }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(v);
}));

demandesRouter.post("/:demandeId/transitions", endpoint(async (req, res) => {
  const access = await projectOr404(req, res, "comment");
  if (!access) return;
  const parsed = demandeTransitionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  await transitionDemande(access.id, req.user!.id, String(req.params["demandeId"]), parsed.data);
  const [v] = await lireDemandes(access.id, req.user!.id, access.role, { ids: [String(req.params["demandeId"])], journal: true });
  res.json(v);
}));
