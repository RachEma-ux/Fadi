import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projects } from "../db/schema.js";

/**
 * Charge le projet ET vérifie que l'utilisateur en est propriétaire, en une
 * seule requête. Toute route qui touche un projet passe par ici d'abord —
 * jamais seulement « l'utilisateur est connecté » (AGENTS.md et Definition
 * of Done : autorisation vérifiée côté serveur par ressource).
 */
export async function loadOwnedProject(projectId: string, ownerId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

export type OwnedProject = NonNullable<Awaited<ReturnType<typeof loadOwnedProject>>>;
