/**
 * Garde du dernier administrateur, atomique (revue de sécurité de la PR #255).
 *
 * Toute opération qui peut retirer un administrateur actif (auto-suppression, suppression par l'administration,
 * suspension, rétrogradation) passe par `lockAdminEligibility` **au début de sa transaction** : un verrou consultatif
 * transactionnel unique sérialise ces opérations, puis la liste des administrateurs actifs est relue sous ce verrou. La
 * vérification de l'invariant et la mutation se font dans la même transaction ; le verrou n'est relâché qu'à la
 * validation (ou l'annulation), donc après le changement d'éligibilité. Un seul verrou, toujours pris en premier :
 * aucun ordre de verrouillage concurrent, donc aucun interblocage entre ces opérations.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Clé du verrou consultatif (deux entiers : espace « Fadi gestion des comptes », objet « éligibilité administrateur »). */
export const ADMIN_ELIGIBILITY_LOCK = [253, 1] as const;

/** Prend le verrou d'éligibilité (jusqu'à la fin de la transaction) et relit les administrateurs actifs. */
export async function lockAdminEligibility(tx: Tx): Promise<string[]> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_ELIGIBILITY_LOCK[0]}::int, ${ADMIN_ELIGIBILITY_LOCK[1]}::int)`);
  const rows = await tx.select({ id: users.id }).from(users)
    .where(and(eq(users.platformRole, "admin"), eq(users.status, "active"), isNull(users.deletionRequestedAt)));
  return rows.map((r) => r.id);
}
