import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../db/client.js";
import { projectMembers, projectSupportGrants, projects, users, type EditingLock } from "../db/schema.js";

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
export type ProjectRole = "proprietaire" | "editeur" | "lecteur" | "support";
/**
 * `modify` = `write` **et** le modèle du projet peut être modifié : la référence protégée de l'exemple
 * (`example_mode = 'reference'`, D-016 / D-194) n'est jamais écrite par l'Atelier, même par un appel direct à
 * l'API ; l'interface crée la copie de travail à la première modification, le serveur refuse le reste (403
 * `reference-protegee`). Les routes qui n'écrivent pas le modèle (essais à blanc, versions nommées,
 * publications, verrous, copies) restent en `write` ; la transmission de la parcelle (étape 01), qui écrit le modèle par
 * des commandes internes, est en `modify` comme les routes de l'Atelier.
 */
export type ProjectNeed = "read" | "comment" | "write" | "modify" | "owner" | "export";

/**
 * `support` (D-2, UM-4) : administrateur de la plateforme muni d'un accès support **actif** accordé par le propriétaire
 * (`project_support_grants`, ≤ 72 h) — lecture seule : ni commentaire, ni écriture, ni export ou téléchargement. Le rôle
 * plateforme seul ne donne jamais accès à un projet.
 *
 * `export` (revue de sécurité de la PR #255) : sortir du contenu du projet — fichier téléchargé, document produit (et sa
 * trace de production), archive, copie vers un autre projet, publication servie comme source d'un autre projet. Déclaré
 * par chaque route concernée : la garde de chemin `supportReadOnlyGuard` n'est qu'une défense supplémentaire, jamais la
 * frontière. Propriétaire et éditeur exportent ; l'accès support jamais. Un `lecteur` n'exporte que si le propriétaire le
 * lui a accordé (`project_members.can_export`, écart E2 du 2026-10-24, tranche CR-D4) : TRUE pour les lecteurs antérieurs
 * à cette règle (aucune régression), FALSE par défaut pour un nouveau lecteur — `exportAllowed(access)`.
 */
const ALLOWED: Record<ProjectNeed, readonly ProjectRole[]> = {
  read: ["proprietaire", "editeur", "lecteur", "support"],
  comment: ["proprietaire", "editeur", "lecteur"],
  write: ["proprietaire", "editeur"],
  modify: ["proprietaire", "editeur"],
  owner: ["proprietaire"],
  export: ["proprietaire", "editeur"],
};

/** Droit du rôle seul. Pour `export`, le droit accordé à un lecteur est dans l'accès : `accessAllows`. */
export function roleAllows(role: ProjectRole, need: ProjectNeed): boolean {
  return ALLOWED[need].includes(role);
}

/** Droit de l'accès chargé : le rôle, plus l'export explicitement accordé à un lecteur (E2). */
export function accessAllows(access: Pick<AccessibleProject, "role" | "canExport">, need: ProjectNeed): boolean {
  if (need === "export" && access.role === "lecteur") return access.canExport;
  return roleAllows(access.role, need);
}

export const FORBIDDEN_MESSAGE: Record<ProjectNeed, string> = {
  read: "Accès refusé.",
  comment: "Accès refusé.",
  write: "Ce projet vous est partagé en lecture : les modifications sont réservées à son propriétaire et à ses éditeurs.",
  modify: "Ce projet vous est partagé en lecture : les modifications sont réservées à son propriétaire et à ses éditeurs.",
  owner: "Action réservée au propriétaire du projet.",
  export: "Export et téléchargement réservés au propriétaire, aux éditeurs et aux lecteurs à qui le propriétaire les a accordés.",
};

/** Refus d'un accès support (lecture seule) : export ou modification. */
export const SUPPORT_NO_EXPORT = { error: "support_no_export", message: "Accès support en lecture seule : export et téléchargement exclus." } as const;
export const SUPPORT_READ_ONLY = { error: "support_read_only", message: "Accès support en lecture seule : aucune modification ni commentaire." } as const;

type ProjectRow = typeof projects.$inferSelect;

