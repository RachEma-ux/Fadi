/**
 * Responsables d'un projet (Issue #262, OP-D9 et OP-D13) — définition commune aux phases 2 (coordonnées des contacts) et
 * 3 bis (historique de participation du projet).
 *
 * Est responsable du projet : son propriétaire, ou une personne liée à ce compte dont la participation est `active` et qui
 * porte le rôle `coordinateur` à la portée `projet` ou la responsabilité d'équipe `diriger`. Un participant externe d'une
 * revue (phase 4) n'en est jamais un par sa seule affectation de revue. Vérifié côté serveur à chaque requête.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { people, projectParticipations, projectRoleAssignments, projects } from "../db/schema.js";

type Executor = Pick<typeof db, "select">;

/** Règle pure : le propriétaire, ou une participation active coordinatrice (portée projet) ou dirigeante. */
export function estResponsable(input: {
  ownerId: string;
  userId: string;
  participation?: { status: string; responsibilities: readonly string[]; projectRoles: readonly string[] } | null;
}): boolean {
  if (input.ownerId === input.userId) return true;
  const p = input.participation;
  if (!p || p.status !== "active") return false;
  return p.responsibilities.includes("diriger") || p.projectRoles.includes("coordinateur");
}

export async function isProjectResponsible(projectId: string, userId: string, executor: Executor = db): Promise<boolean> {
  const [project] = await executor.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return false;
  if (project.ownerId === userId) return true;
  const rows = await executor
    .select({ id: projectParticipations.id })
    .from(projectParticipations)
    .innerJoin(people, eq(people.id, projectParticipations.personId))
    .leftJoin(projectRoleAssignments, and(
      eq(projectRoleAssignments.participationId, projectParticipations.id),
      eq(projectRoleAssignments.role, "coordinateur"),
      eq(projectRoleAssignments.scopeType, "projet"),
    ))
    .where(and(
      eq(projectParticipations.projectId, projectId),
      eq(people.userId, userId),
      eq(projectParticipations.status, "active"),
      or(sql`'diriger' = ANY(${projectParticipations.responsibilities})`, sql`${projectRoleAssignments.id} IS NOT NULL`),
    ))
    .limit(1);
  return rows.length > 0;
}
