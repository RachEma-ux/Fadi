/**
 * Journal d'activité — consultation par l'administrateur de la plateforme (phase 3 bis, tâche 1, OP-D13 (a)). Monté dans
 * `adminRouter`, donc derrière `requirePlatformRole("admin")` : 404 pour tout non-administrateur, 403 `mfa_required` /
 * `mfa_session_required` sans double authentification prouvée par la session (UM-18).
 *
 *   GET /admin/audit   filtres `actor` (identifiant, adresse ou nom du compte acteur), `action` (exacte), `family`
 *                      (famille d'actions), `targetType`, `targetId`, `from` / `to` (date ou date-heure ISO), pagination
 *                      par curseur `before` (identifiant de la dernière entrée reçue), `limit` (1 à 100, 50 par défaut) ;
 *                      tri récent d'abord.
 *
 * Lecture seule : le journal reste append-only. Aucune sortie de fichier (ni CSV, ni téléchargement) : la capacité
 * `export` (UM-20) n'existe que pour le contenu d'un projet ; aucune capacité d'export d'administration n'est définie,
 * la réponse le déclare (`export.available = false`).
 */
import { Router } from "express";
import { z } from "zod";
import { adminJournal } from "../../lib/journal.js";
import { JOURNAL_FAMILIES, JOURNAL_PAGE_DEFAULT, JOURNAL_PAGE_MAX } from "../../lib/journal-audience.js";

export const adminJournalRouter = Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const instant = (end: boolean) => z.string().trim().max(40).optional().transform((v, ctx) => {
  if (!v) return undefined;
  const d = new Date(DAY.test(v) ? `${v}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "date invalide" });
    return z.NEVER;
  }
  return d;
});
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const filtersSchema = z.object({
  actor: text(254),
  action: text(80),
  family: z.enum(JOURNAL_FAMILIES).optional(),
  targetType: text(40),
  targetId: text(120),
  from: instant(false),
  to: instant(true),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(JOURNAL_PAGE_MAX).default(JOURNAL_PAGE_DEFAULT),
});

export const ADMIN_EXPORT_UNAVAILABLE = {
  available: false,
  reason: "Aucune capacité d’export n’est définie pour l’administration (UM-20) : le journal se consulte ici, sans téléchargement.",
} as const;

adminJournalRouter.get("/audit", async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_input" });
  const { before, ...f } = parsed.data;
  const page = await adminJournal(req.user!.id, { ...f, cursor: before });
  res.json({ ...page, families: JOURNAL_FAMILIES, export: ADMIN_EXPORT_UNAVAILABLE });
});
