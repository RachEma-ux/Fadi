/**
 * Agents et extensions de Studio côté **personne** (session humaine, lot F, décision P-12 ; `lib/studio-agents.ts`) :
 * jetons d'agent (création montrée une fois, liste, révocation), propositions à confirmer ou refuser, journal agent /
 * humain, déclarations d'extension évaluées sans rien charger. Monté sous le routeur Studio (`requireAuth` : cookie de
 * session) ; un jeton d'agent n'est pas une session et ne peut atteindre aucune de ces routes. Contrats :
 * `lib/studio-contrats-routes.ts`.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { STUDIO_EXTENSION_MCP, studioEvaluerExtension } from "@parcours/atelier-model/studio-agents";
import { db } from "../db/client.js";
import { loadProjectAccess } from "../lib/owned-project.js";
import { assertAccess, StudioRequestError } from "../lib/studio-commands.js";
import { avecContrat } from "../lib/studio-contrats.js";
import {
  CONTRAT_AGENTS_JETON_CREER, CONTRAT_AGENTS_JETON_REVOQUER, CONTRAT_AGENTS_JETONS_LISTER, CONTRAT_AGENTS_JOURNAL, CONTRAT_AGENTS_PROPOSITION_CONFIRMER,
  CONTRAT_AGENTS_PROPOSITION_REFUSER, CONTRAT_AGENTS_PROPOSITIONS, CONTRAT_EXTENSION_EVALUER, CONTRAT_EXTENSIONS_LISTER,
} from "../lib/studio-contrats-routes.js";
import {
  confirmerProposition, contexteConfianceExtensions, creerJetonAgent, journalAgents, listerJetonsAgent, listerPropositions, refuserProposition, revoquerJetonAgent, studioJetonSchema,
} from "../lib/studio-agents.js";

export const studioAgentsRouter = Router({ mergeParams: true });
const projet = (req: Request) => (req.params as Record<string, string>)["projectId"] ?? "";
const endpoint = (h: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { res.setHeader("Cache-Control", "private, no-store"); await h(req, res); } catch (e) { if (e instanceof StudioRequestError) res.status(e.status).json(e.body); else next(e); }
};

studioAgentsRouter.get("/agents/jetons", avecContrat(CONTRAT_AGENTS_JETONS_LISTER), endpoint(async (req, res) => { res.json(await listerJetonsAgent(projet(req), req.user!.id)); }));
studioAgentsRouter.post("/agents/jetons", avecContrat(CONTRAT_AGENTS_JETON_CREER), endpoint(async (req, res) => {
  const parsed = studioJetonSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  res.status(201).json(await creerJetonAgent(projet(req), req.user!.id, parsed.data.nom, parsed.data.joursValidite));
}));
studioAgentsRouter.post("/agents/jetons/:tokenId/revoquer", avecContrat(CONTRAT_AGENTS_JETON_REVOQUER), endpoint(async (req, res) => { res.json(await revoquerJetonAgent(projet(req), req.user!.id, req.params["tokenId"] as string)); }));
studioAgentsRouter.get("/agents/propositions", avecContrat(CONTRAT_AGENTS_PROPOSITIONS), endpoint(async (req, res) => { res.json(await listerPropositions(projet(req), req.user!.id)); }));
studioAgentsRouter.post("/agents/propositions/:proposalId/confirmer", avecContrat(CONTRAT_AGENTS_PROPOSITION_CONFIRMER), endpoint(async (req, res) => { res.json(await confirmerProposition(projet(req), req.user!.id, req.params["proposalId"] as string)); }));
studioAgentsRouter.post("/agents/propositions/:proposalId/refuser", avecContrat(CONTRAT_AGENTS_PROPOSITION_REFUSER), endpoint(async (req, res) => { res.json(await refuserProposition(projet(req), req.user!.id, req.params["proposalId"] as string)); }));
studioAgentsRouter.get("/agents/journal", avecContrat(CONTRAT_AGENTS_JOURNAL), endpoint(async (req, res) => { res.json(await journalAgents(projet(req), req.user!.id)); }));
/** Extensions déclarées (EX-031) : l'adaptateur MCP intégré et son état ; évaluation d'une déclaration sans écriture. */
studioAgentsRouter.get("/extensions", avecContrat(CONTRAT_EXTENSIONS_LISTER), endpoint(async (req, res) => {
  assertAccess(await loadProjectAccess(projet(req), req.user!.id, db), req.user!.id, "read");
  res.json({ extensions: [{ declaration: STUDIO_EXTENSION_MCP, evaluation: studioEvaluerExtension(STUDIO_EXTENSION_MCP, contexteConfianceExtensions()) }] });
}));
studioAgentsRouter.post("/extensions/evaluer", avecContrat(CONTRAT_EXTENSION_EVALUER), endpoint(async (req, res) => {
  assertAccess(await loadProjectAccess(projet(req), req.user!.id, db), req.user!.id, "read");
  res.json({ evaluation: studioEvaluerExtension(req.body?.declaration, contexteConfianceExtensions()) });
}));
