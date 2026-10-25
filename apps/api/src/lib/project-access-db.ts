/**
 * Partage du projet écrit dans les participations et les rôles (Issue #262, lot OP-PONT : retrait du pont
 * `op_sync_access`). Règles pures : `project-access.ts`.
 *
 * Plus aucune écriture de l'application ne touche `project_members` : c'est une VUE de compatibilité en lecture (init.sql,
 * bloc « retrait du pont »), dérivée des participations. Chaque chemin qui écrivait la table — partage (changement de
 * rôle ou d'export), retrait, départ, transfert de propriété, invitation acceptée, anonymisation, restauration
 * d'archive, création ou import de projet (ancien déclencheur du propriétaire) — appelle ici, DANS SA TRANSACTION, la
 * fonction qui fait exactement ce que faisait le miroir ; l'appelant garde son entrée de journal (`admin.audit_log`).
 *
 *   - `shareOf(q, projectId, userId, { lock })` : le partage en cours du compte (ligne de la vue de compatibilité), la
 *     participation verrouillée FOR UPDATE si demandé ;
 *   - `grantShare(tx, input)` : pose ou change le partage (rôle `acces` Lecteur / Concepteur, export accordé, invitant et
 *     date) — mode `set` (changement de rôle), `merge` (invitation acceptée : rôle le plus large) ou `if-absent`
 *     (restauration : un partage existant n'est jamais écrasé) ;
 *   - `revokeShare(tx, projectId, userId)` : retrait ou départ — la participation en cours est terminée et datée ;
 *   - `revokeSharesOfUser(tx, userId)` / `relabelShareInviter(tx, before, after)` : anonymisation d'un compte ;
 *   - `ensureOwnerParticipation(tx, projectId, ownerId)` : participation active du propriétaire, sans rôle de partage.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { people, projectParticipations, projectRoleAssignments, projects, type ParticipationStatus, type ProjectBusinessRole } from "../db/schema.js";
import { newId } from "./ids.js";
import { mergedShareRole, shareBusinessRole, shareExportFlag, shareRoleFromRoles, type ShareRole } from "./project-access.js";
import type { Tx } from "./step-rows.js";

type Querier = Pick<Tx, "select">;

/** Un partage en cours : les colonnes de l'ancienne ligne `project_members`, plus la participation qui le porte. */
export interface ShareRow {
  projectId: string;
  userId: string;
  role: ShareRole;
  /** Export accordé à un lecteur (FALSE pour un éditeur, qui exporte toujours). */
  canExport: boolean;
  invitedBy: string;
  createdAt: Date;
  participationId: string;
  status: ParticipationStatus;
}

/** Début d'une participation ouverte par le partage : aujourd'hui (date du serveur de base, comme l'ancien miroir). */
const today = () => sql`current_date`;

async function ensurePerson(tx: Tx, userId: string): Promise<string> {
  await tx.insert(people).values({ id: newId("per"), userId })
    .onConflictDoNothing({ target: people.userId, where: sql.raw("user_id IS NOT NULL") });
  const [row] = await tx.select({ id: people.id }).from(people).where(eq(people.userId, userId)).limit(1);
  return row!.id;
}

async function currentParticipation(q: Querier, projectId: string, userId: string, lock: boolean) {
  const query = q.select({
    id: projectParticipations.id, status: projectParticipations.status, canExport: projectParticipations.canExport,
    grantedBy: projectParticipations.accessGrantedBy, grantedAt: projectParticipations.accessGrantedAt, createdAt: projectParticipations.createdAt,
  }).from(projectParticipations).innerJoin(people, eq(people.id, projectParticipations.personId))
    .where(and(eq(projectParticipations.projectId, projectId), eq(people.userId, userId), ne(projectParticipations.status, "terminee"))).limit(1);
  const [row] = lock ? await query.for("update", { of: projectParticipations }) : await query;
  return row ?? null;
}

async function accesRoles(q: Querier, participationId: string): Promise<ProjectBusinessRole[]> {
  const rows = await q.select({ role: projectRoleAssignments.role }).from(projectRoleAssignments)
    .where(and(eq(projectRoleAssignments.participationId, participationId), eq(projectRoleAssignments.origin, "acces"), eq(projectRoleAssignments.scopeType, "projet")));
  return rows.map((r) => r.role);
}

async function ownerOf(q: Querier, projectId: string): Promise<string | null> {
  const [p] = await q.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return p?.ownerId ?? null;
}

/** Partage en cours du compte dans le projet (jamais le propriétaire) ; `lock` verrouille la participation. */
export async function shareOf(q: Querier, projectId: string, userId: string, opts: { lock?: boolean } = {}): Promise<ShareRow | null> {
  const owner = await ownerOf(q, projectId);
  if (!owner || owner === userId) return null;
  const part = await currentParticipation(q, projectId, userId, opts.lock ?? false);
  if (!part) return null;
  const role = shareRoleFromRoles(await accesRoles(q, part.id));
  if (!role) return null;
  return {
    projectId, userId, role, canExport: part.canExport, invitedBy: part.grantedBy ?? "", createdAt: part.grantedAt ?? part.createdAt,
    participationId: part.id, status: part.status,
  };
}

export interface GrantShareInput {
  projectId: string;
  userId: string;
  role: ShareRole;
  /** Export accordé (lecteur) ; `undefined` = inchangé (nouveau partage : aucun) ; `null` = archive antérieure à E2 : TRUE. */
  canExport?: boolean | null | undefined;
  /** Libellé de l'invitant (historiquement son adresse), gardé pour un NOUVEAU partage seulement. */
  invitedBy: string;
  /** Compte qui accorde (rôle `acces`, `granted_by`) ; null : tâche ou restauration. */
  grantedBy?: string | null;
  /** Date du partage (restauration : celle de l'archive) ; par défaut maintenant. */
  grantedAt?: Date;
  mode?: "set" | "merge" | "if-absent";
}