/** Message du refus serveur sur la référence protégée — le même constat que la barre de l'Atelier. */
export const REFERENCE_PROTEGEE_MESSAGE =
  "Exemple protégé : la référence n'est jamais modifiée. Travaillez dans une copie (POST /projects/:id/copies) ; l'Atelier la crée de lui-même à la première modification.";

/** La référence protégée de l'exemple importé (`example_mode = 'reference'`) : lisible, copiable, jamais écrite. */
export function estReferenceProtegee(project: Pick<ProjectRow, "exampleMode">): boolean {
  return project.exampleMode === "reference";
}
/** `canExport` : le rôle exporte (propriétaire, éditeur) ou l'export a été accordé à ce lecteur ; jamais l'accès support. */
export type AccessibleProject = ProjectRow & { role: ProjectRole; canExport: boolean };

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
export async function loadProjectAccess(projectId: string, userId: string, executor: Pick<typeof db, "select"> = db): Promise<AccessibleProject | null> {
  const rows = await executor
    .select({ project: projects, memberRole: projectMembers.role, memberCanExport: projectMembers.canExport })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
    .where(eq(projects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.project.ownerId === userId) return { ...row.project, role: "proprietaire", canExport: true };
  // NULL (ligne restaurée d'une archive antérieure à la colonne) = droit d'origine conservé.
  if (row.memberRole) return { ...row.project, role: row.memberRole, canExport: row.memberRole === "editeur" || (row.memberCanExport ?? true) };
  if (await activeSupportGrant(projectId, userId, executor)) return { ...row.project, role: "support", canExport: false };
  return null;
}

/**
 * L'accès support actif d'un administrateur sur ce projet, ou null. Revérifié à chaque requête : compte toujours
 * administrateur et actif, accès ni révoqué ni expiré (un accès expiré redevient un 404).
 */
export async function activeSupportGrant(projectId: string, userId: string, executor: Pick<typeof db, "select"> = db): Promise<{ id: string; expiresAt: Date } | null> {
  const rows = await executor
    .select({ id: projectSupportGrants.id, expiresAt: projectSupportGrants.expiresAt })
    .from(projectSupportGrants)
    .innerJoin(users, eq(users.id, projectSupportGrants.adminId))
    .where(and(
      eq(projectSupportGrants.projectId, projectId),
      eq(projectSupportGrants.adminId, userId),
      isNull(projectSupportGrants.revokedAt),
      gt(projectSupportGrants.expiresAt, new Date()),
      eq(users.platformRole, "admin"),
      eq(users.status, "active"),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Charge le projet si l'utilisateur y a l'accès demandé (`owner` par
 * défaut : le comportement historique, propriétaire seulement). `null`
 * sinon — sans distinguer absence et rôle insuffisant ; les routes qui
 * veulent répondre 403 passent par `projectOr404`.
 */
export async function loadOwnedProject(projectId: string, userId: string, need: ProjectNeed = "owner"): Promise<AccessibleProject | null> {
  const access = await loadProjectAccess(projectId, userId);
  return access && accessAllows(access, need) ? access : null;
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
  const refusal = projectAccessRefusal(access, req.user!.id, need);
  if (refusal) {
    res.status(refusal.status).json(refusal.body);
    return null;
  }
  return access;
}


/** Même verdict pour les routes historiques et les écritures relues sous transaction. */
export function projectAccessRefusal(access: AccessibleProject | null, userId: string, need: ProjectNeed): { status: number; body: Record<string, unknown> } | null {
  if (!access) return { status: 404, body: { error: "not_found" } };
  if (access.role === "support" && !roleAllows("support", need)) return { status: 403, body: { ...(need === "export" ? SUPPORT_NO_EXPORT : SUPPORT_READ_ONLY), role: "support" } };
  if (!accessAllows(access, need)) return { status: 403, body: { error: "forbidden", message: FORBIDDEN_MESSAGE[need], role: access.role } };
  if (need === "modify" && estReferenceProtegee(access)) {
    return { status: 403, body: { error: "forbidden", motif: "reference-protegee", message: REFERENCE_PROTEGEE_MESSAGE, role: access.role } };
  }
  if (need === "write" || need === "modify") {
    const lock = activeLock(access);
    if (lock && lock.userId !== userId) return { status: 423, body: { error: "locked", message: lockedMessage(lock), lock } };
  }
  return null;
}
