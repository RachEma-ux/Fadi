/** Historiques de lecture : aucune écriture, aucune synchronisation déduite d'une date de projet. */
import { Router } from "express";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { atelierCommands, projectMembers, projects, users } from "../db/schema.js";
import { HISTORY_COMMAND_LIMIT, HISTORY_LIMIT, historyEvent, latestHistory, type HistoryEvent } from "../lib/history.js";
import { projectOr404 } from "../lib/owned-project.js";
import { requireAuth } from "../middleware/require-auth.js";
import { revisionJournalSnapshot } from "./collaboration.js";

export const historyRouter = Router();
historyRouter.use(requireAuth);

/**
 * Deux requêtes de données, chacune plafonnée avant son transfert à Node, quel que soit le nombre de projets.
 * Le filtre d'accès est dans CHAQUE requête ; aucun identifiant fourni par le client n'élargit le périmètre.
 */
historyRouter.get("/history", async (req, res) => {
  const memberJoin = and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, req.user!.id));
  const readable = or(eq(projects.ownerId, req.user!.id), inArray(projectMembers.role, ["lecteur", "editeur"]));
  const [created, commands] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name, createdAt: projects.createdAt, sourceExampleId: projects.sourceExampleId })
      .from(projects).leftJoin(projectMembers, memberJoin).where(readable)
      .orderBy(desc(projects.createdAt), asc(projects.id)).limit(HISTORY_LIMIT + 1),
    db.select({ id: atelierCommands.id, projectId: projects.id, code: projects.code, name: projects.name, label: atelierCommands.label, kind: atelierCommands.kind, revision: atelierCommands.resultRevision, createdAt: atelierCommands.createdAt, authorId: atelierCommands.authorId, authorLabel: users.email })
      .from(atelierCommands).innerJoin(projects, eq(projects.id, atelierCommands.projectId))
      .leftJoin(projectMembers, memberJoin).leftJoin(users, eq(users.id, atelierCommands.authorId)).where(readable)
      .orderBy(desc(atelierCommands.createdAt), asc(atelierCommands.id)).limit(HISTORY_LIMIT + 1),
  ]);
  const events: HistoryEvent[] = [];
  for (const project of created) {
    const event = historyEvent({ id: "created", at: project.createdAt.toISOString(), kind: "projet", label: "Dossier créé", detail: project.sourceExampleId ? `Créé depuis l'exemple ${project.sourceExampleId}.` : "Date de création conservée dans le dossier.", stepNumber: null, revision: null, source: "record" }, project);
    if (event) events.push(event);
  }
  for (const command of commands) {
    const action = command.kind === "annulation" ? "Annulation acceptée par le serveur" : command.kind === "retablissement" ? "Rétablissement accepté par le serveur" : "Modèle enregistré sur le serveur";
    const event = historyEvent({ id: `atelier:${command.id}`, at: command.createdAt.toISOString(), kind: "enregistrement", label: action, detail: `${command.label || "Lot de commandes"} · révision ${command.revision}. Cette entrée confirme ce lot du modèle, pas la synchronisation de tout le dossier.`, stepNumber: 10, revision: command.revision, authorId: command.authorId, authorLabel: command.authorLabel, source: "ledger" }, { id: command.projectId, code: command.code, name: command.name });
    if (event) events.push(event);
  }
  const latest = latestHistory(events);
  res.json({
    scope: "platform",
    project: null,
    events: latest.events,
    readAt: new Date().toISOString(),
    coverage: {
      limit: HISTORY_LIMIT,
      truncated: latest.truncated || created.length > HISTORY_LIMIT || commands.length > HISTORY_LIMIT,
      omittedInvalidDates: 0,
      sources: ["Créations de dossiers accessibles", "Lots de commandes acceptés par le serveur"],
      notice: "Historique partiel des dossiers auxquels vous avez accès : créations et lots du modèle acceptés par le serveur. Les envois en attente, les erreurs et les conflits ne sont pas des événements acceptés. Aucune synchronisation complète du dossier n'est déduite de ces entrées.",
    },
  });
});

historyRouter.get("/:projectId/history", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const { events, truncated, omittedInvalidDates } = await revisionJournalSnapshot(project);
  res.json({
    scope: "project",
    project: { id: project.id, code: project.code, name: project.name },
    events,
    readAt: new Date().toISOString(),
    coverage: {
      limit: HISTORY_LIMIT,
      truncated,
      omittedInvalidDates,
      sources: ["Données datées conservées dans le dossier", `${HISTORY_COMMAND_LIMIT} derniers lots du journal de l'Atelier`, "Commentaires conservés"],
      notice: "Historique partiel : les données datées (y compris celles importées) et les commentaires encore conservés sont rapprochés du journal de l'Atelier. Certains états sont remplacés ou supprimés. Ce relevé n'est ni un audit complet et immuable, ni une liste de versions restaurables. Les auteurs absents des données ne sont pas reconstitués.",
    },
  });
});
