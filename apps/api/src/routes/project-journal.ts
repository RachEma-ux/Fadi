/**
 * Historique de la participation d'un projet (phase 3 bis, tâche 3, OP-D13 (a)) — à ne pas confondre avec
 * `routes/history.ts` (historique de lecture des dossiers).
 *
 *   GET /projects/:projectId/journal   arrivées et départs (`project.member.*`), changements de rôle et d'export,
 *                                      transfert de propriété, invitations du projet, audience des fils, accès support,
 *                                      et toute action future `participation.*`, `person.*`, `review.*` rattachée au
 *                                      projet ; filtre `family`, pagination par curseur `before`, récent d'abord.
 *
 * Visible des seuls responsables du projet (`isProjectResponsible` : propriétaire, ou participation active
 * coordinatrice à la portée projet ou dirigeante) : 404 sans accès au projet, 403 avec motif `responsable-requis`
 * sinon (lecteur, éditeur, accès support). Filtré côté serveur (`lib/journal-audience.ts`, audience `projet`) ; jamais
 * d'adresse IP. Lecture seule.
 */
import { Router } from "express";
import { z } from "zod";
import { loadProjectAccess } from "../lib/owned-project.js";
import { isProjectResponsible } from "../lib/project-responsables.js";
import { projectJournal } from "../lib/journal.js";
import { JOURNAL_PAGE_DEFAULT, JOURNAL_PAGE_MAX } from "../lib/journal-audience.js";
import { requireAuth } from "../middleware/require-auth.js";

export const projectJournalRouter = Router({ mergeParams: true });
projectJournalRouter.use(requireAuth);

export const PROJECT_JOURNAL_FAMILIES = ["project", "invitation", "comment", "support", "participation", "person", "review"] as const;

const schema = z.object({
  family: z.enum(PROJECT_JOURNAL_FAMILIES).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(JOURNAL_PAGE_MAX).default(JOURNAL_PAGE_DEFAULT),
});

export const RESPONSABLE_REQUIS = {
  error: "forbidden",
  motif: "responsable-requis",
  message: "L’historique de la participation est réservé aux responsables du projet (propriétaire, coordinateur ou direction de l’équipe).",
} as const;

projectJournalRouter.get("/", async (req, res) => {
  const projectId = (req.params as Record<string, string>)["projectId"] ?? "";
  const access = await loadProjectAccess(projectId, req.user!.id);
  if (!access) return void res.status(404).json({ error: "not_found" });
  if (access.role === "support" || !(await isProjectResponsible(projectId, req.user!.id))) {
    return void res.status(403).json({ ...RESPONSABLE_REQUIS, role: access.role });
  }
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_input" });
  const page = await projectJournal(projectId, req.user!.id, parsed.data.before, parsed.data.limit, parsed.data.family);
  res.json({ ...page, families: PROJECT_JOURNAL_FAMILIES });
});