/**
 * Pose ou change le partage d'un compte (non propriétaire), dans la transaction de l'appelant — même effet que l'ancien
 * miroir sur une ligne `project_members` insérée ou modifiée : personne créée au besoin ; participation en cours
 * réutilisée (un contact devient actif, une participation suspendue LE RESTE), sinon nouvelle participation active
 * commencée aujourd'hui ; rôle `acces` unique (Lecteur ou Concepteur) ; export accordé seulement à un lecteur.
 */
export async function grantShare(tx: Tx, input: GrantShareInput): Promise<{ before: ShareRow | null; after: ShareRow }> {
  const owner = await ownerOf(tx, input.projectId);
  if (!owner) throw new Error("grantShare : projet introuvable");
  if (owner === input.userId) throw new Error("grantShare : le propriétaire n'a pas de partage");
  const personId = await ensurePerson(tx, input.userId);
  const before = await shareOf(tx, input.projectId, input.userId, { lock: true });
  if (before && input.mode === "if-absent") return { before, after: before };
  const role = input.mode === "merge" ? mergedShareRole(before?.role ?? null, input.role) : input.role;
  const flag = shareExportFlag(role, input.canExport, before?.canExport ?? false);
  let part = await currentParticipation(tx, input.projectId, input.userId, true);
  if (!part) {
    const id = newId("ppa");
    await tx.insert(projectParticipations).values({ id, projectId: input.projectId, personId, status: "active", startsOn: today() });
    part = await currentParticipation(tx, input.projectId, input.userId, true);
  } else if (part.status === "contact") {
    await tx.update(projectParticipations).set({ status: "active", updatedAt: new Date() }).where(eq(projectParticipations.id, part.id));
  }
  const partId = part!.id;
  await tx.update(projectParticipations).set({
    canExport: flag,
    ...(before ? {} : { accessGrantedBy: input.invitedBy, accessGrantedAt: input.grantedAt ?? new Date() }),
  }).where(eq(projectParticipations.id, partId));
  const wanted = shareBusinessRole(role);
  await tx.delete(projectRoleAssignments).where(and(eq(projectRoleAssignments.participationId, partId), eq(projectRoleAssignments.origin, "acces"), ne(projectRoleAssignments.role, wanted)));
  await tx.insert(projectRoleAssignments).values({ id: newId("pra"), participationId: partId, role: wanted, scopeType: "projet", origin: "acces", grantedBy: input.grantedBy ?? null })
    .onConflictDoNothing();
  const after = await shareOf(tx, input.projectId, input.userId);
  return { before, after: after! };
}

/**
 * Retire le partage (retrait par le propriétaire, départ du membre) — effet de l'ancien miroir sur une ligne supprimée :
 * la participation en cours est terminée et datée (aucun retour ne la rouvre). Renvoie le partage retiré, ou null.
 */
export async function revokeShare(tx: Tx, projectId: string, userId: string): Promise<ShareRow | null> {
  const before = await shareOf(tx, projectId, userId, { lock: true });
  if (!before) return null;
  await tx.update(projectParticipations)
    .set({ status: "terminee", endsOn: sql`greatest(current_date, coalesce(${projectParticipations.startsOn}, current_date))`, updatedAt: new Date() })
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"),
      sql`${projectParticipations.personId} IN (SELECT id FROM people WHERE user_id = ${userId})`));
  return before;
}

/** Anonymisation d'un compte : chacun de ses partages est retiré (participation terminée). Renvoie les projets. */
export async function revokeSharesOfUser(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx.select({ projectId: projectParticipations.projectId }).from(projectParticipations)
    .innerJoin(people, eq(people.id, projectParticipations.personId))
    .where(and(eq(people.userId, userId), ne(projectParticipations.status, "terminee")));
  const revoked: string[] = [];
  for (const { projectId } of rows) if (await revokeShare(tx, projectId, userId)) revoked.push(projectId);
  return revoked;
}

/** Anonymisation : le libellé d'invitant (ancienne adresse) des partages est remplacé. */
export async function relabelShareInviter(tx: Tx, before: string, after: string): Promise<void> {
  await tx.update(projectParticipations).set({ accessGrantedBy: after }).where(eq(projectParticipations.accessGrantedBy, before));
}

/**
 * Participation du propriétaire (ancien déclencheur `projects_op_owner_mirror`) : personne créée au besoin,
 * participation en cours réutilisée (un contact devient actif) ou créée active ; aucun rôle de partage ni export
 * accordé (le propriétaire a tous les droits par `projects.owner_id`). À la création, à l'import et au transfert.
 */
export async function ensureOwnerParticipation(tx: Tx, projectId: string, ownerId: string): Promise<string> {
  const personId = await ensurePerson(tx, ownerId);
  let part = await currentParticipation(tx, projectId, ownerId, true);
  if (!part) {
    await tx.insert(projectParticipations).values({ id: newId("ppa"), projectId, personId, status: "active", startsOn: today() });
    part = await currentParticipation(tx, projectId, ownerId, true);
  } else if (part.status === "contact") {
    await tx.update(projectParticipations).set({ status: "active", updatedAt: new Date() }).where(eq(projectParticipations.id, part.id));
  }
  if (part!.canExport) await tx.update(projectParticipations).set({ canExport: false }).where(eq(projectParticipations.id, part!.id));
  await tx.delete(projectRoleAssignments).where(and(eq(projectRoleAssignments.participationId, part!.id), eq(projectRoleAssignments.origin, "acces")));
  return part!.id;
}
