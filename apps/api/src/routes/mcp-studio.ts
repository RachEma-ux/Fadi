/**
 * Serveur MCP de Studio, transport HTTP « Streamable HTTP » en mode réponse JSON (`POST /mcp/studio`, lot F, décision
 * P-12 ; partie pure : `packages/atelier-model/src/studio/agents/mcp.ts`, gestionnaires : `lib/studio-agents.ts`).
 * Authentification par **jeton d'agent** seulement (`Authorization: Bearer fadi_mcp_…`) ; un cookie de session est
 * ignoré (aucune requête de page ne peut agir ici). Un en-tête `Origin` étranger est refusé (protection contre le
 * rebinding DNS, exigée par la spécification MCP). `GET` et `DELETE` : 405 (aucun flux serveur, aucune session MCP à
 * fermer). Le transport stdio est un relais vers cette route : `apps/api/scripts/studio-mcp-stdio.mjs`.
 */
import { Router, type Request, type Response } from "express";
import { studioTraiterMessageMcp } from "@parcours/atelier-model/studio-agents";
import { gestionnairesMcp, resoudreJetonAgent } from "../lib/studio-agents.js";

export function studioMcpRouter(origines: readonly string[]): Router {
  const admises = new Set(origines.map((o) => o.trim().replace(/\/$/, "")).filter(Boolean));
  const r = Router();
  const nonAdmis = (_req: Request, res: Response) => { res.setHeader("Allow", "POST"); res.status(405).json({ error: "method_not_allowed" }); };
  r.get("/", nonAdmis);
  r.delete("/", nonAdmis);
  r.post("/", async (req, res, next) => {
    try {
      const origine = req.get("origin");
      if (origine && !admises.has(origine) && origine !== `${req.protocol}://${req.get("host")}`) { res.status(403).json({ error: "origin_refused" }); return; }
      const ctx = await resoudreJetonAgent(req.get("authorization"));
      if (!ctx) { res.setHeader("WWW-Authenticate", 'Bearer realm="fadi-studio-mcp"'); res.status(401).json({ error: "agent_token_required" }); return; }
      const g = gestionnairesMcp(ctx);
      const corps: unknown = req.body;
      if (Array.isArray(corps)) {
        const reponses = (await Promise.all(corps.map((m) => studioTraiterMessageMcp(m, g)))).filter((x) => x !== null);
        if (reponses.length === 0) { res.status(202).end(); return; }
        res.json(reponses);
        return;
      }
      const reponse = await studioTraiterMessageMcp(corps, g);
      if (reponse === null) { res.status(202).end(); return; }
      res.json(reponse);
    } catch (err) { next(err); }
  });
  return r;
}
