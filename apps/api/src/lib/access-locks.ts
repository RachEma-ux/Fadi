/**
 * Verrous de l'accès dans une écriture (Issue #262, phase 2). La décision d'accès vient de `project_effective_access`
 * (participations actives et rôles par portée) ; une écriture qui relit l'accès sous transaction verrouille (FOR SHARE)
 * ce dont il dépend : la ligne de partage du compte et ses participations au projet. Une révocation, une suspension ou
 * une fin de participation concurrente attend alors le commit de l'écriture. Requêtes simples (sans jointure) : les
 * bases simulées des suites Studio les exécutent telles quelles.
 */
import { and, eq, sql } from "drizzle-orm";
import { projectMembers, projectParticipations } from "../db/schema.js";
import type { Tx } from "./step-rows.js";

export async function lockAccessRows(tx: Tx, projectId: string, userId: string): Promise<void> {
  await tx.select({ userId: projectMembers.userId }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).for("share");
  await tx.select({ id: projectParticipations.id }).from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, projectId), sql`${projectParticipations.personId} IN (SELECT id FROM people WHERE user_id = ${userId})`)).for("share");
}
