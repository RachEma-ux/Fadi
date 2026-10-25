/**
 * Verrous de l'accès dans une écriture (Issue #262, phase 2). La décision d'accès vient de `project_effective_access`
 * (participations actives et rôles par portée) ; une écriture qui relit l'accès sous transaction verrouille (FOR SHARE)
 * ce dont il dépend : les participations du compte au projet. Une révocation, une suspension, une fin de participation
 * ou un changement de partage concurrent (qui verrouille la participation FOR UPDATE avant d'écrire ses rôles,
 * `project-access-db.ts`) attend alors le commit de l'écriture. Lot OP-PONT : la ligne de partage `project_members`
 * n'existe plus (vue de compatibilité) — le partage est porté par ces mêmes participations. Requête simple (sans
 * jointure) : les bases simulées des suites Studio l'exécutent telle quelle.
 */
import { and, eq, sql } from "drizzle-orm";
import { projectParticipations } from "../db/schema.js";
import type { Tx } from "./step-rows.js";

export async function lockAccessRows(tx: Tx, projectId: string, userId: string): Promise<void> {
  await tx.select({ id: projectParticipations.id }).from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, projectId), sql`${projectParticipations.personId} IN (SELECT id FROM people WHERE user_id = ${userId})`)).for("share");
}
