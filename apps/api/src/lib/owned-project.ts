import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../db/client.js";
import { projectMembers, projects } from "../db/schema.js";

/**
 * Accès à un projet, vérifié côté serveur à chaque route — jamais seulement
 * « l'utilisateur est connecté » (AGENTS.md et Definition of Done).
 *
 * Rôles : le propriétaire (`projects.owner_id`) peut tout ; un membre
 * `editeur` lit et modifie ; un membre `lecteur` lit et commente. Chaque
 * route déclare ce dont elle a besoin (`need`) ; un projet inaccessible
 * reste introuvable (404), un rôle insuffisant est refusé (403) avec le
 * motif.
 */
export type ProjectRole = "proprietaire" | "editeur" | "lecteur";
export type ProjectNeed = "read" | "comment" | "write" | "owner";

const ALLOWED: Record<ProjectNeed, readonly ProjectRole[]> = {
  read: ["proprietaire", "editeur", "lecteur"],
  comment: ["proprietaire", "editeur", "lecteur"],
  write: ["proprietaire", "editeur"],
  owner: ["proprietaire"],
};

export function roleAllows(role: ProjectRole, need: ProjectNeed): boolean {
  return ALLOWED[need].includes(role);
}

export const FORBIDDEN_MESSAGE: Record<ProjectNeed, string> = {
  read: "Accès refusé.",
  comment: "Accès refusé.",
  write: "Ce projet vous est partagé en lecture : les modifications sont réservées à son propriétaire et à ses éditeurs.",
  owner: "Action réservée au propriétaire du projet.",
};

type ProjectRow = typeof projects.$inferSelect;
export type AccessibleProject = ProjectRow & { role: ProjectRole };

/** Le projet et le rôle de l'utilisateur, en une requête ; `null` quand il n'y a aucun accès. */
export async function loadProjectAccess(projectId: string, userId: string): Promise<AccessibleProject | null> {
  const rows = await db
    .select({ project: projects, memberRole: projectMembers.role })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
    .where(eq(projects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.project.ownerId === userId) return { ...row.project, role: "proprietaire" };
  if (row.memberRole) return { ...row.project, role: row.memberRole };
  return null;
}

/**
 * Charge le projet si l'utilisateur y a l'accès demandé (`owner` par
 * défaut : le comportement historique, propriétaire seulement). `null`
 * sinon — sans distinguer absence et rôle insuffisant ; les routes qui
 * veulent répondre 403 passent par `projectOr404`.
 */
export async function loadOwnedProject(projectId: string, userId: string, need: ProjectNeed = "owner"): Promise<AccessibleProject | null> {
  const access = await loadProjectAccess(projectId, userId);
  return access && roleAllows(access.role, need) ? access : null;
}

export type OwnedProject = AccessibleProject;

/** Aide commune des routeurs : 404 sans accès, 403 (avec motif) si le rôle ne suffit pas, sinon le projet avec le rôle. */
export async function projectOr404(req: Request, res: Response, need: ProjectNeed): Promise<AccessibleProject | null> {
  const projectId = (req.params as Record<string, string>)["projectId"] ?? "";
  const access = await loadProjectAccess(projectId, req.user!.id);
  if (!access) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  if (!roleAllows(access.role, need)) {
    res.status(403).json({ error: "forbidden", message: FORBIDDEN_MESSAGE[need], role: access.role });
    return null;
  }
  return access;
}
