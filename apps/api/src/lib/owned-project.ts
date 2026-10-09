import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../db/client.js";
import { projectMembers, projects, type EditingLock } from "../db/schema.js";

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
/**
 * `modify` = `write` **et** le modèle du projet peut être modifié : la référence protégée de l'exemple
 * (`example_mode = 'reference'`, D-016 / D-194) n'est jamais écrite par l'Atelier, même par un appel direct à
 * l'API ; l'interface crée la copie de travail à la première modification, le serveur refuse le reste (403
 * `reference-protegee`). Les routes qui n'écrivent pas le modèle (essais à blanc, versions nommées,
 * publications, verrous, copies) restent en `write` ; la transmission de la parcelle (étape 01), qui écrit le modèle par
 * des commandes internes, est en `modify` comme les routes de l'Atelier.
 */
export type ProjectNeed = "read" | "comment" | "write" | "modify" | "owner";

const ALLOWED: Record<ProjectNeed, readonly ProjectRole[]> = {
  read: ["proprietaire", "editeur", "lecteur"],
  comment: ["proprietaire", "editeur", "lecteur"],
  write: ["proprietaire", "editeur"],
  modify: ["proprietaire", "editeur"],
  owner: ["proprietaire"],
};

export function roleAllows(role: ProjectRole, need: ProjectNeed): boolean {
  return ALLOWED[need].includes(role);
}

export const FORBIDDEN_MESSAGE: Record<ProjectNeed, string> = {
  read: "Accès refusé.",
  comment: "Accès refusé.",
  write: "Ce projet vous est partagé en lecture : les modifications sont réservées à son propriétaire et à ses éditeurs.",
  modify: "Ce projet vous est partagé en lecture : les modifications sont réservées à son propriétaire et à ses éditeurs.",
  owner: "Action réservée au propriétaire du projet.",
};

type ProjectRow = typeof projects.$inferSelect;

/** Message du refus serveur sur la référence protégée — le même constat que la barre de l'Atelier. */
export const REFERENCE_PROTEGEE_MESSAGE =
  "Exemple protégé : la référence n'est jamais modifiée. Travaillez dans une copie (POST /projects/:id/copies) ; l'Atelier la crée de lui-même à la première modification.";

/** La référence protégée de l'exemple importé (`example_mode = 'reference'`) : lisible, copiable, jamais écrite. */
export function estReferenceProtegee(project: Pick<ProjectRow, "exampleMode">): boolean {
  return project.exampleMode === "reference";
}
export type AccessibleProject = ProjectRow & { role: ProjectRole };

/** Durée d'une réservation d'édition ; renouvelable tant que l'éditeur travaille. */
export const EDITING_LOCK_MINUTES = 30;

/** Le verrou d'édition du projet s'il est encore valable, sinon null (un verrou expiré n'existe plus). */
export function activeLock(project: Pick<ProjectRow, "editingLock">, now = new Date()): EditingLock | null {
  const lock = project.editingLock;
  if (!lock || !lock.expiresAt) return null;
  return new Date(lock.expiresAt).getTime() > now.getTime() ? lock : null;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: process.env["FADI_TZ"] ?? "Europe/Paris" });

export function lockedMessage(lock: EditingLock): string {
  return `Édition réservée par ${lock.email} jusqu'à ${hhmm(lock.expiresAt)} : lecture et commentaires seulement ; demandez-lui de rendre la main, ou attendez l'échéance.`;
}

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

/**
 * Aide commune des routeurs : 404 sans accès, 403 (avec motif) si le rôle ne
 * suffit pas, 423 si l'édition est réservée par quelqu'un d'autre (verrou
 * optionnel, « un seul éditeur actif » ; les lectures et commentaires
 * passent), sinon le projet avec le rôle.
 */
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
  // La référence protégée d'abord : son refus est inconditionnel, il ne dépend pas d'un verrou passager (423).
  if (need === "modify" && estReferenceProtegee(access)) {
    res.status(403).json({ error: "forbidden", motif: "reference-protegee", message: REFERENCE_PROTEGEE_MESSAGE, role: access.role });
    return null;
  }
  if (need === "write" || need === "modify") {
    const lock = activeLock(access);
    if (lock && lock.userId !== req.user!.id) {
      res.status(423).json({ error: "locked", message: lockedMessage(lock), lock });
      return null;
    }
  }
  return access;
}
